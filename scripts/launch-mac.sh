#!/bin/bash
#
# macOS 启动器 —— 由桌面上的 `OKPlay-源码安装.app` 调用。
#
# 那个 .app 是 `npm run shortcut` 用 osacompile 生成的，内部只执行本脚本。
# 直接跑 Electron 二进制、把仓库根目录作为参数传进去，等价于 `npm start`，
# 但**不会弹终端窗口**。日志写到 /tmp/okplay-start.log。
#
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON="$DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"

if [ ! -x "$ELECTRON" ]; then
  echo "找不到 Electron：$ELECTRON" >&2
  echo "先在这个目录跑 npm install。" >&2
  exit 1
fi

exec "$ELECTRON" "$DIR"
