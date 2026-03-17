# drawdesk

Lightweight desktop Excalidraw viewer/editor built with Tauri v2 + Vite + React + TypeScript.

## Architecture

- **Frontend**: React app with `@excalidraw/excalidraw` component (`src/`)
- **Backend**: Minimal Rust/Tauri shell — just file I/O and CLI arg passing (`src-tauri/`)
- **No server**: Tauri bundles the frontend into a single binary using the system webview (WebKitGTK on Linux)

## Key Files

- `src/App.tsx` — Main React component: Excalidraw wrapper, file I/O, keyboard shortcuts, image paste
- `src/excalidraw-md.ts` — Parsing/serialization of `.excalidraw.md` format (Obsidian compatibility)
- `src/image.ts` — Image utilities: data URL conversion, MIME type detection
- `src/theme.ts` — System theme detection and Excalidraw theme appState helpers
- `src/App.css` — Styling (Excalidraw CSS variable overrides, dark mode canvas filter fix)
- `src-tauri/src/lib.rs` — CLI arg handling (`--image` flag), Tauri plugin setup
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
drawdesk --image screenshot.png              # Open with image on canvas
drawdesk -i screenshot.png out.excalidraw.md # Open image + set save target
```

## Keyboard Shortcuts

- `Ctrl+O` — Open file
- `Ctrl+N` — New drawing
- `Ctrl+S` — Save (immediate; also auto-saves 5s after changes)
- `Ctrl+C` — Copy entire canvas as PNG to clipboard (overrides Excalidraw's default JSON copy)
- `Ctrl+V` — Paste image from clipboard (supports file paths and `file://` URIs)

## Releasing

GitHub Actions workflow (`.github/workflows/release.yml`) builds in an Arch Linux container and creates a GitHub release with a tarball containing the binary + `.desktop` file.

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Important

- After making changes, always run `./install.sh` to rebuild and reinstall — the app launcher runs the installed binary, not the dev server
- `tsc --noEmit` and `tsc -b` may give different results; `npm run build` uses `tsc -b` which is stricter

## Conventions

- Tauri v2 APIs (not v1) — imports from `@tauri-apps/api`, `@tauri-apps/plugin-*`
- All deps use loose version ranges for easy updates (`npm update` + `cargo update`)
- Theme follows system preference (dark/light)
- Dark mode: Excalidraw's CSS canvas filter (`invert(93%) hue-rotate(180deg)`) is disabled via `App.css` to preserve image colors. Instead, dark background + light stroke colors are set directly in appState (see `theme.ts`).
- Custom buttons use Excalidraw's `renderTopRightUI` prop and its CSS variables
- Port 48205 for dev server (avoid conflicts)
