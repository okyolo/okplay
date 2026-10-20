#!/bin/bash
#
# macOS 启动器 —— 由桌面上的 `okplay.app` 调用。
#
# 那个 .app 是 `npm run shortcut` 用 osacompile 生成的，内部只执行本脚本。
# 直接跑 Electron 二进制、把仓库根目录作为参数传进去，等价于 `npm start`，
# 但**不会弹终端窗口**。日志写到 /tmp/okplay-start.log。
#
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON="$DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
MAIN="$DIR/dist/main/index.js"

if [ ! -x "$ELECTRON" ]; then
  echo "找不到 Electron：$ELECTRON" >&2
  echo "先在这个目录跑 npm install。" >&2
  exit 1
fi

# 没有构建产物时 Electron 不会开窗口，只在这个日志里留一行错误。
if [ ! -f "$MAIN" ]; then
  echo "构建产物缺失：$MAIN" >&2
  echo "先跑 npm run build；或重跑 npm run shortcut（它会自动构建）。" >&2
  exit 1
fi

exec "$ELECTRON" "$DIR"
