// A recycled row is collectable. A virtualized list builds rows near the screen
// and drops the rest as it scrolls; nothing the runtime keeps may go on holding
// a dropped row. Found 2026-10-17 by a reviewer scrolling a 30,500-message chat
// (heap 20 → 122 MB): every row that drew stayed alive through its density
// listener (dpr.ts), and every row a layout had placed through the layout's
// table of authored bases (layout.ts `bases`). Real Chrome, the real DOM
// backend; live instances counted after garbage collection (CDP queryObjects).
// The list reuses a row for a new record, so what leaked was never the row: it
// was what comes and goes INSIDE a reused row with its record — here a drawn
// chip per item, under a layout that outlives them.

import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize } from "./harness.mjs";
import { launchChrome } from "../tools/internal/chrome.mjs";
import { compile } from "../compiler/dist/compile-node.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html;charset=utf-8", ".js": "text/javascript;charset=utf-8", ".json": "application/json", ".wasm": "application/wasm" };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
  catch { res.writeHead(400); return res.end("bad request"); }
  const fp = path.join(ROOT, pathname);
  if (fp !== ROOT && !fp.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end("forbidden"); }
  try {
    const st = fs.statSync(fp);
    if (st.isDirectory()) { res.writeHead(200, { "content-type": MIME[".html"] }); return res.end("<!doctype html><meta charset=utf-8><body style=margin:0>"); }
    res.writeHead(200, { "content-type": MIME[path.extname(fp).toLowerCase()] ?? "application/octet-stream" });
    res.end(fs.readFileSync(fp));
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await launchChrome({ args: ["--no-sandbox"] });

const rows = JSON.stringify({ rows: Array.from({ length: 3000 }, (_, n) => ({ n, chips: Array.from({ length: n % 4 }, (_, k) => ({ k })) })) });
const SOURCE = `
class Swatch extends View [ width = 12, height = 12,
    draw(d: DrawContext) { d.fillStyle = "#3366CC"; d.fillRect(0, 0, 12, 12) } ]
App [ width = 300, height = 400,
  d: Dataset { ${rows} },
  list: View [ width = 300, height = 400, scrolls = y, datapath = { d.value },
    View [ datapath = :rows[], virtualize = true, width = 300, height = 30,
      layout: SimpleLayout [ axis = x, spacing = 6 ],
      Text [ text = { "row " + :n } ],
      chips: View [ layout: SimpleLayout [ axis = x, spacing = 2 ],
        Swatch [ datapath = :chips[] ] ] ] ] ]`;

await test("rows a virtualized list drops as it scrolls are collected: drawn rows, laid-out rows", async () => {
  const r = await compile(SOURCE);
  assert.deepEqual(r.errors.map((e) => e.message), [], "the program compiles");
  const page = await browser.newPage();
  await page.setViewport({ width: 600, height: 400 });
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async (base, json) => {
    const rt = await import(base + "/runtime/dist/index.js");
    await rt.kernelReady?.();
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:0;top:0;width:300px;height:400px";
    document.body.appendChild(host);
    const app = rt.buildProgram(JSON.parse(json));
    rt.mountApp(app, host, new rt.DomBackend());
    rt.settle();
    window.__t = { rt, app, frame: () => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0))) };
    await window.__t.frame();
  }, BASE, JSON.stringify(r.program));
  const cdp = await page.createCDPSession();
  const live = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    const proto = await page.evaluateHandle(() => window.__t.rt.View.prototype);
    const all = await page.queryObjects(proto);
    const n = await page.evaluate((a) => a.length, all);
    await all.dispose(); await proto.dispose();
    return n;
  };
  const jump = (k) => page.evaluate(async (k) => {
    const { app, rt, frame } = window.__t;
    const max = 3000 * 30 - 400;
    for (let i = 0; i < k; i++) { app.list.scrollTo(((i * 7919) % 100) / 100 * max); rt.settle(); await frame(); }
    return app.list.scrollY;
  }, k);
  await jump(20);
  const settled = await live();
  const at = await jump(200);
  const after = await live();
  if (process.env.SHOW) console.log({ settled, after, at });
  assert.ok(at > 1000, `the list scrolled (scrollY ${at})`);
  await page.close();
  assert.deepEqual(errors, [], "no page errors");
  // a recycled row may sit in the reconciler's pool, so allow slack; a leak
  // keeps every row ever built — 200 jumps across 3,000 records is thousands
  assert.ok(after < settled * 1.5 + 50, `live views stay bounded: ${settled} after warm-up, ${after} after 200 more jumps`);
});

await browser.close();
server.close();
summarize("row-lifetime");
