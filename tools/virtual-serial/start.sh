#!/bin/bash
# 启动虚拟串口AT指令模拟器 (macOS)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "启动虚拟串口模拟器..."
echo "按 Ctrl+C 停止"
echo

python3 "$SCRIPT_DIR/at_simulator_mac.py" "$@"
