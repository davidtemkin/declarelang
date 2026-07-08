// parity-fix-lzpix-dragdrop.mjs — SINGLE-APP re-measurement for the two parity-sweep apps whose
// bare-static-server context was degrading them to a harness artifact rather than their real
// canvas-vs-dhtml behavior:
//
//   1. examples/lzpix/app.lzx — canned "Data source error" dialog on BOTH kernels.
//      ROOT CAUSE: the compiler always bakes `__LZproxied:"true"` into the compiled canvas
//      (compiler/src/compile.ts canvasDefaults; no `--solo`/`--proxied=false` flag was passed by
//      parity-sweep.mjs's compileAll()). With proxied=true, LzHTTPDataProvider.doRequest (see
//      openlaszlo-5.0/runtime/lfc-src/data/LzHTTPDataProvider.lzs ~L186-215) routes EVERY dataset
//      request through `makeProxiedURL(...)` — i.e. it expects a server-side proxy endpoint, which
//      does not exist in a bare-static-server context. So `favoritesds`' request for the app's own
//      bundled `data/favorites.xml` never becomes a real HTTP request at all (confirmed via a
//      network-observing headless-Chrome probe: literally zero requests for anything under data/
//      — not even a failed one), and gDataMan's registered onerror handler fires the
//      "Data source error" dialog on BOTH kernels equally.
//      This is NOT a dynamic-backend requirement (lzpix's data is 100% static bundled XML/JPEG
//      under examples/lzpix/data/) — it's a compile-mode mismatch: a standalone-static deployment
//      (GitHub Pages, this sweep's dumb static server) needs the SOLO build (`proxied:false`), the
//      same way the real distro's Service Worker always compiles with `proxied:false` for static
//      hosting (see docs/README-STATIC.md + service-worker.js `compileInBrowser(..., proxied:false)`
//      "SOLO static distro — no dynamic data proxy").
//      FIX (harness-only, no compiler/runtime edit): both LFC kernels ALSO honor a `lzproxied`
//      query arg on the app URL, checked BEFORE the compiled-in value (LaszloCanvas.lzs L326-330
//      `getQueryArg('proxied','lzproxied')`; confirmed present in both frozen snapshot kernels via
//      `grep lzproxied` on LFCcanvas.js and lfc.js) — the exact mechanism explorer/index.html
//      already uses live (`url: 'explore-nav.js?lzproxied=false'`). So the wrapper for lzpix only
//      needs `url:'<js>?lzproxied=false'`; no recompile flag, no new compiled artifact needed.
//
//   2. explorer/basics/drag-and-drop.lzx — two `<view resource="../images/laszlo_explorer_logo.png">`
//      images 404 on both kernels (dhtml: broken-image placeholder; canvas: draws nothing).
//      ROOT CAUSE: a genuine compiler bug in compiler/src/node-io.ts `relPathOf`'s `maxCommonPrefix`
//      (character-by-character, not path-segment-aware). The resource lives OUTSIDE the compiling
//      app's own directory (`explorer/basics/` → `../images/` = `explorer/images/`, a directory
//      shared by several explorer/ demos), so it's classified ptype "sr" (server-root) and its
//      relPath is computed relative to `maxCommonPrefix(absPath, LPS_HOME)`. Because this repo's
//      path (.../openlaszlo-neo/explorer/images/...) and LPS_HOME (.../openlaszlo-5.0/runtime)
//      share the literal character run ".../OpenLaszlo/openlaszlo-" before diverging at "neo" vs
//      "5.0", the naive char-compare treats that as the common prefix — producing the nonsense
//      relPath "neo/explorer/images/laszlo_explorer_logo.png" (verified: the compiled
//      `explorer/basics/drag-and-drop.lzx.js` literally contains
//      `LzResourceLibrary.$LZ1={ptype:"sr",frames:['neo/explorer/images/laszlo_explorer_logo.png'],...}`).
//      Confirmed end-to-end via a network probe: the browser requests exactly
//      `/explorer/basics/lps/resources/neo/explorer/images/laszlo_explorer_logo.png` (serverroot
//      'lps/resources/' + that garbled relPath) → 404, because no such path exists anywhere.
//      The actual PNG is real and present at `explorer/images/laszlo_explorer_logo.png` (confirmed
//      on disk; also used correctly, with the SAME "../images/..." source reference, by
//      explorer/components/components.lzx — this is a real, reachable, non-dead resource).
//      compiler/ and the .lzx source are off-limits for this task, so the fix is applied to the
//      GENERATED `.lzx.js` sibling artifact (exactly analogous to parity-sweep.mjs's own cv/dh
//      wrapper generation): rewrite the two corrupted resource-library entries from
//      `{ptype:"sr", frames:['neo/explorer/images/...']}` to
//      `{ptype:"ar", frames:['../images/...']}` — ptype "ar" resolves relative to `approot`
//      (empty string in these wrappers), i.e. relative to the page's own URL, so "../images/..."
//      correctly walks up from explorer/basics/ to explorer/images/ (confirmed: LzSprite.getBaseUrl
//      in the frozen kernel snapshot returns `options[ptype=="sr"?"serverroot":"approot"]`, then
//      concatenates the frame path with NO further normalization/validation of "..", so a literal
//      relative "../" frame path is honored as a normal browser-resolved relative URL).
//
// Both fixes live ENTIRELY in this harness file (new compiled-JS siblings + new HTML wrappers with
// distinct filenames, so nothing collides with a concurrently-running full parity-sweep.mjs pass
// which may be reading/writing the canonical `app.lzx.js` / `app.__cv.html` / `app.__dh.html`
// siblings at the same time). Neither `compiler/`, `runtime/`, nor the `.lzx` sources are modified.
//
//   node parity-fix-lzpix-dragdrop.mjs
//
// Env: PORT (default 8264).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const NEO = "/Users/temkin/Code/OpenLaszlo/openlaszlo-neo";
const SNAP = path.join(NEO, "benchmarks/parity-sweep/snapshot");
const OUT = path.join(NEO, "benchmarks/parity-sweep/out");
const SHOTS = path.join(OUT, "shots");
const TOOLS = path.join(NEO, "benchmarks/tools");
const LPS_HOME = "/Users/temkin/Code/OpenLaszlo/openlaszlo-5.0/runtime";
const CLI = path.join(SNAP, "compiler-dist/cli.js");
const KERNEL_CV = "/benchmarks/parity-sweep/snapshot/LFCcanvas.js";
const KERNEL_DH = "/benchmarks/parity-sweep/snapshot/lfc.js";
const PORT = +(process.env.PORT || 8264);

