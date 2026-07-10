// parity-sweep.mjs — VISUAL (pixel) parity of the Declare *canvas* kernel vs the stock
// *DHTML* kernel across a LARGE set of OpenLaszlo apps, at dpr=2 (Retina).
//
// KEY FACT: both kernels run the SAME compiled `.lzx.js`; only the LFC differs. So each app is
// compiled ONCE (frozen compiler) and rendered under BOTH kernels by swapping `lfcurl`:
//   canvas = snapshot/LFCcanvas.js   dhtml = snapshot/lfc.js   (both FROZEN — see snapshot/).
//
// DEBUG-COMPILED APPS (`<canvas debug="true">` + an explicit `<debug .../>` window, e.g.
// examples/ten-minutes/systemprop.lzx / sessionwindow.lzx) instantiate LzDebugWindow, which does
// NOT exist in the production LFC on EITHER side — that app would die at startup ($reportException
// undefined etc) and render a blank/crashed page (a harness artifact, not a real renderer
// divergence). Detected from the COMPILED `.lzx.js` output (references `LzDebugWindow`), not by
// parsing the source `.lzx` — the compiler is the ground truth for what actually got emitted.
// Debug-compiled apps get BOTH kernels' debug LFC build instead:
//   dhtml(debug)   = snapshot/lfc-debug.js       (FROZEN — see snapshot/).
//   canvas(debug)  = snapshot/LFCcanvas-debug.js (FROZEN — see snapshot/).
// This yields debugger-chrome-vs-debugger-chrome comparisons for these apps, not a crash-vs-render
// mismatch.
//
// Pipeline (single invocation): start dumb static server → compile every app with the frozen
// compiler + write cv/dh wrappers (siblings of the source, so app-relative resources resolve) →
// capture both kernels at dpr=2 with the existing capture.mjs (settles to byte-stable frames) →
// AE-diff. Two metrics:
//   • rawAE   = `compare -metric AE` fuzz 0            (every ±1 px; dominated by text/gradient AA)
//   • substAE = blur σ=2 + `compare -metric AE` fuzz 10%  (AA/edge noise collapses to ~0; only a
//               REAL area divergence — missing/broken component, wrong-color region, layout/image
//               gap — survives). RANK BY substAE.
//
// Re-runnable: `node parity-sweep.mjs`  (add `clean` to remove generated siblings).
// Env knobs: PORT (default 8231), CONC (capture concurrency, default 3).
//
// Writes ONLY under openlaszlo-neo/. openlaszlo-5.0/ is READ-ONLY (used as LPS_HOME + /runtime).

