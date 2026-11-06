# 开发约定

## 环境与本地校验

- Node 22、Rust stable；Linux 打包所需的系统库清单见 `.github/workflows/build-release.yml`。
- 提交前跑：`npm ci && npx tsc --noEmit && npm test`。

## CI 门禁

- `.github/workflows/ci.yml`：PR 与 `push main` 触发，跑类型检查 + 单测（不打包，保持快速）。合并前必须全绿。
- `.github/workflows/build-release.yml`：打 `v*` tag 时跑四平台矩阵（macOS aarch64/x86_64、Windows、Linux），矩阵里会再跑一次 `npm test` 作为发版前的最后兜底。

## 在外置盘 / exFAT 卷上开发

macOS 会在 exFAT 卷上为每个文件生成 `._*` AppleDouble 元数据文件，会带来三类问题：

1. **git 出现大量假修改** — 设置 `git config core.filemode false`，并清理 `._*`。
2. **vitest 把 `._xxx.test.ts` 当成测试文件** — `vitest.config.ts` 已用 `exclude: [...configDefaults.exclude, '**/._*']` 排除。
3. **Tauri 编译报 `stream did not contain valid UTF-8`** — `tauri-build` 扫描 `src-tauri/` 时会把 `._tauri.macos.conf.json` 之类的元数据文件当成配置解析。`src-tauri/build.rs` 会先给出明确警告，指出是哪些文件。

清理（只删元数据文件，不动源文件）：

```bash
find . -name '._*' -delete
```

如果不想反复清理，用**同一块外置盘**上的 APFS 稀疏镜像承载构建，构建产物仍留在外置盘、不占内部盘空间：

```bash
hdiutil create -size 60g -fs APFS -type SPARSE -volname scom-build \
  /Volumes/WorDpassort/scom-build.sparseimage
hdiutil attach /Volumes/WorDpassort/scom-build.sparseimage -mountpoint /Volumes/scom-build
```

然后在 `src-tauri/.cargo/config.toml`（已加入 `.git/info/exclude`，不入库）里写：

```toml
[build]
target-dir = "/Volumes/scom-build/cargo-target"
```

APFS 卷不会生成 `._*`，编译稳定。`build.rs` 只做诊断，**不会自动删除任何文件**。

## 代码签名（已知取舍）

当前发布包**没有代码签名**：macOS 首次打开会被 Gatekeeper 拦、Windows 会被 SmartScreen 拦，绕法写在 `.github/release-body.md` 并会展示在发布页。将来拿到证书后，在 `build-release.yml` 的「构建」步骤前补 `codesign` / `notarytool` / `signtool` 即可，矩阵其余部分无需改动。

## 发版流程

1. `npm run bump:patch|minor|major` 同步 `VERSION` 与 `tauri.conf.json` 的版本号（流水线会校验 tag 与配置一致）。
2. 打 `v*` tag 并推送 → 四平台矩阵自动构建并上传到草稿 Release。
3. 矩阵全绿后草稿 Release 转正；任一平台失败则不会发布。
