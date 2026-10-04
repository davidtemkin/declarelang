#!/usr/bin/env node
// bench — Murmur implementations measured side by side, at any history size.
//
//   node evals/apps/murmur/bench.mjs --arm react=my-apps/react-murmur,mount=/my-apps/react-murmur/,route=#/{t} \
//        --arm virt=my-apps/murmur-virt --arm full=my-apps/murmur-virt,novirt \
//        --scale 30 --first t4 --runs 7 [--throttle 4] [--out results.json]
//
// An ARM is a name and a folder, with options after commas:
//   a Declare program (a folder holding one top-level .declare) — built with declarec;
//     `novirt` builds it with `virtualize = true` switched off
//   a built folder (it has an index.html), such as a React app's own build — served as it is
//   mount=/path/  where it is served (default /<name>/; a build with absolute asset paths needs its own)
//   route=#c/{t}  the deep link to a conversation, {t} its id (default #c/{t} for Declare, #/{t} otherwise)
//
// Every arm reads the same service, started here (api/server.mjs, --quiet so no unbidden
// events land mid-measurement) at --scale times the fixture's history, behind one static
// server that also proxies the service's routes and its live feed. Each run is a cold
// load in a fresh browser context; arms alternate order run to run; medians are reported.
//
// Measured per arm: bundle (document + scripts + styles the page loads, raw and gzip -9),
// first contentful paint, load → first conversation painted (its last message laid out on
// screen), JS heap and DOM after load, click → painted for every other conversation on a
// first visit and again on a second, and DOM after visiting all.

import http from "node:http";
import net from "node:net";
import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdtempSync, cpSync } from "node:fs";
import { join, resolve, dirname, extname, normalize } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { launchChrome } from "../../../tools/internal/chrome.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");

// ── arguments ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = (name, d) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : d; };
const ARMS = [];
for (let i = 0; i < argv.length; i++) if (argv[i] === "--arm") {
  const [head, ...rest] = argv[++i].split(",");
  const [name, path] = head.split("=");
  const o = Object.fromEntries(rest.map((r) => { const [k, v] = r.split("="); return [k, v ?? true]; }));
  ARMS.push({ name, path: resolve(ROOT, path), ...o });
}
if (ARMS.length === 0) { console.error("bench: give at least one --arm name=folder (see the header)"); process.exit(2); }
const SCALE = Number(opt("scale", 1)), FIRST = opt("first", "t3"), RUNS = Number(opt("runs", 5));
const THROTTLE = Number(opt("throttle", 1)), OUT = opt("out", null);

// the fixture's conversations by recent activity: the name its row shows, and its last
// text message, which no scale changes
const THREADS = [
  { id: "t3", row: "Dana", last: "good" },
  { id: "t4", row: "Trail crew", last: "it was a good morning to be up there honestly" },
  { id: "t5", row: "Marco", last: "that's the correct response" },
  { id: "t2", row: "Priya", last: "deep" },
  { id: "t6", row: "Book club", last: "mine is nicest and I will not be taking questions" },
  { id: "t1", row: "Kestrel Street", last: "the bins, for the record" },
];
{ const i = THREADS.findIndex((t) => t.id === FIRST); if (i > 0) THREADS.unshift(...THREADS.splice(i, 1)); }

// ── building each arm ────────────────────────────────────────────────────────
const WORK = mkdtempSync(join(tmpdir(), "murmur-bench-"));
function build(arm) {
  const files = readdirSync(arm.path);
  if (files.includes("index.html")) return { dir: arm.path, kind: "static" };
  const main = files.filter((f) => f.endsWith(".declare"));
  if (main.length > 0) {
    if (main.length > 1 && !arm.main) throw new Error(`${arm.name}: several .declare files — say which with main=<file>`);
    let src = join(arm.path, arm.main ?? main[0]);
    if (arm.novirt) {
      const copy = join(WORK, `${arm.name}-src`);
      cpSync(arm.path, copy, { recursive: true });
      src = join(copy, arm.main ?? main[0]);
      writeFileSync(src, readFileSync(src, "utf8").replaceAll("virtualize = true", "virtualize = false"));
    }
    const out = join(WORK, arm.name);
    execSync(`node ${JSON.stringify(join(ROOT, "tools/declarec.mjs"))} ${JSON.stringify(src)} -o ${JSON.stringify(out)} --quiet`, { stdio: "inherit" });
    return { dir: out, kind: "declare" };
  }
  throw new Error(`${arm.name}: ${arm.path} is neither a Declare program nor a built folder (one with an index.html)`);
}
for (const arm of ARMS) {
  Object.assign(arm, build(arm));
  arm.mount ??= `/${arm.name}/`;
  arm.route ??= arm.kind === "declare" ? "#c/{t}" : "#/{t}";
}

