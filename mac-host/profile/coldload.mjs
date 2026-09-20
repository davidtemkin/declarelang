// coldload — the FIRST-TIME LOAD of a production build on a real device: what a
// visitor with an empty cache waits, from navigation to first contentful paint.
//
//   node mac-host/profile/coldload.mjs --real <udid> [--app calendar] [--n 3]
//
// Builds the app with each tree's own `declarec` (index.html + module[s]),
// serves the directory gzipped on the Mac's LAN address on a FRESH PORT per run
// (a new origin, so Safari's cache is cold every time), opens it in the
// device's Safari via devicectl (a new tab per run), and the page reports back: navigation timing,
// the HTML and module fetches, first-contentful-paint. "Execution → paint" is
// FCP minus the module's responseEnd (a production page compiles nothing).
import http from "node:http";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const REAL = flag("real", null), APP = flag("app", "calendar"), N = +flag("n", "3");
// --path <program.declare> (relative to this tree): a program outside apps/ — a testbed. Its directory serves its siblings.
const PROGRAM_PATH = flag("path", null);
// --render canvas: build for the canvas renderer
const RENDER = flag("render", "dom");
// --ab-flag name=value (repeatable): the "main" column is THIS tree's build WITH these globals set before the
// module runs, the "opt" column the same build without — an A/B of runtime switches (needs --marks)
const AB_FLAGS = argv.flatMap((a, i) => (a === "--ab-flag" && argv[i + 1] ? [argv[i + 1]] : []));
const MARKS = argv.includes("--marks");
const HOLD = +flag("hold", "1.5");
const PHASES = new Map();   // tree → [{ category: ms }] per run (needs --marks: the phase timer lives in dev builds)
const SHOT = flag("shot", null);
const FLAGS = argv.flatMap((a, i) => (a === "--flag" && argv[i + 1] ? [argv[i + 1]] : []));   // --flag name=value: a global set before the module runs (needs --marks, which keeps the switches)     // --shot <dir>: after the hold, a WebDriver screenshot of each page — the proof that it loaded, in the run itself   // seconds the page stays up after reporting, before its tab closes (long enough to look, when looking is the point)   // build the optimized tree with its boot marks (declarec opts.marks) and print a wall-clock timeline
const TREES = { main: "/Users/temkin/Code/Declare", opt: path.resolve(HERE, "../..") };
if (!REAL) { console.error("usage: coldload.mjs --real <udid> [--app x] [--n 3]"); process.exit(2); }
const lanIP = () => { for (const ifc of ["en0", "en1"]) { try { const ip = execFileSync("ipconfig", ["getifaddr", ifc], { encoding: "utf8" }).trim(); if (ip) return ip; } catch { /* next */ } } throw new Error("no LAN address"); };
const IP = lanIP();


const REPORTER = `<script>
(function(){
  var sent=false; function go(){ if(sent) return; sent=true;
    var nav=performance.getEntriesByType("navigation")[0]||{}; var paint=performance.getEntriesByType("paint");
    var fcp=(paint.find(function(p){return p.name==="first-contentful-paint"})||paint[0]||{}).startTime;
    var res=performance.getEntriesByType("resource").map(function(r){return {name:r.name.split("/").pop().slice(0,40), start:+r.startTime.toFixed(0), end:+r.responseEnd.toFixed(0), bytes:r.transferSize}});
    var marks=performance.getEntriesByType("measure").filter(function(m){return m.name.indexOf("declare:")===0}).map(function(m){return {name:m.name.slice(8), start:+m.startTime.toFixed(1), end:+(m.startTime+m.duration).toFixed(1)}});
    var evalAt=(performance.getEntriesByName("declare:kernel-bytes:start")[0]||{}).startTime;
    fetch(location.origin+"/__cold",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({phases:globalThis.__declarePhaseTotals||null,marks:marks,evalAt:evalAt==null?null:+evalAt.toFixed(1),ua:navigator.userAgent,html:{start:+(nav.fetchStart||0).toFixed(0),responseEnd:+(nav.responseEnd||0).toFixed(0)},fcp:fcp==null?null:+fcp.toFixed(0),res:res})});
  }
  if (window.PerformanceObserver) { try { new PerformanceObserver(function(l){ if(l.getEntries().some(function(e){return e.name==="first-contentful-paint"})) setTimeout(go,300); }).observe({type:"paint",buffered:true}); } catch(e){} }
  setTimeout(go, 8000);
})();
</script>`;

