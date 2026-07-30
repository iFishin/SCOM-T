<div align="center">
  <img src="public/SCOM-T_Banner.png" alt="SCOM-T Banner" width="100%" />
</div>

# SCOM-T

<p align="center">
  <strong>Serial Command Tool</strong> — 基于 Tauri + React + TypeScript 的现代化串口调试工具。
  <br />
  轻量、美观、可扩展，适用于嵌入式开发、IoT 设备调试和串口通信测试。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows-blue?logo=windows" alt="Windows" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT" />
  <img src="https://img.shields.io/badge/Language-TypeScript-3178C6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Runtime-Tauri-FFC131?logo=tauri" alt="Tauri" />
</p>

---

## 目录

- [简介](#简介)
- [界面预览](#界面预览)
- [功能特性](#功能特性)
- [系统要求](#系统要求)
- [安装](#安装)
- [开发与构建](#开发与构建)
- [常见问题](#常见问题)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

---

## 简介

SCOM-T 是原 [SCOM](https://github.com/iFishin/scom)（Python/PySide6 版）的全面重构版本，使用 Tauri 2 + React 19 + TypeScript 重新编写。相比旧版，拥有更小的体积、更低的资源占用和现代化的界面体验。

> 前身：PySide 版和 QT 版均已停止热更新，SCOM-T 为当前主力版本。

---

## 功能特性

### 🔌 串口通信

| 功能 | 说明 |
|------|------|
| 多标签页 | 同时连接多个串口，独立收发，标签切换互不干扰 |
| Mock 串口 | 内置模拟串口，无需硬件即可测试指令收发 |
| ASCII / HEX 双模式 | 实时切换文本和十六进制收发 |
| 自动补全 | 常用波特率、数据位、校验位等参数快速选择 |
| 端口独占保护 | 同一串口不可被两个标签重复打开 |

### 📋 指令网格

| 功能 | 说明 |
|------|------|
| 批量执行 | 按行排列指令，多选后循环执行 |
| 指令响应集 | 将常用 AT 指令和期望响应保存为 YAML 文件，按需导入 |
| 响应匹配 | 支持顺序匹配和任意匹配，支持正则表达式 |
| 参数占位符 | 指令中使用 `{name}` 定义变量，导入时弹窗填写后自动展开 |
| 指令分组 | 按 `group` 字段分区折叠，大型响应集一目了然 |
| 指令说明 | 每条指令可附加描述文本，导入后显示为行内备注 |
| HEX 模式标记 | 响应集中的指令可声明为 HEX 模式，导入时自动勾选 |
| 响应采集 | 发送并收到响应后，一键捕获实际接收文本追加为期望响应 |
| 模板导入 | 从内置 AT 指令模板快速导入常用响应集 |

### ⌨ 热键系统

| 功能 | 说明 |
|------|------|
| 自定义快捷键 | 绑定任意键位组合，一键发送指令 |
| 内置操作 | 清除日志、刷新端口、关闭端口、清空串口缓冲区等 |
| 全局可用 | 无论焦点在何处，快捷键始终生效 |

### ☁ 云端市场

| 功能 | 说明 |
|------|------|
| 共享响应集 | 上传/下载指令响应集和配置到云端服务器 |
| 多类型支持 | 支持响应集和指令配置两种类型 |
| 在线编辑 | 直接在市场预览中编辑条目内容并保存 |

### 📊 可视化

| 功能 | 说明 |
|------|------|
| 信号监视 | RTS、DTR、CTS、DSR、CD、RI 信号状态实时显示 |
| 流量统计 | TX/RX 字节数、速率实时监控 |
| 延时检测 | TCP 连接延时图表 |
| 健康看板 | 连接状态、端口信息综合面板 |
| 波形图 | 信号变化波形展示 |

### 📝 日志系统

| 功能 | 说明 |
|------|------|
| 文件记录 | 选择保存路径后实时写入日志文件，支持 UTF-8 BOM |
| 搜索高亮 | 大小写、正则、全词三种搜索模式，当前匹配项橙色高亮 |
| 日志编辑器 | 内置日志文本编辑器，支持搜索、复制、格式化 |
| 日志管理 | 每个标签页独立管理日志文件路径和写入状态 |
| 一键跟随 | 日志滚动到底部自动跟随，手动翻阅时显示"一键跟随"按钮 |

### 🎨 界面

| 功能 | 说明 |
|------|------|
| 自定义网格布局 | 自由拖拽排列各面板位置和大小 |
| 深色/浅色主题 | 内置深色浅色两套主题，支持实时切换 |
| 紧凑模式 | 减小面板间距以显示更多内容 |
| 多语言 | 中文和 English 界面 |

---

## 系统要求

- **操作系统**：Windows 10 / 11
- **运行时**：Tauri 2 内置 WebView2（Windows 10+ 自带，无需额外安装）
- **磁盘空间**：约 150 MB（打包后约 50 MB）

---

## 安装

### 方法一：下载便携版（推荐）

1. 前往 [Releases](https://github.com/iFishin/SCOM-T/releases/latest) 下载 `SCOM-T-portable.exe`
2. 双击运行，无需安装

### 方法二：NSIS 安装包

1. 前往 [Releases](https://github.com/iFishin/SCOM-T/releases/latest) 下载 NSIS 安装包
2. 运行安装程序，按照提示完成安装

---

## 开发与构建

### 环境要求

- Node.js 22+
- Rust 稳定版（安装见 [rustup](https://rustup.rs/)）
- Windows：Microsoft Visual Studio Build Tools（含 C++ 工具链）

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/iFishin/SCOM-T.git
cd SCOM-T

# 安装前端依赖
npm install

# 启动开发模式（Vite 热更新 + Tauri 窗口）
npm run tauri dev
```

### 打包构建

```bash
npm run tauri:build
```

构建产物位于：
- 便携版：`src-tauri/target/release/SCOM-T.exe`
- NSIS 安装包：`src-tauri/target/release/bundle/nsis/`

---

## 常见问题

<details>
<summary><b>Q: 程序启动后提示 1420 端口被占用？</b></summary>
这是 Vite 开发服务器的端口。结束占用该端口的进程后重试即可：<code>powershell "Stop-Process -Id (Get-NetTCPConnection -LocalPort 1420).OwningProcess -Force"</code>
</details>

<details>
<summary><b>Q: 日志文件打开后乱码？</b></summary>
新版本的日志文件已自动写入 UTF-8 BOM，Windows 记事本可正确识别。旧文件请删除后重新保存。
</details>

<details>
<summary><b>Q: 如何自定义云端市场服务器地址？</b></summary>
在设置 → 云端市场中可以修改服务器地址。默认为 <code>scom-t-marketplace.ifishin.top</code>。
</details>

<details>
<summary><b>Q: 旧版 SCOM 的配置可以迁移吗？</b></summary>
SCOM-T 使用全新的 YAML 配置格式，不兼容旧版 SCOM（Python）。指令响应集和提示配置可手动复制到 <code>~/SCOM-T/responses/</code> 和 <code>~/SCOM-T/prompts/</code> 目录。
</details>

---

## 贡献指南

欢迎任何形式的贡献！

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'feat: add some amazing feature'`
4. 推送到分支：`git push origin feature/amazing-feature`
5. 发起 Pull Request

### 贡献类型

- 🐛 报告 Bug 或提交修复
- ✨ 提出新功能建议或实现
- 📝 改进文档
- 🎨 优化界面和用户体验
- ⚡ 性能优化和代码重构

---

## 许可证

MIT License. 详见 [LICENSE](LICENSE) 文件。

---

<p align="center">
  如果这个项目对您有帮助，请考虑给它一个 ⭐<br />
  Made with ❤️ by iFishin
</p>
