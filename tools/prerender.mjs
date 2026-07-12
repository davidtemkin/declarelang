// tools/prerender.mjs — EXPERIMENT (uncommitted; delete to revert).
//
// SEO prerender for a Declare page. A Declare page normally ships a thin HTML shell +
// a chunk of JS that, when run, builds the DOM. A crawler that doesn't execute JS sees
// no content. This tool runs the app once in headless Chrome, lets it build the DOM +
// resolve constraints, captures the rendered `#host` subtree (styles are inline, so the
// snapshot is self-contained), and re-emits the page as `<name>.prerendered.html`:
//
//   • the captured DOM is inlined in the initial HTML (in a `data-prerender` wrapper) so a
//     crawler / no-JS reader gets the real text + structure — SEO, and pre-JS first paint;
//   • the ORIGINAL boot script is kept, so the JS still runs and mounts the LIVE app; a
//     small script then removes the snapshot once the live root has mounted (seamless swap,
//     since the snapshot and the live tree are pixel-identical).
//
//   node tools/prerender.mjs [pagePath]      # default "/" (the homepage / marketing site)
//   node tools/prerender.mjs /examples/neoweather/
//
// Output sits next to the source page (index.prerendered.html at the root). It's a normal
// static file — serve it and view-source to see the baked content, or rename it over
// index.html to test it as the real entry. Delete the *.prerendered.html + this tool to revert.

import http from "node:http";
import path from "node:path";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import puppeteer from "../node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PAGE = process.argv[2] || "/";                       // request path; "/" → index.html
const VIEWPORT = { width: 1280, height: 900 };             // capture width (positions bake in; the LIVE app stays responsive)
const SETTLE_MS = 1600;                                    // let spring entrances / animations reach rest before capture

// Resolve the request path to a source HTML file on disk.
const pageFile = PAGE.endsWith(".html")
  ? path.join(ROOT, PAGE.replace(/^\/+/, ""))
  : path.join(ROOT, PAGE.replace(/^\/+/, ""), "index.html");
if (!existsSync(pageFile)) { console.error("prerender: no page at", pageFile); process.exit(1); }

// ── a tiny static server for the render (self-contained; no reliance on a running one) ──
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".ico": "image/x-icon", ".declare": "text/plain", ".woff2": "font/woff2",
  ".woff": "font/woff", ".map": "application/json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const abs = path.join(ROOT, p);
  if (!abs.startsWith(ROOT) || !existsSync(abs) || statSync(abs).isDirectory()) { res.writeHead(404); return res.end("nope"); }
  res.writeHead(200, { "content-type": MIME[path.extname(abs)] || "application/octet-stream", "cache-control": "no-cache" });
  res.end(readFileSync(abs));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}${PAGE.endsWith(".html") ? PAGE : PAGE.replace(/\/?$/, "/")}`;

// ── render + capture ──
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport(VIEWPORT);
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
console.log("prerender:", url);
await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
// wait until the app has built its DOM, then let animations settle
await page.waitForFunction(() => { const h = document.getElementById("host"); return h && h.children.length > 0; }, { timeout: 15000 });
await new Promise((r) => setTimeout(r, SETTLE_MS));

const cap = await page.evaluate(() => {
  const host = document.getElementById("host");
  // Only the JS-INJECTED styles (they carry an id, e.g. the scrollbar rule); the page's
  // own <style> is already in the source HTML, so we don't want to duplicate it.
  const injected = [...document.head.querySelectorAll("style[id]")].map((s) => s.outerHTML).join("\n");
  const text = (host.innerText || "").replace(/\s+/g, " ").trim();
  return {
    snapshot: host.innerHTML,          // the live root subtree — styles are inline, so self-contained
    injectedStyles: injected,
    nodeCount: host.querySelectorAll("*").length,
    textLen: text.length,
    textHead: text.slice(0, 140),
  };
});

await browser.close();
server.close();
if (errs.length) console.warn("prerender: page errors:", errs.slice(0, 3));

// ── re-emit: source HTML + inlined snapshot + injected styles + a snapshot-removal script ──
let html = readFileSync(pageFile, "utf8");
if (!html.includes('<div id="host"></div>')) { console.error('prerender: could not find <div id="host"></div> in', pageFile); process.exit(1); }

// The snapshot overlays #host exactly (absolute/inset), inert to pointers, and is removed
// once the live root (the #host child WITHOUT data-prerender) mounts.
const snapshotBlock =
  `<div id="host"><div data-prerender style="position:absolute;inset:0;pointer-events:none">` +
  cap.snapshot +
  `</div></div>`;
const removalScript =
  `\n<script type="module">\n` +
  `  // EXPERIMENT: drop the SEO prerender snapshot once the live app has mounted.\n` +
  `  const host = document.getElementById("host");\n` +
  `  const live = () => [...host.children].find((c) => !c.hasAttribute("data-prerender"));\n` +
  `  const t0 = performance.now();\n` +
  `  const tick = () => {\n` +
  `    if (live()) { const s = host.querySelector("[data-prerender]"); if (s) s.remove(); return; }\n` +
  `    if (performance.now() - t0 < 8000) requestAnimationFrame(tick);\n` +
  `  };\n` +
  `  requestAnimationFrame(tick);\n` +
  `</script>\n`;

html = html
  .replace(/<div id="host"><\/div>/, (cap.injectedStyles ? cap.injectedStyles + "\n" : "") + snapshotBlock)
  .replace(/<\/script>\s*$/, "</script>" + removalScript);

const outFile = pageFile.replace(/\.html$/, ".prerendered.html");
writeFileSync(outFile, html);

const rawKB = (Buffer.byteLength(html) / 1024).toFixed(1);
const gzKB = (gzipSync(html).length / 1024).toFixed(1);
const srcKB = (statSync(pageFile).size / 1024).toFixed(1);
console.log("\nprerender: wrote", path.relative(ROOT, outFile));
console.log(`  DOM captured:   ${cap.nodeCount} nodes · ${cap.textLen} chars of text`);
console.log(`  text head:      "${cap.textHead}…"`);
console.log(`  page size:      ${srcKB} KB → ${rawKB} KB  (${gzKB} KB gzipped)`);
console.log(`  serve it and view-source, or rename over index.html to test as the entry.`);
