# drawdesk

A lightweight desktop app for viewing and editing [Excalidraw](https://excalidraw.com) drawings. Built with Tauri v2 — runs as a native window using your system webview, no Electron bloat.

## Features

- Opens `.excalidraw` and `.excalidraw.md` (Obsidian plugin format) files
- Handles compressed (LZ-string) `.excalidraw.md` files transparently
- CLI-first: `drawdesk myfile.excalidraw.md` — opens existing or creates new
- Auto-save (5s after changes) + manual save with Ctrl+S
- Dark theme
- Single self-contained binary

## Install

Requires: Node.js, Rust, and `webkit2gtk` (Linux).

```bash
git clone https://github.com/user/drawdesk.git
cd drawdesk
./install.sh
```

This builds a release binary and copies it to `~/.local/bin/drawdesk`.

## Usage

```bash
drawdesk drawing.excalidraw.md   # open file
drawdesk new-sketch.excalidraw   # create new (file doesn't need to exist yet)
drawdesk                         # launch with welcome screen
```

Keyboard shortcuts: Ctrl+O (open), Ctrl+N (new), Ctrl+S (save).

## Dev

```bash
npm install
npm run tauri dev
```