async function buildDir(tree, precompile = undefined, extraFlags = []) {
  const { buildProduction } = await import(path.join(TREES[tree], "tools/declarec.mjs"));
  const progFile = PROGRAM_PATH ? path.join(TREES[tree], PROGRAM_PATH) : path.join(TREES[tree], "apps", APP, APP + ".declare");
  const src = readFileSync(progFile, "utf8");
  const out = await buildProduction(src, { name: APP, originDir: path.dirname(progFile), render: RENDER, ...(MARKS && tree === "opt" ? { marks: true } : {}), ...(precompile === undefined ? {} : { precompile }) });
  if (!out.ok) throw new Error(tree + " build failed: " + out.errors.map((e) => e.message).join("; "));
  const files = new Map();
  const ALLFLAGS = [...FLAGS, ...extraFlags];
  const FLAGSCRIPT = ALLFLAGS.length ? "<script>" + ALLFLAGS.map((kv) => { const [k, v] = kv.split("="); return `globalThis[${JSON.stringify(k)}]=${v === undefined || v === "true" ? "true" : v === "false" ? "false" : JSON.stringify(v)};`; }).join("") + "</script>\n" : "";
  for (const f of out.files) files.set("/" + f.name, f.name === "index.html" ? Buffer.from(String(f.contents).replace("<script", FLAGSCRIPT + "<script").replace("</script>", "</script>\n" + REPORTER)) : Buffer.from(f.contents));
  const total = [...files.values()].reduce((n, b) => n + gzipSync(b).length, 0);
  // the app's own directory rides alongside a deploy (data, images — declarec's
  // CLI copies every sibling but the sources); serve it the same way
  return { files, gz: total, dir: path.dirname(progFile) };
}
// --pre-ab: compare THIS tree's text build ("main" column) with its precompiled
// build ("opt" column) instead of main vs this tree
const PRE_AB = argv.includes("--pre-ab");
const builds = AB_FLAGS.length ? { main: await buildDir("opt", undefined, AB_FLAGS), opt: await buildDir("opt") }
  : PRE_AB ? { main: await buildDir("opt", false), opt: await buildDir("opt", true) } : { main: await buildDir("main"), opt: await buildDir("opt") };
console.log(`${APP}: main ${(builds.main.gz / 1024).toFixed(1)} KB gz in ${builds.main.files.size} files · optimized ${(builds.opt.gz / 1024).toFixed(1)} KB gz in ${builds.opt.files.size} files · served from ${IP}`);

// ONE server for the whole session — nothing is torn down between runs, so no
// tab is ever left pointing at a dead port. Each run lives under its own path
// prefix (/r<n>-<tree>/…), so every URL is new to Safari and the cache is cold.
const runs = new Map();   // prefix → build
let resolveReport = null;
const srv = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/__cold") { let b = ""; req.on("data", (c) => { b += c; }); req.on("end", () => { res.end("ok"); resolveReport?.(JSON.parse(b)); }); return; }
  const [, prefix, ...rest] = req.url.split("?")[0].split("/");
  const build = runs.get(prefix);
  const p = "/" + (rest.join("/") || "index.html");
  let body = build?.files.get(p);
  if (!body && build && !p.endsWith(".declare")) { try { body = readFileSync(path.join(build.dir, decodeURIComponent(p))); } catch { /* not a sibling */ } }
  if (!body) { res.writeHead(404); res.end(); return; }
  const type = p.endsWith(".html") ? "text/html; charset=utf-8" : p.endsWith(".js") ? "application/javascript; charset=utf-8" : p.endsWith(".json") ? "application/json" : p.endsWith(".png") ? "image/png" : p.endsWith(".jpg") || p.endsWith(".jpeg") ? "image/jpeg" : p.endsWith(".svg") ? "image/svg+xml" : p.endsWith(".webp") ? "image/webp" : p.endsWith(".woff2") ? "font/woff2" : "application/octet-stream";
  const gz = gzipSync(body);
  res.writeHead(200, { "content-type": type, "content-encoding": "gzip", "content-length": gz.length, "cache-control": "no-store" });
  res.end(gz);
});
await new Promise((r) => srv.listen(0, "0.0.0.0", r));
const PORT = srv.address().port;

