// warmcost — what a PRE-COMPILED page downloads, with and without the
// speculative compiler warm (boot-uniform.js `?warm`). Serves the tree as a
// dumb static host and counts what the SERVER sent, in bytes, for one visit.
//
//   node mac-host/profile/warmcost.mjs [apps/weather/]
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const APP = process.argv[2] ?? "apps/weather/";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MIME = {
  ".html": "text/html;charset=utf-8", ".js": "text/javascript;charset=utf-8", ".mjs": "text/javascript;charset=utf-8",
  ".json": "application/json", ".css": "text/css;charset=utf-8", ".declare": "text/plain;charset=utf-8",
  ".txt": "text/plain;charset=utf-8", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".jpg": "image/jpeg", ".mp4": "video/mp4",
};
let log = [];
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let fp = path.join(ROOT, rel);
  try {
    const st = fs.statSync(fp);
    if (st.isDirectory()) fp = path.join(fp, "index.html");
    const body = fs.readFileSync(fp);
    // what a real static host puts on the wire: gzip for the types it compresses
    const type = MIME[path.extname(fp).toLowerCase()] ?? "application/octet-stream";
    const compressible = /^(text|application\/(javascript|json))/.test(type);
    log.push({ rel, bytes: compressible ? zlib.gzipSync(body).length : body.length, type });
    res.writeHead(200, { "content-type": type, etag: `"${st.size}-${Number(st.mtimeMs).toString(36)}"` });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

const visit = async (q) => {
  log = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${B}/${APP}${q}`, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 4500));
  const state = await page.evaluate(() => ({ path: globalThis.__declarePerf?.path ?? null, nodes: document.querySelectorAll("*").length }));
  await page.close();
  const total = log.reduce((n, e) => n + e.bytes, 0);
  const compiler = log.filter((e) => /declare-compiler|library\//.test(e.rel)).reduce((n, e) => n + e.bytes, 0);
  const top = [...log].sort((a, b) => b.bytes - a.bytes).slice(0, 5).map((e) => `${e.rel.split("/").pop()} ${(e.bytes / 1024).toFixed(0)}KB`);
  return { ...state, total, compiler, files: log.length, top };
};

const kb = (n) => (n / 1024).toFixed(1).padStart(7) + " KB";
console.log(`${APP} — bytes ON THE WIRE for one visit (gzip where a static host compresses)\n`);
for (const [label, q] of [["default (warm off)", ""], ["?warm=1 (opt in)", "?warm=1"]]) {
  const r = await visit(q);
  console.log(`  ${label.padEnd(20)} total ${kb(r.total)} · compiler+library ${kb(r.compiler)} · ${String(r.files).padStart(3)} files · path=${r.path} · ${r.nodes} nodes\n      biggest: ${r.top.join(", ")}`);
}
await browser.close();
server.close();
