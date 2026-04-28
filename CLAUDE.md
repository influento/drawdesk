# drawdesk

Lightweight desktop Excalidraw viewer/editor built with Tauri v2 + Vite + React + TypeScript.

## Architecture

- **Frontend**: React app with `@excalidraw/excalidraw` component (`src/`)
- **Backend**: Minimal Rust/Tauri shell — just file I/O and CLI arg passing (`src-tauri/`)
- **No server**: Tauri bundles the frontend into a single binary using the system webview (WebKitGTK on Linux)

## Features

Every feature, where it lives. Source is the source of truth — entries here are pointers, not duplications.

| Feature | Source |
|---|---|
| Open/save `.excalidraw` and `.excalidraw.md` | `src/App.tsx:38` (`loadFile`), `src/App.tsx:190` (`saveFile`), `src/excalidraw-md.ts` |
| Auto-save 5s after change | `src/App.tsx:314` (debounced `saveFile`) |
| Welcome screen (New / Open) | `src/App.tsx:322` |
| File-path indicator (bottom of canvas) | `src/App.tsx:362`, `.file-path-indicator` in `src/App.css` |
| Dismissible error banner | `src/App.tsx:330,361`, `.error-banner` in `src/App.css` |
| Custom toolbar (New / Open buttons via `renderTopRightUI`) | `src/App.tsx:347` |
| System-theme-following dark/light | `src/theme.ts`, `src/App.tsx:31` (live `matchMedia`) |
| Dark-mode WYSIWYG colors (`--theme-filter: none` globally) | `src/App.css` (`.excalidraw.theme--dark`), `src/theme.ts` |
| Custom 5 stroke top picks (white/blue/grape/teal/red) | `scripts/patch-excalidraw-picks.mjs` (postinstall patch — Excalidraw bakes picks into the bundle, no prop exists) |
| Image paste from clipboard text path (Ctrl+Shift+V) | `src/App.tsx:264` (paste handler), `src/App.tsx:79` (`insertImageToCanvas`) |
| Copy selection (or canvas) as PNG → sway pipeline (Ctrl+Shift+C) | `src/App.tsx:217` (`copySelectionAsPng`), `src-tauri/src/lib.rs` (`copy_png_via_sway`) |
| CLI: open file (positional) / `--image` flag | `src-tauri/src/lib.rs` (arg parsing), `src/App.tsx:134` (init) |
| WebKitGTK crash mitigation | `src-tauri/src/lib.rs` (`WEBKIT_SKIA_GPU_PAINTING_THREADS=1`) |

## Key Files

- `src/App.tsx` — Excalidraw wrapper, file I/O, keyboard shortcuts, image paste
- `src/excalidraw-md.ts` — `.excalidraw.md` (Obsidian) parse/serialize; handles `json` and `compressed-json` (LZ-string) blocks, preserves original compression
- `src/image.ts` — Image utils: data URL conversion, MIME type detection
- `src/theme.ts` — System theme detection + dark-mode appState defaults
- `src/App.css` — Styling, dark-mode `--theme-filter` override
- `src-tauri/src/lib.rs` — CLI arg parsing, `copy_png_via_sway` command, Tauri plugin setup
- `src-tauri/tauri.conf.json` — Window config, dev server port (48205)
- `src-tauri/capabilities/default.json` — Tauri v2 permission grants (fs, dialog)
- `install.sh` — Build release + copy binary to `~/.local/bin/`
- `scripts/patch-excalidraw-picks.mjs` — `postinstall` patch for Excalidraw's hardcoded stroke top picks. Matches by shape (regex), so it survives content-hash filename changes; will fail loudly if upstream restructures the constants.

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
- `Ctrl+C` / `Ctrl+V` — Native Excalidraw copy/paste (selected elements)
- `Ctrl+Shift+C` — Export selection (or whole canvas if nothing selected) as PNG; hands it to sway's `wl-copy + delayed-rm` pipeline (see `copy_png_via_sway` in `lib.rs`). Requires `wl-copy` on PATH.
- `Ctrl+Shift+V` — Paste image from clipboard text (file paths and `file://` URIs)

## Releasing

GitHub Actions workflow (`.github/workflows/release.yml`) builds in an Arch Linux container and creates a GitHub release with a tarball containing the binary + `.desktop` file.

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Important

- After making changes, always run `./install.sh` to rebuild and reinstall — the app launcher runs the installed binary, not the dev server
- `tsc --noEmit` and `tsc -b` may give different results; `npm run build` uses `tsc -b` which is stricter

## Git

- Do not add `Co-Authored-By` trailers to git commits
- Before every commit/push, audit the staged diff for sensitive information leaks:
  usernames, passwords, API keys, tokens, private IPs, email addresses, or any
  data that should not appear in a public repository. Flag any findings to the user
  before proceeding

## Known Issues

- **WebKitGTK crashes during drawing** — WebKitWebProcess segfaults (SIGSEGV/SIGABRT) due to race conditions in multi-threaded Skia GPU painting on AMD radeonsi + Mesa. Current mitigation: `WEBKIT_SKIA_GPU_PAINTING_THREADS=1` set in `lib.rs` at startup. If crashes persist, try in order:
  1. `WEBKIT_SKIA_GPU_PAINTING_THREADS=0` (single-thread GPU painting)
  2. `mesa_glthread=false` (disable Mesa's GL threading, can combine with above)
  3. `WEBKIT_DISABLE_COMPOSITING_MODE=1` (disable HW compositing entirely, moderate perf hit)
  4. `WEBKIT_DISABLE_DMABUF_RENDERER=1` (last resort, significant perf hit)
  5. Upgrade WebKitGTK — 2.52.0 fixes ThreadedCompositor race conditions that may help

## Conventions

- Tauri v2 APIs (not v1) — imports from `@tauri-apps/api`, `@tauri-apps/plugin-*`
- All deps use loose version ranges for easy updates (`npm update` + `cargo update`)
- Port 48205 for dev server (avoid conflicts)