function wrapper(url, lfcurl, W, H, bg) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<script src="/runtime/embed.js"></script>
<style>html,body{height:100%;margin:0;padding:0;border:0}body{background:${bg}}#appcontainer{position:absolute;left:0;top:0}</style>
</head><body><div id="appcontainer"></div>
<script defer>
lz.embed.__serverroot="/runtime/includes/";
lz.embed.dhtml({url:'${url}',lfcurl:'${lfcurl}',serverroot:'lps/resources/',bgcolor:'${bg}',width:'${W}',height:'${H}',id:'lzapp',accessible:'false',cancelmousewheel:false,cancelkeyboardcontrol:false,skipchromeinstall:false,usemastersprite:false,approot:'',appenddivid:'appcontainer'});
</script></body></html>`;
}

function compile(src) {
  const r = spawnSync("node", [CLI, src], { env: { ...process.env, LPS_HOME }, encoding: "buffer", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`compile failed: ${src}\n` + (r.stderr || "").toString());
  return r.stdout.toString("utf8");
}

// ---------------------------------------------------------------- app 1: lzpix
const lzpixSrc = path.join(NEO, "examples/lzpix/app.lzx");
const lzpixJs = compile(lzpixSrc);
const lzpixJsPath = path.join(NEO, "examples/lzpix/app.parityfix.js");
fs.writeFileSync(lzpixJsPath, lzpixJs);
console.log(`lzpix compiled: ${(lzpixJs.length / 1024) | 0}KB, __LZproxied still baked "true" (unfixed) — override via ?lzproxied=false in the wrapper URL`);
const lzpixCv = path.join(NEO, "examples/lzpix/app.parityfix.__cv.html");
const lzpixDh = path.join(NEO, "examples/lzpix/app.parityfix.__dh.html");
fs.writeFileSync(lzpixCv, wrapper("app.parityfix.js?lzproxied=false", KERNEL_CV, 800, 600, "#cfcfcf"));
fs.writeFileSync(lzpixDh, wrapper("app.parityfix.js?lzproxied=false", KERNEL_DH, 800, 600, "#cfcfcf"));

// ---------------------------------------------------------------- app 2: drag-and-drop
const dndSrc = path.join(NEO, "explorer/basics/drag-and-drop.lzx");
let dndJs = compile(dndSrc);
const before = (dndJs.match(/ptype:"sr",frames:\['neo\/explorer\/images\/laszlo_explorer_logo\.png'\]/g) || []).length;
dndJs = dndJs.replace(
  /ptype:"sr",frames:\['neo\/explorer\/images\/laszlo_explorer_logo\.png'\]/g,
  `ptype:"ar",frames:['../images/laszlo_explorer_logo.png']`
);
const after = (dndJs.match(/ptype:"ar",frames:\['\.\.\/images\/laszlo_explorer_logo\.png'\]/g) || []).length;
console.log(`drag-and-drop: patched ${before} corrupted "sr" resource-library entries → ${after} corrected "ar" entries`);
if (before !== 2 || after < before) throw new Error(`expected to patch 2 entries, got before=${before} after=${after} — source may have changed`);
const dndJsPath = path.join(NEO, "explorer/basics/drag-and-drop.parityfix.js");
fs.writeFileSync(dndJsPath, dndJs);
const dndCv = path.join(NEO, "explorer/basics/drag-and-drop.parityfix.__cv.html");
const dndDh = path.join(NEO, "explorer/basics/drag-and-drop.parityfix.__dh.html");
fs.writeFileSync(dndCv, wrapper("drag-and-drop.parityfix.js", KERNEL_CV, 800, 600, "#ffffff"));
fs.writeFileSync(dndDh, wrapper("drag-and-drop.parityfix.js", KERNEL_DH, 800, 600, "#ffffff"));

// ---------------------------------------------------------------- server
console.log(`\nstarting static server on :${PORT} ...`);
const { spawn } = await import("node:child_process");
const srv = spawn("node", [path.join(TOOLS, "serve-static.mjs"), NEO, String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
await new Promise((res) => { srv.stdout.on("data", (d) => { if (/STATIC/.test(d.toString())) res(); }); setTimeout(res, 1500); });

function capture(url, W, H, out) {
  const r = spawnSync("node", [path.join(TOOLS, "capture.mjs"), url, String(W), String(H), out],
    { env: { ...process.env, CAP_DPR: "2" }, encoding: "utf8" });
  return { out: r.stdout || "", ok: fs.existsSync(out) };
}
function ae(a, b, fuzz) {
  const r = spawnSync("compare", ["-metric", "AE", "-fuzz", fuzz + "%", a, b, "null:"], { encoding: "utf8" });
  const m = (r.stderr || "").trim().match(/^(\d+)/);
  return m ? +m[1] : NaN;
}
function substAE(cv, dh, tmp) {
  const cb = tmp + ".cvb.png", db = tmp + ".dhb.png";
  spawnSync("magick", [cv, "-blur", "0x2", cb]);
  spawnSync("magick", [dh, "-blur", "0x2", db]);
  const v = ae(cb, db, 10);
  try { fs.unlinkSync(cb); fs.unlinkSync(db); } catch {}
  return v;
}

const apps = [
  { key: "lzpix", rel: "examples/lzpix/app.lzx", cvHtml: "examples/lzpix/app.parityfix.__cv.html", dhHtml: "examples/lzpix/app.parityfix.__dh.html", W: 800, H: 600 },
  { key: "drag-and-drop", rel: "explorer/basics/drag-and-drop.lzx", cvHtml: "explorer/basics/drag-and-drop.parityfix.__cv.html", dhHtml: "explorer/basics/drag-and-drop.parityfix.__dh.html", W: 800, H: 600 },
];

const results = {};
for (const a of apps) {
  console.log(`\ncapturing ${a.key} ...`);
  const cvOut = path.join(SHOTS, a.key + ".parityfix.cv.png");
  const dhOut = path.join(SHOTS, a.key + ".parityfix.dh.png");
  const cv = capture(`http://localhost:${PORT}/${a.cvHtml}`, a.W, a.H, cvOut);
  const dh = capture(`http://localhost:${PORT}/${a.dhHtml}`, a.W, a.H, dhOut);
  console.log("  cv:", cv.out.trim());
  console.log("  dh:", dh.out.trim());
  if (!cv.ok || !dh.ok) { results[a.key] = { err: "capture failed" }; continue; }
  const diffOut = path.join(SHOTS, a.key + ".parityfix.diff.png");
  spawnSync("compare", ["-metric", "AE", cvOut, dhOut, diffOut]);
  const total = a.W * 2 * a.H * 2;
  const raw = ae(cvOut, dhOut, 0);
  const subst = substAE(cvOut, dhOut, path.join(SHOTS, a.key + ".parityfix"));
  results[a.key] = { cvOut, dhOut, diffOut, total, raw, rawPct: raw / total, subst, substPct: subst / total };
  console.log(`  raw=${raw} (${(raw / total * 100).toFixed(2)}%)  subst=${subst} (${(subst / total * 100).toFixed(2)}%)`);
}

srv.kill();
fs.writeFileSync(path.join(OUT, "parityfix-lzpix-dragdrop.json"), JSON.stringify(results, null, 2));
console.log(`\nwrote ${path.join(OUT, "parityfix-lzpix-dragdrop.json")}`);
