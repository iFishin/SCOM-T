#!/usr/bin/env python3
"""
Virtual Serial Port AT Command Simulator
虚拟串口AT指令模拟器

Creates a virtual serial port pair and responds to AT commands.
用于测试SCOM-T等串口调试工具的响应匹配功能。

Usage:
    python3 at_simulator.py                    # 使用默认配置
    python3 at_simulator.py --delay 100        # 响应延迟100ms
    python3 at_simulator.py --log              # 启用日志
    python3 at_simulator.py --ports /dev/ttys010 /dev/ttys011  # 指定串口

Requirements: Python 3.7+ (标准库，无需安装依赖)
"""

import pty
import os
import select
import sys
import time
import json
import argparse
import threading
from typing import Dict, Optional, Callable
from dataclasses import dataclass
from datetime import datetime


@dataclass
class SimConfig:
    """模拟器配置"""
    response_delay_ms: int = 0          # 响应延迟（毫秒）
    enable_logging: bool = False        # 启用日志
    enable_echo: bool = True            # 启用回显
    line_ending: str = "\r\n"           # 默认换行符
    hex_mode: bool = False              # HEX模式显示


class ATCommandSimulator:
    """AT指令模拟器"""

    # 预定义的AT指令响应
    DEFAULT_RESPONSES: Dict[str, str] = {
        # 基础指令
        "AT": "OK",
        "ATE0": "OK",
        "ATE1": "OK",

        # SIM卡相关
        "AT+CPIN?": "+CPIN: READY\n\nOK",
        "AT+CPIN=1234": "OK",
        "AT+CPIN=\"1234\"": "OK",

        # 信号质量
        "AT+CSQ": "+CSQ: 20,0\n\nOK",
        "AT+CSQ=?": "+CSQ: (0-31,0-99)\n\nOK",

        # 网络注册
        "AT+CEREG?": "+CEREG: 0,1\n\nOK",
        "AT+CEREG=?": '+CEREG: (0,1,2,3,4,5),(0-5)\n\nOK',
        "AT+CREG?": "+CREG: 0,1\n\nOK",
        "AT+CGREG?": "+CGREG: 0,1\n\nOK",

        # GPRS附着
        "AT+CGATT?": "+CGATT: 1\n\nOK",
        "AT+CGATT=1": "OK",
        "AT+CGATT=0": "OK",

        # 运营商查询
        "AT+COPS?": '+COPS: 0,0,"China Mobile",0\n\nOK',
        "AT+COPS=?": '+COPS: (2,"China Mobile","CMCC","46000",0),(1,"China Unicom","CUCC","46001",0),(1,"China Telecom","CTCC","46003",0)\n\nOK',

        # 设备信息
        "AT+CGMI": "+CGMI: SIMCOM\n\nOK",
        "AT+CGMM": "+CGMM: SIMCOM_SIM800C\n\nOK",
        "AT+CGMR": "+CGMR:_revision:1308B05SIM800C\n\nOK",
        "AT+CGSN": "+CGSN:869123456789012\n\nOK",

        # IMEI
        "AT+GSN": "869123456789012\n\nOK",

        # 网络模式
        "AT+CNMODE?": "+CNMODE: 0\n\nOK",
        "AT+CNMODE=0": "OK",

        # PDP上下文
        "AT+CGDCONT?": '+CGDCONT: 1,"IP","cmnet"\n\nOK',
        "AT+CGDCONT=1,\"IP\",\"cmnet\"": "OK",

        # 拨号
        "ATD*99#": "CONNECT 9600",
        "ATD*99***1#": "CONNECT 9600",
        "ATH": "OK",
        "ATA": "OK",

        # 短信相关
        "AT+CMGF=1": "OK",
        "AT+CMGF=0": "OK",
        "AT+CMGL=\"ALL\"": "+CMGL: 0,\"REC READ\",\"+8613800138000\",,\"24/01/01,12:00:00+32\",168,\"Hello\"\n\nOK",

        # HTTP相关
        "AT+HTTPINIT": "OK",
        "AT+HTTPTERM": "OK",
        "AT+HTTPPARA=\"CID\",1": "OK",
        'AT+HTTPPARA="URL","http://example.com"': "OK",
        "AT+HTTPACTION=0": "+HTTPACTION: 0,200,100\n\nOK",

        # TCP/IP相关
        "AT+CIPSTART=\"TCP\",\"example.com\",80": "CONNECT OK",
        "AT+CIPCLOSE": "CLOSE OK",
        "AT+CIPSEND=5": "> ",
        "AT+CIPSHUT": "SHUT OK",

        # WiFi相关（如果支持）
        "AT+CWMODE?": "+CWMODE: 1\n\nOK",
        "AT+CWMODE=1": "OK",
        "AT+CWJAP?": "+CWJAP: \"MyWiFi\"\n\nOK",

        # 电源管理
        "AT+CFUN?": "+CFUN: 1\n\nOK",
        "AT+CFUN=1": "OK",
        "AT+CFUN=0": "OK",

        # 日期时间
        "AT+CCLK?": f'+CCLK: "{datetime.now().strftime("%y/%m/%d,%H:%M:%S+32")}"\n\nOK',

        # 错误处理
        "AT+ERROR": "ERROR",
        "AT+CME ERROR": "+CME ERROR: 1\n\nOK",
        "AT+CMS ERROR": "+CMS ERROR: 301\n\nOK",
    }

    def __init__(self, config: SimConfig):
        self.config = config
        self.responses = dict(self.DEFAULT_RESPONSES)
        self.running = False
        self.master_fd: Optional[int] = None
        self.slave_name: Optional[str] = None
        self._buffer = ""

    def add_response(self, command: str, response: str):
        """添加自定义响应"""
        self.responses[command.upper()] = response

    def load_responses_from_file(self, filepath: str):
        """从JSON文件加载响应配置"""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    self.responses.update(data)
                    self._log(f"已加载 {len(data)} 条自定义响应")
        except Exception as e:
            self._log(f"加载响应配置失败: {e}")

    def _log(self, msg: str):
        """输出日志"""
        if self.config.enable_logging:
            timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            print(f"[{timestamp}] {msg}")

    def _format_hex(self, data: str) -> str:
        """格式化为HEX显示"""
        hex_str = ' '.join(f'{ord(c):02X}' for c in data)
        ascii_str = ''.join(c if 32 <= ord(c) < 127 else '.' for c in data)
        return f"{hex_str}  |{ascii_str}|"

    def _find_response(self, cmd: str) -> str:
        """查找指令对应的响应"""
        cmd_upper = cmd.upper().strip()

        # 精确匹配
        if cmd_upper in self.responses:
            return self.responses[cmd_upper]

        # 前缀匹配（用于带参数的指令）
        for k, v in self.responses.items():
            if cmd_upper.startswith(k.rstrip('=') + '=') or cmd_upper.startswith(k):
                return v

        # 默认响应
        if cmd_upper.startswith("AT"):
            return "OK"
        return "ERROR"

    def _process_command(self, cmd: str):
        """处理收到的指令"""
        cmd = cmd.strip()
        if not cmd:
            return

        self._log(f"收到指令: {cmd}")

        if self.config.enable_echo:
            self._log(f"回显: {cmd}")

        # 查找响应
        response = self._find_response(cmd)
        self._log(f"发送响应: {response}")

        # 模拟延迟
        if self.config.response_delay_ms > 0:
            time.sleep(self.config.response_delay_ms / 1000.0)

        # 发送响应
        if self.master_fd is not None:
            data = response + self.config.line_ending
            os.write(self.master_fd, data.encode('utf-8'))

    def _read_loop(self):
        """读取串口数据的主循环"""
        self._log("等待数据...")

        while self.running:
            try:
                r, _, _ = select.select([self.master_fd], [], [], 0.1)
                if r:
                    data = os.read(self.master_fd, 1024)
                    if not data:
                        self._log("连接断开")
                        break

                    text = data.decode('utf-8', errors='ignore')

                    if self.config.enable_logging:
                        self._log(f"接收: {self._format_hex(text)}")

                    self._buffer += text

                    # 处理完整的行
                    while '\r' in self._buffer or '\n' in self._buffer:
                        # 找到换行符位置
                        idx_cr = self._buffer.find('\r')
                        idx_lf = self._buffer.find('\n')

                        if idx_cr == -1:
                            idx = idx_lf
                        elif idx_lf == -1:
                            idx = idx_cr
                        else:
                            idx = min(idx_cr, idx_lf)

                        line = self._buffer[:idx].strip()

                        # 跳过换行符
                        skip = idx + 1
                        if skip < len(self._buffer):
                            # 如果是\r\n，多跳一个字符
                            if self._buffer[idx:idx+2] in ('\r\n', '\n\r'):
                                skip += 1
                        self._buffer = self._buffer[skip:]

                        if line:
                            self._process_command(line)

            except OSError:
                self._log("串口错误")
                break
            except KeyboardInterrupt:
                self._log("用户中断")
                break

    def start(self):
        """启动模拟器"""
        # 创建虚拟串口对
        try:
            self.master_fd, slave_fd = pty.openpty()
            self.slave_name = os.ttyname(slave_fd)
        except Exception as e:
            print(f"创建虚拟串口失败: {e}")
            print("请检查系统权限")
            sys.exit(1)

        print("=" * 60)
        print("虚拟串口AT指令模拟器")
        print("=" * 60)
        print(f"串口设备: {self.slave_name}")
        print(f"响应延迟: {self.config.response_delay_ms}ms")
        print(f"日志模式: {'启用' if self.config.enable_logging else '关闭'}")
        print(f"已加载响应: {len(self.responses)} 条")
        print("=" * 60)
        print("请在SCOM-T中打开上述串口")
        print("按 Ctrl+C 停止模拟器")
        print("=" * 60)
        print()

        self.running = True
        self._read_loop()

    def stop(self):
        """停止模拟器"""
        self.running = False
        if self.master_fd is not None:
            os.close(self.master_fd)
            self._log("模拟器已停止")