// ── the service, and one server in front of everything ───────────────────────
const free = () => new Promise((r) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const SVC = await free();
const service = spawn(process.execPath, [join(HERE, "api/server.mjs"), `--port=${SVC}`, "--seed=1", "--quiet", `--scale=${SCALE}`], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));

const SERVICE_ROUTES = ["/threads.json", "/schedule.json", "/photos/", "/voice/", "/avatars/", "/live"];
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".wasm": "application/wasm" };
const toService = (p) => SERVICE_ROUTES.some((r) => p === r || p.startsWith(r));
function fileFor(urlPath) {
  for (const arm of ARMS) if (urlPath.startsWith(arm.mount)) {
    const rel = normalize(decodeURIComponent(urlPath.slice(arm.mount.length))).replace(/^(\.\.[/\\])+/, "");
    const f = join(arm.dir, rel || "index.html");
    if (f.startsWith(arm.dir) && existsSync(f) && statSync(f).isFile()) return f;
  }
  return null;
}
const front = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (toService(url.pathname)) {
    const up = http.request({ host: "127.0.0.1", port: SVC, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on("error", () => { res.writeHead(502); res.end(); });
    return req.pipe(up);
  }
  const f = fileFor(url.pathname);
  if (!f) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(f));
});
front.on("upgrade", (req, sock, head) => {   // the live feed's websocket, passed through untouched
  const up = net.connect(SVC, "127.0.0.1", () => {
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n\r\n");
    if (head.length) up.write(head);
    sock.pipe(up).pipe(sock);
  });
  up.on("error", () => sock.destroy());
  sock.on("error", () => up.destroy());
});
const PORT = await free();
await new Promise((r) => front.listen(PORT, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${PORT}`;
const urlOf = (arm, t) => `${ORIGIN}${arm.mount}index.html${arm.route.replace("{t}", t)}`;

// ── measuring ────────────────────────────────────────────────────────────────
// installed before any page script: stamps the frame after a wanted text is on screen
// in the conversation pane (right of `edge`), and the press that asked for it
const WATCH = (edge) => {
  window.__paint = { want: null, edge, t0: 0, t1: 0 };
  const onScreen = (want, e) => {
    const w = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.textContent.trim() !== want) continue;
      const r = n.parentElement.getBoundingClientRect();
      if (r.width > 0 && r.left >= e && r.top >= 0 && r.bottom <= innerHeight) return true;
    }
    return false;
  };
  const tick = () => {
    const p = window.__paint;
    if (p.want !== null && p.t1 === 0 && onScreen(p.want, p.edge)) requestAnimationFrame(() => { if (p.t1 === 0) p.t1 = performance.now(); });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  addEventListener("pointerdown", () => { if (window.__paint.want !== null) window.__paint.t0 = performance.now(); }, true);
};
const EDGE = 480;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

async function runOnce(browser, arm) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const cdp = await page.createCDPSession();
  if (THROTTLE > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(WATCH, EDGE);
  await page.evaluateOnNewDocument((want) => { const set = () => { if (window.__paint) window.__paint.want = want; else setTimeout(set, 0); }; set(); }, THREADS[0].last);
  const loaded = [];
  page.on("response", (r) => { const t = r.request().resourceType(); if (t === "document" || t === "script" || t === "stylesheet") loaded.push(new URL(r.url()).pathname); });
  await page.goto(urlOf(arm, THREADS[0].id), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__paint.t1 > 0, { timeout: 120000, polling: 50 })
    .catch((e) => { throw new Error(`${arm.name}: the first conversation never painted "${THREADS[0].last}" — ${e.message}`); });
  const load = await page.evaluate(() => window.__paint.t1);
  const fcp = await page.evaluate(() => performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? NaN);
  const elementsAfterLoad = await page.evaluate(() => document.querySelectorAll("*").length);
  await cdp.send("Performance.enable");
  const m = (await cdp.send("Performance.getMetrics")).metrics, metric = (n) => m.find((x) => x.name === n)?.value ?? NaN;
  const heapMB = metric("JSHeapUsedSize") / 1048576, nodesAfterLoad = metric("Nodes");
  await wait(300);
  const rowAt = (name) => page.evaluate((name) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = n.textContent.trim();
      if (t !== name && !t.startsWith(name + " ")) continue;
      const r = n.parentElement.getBoundingClientRect();
      if (r.left < 400 && r.width > 0 && r.top > 40) return { x: r.left + 10, y: r.top + r.height / 2 };
    }
    return null;
  }, name);
  const open = async (t) => {
    await page.evaluate((want) => { Object.assign(window.__paint, { want, t0: 0, t1: 0 }); }, t.last);
    const at = await rowAt(t.row);
    if (at === null) throw new Error(`${arm.name}: no row for ${t.row}`);
    await page.mouse.click(at.x, at.y);
    await page.waitForFunction(() => window.__paint.t1 > 0 && window.__paint.t0 > 0, { timeout: 120000, polling: 20 })
      .catch((e) => { throw new Error(`${arm.name}: ${t.id} (${t.row}) never painted "${t.last}" — ${e.message}`); });
    const ms = await page.evaluate(() => window.__paint.t1 - window.__paint.t0);
    await wait(250);
    return ms;
  };
  const first = {}, again = {};
  for (const t of THREADS.slice(1)) first[t.id] = await open(t);
  for (const t of THREADS) again[t.id] = await open(t);
  const elementsAfterAll = await page.evaluate(() => document.querySelectorAll("*").length);
  await ctx.close();
  return { load, fcp, heapMB, elementsAfterLoad, nodesAfterLoad, first, again, elementsAfterAll, loaded };
}

function bundleOf(paths) {
  let raw = 0, gz = 0;
  for (const p of new Set(paths)) { const f = fileFor(p); if (!f) continue; const b = readFileSync(f); raw += b.length; gz += gzipSync(b, { level: 9 }).length; }
  return { raw, gz };
}

const browser = await launchChrome({ args: ["--no-sandbox"], protocolTimeout: 600000 });
const results = Object.fromEntries(ARMS.map((a) => [a.name, []]));
try {
  for (let i = 0; i < RUNS; i++) for (const arm of (i % 2 ? [...ARMS].reverse() : ARMS)) results[arm.name].push(await runOnce(browser, arm));
} finally {
  await browser.close();
  front.close();
  service.kill();
}

// ── report ───────────────────────────────────────────────────────────────────
const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : "—").padStart(10);
const row = (label, pick, d = 0) => console.log(label.padEnd(44) + ARMS.map((a) => fmt(median(results[a.name].map(pick)), d)).join(""));
const history = JSON.parse(readFileSync(join(HERE, "fixtures/threads.json"), "utf8"));
const longest = Math.max(...history.threads.map((t) => t.messages.length)) * SCALE;
console.log(`\nmurmur bench · ${SCALE}× history (${history.threads.reduce((n, t) => n + t.messages.length, 0) * SCALE} messages, longest ${longest}) · opened on ${THREADS[0].row} · median of ${RUNS} · 1440×900 · CPU ${THROTTLE}×`);
console.log("".padEnd(44) + ARMS.map((a) => a.name.padStart(10)).join(""));
const bundles = Object.fromEntries(ARMS.map((a) => [a.name, bundleOf(results[a.name][0].loaded)]));
console.log("bundle, gzip -9 (KB)".padEnd(44) + ARMS.map((a) => fmt(bundles[a.name].gz / 1024, 1)).join(""));
console.log("bundle, raw (KB)".padEnd(44) + ARMS.map((a) => fmt(bundles[a.name].raw / 1024, 1)).join(""));
row("first contentful paint (ms)", (r) => r.fcp);
row(`load → ${THREADS[0].row} painted (ms)`, (r) => r.load);
row("JS heap after load (MB)", (r) => r.heapMB, 1);
row("elements after load", (r) => r.elementsAfterLoad);
row("DOM nodes after load (incl. text)", (r) => r.nodesAfterLoad);
for (const t of THREADS.slice(1)) row(`click → ${t.row}, first visit (ms)`, (r) => r.first[t.id]);
for (const t of THREADS) row(`click → ${t.row} again (ms)`, (r) => r.again[t.id]);
row("elements after visiting all", (r) => r.elementsAfterAll);
if (OUT) writeFileSync(resolve(OUT), JSON.stringify({ scale: SCALE, first: FIRST, runs: RUNS, throttle: THROTTLE, arms: ARMS.map(({ name, kind, path }) => ({ name, kind, path })), bundles, results }, null, 1));
process.exit(0);
