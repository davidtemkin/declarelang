// prodboot — PRODUCTION-build startup in Chrome, A/B: each app built twice
// (declarec with bodies as text vs precompiled), each load in a FRESH browser
// context (nothing cached), variants alternated. Execution → first paint =
// first-contentful-paint minus the bundle's responseEnd.
//   node mac-host/profile/prodboot.mjs [--n 7] [apps…]
import http from "node:http"; import path from "node:path"; import { readFileSync } from "node:fs"; import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const N = argv.includes("--n") ? +argv[argv.indexOf("--n") + 1] : 7;
const apps = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--n");
const APPS = apps.length ? apps : ["calendar", "desktop", "tracker", "weather", "marketmap", "sampler", "docs", "lzx-weather"];
const { buildProduction } = await import(path.join(ROOT, "tools/declarec.mjs"));
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[(s.length - 1) >> 1]; };
console.log(`| app | text: exec → paint (median of ${N}) | precompiled | change |\n|---|---|---|---|`);
for (const app of APPS) {
  const dir = path.join(ROOT, "apps", app); const src = readFileSync(path.join(dir, app + ".declare"), "utf8");
  const builds = {};
  for (const v of ["text", "pre"]) {
    const out = await buildProduction(src, { name: app, originDir: dir, precompile: v === "pre" });
    builds[v] = new Map(out.files.map((f) => ["/" + f.name, Buffer.from(f.contents)]));
  }
  let cur = null;
  const srv = http.createServer((req, res) => {
    const p = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
    let body = cur.get(p); if (!body) { try { body = readFileSync(path.join(dir, decodeURIComponent(p))); } catch { res.writeHead(404); res.end(); return; } }
    res.writeHead(200, { "content-type": p.endsWith(".html") ? "text/html" : p.endsWith(".js") ? "application/javascript" : p.endsWith(".json") ? "application/json" : "application/octet-stream", "cache-control": "no-store" }); res.end(body);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const times = { text: [], pre: [] };
  for (let i = 0; i < N; i++) for (const v of ["text", "pre"]) {
    cur = builds[v];
    const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage();
    await pg.setViewport({ width: 1280, height: 828, deviceScaleFactor: 2 });
    await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html?r=${i}${v}`, { waitUntil: "networkidle0", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 400));
    const t = await pg.evaluate(() => { const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime; const mod = performance.getEntriesByType("resource").find((e) => /\/app\.[0-9a-f]+\.js/.test(e.name)); return fcp != null && mod ? fcp - mod.responseEnd : null; });
    if (t != null) times[v].push(t);
    await ctx.close();
  }
  srv.close();
  const a = med(times.text), b = med(times.pre);
  console.log(`| ${app} | ${a.toFixed(1)} ms | ${b.toFixed(1)} ms | ${b < a ? "−" : "+"}${Math.abs(b - a).toFixed(1)} ms (${((b - a) / a * 100).toFixed(0)}%) |`);
}
await browser.close();
