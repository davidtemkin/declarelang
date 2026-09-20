// deploycheck — does a production build actually deploy? Builds the calendar
// three ways, serves each from a DUMB static server (no MIME help, no headers
// beyond the obvious — the GitHub Pages case), loads it in headless Chrome and
// reports whether the app mounted, what it fetched, and in what order. Then the
// same over file://, which is the offline case.
//
//   node mac-host/profile/deploycheck.mjs
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const { buildProduction } = await import(path.join(ROOT, "tools/declarec.mjs"));
const src = readFileSync(path.join(ROOT, "apps/calendar/calendar.declare"), "utf8");
const gzkb = (s) => (zlib.gzipSync(Buffer.from(s)).length / 1024).toFixed(1);

const TYPES = { ".html": "text/html", ".js": "application/javascript", ".wasm": "application/wasm", ".txt": "text/plain" };
/** A static server that does nothing clever: no compression, no rewrites. */
function serve(dir) {
  const hits = new Map();   // what the SERVER actually sent — a reused preload never gets here
  const s = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    hits.set(rel, (hits.get(rel) ?? 0) + 1);
    try {
      const body = readFileSync(path.join(dir, rel));
      res.writeHead(200, { "content-type": TYPES[path.extname(rel)] ?? "application/octet-stream" });
      res.end(body);
    } catch { res.writeHead(404); res.end("not found"); }
  });
  return new Promise((r) => s.listen(0, "127.0.0.1", () => r({ server: s, port: s.address().port, hits })));
}

async function emit(opts) {
  const out = await buildProduction(src, { name: "calendar", originDir: path.join(ROOT, "apps/calendar"), ...opts });
  if (!out.ok) throw new Error("build failed: " + out.errors?.map((e) => e.message).join("; "));
  const dir = mkdtempSync(path.join(tmpdir(), "declare-deploy-"));
  for (const f of out.files) writeFileSync(path.join(dir, f.name), f.contents);
  return { dir, files: out.files };
}

/** Load a URL and report what happened: did the app mount, what did it fetch. */
async function load(browser, url) {
  const page = await browser.newPage();
  const reqs = [], errors = [];
  page.on("request", (r) => reqs.push(path.basename(new URL(r.url()).pathname || "/")));
  page.on("pageerror", (e) => errors.push(String(e).split("\n")[0].slice(0, 120)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 120)); });
  let mounted = false;
  try {
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction("document.querySelector('#host') && document.querySelector('#host').children.length > 0", { timeout: 20000 });
    mounted = true;
  } catch { /* reported below */ }
  const nodes = await page.evaluate("document.querySelectorAll('#host *').length").catch(() => 0);
  await page.close();
  return { mounted, nodes, reqs, errors };
}

// NO --allow-file-access-from-files: this is what a double-clicked page really gets
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const rows = [];
for (const [label, opts] of [["separate kernel file", {}], ["inlineKernel: true", { inlineKernel: true }]]) {
  const { dir, files } = await emit(opts);
  console.log(`\n== ${label}`);
  for (const f of files) console.log(`   ${f.name.padEnd(30)} gz ${gzkb(f.contents)} KB`);
  const { server, port, hits } = await serve(dir);
  const http_ = await load(browser, `http://127.0.0.1:${port}/`);
  server.close();
  const file_ = await load(browser, "file://" + path.join(dir, "index.html"));
  rows.push([label, "static http", http_], [label, "file://", file_]);
  console.log(`   http   mounted=${http_.mounted} nodes=${http_.nodes}`);
  console.log(`   server sent: ${[...hits].filter(([k]) => !/favicon|events/.test(k)).map(([k, n]) => `${k || "index.html"}×${n}`).join(", ")}`);
  console.log(`   file   mounted=${file_.mounted} nodes=${file_.nodes}${file_.errors.length ? "\n          errors: " + file_.errors.slice(0, 2).join(" | ") : ""}`);
}
await browser.close();
console.log("\n| build | serving | mounted | nodes |");
for (const [label, how, r] of rows) console.log(`| ${label} | ${how} | ${r.mounted ? "yes" : "NO"} | ${r.nodes} |`);
