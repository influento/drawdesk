# drawdesk

Lightweight desktop Excalidraw viewer/editor built with Tauri v2 + Vite + React + TypeScript.

## Architecture

- **Frontend**: React app with `@excalidraw/excalidraw` component (`src/`)
- **Backend**: Minimal Rust/Tauri shell — just file I/O and CLI arg passing (`src-tauri/`)
- **No server**: Tauri bundles the frontend into a single binary using the system webview (WebKitGTK on Linux)

## Key Files

- `src/App.tsx` — All app logic: file parsing, save/load, UI, keyboard shortcuts
- `src/App.css` — Styling (uses Excalidraw's CSS variables for toolbar buttons)
- `src-tauri/src/lib.rs` — CLI arg handling, Tauri plugin setup
- `src-tauri/tauri.conf.json` — Window config, dev server URL (port 48205), permissions
- `src-tauri/capabilities/default.json` — Tauri v2 permission grants (fs, dialog)
- `install.sh` — Builds release and copies binary to ~/.local/bin/

## File Formats

Supports two formats:
- `.excalidraw` — raw JSON
- `.excalidraw.md` — Obsidian Excalidraw plugin format (JSON wrapped in markdown with frontmatter)
  - Handles both `json` and `compressed-json` (LZ-string) code blocks
  - Preserves original compression format on save

## Dev Commands

```bash
npm run tauri dev                           # Dev mode
npm run tauri dev -- -- path/to/file        # Dev mode with file
npm run tauri build                         # Release build
./install.sh                                # Build + install to ~/.local/bin/
```

## CLI Usage

```bash
drawdesk file.excalidraw.md    # Open existing file
drawdesk new.excalidraw.md     # Create new (file doesn't need to exist)
drawdesk                       # Welcome screen with New/Open buttons
```

## Keyboard Shortcuts

- `Ctrl+O` — Open file
- `Ctrl+N` — New drawing
- `Ctrl+S` — Save (immediate; also auto-saves 5s after changes)

## Conventions

- Tauri v2 APIs (not v1) — imports from `@tauri-apps/api`, `@tauri-apps/plugin-*`
- All deps use loose version ranges for easy updates (`npm update` + `cargo update`)
- Dark theme forced by default
- Custom buttons use Excalidraw's `renderTopRightUI` prop and its CSS variables
- Port 48205 for dev server (avoid conflicts)