// ── Safari on the device: a new tab per run, opened with Apple's devicectl ──
// (safaridriver was tried, 2026-09-18: every session is a Safari WINDOW that
// nothing can close afterwards — DT: "tons of windows … the old way was
// better".) Tabs accumulate for the round; the one server stays up for the
// whole round so a restored tab never reloads against a dead port. Close the
// tabs when a round is done (Safari: hold the tabs button → Close All Tabs).
async function openOnDevice(url) {
  execFileSync("xcrun", ["devicectl", "device", "process", "launch", "--device", REAL, "--terminate-existing", "--payload-url", url, "com.apple.mobilesafari"], { stdio: "ignore", timeout: 60000 });
  return { close: async () => {}, shot: async () => { throw new Error("no screenshot without automation"); } };
}
async function endSession() {}

const f0 = (x) => (x == null ? "—" : String(Math.round(x)));
console.log(`| run | tree | HTML fetch | module fetch (gz KB) | first contentful paint | execution → paint |\n|---|---|---|---|---|---|`);
const sums = { main: [], opt: [] };
const TREE_ORDER = argv.includes("--reverse") ? ["opt", "main"] : ["main", "opt"];   // --reverse: the second variant loads first
for (let i = 1; i <= N; i++) for (const tree of TREE_ORDER) {
  const prefix = `r${i}-${tree}`;
  runs.set(prefix, builds[tree]);
  const report = new Promise((r) => { resolveReport = r; });
  const url = `http://${IP}:${PORT}/${prefix}/index.html`;
  let tab = null;
  try { tab = await openOnDevice(url); } catch (e) { console.log(`| ${i} | ${tree} | ${String(e.message).slice(0, 120)} | | | |`); continue; }
  const r = await Promise.race([report, new Promise((_, rej) => setTimeout(() => rej(new Error("no report in 60 s")), 60000))]).catch((e) => ({ error: String(e) }));
  await new Promise((r) => setTimeout(r, HOLD * 1000));   // let the page finish its own loads (and be looked at)
  if (SHOT) { try { const { mkdirSync, writeFileSync } = await import("node:fs"); mkdirSync(SHOT, { recursive: true }); writeFileSync(path.join(SHOT, `${APP}-${tree}-${i}.png`), Buffer.from(await tab.shot(), "base64")); } catch (e) { console.log(`    (screenshot failed: ${String(e.message).slice(0, 80)})`); } }
  await tab.close();                                // one tab per run, and it goes when the run does
  if (r.error) { console.log(`| ${i} | ${tree} | ${r.error} | | | |`); continue; }
  const mod = r.res.find((x) => /^app\./.test(x.name)) ?? {};
  const exec = r.fcp != null && mod.end != null ? r.fcp - mod.end : null;
  sums[tree].push({ fcp: r.fcp, exec });
  if (r.phases) { if (!PHASES.has(tree)) PHASES.set(tree, []); PHASES.get(tree).push(r.phases); }
  console.log(`| ${i} | ${tree} | ${f0(r.html.responseEnd - r.html.start)} ms | ${f0(mod.end - mod.start)} ms (${((mod.bytes ?? 0) / 1024).toFixed(1)}) | ${f0(r.fcp)} ms | ${f0(exec)} ms |`);
  if (MARKS) {
    const data = r.res.filter((x) => /\.json$/.test(x.name)).map((x) => [x.name, x.start, x.end]);
    const rows = [["html", r.html.start, r.html.responseEnd], ["bundle fetch", mod.start, mod.end], ...data, ...(r.evalAt != null ? [["bundle evaluated (kernel load kicked)", r.evalAt, r.evalAt]] : []),
      ...r.marks.map((m) => [m.name, m.start, m.end]), ["first contentful paint", r.fcp, r.fcp]];
    console.log("    " + rows.map(([n, a, b]) => `${n} ${f0(a)}${a === b ? "" : "→" + f0(b)}`).join(" · "));
  }
}
await endSession(); srv.close();
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : null; };
for (const [tree, list] of PHASES) {
  const cats = [...new Set(list.flatMap((p) => Object.keys(p)))];
  const rows = cats.map((c) => [c, med(list.map((p) => p[c]?.ms ?? 0)), med(list.map((p) => p[c]?.n ?? 0))]).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((t, r) => t + r[1], 0);
  console.log(`\n### ${tree} · instantiate + attach split, exclusive ms (median of ${list.length}; total ${f0(total)})\n` + rows.map(([c, ms, n]) => `  ${String(Math.round(ms)).padStart(5)} ms  ${String(Math.round(100 * ms / total)).padStart(3)}%  ${c} (${n} calls)`).join("\n"));
}
for (const tree of ["main", "opt"]) console.log(`${tree}: median first contentful paint ${f0(med(sums[tree].map((x) => x.fcp)))} ms · execution → paint ${f0(med(sums[tree].map((x) => x.exec)))} ms`);
