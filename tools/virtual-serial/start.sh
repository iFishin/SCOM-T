#!/bin/bash
# 虚拟串口AT指令模拟器 (macOS)
# 使用 socat 创建真正的虚拟串口对，会被 SCOM-T 识别

set -e

echo "=========================================="
echo "  虚拟串口 AT 指令模拟器 (socat)"
echo "=========================================="
echo

# 检查 socat 是否安装
if ! command -v socat &> /dev/null; then
    echo "错误: 未安装 socat"
    echo "请运行: brew install socat"
    exit 1
fi

# 获取当前可用的最高 ttys 编号
MAX_TTY=$(ls /dev/ 2>/dev/null | grep -E "^tty[sc]" | sed -E 's/^tty[sc]0*//' | sort -n | tail -1 || echo "100")
NEXT_TTY=$((MAX_TTY + 1))

# 创建设备路径
MASTER="/dev/ttyS${NEXT_TTY}"
SLAVE="/dev/cu.SOCOM-T-${NEXT_TTY}"

echo "创建虚拟串口对:"
echo "  Master (写入端): $MASTER"
echo "  Slave (SCOM-T使用): $SLAVE"
echo

# 清理函数
cleanup() {
    echo
    echo "正在停止模拟器..."
    kill $(jobs -p) 2>/dev/null || true
    # 清理符号链接
    rm -f "$SLAVE" 2>/dev/null
    # 尝试断开 socat
    pkill -f "socat.*ttyS${NEXT_TTY}" 2>/dev/null || true
    echo "模拟器已停止"
}

trap cleanup EXIT INT TERM

# socat 创建虚拟串口对
# 一端是 pty (ttyS*)，另一端创建为 cu.* 符号链接供 SCOM-T 使用
socat \
    PTY,link=/dev/ttyS${NEXT_TTY},raw,echo=0,wait-slave \
    PTY,link=${SLAVE},raw,echo=0,wait-slave &
SOCAT_PID=$!

sleep 1

# 检查设备是否创建成功
if [ ! -e "$MASTER" ] || [ ! -e "$SLAVE" ]; then
    echo "错误: 虚拟串口创建失败"
    exit 1
fi

# 设置权限
chmod 666 "$MASTER" "$SLAVE" 2>/dev/null || true

echo "✓ 虚拟串口创建成功"
echo
echo "=========================================="
echo "  请在 SCOM-T 中打开: $SLAVE"
echo "=========================================="
echo
echo "按 Ctrl+C 停止模拟器"
echo
echo "等待指令..."
echo "---"

# 简单的 AT 指令响应循环
while true; do
    if [ -e "$MASTER" ]; then
        # 读取一行数据
        CMD=$(head -1 "$MASTER" 2>/dev/null || echo "")
        if [ -n "$CMD" ]; then
            # 去除回车换行
            CMD=$(echo "$CMD" | tr -d '\r\n')
            echo "收到: $CMD"

            # 根据指令返回响应
            case "$CMD" in
                "AT")
                    echo -e "OK\r" > "$MASTER"
                    echo "响应: OK"
                    ;;
                "AT+CPIN?"*)
                    echo -e "+CPIN: READY\r\n\r\nOK\r" > "$MASTER"
                    echo "响应: +CPIN: READY"
                    ;;
                "AT+CSQ"*)
                    echo -e "+CSQ: 25,0\r\n\r\nOK\r" > "$MASTER"
                    echo "响应: +CSQ: 25,0"
                    ;;
                "AT+CERG"*|"AT+CREG"*|"AT+CGREG"*)
                    echo -e "+CEREG: 0,1\r\n\r\nOK\r" > "$MASTER"
                    echo "响应: +CEREG: 0,1"
                    ;;
                "AT+CGMI"*)
                    echo -e "+CGMI: SIMCOM\r\n\r\nOK\r" > "$MASTER"
                    echo "响应: +CGMI: SIMCOM"
                    ;;
                "AT+CGMM"*)
                    echo -e "+CGMM: SIM800C\r\n\r\nOK\r" > "$MASTER"
                    echo "响应: +CGMM: SIM800C"
                    ;;
                "AT+CGSN"*)
                    echo -e "+CGSN: 861234567890123\r\n\r\nOK\r" > "$MASTER"
                    echo "响应: +CGSN: 861234567890123"
                    ;;
                "AT+COPS?"*)
                    echo -e "+COPS: 0,0,\"China Mobile\"\r\n\r\nOK\r" > "$MASTER"
                    echo "响应: +COPS: China Mobile"
                    ;;
                "AT+CGATT?"*)
                    echo -e "+CGATT: 1\r\n\r\nOK\r" > "$MASTER"
                    echo "响应: +CGATT: 1"
                    ;;
                "AT+CFUN?"*)
                    echo -e "+CFUN: 1\r\n\r\nOK\r" > "$MASTER"
                    echo "响应: +CFUN: 1"
                    ;;
                "AT+CCLK?"*)
                    echo -e "+CCLK: \"24/01/15,12:00:00+32\"\r\n\r\nOK\r" > "$MASTER"
                    echo "响应: +CCLK: 当前时间"
                    ;;
                AT*|"AT")
                    echo -e "OK\r" > "$MASTER"
                    echo "响应: OK"
                    ;;
                *)
                    echo -e "OK\r" > "$MASTER"
                    echo "响应: OK (默认)"
                    ;;
            esac
        fi
    fi
    sleep 0.05
done
