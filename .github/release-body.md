<!-- 这份说明会被整段塞进 GitHub Release 的发布页，四个平台的产物都由同一份流水线产出。 -->

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
