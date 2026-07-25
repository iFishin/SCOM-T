# 虚拟串口AT指令模拟器

用于测试SCOM-T响应匹配功能的虚拟串口模拟器。

## 功能特点

- 无需外部依赖，使用Python标准库
- 自动创建虚拟串口对
- 自动创建 cu.* 软链接（SCOM-T 需要）
- 内置常用4G/5G模块AT指令响应
- 支持自定义响应配置
- 可配置响应延迟

## 快速开始 (macOS)

```bash
# 基本使用
python3 at_simulator_mac.py

# 启用日志
python3 at_simulator_mac.py --log

# 设置响应延迟100ms
python3 at_simulator_mac.py --delay 100
```

## 使用步骤

1. 运行模拟器，会显示虚拟串口设备路径
2. **注意：使用显示的 cu.* 设备**（不是 tty.*）
3. 在SCOM-T中打开该串口
4. 发送AT指令，模拟器会自动响应

## 内置支持的AT指令

| 指令 | 响应 |
|------|------|
| AT | OK |
| AT+CPIN? | +CPIN: READY |
| AT+CSQ | +CSQ: 20,0 |
| AT+CEREG? | +CEREG: 0,1 |
| AT+CGATT? | +CGATT: 1 |
| AT+COPS? | +COPS: 0,0,"China Mobile" |
| AT+CGMI | +CGMI: SIMCOM |
| AT+CGMM | +CGMM: SIMCOM_SIM800C |
| AT+GSN | IMEI号 |
| AT+CCLK? | 当前时间 |
| ... | 更多见源码 |

## 自定义响应

创建JSON配置文件：

```json
{
    "AT+MYCMD": "MY RESPONSE",
    "AT+DATA": "+DATA: 1,2,3\n\nOK"
}
```

加载配置：

```bash
python3 at_simulator_mac.py -c custom_responses.json
```

## 命令行参数

| 参数 | 说明 |
|------|------|
| `-d, --delay MS` | 响应延迟（毫秒） |
| `-l, --log` | 启用日志输出 |
| `-c, --config FILE` | 自定义响应配置文件 |

## 测试SCOM-T响应匹配

1. 启动模拟器：`python3 at_simulator_mac.py --delay 100`
2. 在SCOM-T打开显示的 **cu.* 设备**（不是 tty.*）
3. 添加指令行，设置预期结果
4. 发送指令，观察状态变化（pending → success）

## 原理说明

SCOM-T 在 macOS 上只扫描 cu.* 设备，不扫描 tty.* 设备。
本模拟器使用 Python pty 模块创建虚拟串口（tty.*），然后创建 cu.* 软链接指向它。
