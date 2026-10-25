#!/usr/bin/env node
// compare — Murmur builds side by side, opened by clicks (no deep links needed).
//   node compare.mjs name=dir [name=dir …] --runs 3
// Each dir is a built folder with index.html, served at / on its own port; the
// service routes are proxied to :8330 (started separately, --quiet --scale=100).
import http from "node:http";
import net from "node:net";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { gzipSync } from "node:zlib";
import { launchChrome } from "/Users/temkin/Code/Declare/tools/internal/chrome.mjs";

const argv = process.argv.slice(2);
const RUNS = Number(argv[argv.indexOf("--runs") + 1] ?? 3);
const ARMS = argv.filter((a) => a.includes("=")).map((a) => { const [name, dir] = a.split("="); return { name, dir }; });
const THREADS = [
  { id: "t3", row: "Dana", last: "good" },
  { id: "t4", row: "Trail crew", last: "it was a good morning to be up there honestly" },
  { id: "t5", row: "Marco", last: "that's the correct response" },
  { id: "t2", row: "Priya", last: "deep" },
  { id: "t6", row: "Book club", last: "mine is nicest and I will not be taking questions" },
  { id: "t1", row: "Kestrel Street", last: "the bins, for the record" },
];
const SERVICE = ["/threads.json", "/schedule.json", "/photos/", "/voice/", "/avatars/", "/live"];
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".wasm": "application/wasm" };
const free = () => new Promise((r) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });

function serve(arm) {
  const fileFor = (p) => {
    const rel = normalize(decodeURIComponent(p)).replace(/^(\.\.[/\\])+/, "").replace(/^\//, "");
    let f = join(arm.dir, rel || "index.html");
    if (existsSync(f) && statSync(f).isFile()) return f;
    return join(arm.dir, "index.html");          // SPA fallback
  };
  arm.fileFor = fileFor;
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (SERVICE.some((r) => url.pathname === r || url.pathname.startsWith(r))) {
      const up = http.request({ host: "127.0.0.1", port: 8330, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
      up.on("error", () => { res.writeHead(502); res.end(); });
      return req.pipe(up);
    }
    const f = fileFor(url.pathname);
    res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(readFileSync(f));
  });
  srv.on("upgrade", (req, sock, head) => {
    const up = net.connect(8330, "127.0.0.1", () => {
      up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n\r\n");
      if (head.length) up.write(head);
      sock.pipe(up).pipe(sock);
    });
    up.on("error", () => sock.destroy()); sock.on("error", () => up.destroy());
  });
  return srv;
}

const WATCH = () => {
  window.__paint = { want: null, t0: 0, t1: 0 };
  const onScreen = (want) => {
    const w = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.textContent.trim() !== want) continue;
      const r = n.parentElement.getBoundingClientRect();
      if (r.width > 0 && r.left >= 480 && r.top >= 0 && r.bottom <= innerHeight) return true;
    }
    return false;
  };
  const tick = () => { const p = window.__paint; if (p.want !== null && p.t1 === 0 && onScreen(p.want)) requestAnimationFrame(() => { if (p.t1 === 0) p.t1 = performance.now(); }); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  addEventListener("pointerdown", () => { window.__paint.t0 = performance.now(); }, true);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

async function runOnce(browser, arm) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const cdp = await page.createCDPSession();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(WATCH);
  const loaded = [];
  page.on("response", (r) => { const t = r.request().resourceType(); if (["document", "script", "stylesheet"].includes(t)) loaded.push(new URL(r.url()).pathname); });
  const t0 = Date.now();
  await page.goto(`${arm.origin}/`, { waitUntil: "domcontentloaded" });
  const rowAt = (name) => page.evaluate((name) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = n.textContent.trim();
      if (t !== name && !t.startsWith(name + " ")) continue;
      const r = n.parentElement.getBoundingClientRect();
      if (r.left < 400 && r.width > 0 && r.top > 40 && r.bottom < innerHeight) return { x: r.left + 10, y: r.top + r.height / 2 };
    }
    return null;
  }, name);
  await page.waitForFunction((n) => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let x = w.nextNode(); x; x = w.nextNode()) if (x.textContent.trim() === n) return true; return false; }, { timeout: 120000, polling: 50 }, THREADS[THREADS.length - 1].row);
  const listMs = Date.now() - t0;
  await wait(1500);
  const metrics = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    await cdp.send("Performance.enable");
    const m = (await cdp.send("Performance.getMetrics")).metrics;
    return { heap: m.find((x) => x.name === "JSHeapUsedSize").value / 1048576, nodes: await page.evaluate(() => document.querySelectorAll("*").length) };
  };
  const rest = await metrics();
  const open = async (t) => {
    await page.evaluate((want) => Object.assign(window.__paint, { want, t0: 0, t1: 0 }), t.last);
    const at = await rowAt(t.row);
    if (at === null) throw new Error(`${arm.name}: no row for ${t.row}`);
    await page.mouse.click(at.x, at.y);
    await page.waitForFunction(() => window.__paint.t1 > 0 && window.__paint.t0 > 0, { timeout: 60000, polling: 20 })
      .catch(() => { throw new Error(`${arm.name}: ${t.row} never painted "${t.last}"`); });
    const ms = await page.evaluate(() => window.__paint.t1 - window.__paint.t0);
    await wait(400);
    return ms;
  };
  const first = {}, again = {};
  for (const t of THREADS) first[t.id] = await open(t);
  for (const t of THREADS) again[t.id] = await open(t);
  const all = await metrics();
  const proc = await cdp.send("SystemInfo.getProcessInfo").catch(() => null);
  await ctx.close();
  return { listMs, rest, all, first, again, loaded };
}

