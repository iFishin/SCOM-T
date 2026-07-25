#!/usr/bin/env python3
"""
Virtual Serial Port AT Command Simulator
虚拟串口AT指令模拟器

Creates a virtual serial port pair using socat and responds to AT commands.
用于测试SCOM-T等串口调试工具的响应匹配功能。

Requirements:
    brew install socat
    pip3 install pyserial  # 可选，用于列出串口

Usage:
    python3 at_simulator.py                    # 自动检测并使用 socat
    python3 at_simulator.py --delay 100        # 响应延迟100ms
    python3 at_simulator.py --log              # 启用日志
"""

import os
import sys
import time
import json
import signal
import socket
import argparse
import threading
import subprocess
from typing import Dict, Optional
from dataclasses import dataclass
from datetime import datetime


@dataclass
class SimConfig:
    """模拟器配置"""
    response_delay_ms: int = 0
    enable_logging: bool = False
    enable_echo: bool = True
    line_ending: str = "\r\n"


class ATCommandSimulator:
    """AT指令模拟器"""

    DEFAULT_RESPONSES: Dict[str, str] = {
        # 基础指令
        "AT": "OK",
        "ATE0": "OK",
        "ATE1": "OK",

        # SIM卡相关
        "AT+CPIN?": "+CPIN: READY\n\nOK",
        "AT+CPIN=1234": "OK",

        # 信号质量
        "AT+CSQ": "+CSQ: 20,0\n\nOK",

        # 网络注册
        "AT+CEREG?": "+CEREG: 0,1\n\nOK",
        "AT+CREG?": "+CREG: 0,1\n\nOK",
        "AT+CGREG?": "+CGREG: 0,1\n\nOK",

        # GPRS附着
        "AT+CGATT?": "+CGATT: 1\n\nOK",

        # 运营商查询
        "AT+COPS?": '+COPS: 0,0,"China Mobile",0\n\nOK',

        # 设备信息
        "AT+CGMI": "+CGMI: SIMCOM\n\nOK",
        "AT+CGMM": "+CGMM: SIMCOM_SIM800C\n\nOK",
        "AT+CGMR": "+CGMR:1308B05SIM800C\n\nOK",
        "AT+CGSN": "+CGSN:869123456789012\n\nOK",
        "AT+GSN": "869123456789012\n\nOK",

        # PDP上下文
        "AT+CGDCONT?": '+CGDCONT: 1,"IP","cmnet"\n\nOK',

        # 拨号
        "ATD*99#": "CONNECT 9600",
        "ATH": "OK",
        "ATA": "OK",

        # 短信相关
        "AT+CMGF=1": "OK",
        "AT+CMGL=\"ALL\"": "+CMGL: 0,\"REC READ\",\"+8613800138000\",,\"24/01/01,12:00:00+32\",168,\"Hello\"\n\nOK",

        # HTTP相关
        "AT+HTTPINIT": "OK",
        "AT+HTTPTERM": "OK",

        # TCP/IP相关
        "AT+CIPSTART=\"TCP\",\"example.com\",80": "CONNECT OK",
        "AT+CIPCLOSE": "CLOSE OK",
        "AT+CIPSHUT": "SHUT OK",

        # 电源管理
        "AT+CFUN?": "+CFUN: 1\n\nOK",

        # 日期时间
        "AT+CCLK?": f'+CCLK: "{datetime.now().strftime("%y/%m/%d,%H:%M:%S+32")}"\n\nOK',
    }

    def __init__(self, config: SimConfig):
        self.config = config
        self.responses = dict(self.DEFAULT_RESPONSES)
        self.running = False
        self.sock: Optional[socket.socket] = None
        self._buffer = ""
        self._socat_process: Optional[subprocess.Popen] = None
        self._port1: Optional[str] = None
        self._port2: Optional[str] = None

    def add_response(self, command: str, response: str):
        self.responses[command.upper()] = response

    def load_responses_from_file(self, filepath: str):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    self.responses.update(data)
                    self._log(f"已加载 {len(data)} 条自定义响应")
        except Exception as e:
            self._log(f"加载响应配置失败: {e}")

    def _log(self, msg: str):
        if self.config.enable_logging:
            timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            print(f"[{timestamp}] {msg}")

    def _format_hex(self, data: str) -> str:
        hex_str = ' '.join(f'{ord(c):02X}' for c in data)
        ascii_str = ''.join(c if 32 <= ord(c) < 127 else '.' for c in data)
        return f"{hex_str}  |{ascii_str}|"

    def _find_response(self, cmd: str) -> str:
        cmd_upper = cmd.upper().strip()
        if cmd_upper in self.responses:
            return self.responses[cmd_upper]
        for k, v in self.responses.items():
            if cmd_upper.startswith(k.rstrip('=') + '=') or cmd_upper.startswith(k):
                return v
        return "OK" if cmd_upper.startswith("AT") else "ERROR"

    def _process_command(self, cmd: str):
        cmd = cmd.strip()
        if not cmd:
            return

        self._log(f"收到指令: {cmd}")

        response = self._find_response(cmd)
        self._log(f"发送响应: {response}")

        if self.config.response_delay_ms > 0:
            time.sleep(self.config.response_delay_ms / 1000.0)

        if self.sock:
            data = response + self.config.line_ending
            self.sock.sendall(data.encode('utf-8'))
            self._log(f"已发送: {len(data)} 字节")

    def _create_virtual_port_pair(self) -> bool:
        """使用 socat 创建虚拟串口对"""
        try:
            # 创建 socat 进程，使用 PTY 链接
            # 这样两端都能读写
            cmd = [
                "socat",
                "PTY,raw,echo=0,link=/tmp/vserial1",
                "PTY,raw,echo=0,link=/tmp/vserial2"
            ]

            self._log(f"启动 socat: {' '.join(cmd)}")
            self._socat_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )

            # 等待链接文件创建
            time.sleep(0.5)

            if not os.path.exists("/tmp/vserial1") or not os.path.exists("/tmp/vserial2"):
                self._log("socat 创建链接文件失败")
                return False

            # 获取实际的 PTY 设备名
            self._port1 = os.readlink("/tmp/vserial1")
            self._port2 = os.readlink("/tmp/vserial2")

            self._log(f"端口1: {self._port1} -> /tmp/vserial1")
            self._log(f"端口2: {self._port2} -> /tmp/vserial2")

            return True

        except FileNotFoundError:
            self._log("错误: 未找到 socat，请运行: brew install socat")
            return False
        except Exception as e:
            self._log(f"创建虚拟串口失败: {e}")
            return False

    def _connect_to_port(self, port_path: str) -> bool:
        """连接到串口设备"""
        try:
            # 使用 os.open 打开串口
            fd = os.open(port_path, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
            self._log(f"已打开串口: {port_path} (fd={fd})")

            # 创建 socket 用于读写（简化处理）
            # 实际上需要使用 select/poll 来读写 fd
            import select
            self._fd = fd
            self._read_fds = [fd]

            return True

        except Exception as e:
            self._log(f"打开串口失败: {e}")
            return False

    def _read_loop(self):
        """读取串口数据的主循环"""
        import select

        self._log("等待数据...")

        while self.running:
            try:
                r, _, _ = select.select([self._fd], [], [], 0.1)
                if r:
                    data = os.read(self._fd, 1024)
                    if not data:
                        self._log("连接断开")
                        break

                    text = data.decode('utf-8', errors='ignore')

                    if self.config.enable_logging:
                        self._log(f"接收: {self._format_hex(text)}")

                    self._buffer += text

                    while '\r' in self._buffer or '\n' in self._buffer:
                        idx_cr = self._buffer.find('\r')
                        idx_lf = self._buffer.find('\n')

                        if idx_cr == -1:
                            idx = idx_lf
                        elif idx_lf == -1:
                            idx = idx_cr
                        else:
                            idx = min(idx_cr, idx_lf)

                        line = self._buffer[:idx].strip()

                        skip = idx + 1
                        if skip < len(self._buffer):
                            if self._buffer[idx:idx+2] in ('\r\n', '\n\r'):
                                skip += 1
                        self._buffer = self._buffer[skip:]

                        if line:
                            self._process_command(line)

            except OSError as e:
                self._log(f"串口错误: {e}")
                break
            except KeyboardInterrupt:
                self._log("用户中断")
                break

    def start(self):
        """启动模拟器"""
        # 创建虚拟串口对
        if not self._create_virtual_port_pair():
            sys.exit(1)

        # 连接到端口2（SCOM-T 连接端口1）
        if not self._connect_to_port(self._port2):
            sys.exit(1)

        print()
        print("=" * 60)
        print("  虚拟串口AT指令模拟器")
        print("=" * 60)
        print(f"  串口设备: {self._port1}")
        print(f"  响应延迟: {self.config.response_delay_ms}ms")
        print(f"  日志模式: {'启用' if self.config.enable_logging else '关闭'}")
        print(f"  已加载响应: {len(self.responses)} 条")
        print("=" * 60)
        print("  请在SCOM-T中打开上述串口")
        print("  按 Ctrl+C 停止模拟器")
        print("=" * 60)
        print()

        self.running = True
        self._read_loop()

    def stop(self):
        """停止模拟器"""
        self.running = False

        if hasattr(self, '_fd'):
            try:
                os.close(self._fd)
            except:
                pass

        # 清理 socat 进程
        if self._socat_process:
            self._socat_process.terminate()
            self._socat_process.wait()
            self._log("socat 进程已停止")

        # 清理链接文件
        for f in ['/tmp/vserial1', '/tmp/vserial2']:
            try:
                if os.path.exists(f):
                    os.remove(f)
            except:
                pass

        self._log("模拟器已停止")


def check_socat() -> bool:
    """检查 socat 是否安装"""
    try:
        result = subprocess.run(
            ["which", "socat"],
            capture_output=True,
            text=True
        )
        return result.returncode == 0
    except:
        return False


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

    args = parser.parse_args()

    # 检查 socat
    if not check_socat():
        print("错误: 未找到 socat")
        print("请运行: brew install socat")
        sys.exit(1)

    config = SimConfig(
        response_delay_ms=args.delay,
        enable_logging=args.log,
        enable_echo=not args.no_echo,
    )

    simulator = ATCommandSimulator(config)

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