def main():
    parser = argparse.ArgumentParser(
        description="虚拟串口AT指令模拟器",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python3 at_simulator.py                    # 默认配置启动
  python3 at_simulator.py --delay 100        # 响应延迟100ms
  python3 at_simulator.py --log              # 启用日志调试
  python3 at_simulator.py -c custom.json     # 加载自定义响应

自定义响应配置文件格式 (JSON):
  {
    "AT+MYCMD": "MY RESPONSE",
    "AT+DATA": "+DATA: 1,2,3\\n\\nOK"
  }
        """
    )

    parser.add_argument("-d", "--delay", type=int, default=0,
                        help="响应延迟（毫秒），默认0")
    parser.add_argument("-l", "--log", action="store_true",
                        help="启用日志输出")
    parser.add_argument("-c", "--config", type=str,
                        help="自定义响应配置文件路径")
    parser.add_argument("--no-echo", action="store_true",
                        help="禁用AT指令回显")
    parser.add_argument("--hex", action="store_true",
                        help="启用HEX模式显示")

    args = parser.parse_args()

    config = SimConfig(
        response_delay_ms=args.delay,
        enable_logging=args.log,
        enable_echo=not args.no_echo,
        hex_mode=args.hex,
    )

    simulator = ATCommandSimulator(config)

    # 加载自定义响应
    if args.config:
        simulator.load_responses_from_file(args.config)

    try:
        simulator.start()
    except KeyboardInterrupt:
        print("\n模拟器已停止")
    finally:
        simulator.stop()


if __name__ == "__main__":
    main()
