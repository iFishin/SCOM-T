# SCOM-T Marketplace

一个纯静态的 SCOM-T 指令响应集市场，通过 GitHub Pages 部署。

## 目录结构

```
response-sets/*.yaml   ← 每个文件是一个响应集，格式与 SCOM-T 内 ResponseSetPage 保存的一致
scripts/build-index.mjs ← 从 response-sets/ 自动生成 index.json（列表接口）
index.json              ← 自动生成，不要手动编辑
```

## 添加新的响应集

1. 在 `response-sets/` 下新建 `{id}.yaml`（`id` 只能含字母、数字、`-`、`_`）
2. 至少包含 `name` 字段，`commands` 数组每项含 `command`
3. 提交并推送到 `main` 分支——CI 会自动重建 `index.json` 并发布

## 本地测试

```bash
npm install
npm run build-index
```

## 首次部署

1. 在 GitHub 仓库 Settings → Pages → Source 选择 **GitHub Actions**
2. push 到 `main` 分支即可触发 `.github/workflows/deploy.yml`
3. 部署完成后，市场地址为 `https://<user>.github.io/<repo>/`

## 在 SCOM-T 中使用

设置 → 通用 → 云端市场地址，填入上面的部署地址（末尾可带或不带 `/`）。

## 已知限制

GitHub Pages 是纯静态站点，不支持服务端鉴权校验——`cloudAuthToken` 字段的请求头会发送，但没有服务端逻辑校验它。适用于**公开、无需鉴权**的共享场景。如果需要私有市场，需换成带后端逻辑的服务（例如 Cloudflare Workers）。
