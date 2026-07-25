#!/usr/bin/env python3
"""
Virtual Serial Port AT Command Simulator (macOS)
虚拟串口AT指令模拟器 - macOS 版

使用 Python pty 模块创建虚拟串口，并创建 cu.* 软链接供 SCOM-T 使用。

Usage:
    python3 at_simulator_mac.py                    # 基本启动
    python3 at_simulator_mac.py --delay 100        # 响应延迟100ms
    python3 at_simulator_mac.py --log              # 启用日志
"""

import pty
import os
import sys
import time
import json
import select
import argparse
import signal
from typing import Dict, Optional
from dataclasses import dataclass
from datetime import datetime


@dataclass
class SimConfig:
    response_delay_ms: int = 0
    enable_logging: bool = False
    enable_echo: bool = True
    line_ending: str = "\r\n"


class ATCommandSimulator:
    DEFAULT_RESPONSES: Dict[str, str] = {
        "AT": "OK",
        "ATE0": "OK",
        "ATE1": "OK",
        "AT+CPIN?": "+CPIN: READY\n\nOK",
        "AT+CSQ": "+CSQ: 20,0\n\nOK",
        "AT+CEREG?": "+CEREG: 0,1\n\nOK",
        "AT+CREG?": "+CREG: 0,1\n\nOK",
        "AT+CGREG?": "+CGREG: 0,1\n\nOK",
        "AT+CGATT?": "+CGATT: 1\n\nOK",
        "AT+COPS?": '+COPS: 0,0,"China Mobile",0\n\nOK',
        "AT+CGMI": "+CGMI: SIMCOM\n\nOK",
        "AT+CGMM": "+CGMM: SIMCOM_SIM800C\n\nOK",
        "AT+CGMR": "+CGMR:1308B05SIM800C\n\nOK",
        "AT+CGSN": "+CGSN:869123456789012\n\nOK",
        "AT+GSN": "869123456789012\n\nOK",
        "AT+CGDCONT?": '+CGDCONT: 1,"IP","cmnet"\n\nOK',
        "ATD*99#": "CONNECT 9600",
        "ATH": "OK",
        "ATA": "OK",
        "AT+CMGF=1": "OK",
        "AT+HTTPINIT": "OK",
        "AT+HTTPTERM": "OK",
        "AT+CFUN?": "+CFUN: 1\n\nOK",
        "AT+CCLK?": f'+CCLK: "{datetime.now().strftime("%y/%m/%d,%H:%M:%S+32")}"\n\nOK',
    }

    def __init__(self, config: SimConfig):
        self.config = config
        self.responses = dict(self.DEFAULT_RESPONSES)
        self.running = False
        self.master_fd: Optional[int] = None
        self.slave_name: Optional[str] = None
        self.cu_link: Optional[str] = None
        self._buffer = ""

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

        self._log(f"收到: {cmd}")
        response = self._find_response(cmd)
        self._log(f"响应: {response}")

        if self.config.response_delay_ms > 0:
            time.sleep(self.config.response_delay_ms / 1000.0)

        if self.master_fd is not None:
            data = response + self.config.line_ending
            os.write(self.master_fd, data.encode('utf-8'))

    def _create_cu_link(self, tty_path: str) -> str:
        """创建 cu.* 软链接"""
        # /dev/ttys005 -> /dev/cu.vserial005
        tty_name = os.path.basename(tty_path)
        # 替换 tty 为 cu，并加上 vserial 前缀避免冲突
        cu_name = "cu.vserial" + tty_name[3:]  # ttys005 -> cu.vserial005
        cu_path = f"/dev/{cu_name}"

        # 删除旧链接
        if os.path.exists(cu_path):
            try:
                os.remove(cu_path)
            except:
                pass

        # 创建软链接
        try:
            os.symlink(tty_path, cu_path)
            self._log(f"创建软链接: {cu_path} -> {tty_path}")
            return cu_path
        except Exception as e:
            self._log(f"创建软链接失败: {e}")
            return ""

    def _cleanup_cu_link(self):
        """清理 cu.* 软链接"""
        if self.cu_link and os.path.islink(self.cu_link):
            try:
                os.remove(self.cu_link)
                self._log(f"已删除软链接: {self.cu_link}")
            except:
                pass

    def _read_loop(self):
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

            except OSError:
                self._log("串口错误")
                break
            except KeyboardInterrupt:
                break

    def start(self):
        # 创建虚拟串口
        try:
            self.master_fd, slave_fd = pty.openpty()
            self.slave_name = os.ttyname(slave_fd)
        except Exception as e:
            print(f"创建虚拟串口失败: {e}")
            sys.exit(1)

        # 创建 cu.* 软链接
        self.cu_link = self._create_cu_link(self.slave_name)

        print()
        print("=" * 60)
        print("  虚拟串口AT指令模拟器 (macOS)")
        print("=" * 60)
        print(f"  tty 设备: {self.slave_name}")
        if self.cu_link:
            print(f"  cu 设备:  {self.cu_link}")
        print(f"  响应延迟: {self.config.response_delay_ms}ms")
        print(f"  日志模式: {'启用' if self.config.enable_logging else '关闭'}")
        print(f"  已加载响应: {len(self.responses)} 条")
        print("=" * 60)
        print("  请在SCOM-T中打开 cu 设备")
        print("  按 Ctrl+C 停止模拟器")
        print("=" * 60)
        print()

        self.running = True
        self._read_loop()

    def stop(self):
        self.running = False
        if self.master_fd is not None:
            os.close(self.master_fd)
        self._cleanup_cu_link()
        self._log("模拟器已停止")


def main():
    parser = argparse.ArgumentParser(description="虚拟串口AT指令模拟器 (macOS)")
    parser.add_argument("-d", "--delay", type=int, default=0,
                        help="响应延迟（毫秒）")
    parser.add_argument("-l", "--log", action="store_true",
                        help="启用日志输出")
    parser.add_argument("-c", "--config", type=str,
                        help="自定义响应配置文件")

    args = parser.parse_args()

    config = SimConfig(
        response_delay_ms=args.delay,
        enable_logging=args.log,
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
