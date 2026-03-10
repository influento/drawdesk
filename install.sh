#!/bin/sh
set -e
cd "$(dirname "$0")"
npm install --silent
npm run tauri build 2>&1 | tail -5
cp src-tauri/target/release/drawdesk ~/.local/bin/
cp drawdesk.desktop ~/.local/share/applications/
echo "drawdesk installed to ~/.local/bin/drawdesk"