for (const arm of ARMS) { const p = await free(); await new Promise((r) => serve(arm).listen(p, "127.0.0.1", r)); arm.origin = `http://127.0.0.1:${p}`; }
const browser = await launchChrome({ args: ["--no-sandbox"], protocolTimeout: 600000 });
const results = Object.fromEntries(ARMS.map((a) => [a.name, []]));
for (let i = 0; i < RUNS; i++) for (const arm of (i % 2 ? [...ARMS].reverse() : ARMS)) {
  try { results[arm.name].push(await runOnce(browser, arm)); } catch (e) { console.error(String(e.message ?? e)); }
}
await browser.close();

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : "—").padStart(11);
const row = (label, pick, d = 0) => console.log(label.padEnd(40) + ARMS.map((a) => fmt(median(results[a.name].map(pick)), d)).join(""));
console.log("".padEnd(40) + ARMS.map((a) => a.name.padStart(11)).join(""));
console.log("bundle gzip -9 (KB)".padEnd(40) + ARMS.map((a) => {
  const r = results[a.name][0]; if (!r) return fmt(NaN);
  let gz = 0; for (const p of new Set(r.loaded)) gz += gzipSync(readFileSync(a.fileFor(p)), { level: 9 }).length; return fmt(gz / 1024, 1);
}).join(""));
row("load → list shown (ms)", (r) => r.listMs);
row("DOM elements at rest", (r) => r.rest.nodes);
row("JS heap at rest, after GC (MB)", (r) => r.rest.heap, 1);
for (const t of THREADS) row(`open ${t.row}, first (ms)`, (r) => r.first[t.id]);
row("median first open (ms)", (r) => median(Object.values(r.first)));
row("median reopen (ms)", (r) => median(Object.values(r.again)));
row("DOM elements, all six opened", (r) => r.all.nodes);
row("JS heap, all six opened (MB)", (r) => r.all.heap, 1);
console.log("runs:", ARMS.map((a) => `${a.name} ${results[a.name].length}/${RUNS}`).join(", "));
process.exit(0);
