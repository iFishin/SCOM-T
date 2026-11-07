<!-- 这份说明会被整段塞进 GitHub Release 的发布页，四个平台的产物都由同一份流水线产出。 -->

## 0.3.91 更新内容

**问题修复**

- HEX 固件解码与 QCOM 显示不一致、`AT+QRST` 后 `OK` 变成方块问号（#36 / #37）：接收与日志改为无损字节解码，HEX 视图以真实字节为准。
- 循环发送延时不生效（#35）：循环真正按间隔停顿，新增「循环间隔」输入框（默认 3000ms），未填逐行间隔的指令回退默认值；循环结束后「停止」按钮即时复位。
- 取消勾选指令白屏（#11）：修复重复 order 与状态更新崩溃点，错误边界提到最外层。

**工程与稳定性**

- 发版改为 macOS（Apple Silicon / Intel）、Windows、Linux 四平台矩阵构建。
- 新增 PR 质量门禁（类型检查 + 单测），补循环状态机、设置落盘、信号轮询的确定性单测。
- 接收日志消除每次追加的 O(n) 重算；关窗前落盘配置、信号轮询防并发叠加、更新检查加超时并修正预发布版本比较（#41–#45）。

## 下载哪个

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `SCOM-T_<版本>_x64-setup.exe` | NSIS 安装包，装到当前用户目录 |
| Windows | `SCOM-T_<版本>_x64_portable.exe` | 免安装，双击即用，不写注册表 |
| macOS（Apple Silicon） | `SCOM-T_<版本>_aarch64.dmg` | M 系列芯片 |
| macOS（Intel） | `SCOM-T_<版本>_x64.dmg` | Intel 芯片 |
| Linux | `SCOM-T_<版本>_amd64.deb` | Debian / Ubuntu |
| Linux | `SCOM-T_<版本>_amd64.AppImage` | 任意发行版，免安装 |

> 不确定自己的 Mac 是什么芯片？左上角  →「关于本机」，看「芯片」一行：Apple M 开头选 aarch64，Intel 选 x64。

## 这些包**没有代码签名**

所以第一次打开时系统会拦你一下，这是正常的，不是包坏了。绕过方式如下。

**macOS**：提示「无法打开，因为 Apple 无法检查其是否包含恶意软件」时——

- 方式一：在「应用程序」里右键点击 SCOM-T →「打开」→ 再点「打开」；
- 方式二：终端执行一次，之后正常双击即可：

  ```bash
  xattr -dr com.apple.quarantine /Applications/SCOM-T.app
  ```

如果提示「已损坏，无法打开」，用的就是方式二这条命令，不是文件真的坏了。

**Windows**：提示「Windows 已保护你的电脑」时，点「更多信息」→「仍要运行」。SmartScreen 只是不认识这个发布者。

**Linux**：

```bash
# deb
sudo apt install ./SCOM-T_<版本>_amd64.deb

# AppImage
chmod +x SCOM-T_<版本>_amd64.AppImage
./SCOM-T_<版本>_amd64.AppImage
```

AppImage 需要系统里有 FUSE；没有的话用 `./SCOM-T_x.y.z_amd64.AppImage --appimage-extract-and-run`。

## 各平台的成熟度

- **Windows**：主要开发平台，功能最完整。
- **macOS / Linux**：可以构建、可以跑，但**没有做长期真机验证**。macOS 用的是无边框窗口 + 自定义标题栏，与系统习惯不完全一致；Linux 的托盘图标需要 `libayatana-appindicator3`，部分精简发行版可能没装。

遇到问题请提 [issue](https://github.com/iFishin/SCOM-T/issues)，附上平台、版本号和复现步骤。