import { spawn, spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const NEO = "/Users/temkin/Code/OpenLaszlo/openlaszlo-neo";
const SNAP = path.join(NEO, "benchmarks/parity-sweep/snapshot");
const OUT = path.join(NEO, "benchmarks/parity-sweep/out");
const SHOTS = path.join(OUT, "shots");
const TOOLS = path.join(NEO, "benchmarks/tools");
const LPS_HOME = "/Users/temkin/Code/OpenLaszlo/openlaszlo-5.0/runtime";
const CLI = path.join(SNAP, "compiler-dist/cli.js");
const KERNEL_CV = "/benchmarks/parity-sweep/snapshot/LFCcanvas.js";  // served path (ROOT=NEO)
const KERNEL_DH = "/benchmarks/parity-sweep/snapshot/lfc.js";
const KERNEL_DH_DEBUG = "/benchmarks/parity-sweep/snapshot/lfc-debug.js";  // debug-compiled apps (LzDebugWindow)
const KERNEL_CV_DEBUG = "/benchmarks/parity-sweep/snapshot/LFCcanvas-debug.js";  // canvas side of the same
const PORT = +(process.env.PORT || 8231);
const CONC = +(process.env.CONC || 3);
const DEFAULT_W = 800, DEFAULT_H = 600;

const CLEAN = process.argv.includes("clean");

// ---------------------------------------------------------------- app set
const ls = (d) => { try { return fs.readdirSync(path.join(NEO, d)).map((f) => d + "/" + f); } catch { return []; } };
const hasCanvas = (rel) => { try { return /<canvas\b/i.test(fs.readFileSync(path.join(NEO, rel), "utf8")); } catch { return false; } };

// Apps that require a live backend that no longer exists → noted "needs backend, skipped".
const BACKEND_SKIP = {
  "examples/amazon/amazon.lzx": "Amazon ECS web service (dead)",
  "examples/amazon-soap/amazon.lzx": "Amazon SOAP web service (dead)",
  "examples/weather/weather.lzx": "weather XML feed (dead)",
  "examples/weatherblox/wrapper.lzx": "weather XML feed (dead)",
  "examples/vacation-survey/vacation-survey.lzx": "survey POST backend (dead)",
  "examples/youtube/youtube.lzx": "YouTube data API (dead)",
  "examples/chat/chat.lzx": "chat server / LzConnection (dead)",
  "examples/chatws/chatws.lzx": "chat WebSocket server (not running)",
  "examples/music/music.lzx": "music search web service (dead)",
  "examples/mobile/loadmedia.lzx": "media backend (dead)",
  "examples/videolib/videolib.lzx": "video catalog backend (dead)",
  "examples/videolibrary/videolibrary.lzx": "video catalog backend (dead)",
  "examples/javarpc/accentedtext.lzx": "Java RPC backend (dead)",
  "examples/javarpc/returnjavabean.lzx": "Java RPC backend (dead)",
  "examples/javarpc/returnperson.lzx": "Java RPC backend (dead)",
  "examples/javarpc/returnpojo.lzx": "Java RPC backend (dead)",
  "explorer/data/database.lzx": "getemployees.jsp backend (dead)",
};

// Curated standalone examples (local data / no backend).
const EXAMPLE_KEEP = [
  "examples/animation/animation.lzx",
  "examples/calendar/calendar.lzx",
  "examples/contactlist/contactlist.lzx",
  "examples/css/test.lzx",
  "examples/css/test-haze.lzx",
  "examples/extensions/drawing.lzx",
  "examples/image-loading/dataimage.lzx",
  "examples/image-loading/dataimage2.lzx",
  "examples/lzpix/app.lzx",
  "examples/lzpixmobile/main.lzx",
  "examples/noughts/noughts.lzx",
  "examples/xmldata/xmldata.lzx",
  "examples/videotest/videotest.lzx",
  "examples/musicdhtml/audiokernel.lzx",
  "examples/ten-minutes/hello.lzx",
  "examples/ten-minutes/local.lzx",
  "examples/ten-minutes/paging.lzx",
  "examples/ten-minutes/modeexample.lzx",
  "examples/ten-minutes/sessionwindow.lzx",
  "examples/ten-minutes/systemprop.lzx",
  "examples/ten-minutes/tag-definition.lzx",
];
const DOCS_KEEP = ["docs/component-browser/components.lzx"];

function buildAppList() {
  const apps = [];
  const add = (rel, group) => {
    if (BACKEND_SKIP[rel]) return;
    if (!hasCanvas(rel)) return;
    if (!fs.existsSync(path.join(NEO, rel))) return;
    if (apps.find((a) => a.rel === rel)) return;
    apps.push({ rel, group, key: rel.replace(/[\/]/g, "__").replace(/\.lzx$/, "") });
  };
  ls("examples/components").filter((f) => f.endsWith(".lzx")).sort().forEach((f) => add(f, "component"));
  fs.readdirSync(path.join(NEO, "explorer")).forEach((sub) => {
    const d = "explorer/" + sub;
    if (fs.existsSync(path.join(NEO, d)) && fs.statSync(path.join(NEO, d)).isDirectory())
      ls(d).filter((f) => f.endsWith(".lzx")).sort().forEach((f) => add(f, "explorer"));
  });
  EXAMPLE_KEEP.forEach((f) => add(f, "example"));
  DOCS_KEEP.forEach((f) => add(f, "docs"));
  return apps;
}

// ---------------------------------------------------------------- canvas dims / color
function normColor(c) {
  if (!c) return "#ffffff";
  c = c.trim();
  if (/^0x[0-9a-f]{6}$/i.test(c)) return "#" + c.slice(2);
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return c.toLowerCase();
  const named = { white: "#ffffff", black: "#000000", red: "#ff0000", gray: "#808080", grey: "#808080" };
  return named[c.toLowerCase()] || "#ffffff";
}
function parseCanvas(txt) {
  const tag = (txt.match(/<canvas\b[^>]*>/i) || [""])[0];
  const attr = (n) => { const m = tag.match(new RegExp(n + '\\s*=\\s*"([^"]*)"', "i")); return m ? m[1] : null; };
  const w = attr("width"), h = attr("height");
  return {
    W: /^\d+$/.test(w || "") ? +w : DEFAULT_W,
    H: /^\d+$/.test(h || "") ? +h : DEFAULT_H,
    bg: normColor(attr("bgcolor")),
  };
}
// Heuristic: does this app contain an EDITABLE text input? (DOM-overlay divergence being fixed elsewhere.)
function hasInput(txt) { return /<edittext\b|<inputtext\b|<basefield\b|editable\s*=\s*"true"/i.test(txt); }

// ---------------------------------------------------------------- wrappers
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
const cvHtml = (a) => path.join(NEO, a.rel).replace(/\.lzx$/, ".__cv.html");
const dhHtml = (a) => path.join(NEO, a.rel).replace(/\.lzx$/, ".__dh.html");
const jsPath = (a) => path.join(NEO, a.rel) + ".js";

// ---------------------------------------------------------------- clean mode
if (CLEAN) {
  const apps = buildAppList();
  let n = 0;
  for (const a of apps) for (const p of [cvHtml(a), dhHtml(a), jsPath(a)]) if (fs.existsSync(p)) { fs.unlinkSync(p); n++; }
  console.log(`cleaned ${n} generated siblings`);
  process.exit(0);
}

// ---------------------------------------------------------------- server
function startServer() {
  const srv = spawn("node", [path.join(TOOLS, "serve-static.mjs"), NEO, String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((res) => { srv.stdout.on("data", (d) => { if (/STATIC/.test(d.toString())) res(srv); }); setTimeout(() => res(srv), 1500); });
}
function get(url) {
  return new Promise((res) => { http.get(url, (r) => { r.resume(); res(r.statusCode); }).on("error", () => res(0)); });
}

// ---------------------------------------------------------------- compile + wrappers (phase A)
function compileAll(apps) {
  const results = {};
  for (const a of apps) {
    const src = path.join(NEO, a.rel);
    let txt;
    try { txt = fs.readFileSync(src, "utf8"); } catch { results[a.rel] = { err: "read failed" }; continue; }
    const { W, H, bg } = parseCanvas(txt);
    a.W = W; a.H = H; a.bg = bg; a.input = hasInput(txt);
    const r = spawnSync("node", [CLI, src], { env: { ...process.env, LPS_HOME }, encoding: "buffer", maxBuffer: 256 * 1024 * 1024 });
    if (r.status !== 0) {
      const msg = (r.stderr ? r.stderr.toString() : "").split("\n").find((l) => /UNSUPPORTED|Error|error/.test(l)) || `exit ${r.status}`;
      results[a.rel] = { err: msg.trim().slice(0, 160), W, H };
      continue;
    }
    fs.writeFileSync(jsPath(a), r.stdout);
    // Detect debug-compiled output from what the compiler actually emitted (ground truth),
    // not from parsing the source .lzx: a `<canvas debug="true">` + `<debug .../>` app
    // instantiates LzDebugWindow, which only the debug LFC build provides.
    const isDebug = /\bLzDebugWindow\b/.test(r.stdout.toString("utf8"));
    a.debug = isDebug;
    const url = path.basename(a.rel) + ".js";
    fs.writeFileSync(cvHtml(a), wrapper(url, isDebug ? KERNEL_CV_DEBUG : KERNEL_CV, W, H, bg));
    fs.writeFileSync(dhHtml(a), wrapper(url, isDebug ? KERNEL_DH_DEBUG : KERNEL_DH, W, H, bg));
    results[a.rel] = { ok: true, W, H, bytes: r.stdout.length, debug: isDebug };
    process.stdout.write(`  compiled ${a.rel} (${W}x${H}, ${(r.stdout.length / 1024) | 0}KB${isDebug ? ", DEBUG→lfc-debug.js" : ""})\n`);
  }
  return results;
}

// ---------------------------------------------------------------- capture (phase B, pooled)
function capture(url, W, H, out) {
  return new Promise((res) => {
    const p = spawn("node", [path.join(TOOLS, "capture.mjs"), url, String(W), String(H), out],
      { env: { ...process.env, CAP_DPR: "2" }, stdio: ["ignore", "pipe", "pipe"] });
    let o = "";
    p.stdout.on("data", (d) => (o += d));
    p.stderr.on("data", () => {});
    p.on("close", () => {
      const settled = /SETTLED/.test(o) && !/UNSETTLED/.test(o);
      const inited = /inited=true/.test(o);
      res({ settled, inited, ok: fs.existsSync(out) });
    });
  });
}
async function pool(tasks, n) {
  const out = []; let i = 0;
  async function worker() { while (i < tasks.length) { const j = i++; out[j] = await tasks[j](); } }
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

// ---------------------------------------------------------------- diff (phase C)
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
function makeDiff(cv, dh, out) { spawnSync("compare", ["-metric", "AE", cv, dh, out]); }

// ================================================================ run
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const apps = buildAppList();
  console.log(`\n=== parity sweep: ${apps.length} apps (+${Object.keys(BACKEND_SKIP).length} backend-skipped) ===\n`);

  console.log("PHASE A — compile + wrappers");
  const comp = compileAll(apps);

  console.log("\nPHASE B — capture both kernels @dpr2 (pool=" + CONC + ")");
  const srv = await startServer();
  await new Promise((r) => setTimeout(r, 400));
  const compiled = apps.filter((a) => comp[a.rel]?.ok);
  const capTasks = [];
  for (const a of compiled) {
    const cvOut = path.join(SHOTS, a.key + ".cv.png"), dhOut = path.join(SHOTS, a.key + ".dh.png");
    capTasks.push(async () => {
      const cv = await capture(`http://localhost:${PORT}/${a.rel.replace(/\.lzx$/, ".__cv.html")}`, a.W, a.H, cvOut);
      const dh = await capture(`http://localhost:${PORT}/${a.rel.replace(/\.lzx$/, ".__dh.html")}`, a.W, a.H, dhOut);
      a._cap = { cv, dh };
      process.stdout.write(`  shot ${a.rel}  cv[init=${cv.inited} settle=${cv.settled}] dh[init=${dh.inited} settle=${dh.settled}]\n`);
    });
  }
  await pool(capTasks, CONC);
  srv.kill();

  console.log("\nPHASE C — diff");
  const rows = [];
  for (const a of compiled) {
    const cvOut = path.join(SHOTS, a.key + ".cv.png"), dhOut = path.join(SHOTS, a.key + ".dh.png");
    if (!a._cap.cv.ok || !a._cap.dh.ok) { rows.push({ ...a, err: "capture failed" }); continue; }
    const diffOut = path.join(SHOTS, a.key + ".diff.png");
    makeDiff(cvOut, dhOut, diffOut);
    const total = a.W * 2 * a.H * 2;
    const raw = ae(cvOut, dhOut, 0);
    const subst = substAE(cvOut, dhOut, path.join(SHOTS, a.key));
    rows.push({
      rel: a.rel, group: a.group, key: a.key, W: a.W, H: a.H, input: a.input, debug: !!a.debug,
      cvInit: a._cap.cv.inited, dhInit: a._cap.dh.inited,
      cvSettle: a._cap.cv.settled, dhSettle: a._cap.dh.settled,
      total, raw, rawPct: raw / total, subst, substPct: subst / total,
    });
    process.stdout.write(`  ${a.rel}  raw=${raw} subst=${subst}\n`);
  }

  // failures (compile / capture)
  const failed = [];
  for (const a of apps) {
    if (comp[a.rel]?.err) failed.push({ rel: a.rel, group: a.group, reason: "compile: " + comp[a.rel].err });
    else if (comp[a.rel]?.ok && !rows.find((r) => r.rel === a.rel)) failed.push({ rel: a.rel, group: a.group, reason: "capture failed" });
  }

  const data = {
    when: new Date().toISOString(),
    kernelCanvas: SNAP + "/LFCcanvas.js", kernelDhtml: SNAP + "/lfc.js", kernelDhtmlDebug: SNAP + "/lfc-debug.js", kernelCanvasDebug: SNAP + "/LFCcanvas-debug.js", compiler: CLI,
    dpr: 2, metric: { raw: "AE fuzz=0", subst: "blur σ=2 + AE fuzz=10%" },
    rows, failed,
    backendSkipped: Object.entries(BACKEND_SKIP).map(([rel, reason]) => ({ rel, reason })),
  };
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(data, null, 2));
  console.log(`\nwrote ${path.join(OUT, "results.json")}  (${rows.length} measured, ${failed.length} failed)`);
})();
