// Override the 5 default stroke "top picks" in the Excalidraw color picker.
// Excalidraw bakes the picks (DEFAULT_ELEMENT_STROKE_PICKS) into its bundle as
// constants — there's no prop / API to override them — so we patch the
// installed package directly. Runs as `postinstall`, so this stays in sync
// across `npm install`, `npm ci`, and CI builds.
//
// We patch both bundles:
//   - dist/dev/  (used by `npm run tauri dev`)
//   - dist/prod/ (used by `vite build` → `tauri build`)
// Filenames are content-hashed and change on every Excalidraw upgrade, so we
// glob the chunk files and match on a distinctive shape rather than an exact
// filename. If the upstream ever restructures these constants the script
// will warn loudly and the build can be re-checked.
//
// Picks: white, blue, grape, teal, red.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "node_modules/@excalidraw/excalidraw/dist";

// dist/dev: human-readable. Stable identifiers, easy to match.
const DEV_FROM = `var DEFAULT_ELEMENT_STROKE_PICKS = [
  COLOR_PALETTE.black,
  COLOR_PALETTE.red[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
  COLOR_PALETTE.green[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
  COLOR_PALETTE.blue[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
  COLOR_PALETTE.yellow[DEFAULT_ELEMENT_STROKE_COLOR_INDEX]
];`;
const DEV_TO = `var DEFAULT_ELEMENT_STROKE_PICKS = [
  COLOR_PALETTE.white,
  COLOR_PALETTE.blue[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
  COLOR_PALETTE.grape[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
  COLOR_PALETTE.teal[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
  COLOR_PALETTE.red[DEFAULT_ELEMENT_STROKE_COLOR_INDEX]
];`;

// dist/prod: minified. Identifier names change every release, but the
// distinctive shape `[X.black,X.red[Y],X.green[Y],X.blue[Y],X.yellow[Y]]`
// uniquely identifies the picks array regardless of what X and Y are.
const PROD_RE = /\[([A-Za-z_$][A-Za-z_$0-9]*)\.black,\1\.red\[([A-Za-z_$][A-Za-z_$0-9]*)\],\1\.green\[\2\],\1\.blue\[\2\],\1\.yellow\[\2\]\]/;
// Already-patched shape: distinguishes a successful prior patch from
// an upstream restructure so reruns are idempotent.
const PROD_RE_PATCHED = /\[([A-Za-z_$][A-Za-z_$0-9]*)\.white,\1\.blue\[([A-Za-z_$][A-Za-z_$0-9]*)\],\1\.grape\[\2\],\1\.teal\[\2\],\1\.red\[\2\]\]/;

function patchTree(dir, mode) {
  let chunks;
  try { chunks = readdirSync(dir).filter((n) => n.endsWith(".js")); }
  catch { return { found: false, patched: 0 }; }

  let patched = 0;
  for (const name of chunks) {
    const path = join(dir, name);
    const src = readFileSync(path, "utf8");

    if (mode === "dev") {
      if (src.includes(DEV_FROM)) {
        writeFileSync(path, src.replace(DEV_FROM, DEV_TO));
        patched++;
      } else if (src.includes(DEV_TO)) {
        // already patched
        patched++;
      }
    } else {
      const m = src.match(PROD_RE);
      if (m) {
        const [, palette, idx] = m;
        const replacement =
          `[${palette}.white,${palette}.blue[${idx}],${palette}.grape[${idx}],${palette}.teal[${idx}],${palette}.red[${idx}]]`;
        writeFileSync(path, src.replace(PROD_RE, replacement));
        patched++;
      } else if (PROD_RE_PATCHED.test(src)) {
        // already patched
        patched++;
      }
    }
  }
  return { found: true, patched };
}

const dev = patchTree(`${ROOT}/dev`, "dev");
const prod = patchTree(`${ROOT}/prod`, "prod");

if (!dev.found && !prod.found) {
  console.warn("[patch-excalidraw-picks] Excalidraw not installed; skipping.");
  process.exit(0);
}
if (dev.found && dev.patched === 0) {
  console.error("[patch-excalidraw-picks] dev bundle: stroke-picks pattern not found. Did Excalidraw restructure?");
  process.exit(1);
}
if (prod.found && prod.patched === 0) {
  console.error("[patch-excalidraw-picks] prod bundle: stroke-picks pattern not found. Did Excalidraw restructure?");
  process.exit(1);
}
console.log(`[patch-excalidraw-picks] dev: ${dev.patched}, prod: ${prod.patched} chunk(s) patched.`);
