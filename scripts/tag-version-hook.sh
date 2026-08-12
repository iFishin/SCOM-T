#!/bin/sh
# post-tag hook —— 创建 tag 后自动同步 VERSION 文件
#
# 安装（一次性，本地开发者环境）：
#   cp scripts/tag-version-hook.sh .git/hooks/post-tag
#   chmod +x .git/hooks/post-tag
#
# 之后执行 `git tag vX.Y.Z` 时，会自动把 VERSION 文件更新为 X.Y.Z
# 并提交，提示推送 main 使 raw 端生效。

tag=$(git describe --tags --abbrev=0 2>/dev/null)
version=${tag#v}

if [ -z "$version" ]; then
  echo "post-tag: 无法解析 tag 版本，跳过 VERSION 更新" >&2
  exit 0
fi

echo "$version" > VERSION

if git diff --quiet VERSION; then
  echo "post-tag: VERSION 已是最新（$version），无需更新"
  exit 0
fi

git add VERSION
git commit -m "chore: 更新 VERSION 至 $version" >/dev/null 2>&1

echo "post-tag: VERSION 已更新为 $version 并提交"
echo "post-tag: 请推送 main 使远端生效：git push origin main"
