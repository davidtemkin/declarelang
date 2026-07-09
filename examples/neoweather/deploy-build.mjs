// deploy-build.mjs — assemble the static /neolzx bundle (the four-app side-by-side +
// source page) for Firebase Hosting under davidtemkin.com/neolzx.
//
// Bakes a live comparison into a self-contained static tree:
//   - the two neo apps (DOM + Canvas) = the neo runtime (runtime/dist/) + the compiled
//     program inlined into a page per backend;
//   - the two PRECOMPILED OL apps (dhtml + canvas), taken from workshop/neoweather/;
//   - the OL runtime they load (openlaszlo-5.0/runtime, minus lfc-src/ which is source);
//   - neoweather's resources + its bundled data/weather.json;
//   - the two source files, linked under the columns.
//
// Root-absolute OL paths (/runtime) are rewritten to the deploy base so the tree is
// subpath-portable.
//
//   node examples/neoweather/deploy-build.mjs [outDir]   # default: ~/Code/Mesa/deploy/neolzx

import path from "node:path";
import os from "node:os";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compile } from "../../compiler/dist/compile-node.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));   // examples/neoweather
const ROOT = path.resolve(HERE, "../..");                    // the neolzx distro root
const OL5 = path.resolve(ROOT, "../openlaszlo-5.0");         // the sibling OpenLaszlo 5.0 distro
const WORKSHOP = path.resolve(ROOT, "workshop/neoweather");  // the OL reference builds (dhtml + canvas)
const ORIGINAL_SRC = path.join(WORKSHOP, "original");        // the OL weather bundle (has weather.lzx, for the src link)

const BASE = "/neolzx"; // deploy subpath (davidtemkin.com/neolzx)
const OUT = process.argv[2] ?? path.join(os.homedir(), "Code/Mesa/deploy/neolzx");

// fail early with a clear message if a required input is missing (the OL refs live in the
// git-ignored workshop/; regenerate them there if this fires).
for (const [label, p] of [
  ["neo runtime build (run `npm run build`)", path.join(ROOT, "runtime/dist/index.js")],
  ["OL reference build workshop/neoweather/original", path.join(WORKSHOP, "original", "weather.html")],
  ["openlaszlo-5.0 runtime", path.join(OL5, "runtime")],
]) if (!existsSync(p)) throw new Error(`deploy-build: missing ${label}\n  expected: ${p}`);

const copy = (src, dst) => cpSync(src, dst, { recursive: true });
const write = (rel, body) => { const p = path.join(OUT, rel); mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, body); };

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// ── the neo apps: the neo runtime + resources + bundled data ─────────────────
copy(path.join(ROOT, "runtime/dist"), path.join(OUT, "dist"));   // neo runtime → OUT/dist
copy(path.join(HERE, "resources"), path.join(OUT, "resources"));
copy(path.join(HERE, "data"), path.join(OUT, "data"));           // weather.json (referenced relatively)

// compile the program; inline it into a page per backend. Its data/… and resources/…
// refs are already relative to the page, so nothing to rewrite.
const compiled = compile(readFileSync(path.join(HERE, "neoweather.neolzx"), "utf8"), { originDir: HERE });
if (compiled.errors.length || compiled.warnings.length)
  throw new Error("neoweather did not compile clean:\n" + [...compiled.errors, ...compiled.warnings].map((e) => "  " + e.message).join("\n"));
const NEO_SOURCE = compiled.source;

const neoPage = (backend) => `<!doctype html>
<meta charset="utf-8"><title>neoweather (${backend})</title>
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
  import { renderAsync, ${backend}, Image } from "./dist/index.js";
  const app = await renderAsync(${JSON.stringify(NEO_SOURCE)}, document.getElementById("host"), new ${backend}());
  window.__app = app;
  const images = [];
  (function walk(v) { if (v instanceof Image && v.source) images.push(v);
    for (const c of v.children ?? []) walk(c); })(app);
  const tick = () => { if (images.every((i) => i.loaded))
      requestAnimationFrame(() => requestAnimationFrame(() => { window.__ready = true; }));
    else requestAnimationFrame(tick); };
  tick();
</script>`;
write("neo-dom.html", neoPage("DomBackend"));
write("neo-canvas.html", neoPage("CanvasBackend"));

// ── the OL apps: precompiled (from workshop/), self-contained but for the runtime ────
// Copy each compiled app dir (weather.html + weather.lzx.js + resources/ + data/) and
// repoint its baked root-absolute /runtime/ refs at the deploy base.
for (const app of ["original", "original-canvas"]) {
  copy(path.join(WORKSHOP, app), path.join(OUT, app));
  const htmlPath = path.join(OUT, app, "weather.html");
  writeFileSync(htmlPath, readFileSync(htmlPath, "utf8").replaceAll("/runtime/", `${BASE}/runtime/`));
}

// ── the OL runtime the apps load (openlaszlo-5.0, minus lfc-src/: source, never loaded) ──
copy(path.join(OL5, "runtime"), path.join(OUT, "runtime"));
rmSync(path.join(OUT, "runtime/lfc-src"), { recursive: true, force: true });

// ── the two source files, linked under the columns ──────────────────────────
copy(path.join(ORIGINAL_SRC, "weather.lzx"), path.join(OUT, "src/weather.lzx"));
copy(path.join(HERE, "neoweather.neolzx"), path.join(OUT, "src/neoweather.neolzx"));

// ── the index page: the four columns + the two source links ─────────────────
const WIDTH = 240, HEIGHT = 320, gap = 16;
const lzxW = 2 * WIDTH + gap, neoW = 2 * WIDTH + gap;
write("index.html", `<!doctype html><meta charset="utf-8"><title>neoweather side-by-side</title>
<style>
  body{font:14px sans-serif;background:#333;color:#eee;padding:16px;margin:0}
  .row{display:flex;gap:${gap}px;flex-wrap:wrap;align-items:flex-start}
  figure{margin:0}
  iframe{width:${WIDTH}px;height:${HEIGHT}px;border:1px solid #555}
  figcaption{margin-top:4px;color:#bbb}
  .srcs{margin-top:12px}
  .srcs a{box-sizing:border-box;display:block;text-align:center;padding:9px;background:#3f4977;
    color:#cdd6ff;text-decoration:none;border:1px solid #555;border-radius:4px}
  .srcs a:hover{background:#4a5590}
  .srcs a small{color:#9aa4d8}
</style>
<div class="row">
  <figure><iframe src="original/weather.html"></iframe><figcaption>original — dhtml (OL 5.0)</figcaption></figure>
  <figure><iframe src="original-canvas/weather.html"></iframe><figcaption>original — canvas (OL 5.0)</figcaption></figure>
  <figure><iframe src="neo-dom.html"></iframe><figcaption>neoweather — DOM</figcaption></figure>
  <figure><iframe src="neo-canvas.html"></iframe><figcaption>neoweather — Canvas</figcaption></figure>
</div>
<div class="row srcs">
  <a style="width:${lzxW}px" href="src/weather.lzx" target="_blank">View source: &nbsp; examples/weather/weather.lzx &nbsp; <small>LZX</small></a>
  <a style="width:${neoW}px" href="src/neoweather.neolzx" target="_blank">View source: &nbsp; examples/neoweather/neoweather.neolzx &nbsp; <small>neo-LZX</small></a>
</div>`);

console.log("built:", OUT);
