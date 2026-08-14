// test/static-host.test.mjs — the DUMB STATIC HOST contract, in a real browser.
//
// Everything else that exercises an app in a browser runs it against the dev
// server, where `.declare` compiles on the NODE side: the server resolves
// includes from the filesystem and hands back a finished program. A static
// host (GitHub Pages, S3, nginx) has no compiler, so the browser compiles the
// app itself — and the two paths resolve `include` by entirely different
// machinery. Nothing tested the second one, and the difference shipped: an app
// that includes a file beside it compiled on the dev server and failed on the
// deployed site with DECLARE5002, because the browser's include host read a
// SYNCHRONOUS map that only ever held the LIBRARY. The include seam is async
// now, so the browser host FETCHES what the walk reaches (compile-browser
// fetchHost) — the same thing the Node host does with the filesystem, through
// the same shared search path. This suite is what keeps the two honest.
//
// So this suite serves the tree the way a static host does — files, an
// index.html for a directory, 404 for the rest, and nothing else — and asserts
// the apps actually render. The apps under test are chosen for what they prove:
//
//   • weather + lzx-dashboard — each `include`s a sibling source, the case
//     that broke. Their card/window vocabularies live in a second file.
//   • calendar — includes nothing, so it pins the untouched path: the fix
//     must not disturb an app that never needed it.

import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { test, summarize } from "./harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function findChrome() {
  for (const c of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean))
    if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}

const MIME = {
  ".html": "text/html;charset=utf-8", ".js": "text/javascript;charset=utf-8",
  ".mjs": "text/javascript;charset=utf-8", ".json": "application/json",
  ".css": "text/css;charset=utf-8", ".declare": "text/plain;charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon",
};

// A static host and nothing more: no /compile, no directory program rule, no
// service worker synthesis. If a request cannot be answered by a file on disk,
// it 404s — which is the whole point of the fixture.
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
  catch { res.writeHead(400); return res.end("bad request"); }
  let fp = path.join(ROOT, pathname);
  if (fp !== ROOT && !fp.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end("forbidden"); }
  try {
    const st = fs.statSync(fp);
    if (st.isDirectory()) fp = path.join(fp, "index.html");
    const body = fs.readFileSync(fp);
    res.writeHead(200, {
      "content-type": MIME[path.extname(fp).toLowerCase()] ?? "application/octet-stream",
      // real static hosts send validators; the in-browser cache needs them
      etag: `"${st.size}-${Number(st.mtimeMs).toString(36)}"`,
    });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: findChrome(), headless: true, args: ["--no-sandbox"],
});

/** Boot an app the way a visitor does — the directory URL — and report what
 *  the page settled into: the compile-error panel's text, or the node count. */
async function boot(app) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(`${BASE}/apps/${app}/`, { waitUntil: "networkidle2" });
  // the in-browser path is fetch + compile + instantiate; give it room
  await new Promise((r) => setTimeout(r, 4000));
  const out = await page.evaluate(() => {
    const panel = document.querySelector('[role="alert"]');
    return {
      error: panel === null ? null : panel.innerText.replace(/\s+/g, " ").trim(),
      nodes: document.querySelectorAll("*").length,
    };
  });
  await page.close();
  return { ...out, pageErrors: errors };
}

for (const app of ["weather", "lzx-dashboard"]) {
  await test(`an app that includes a sibling source compiles in-browser: ${app}`, async () => {
    const r = await boot(app);
    // The regression this suite exists for. Name it in the failure, because
    // "it didn't render" is the symptom of many things and this one is exact.
    assert.equal(r.error, null,
      `${app} failed to compile on a static host — if this names an include, the browser's ` +
      `fetch host (compile-browser fetchHost) did not read the app's own files: ${r.error}`);
    assert.ok(r.nodes > 200, `${app} compiled but rendered almost nothing (${r.nodes} nodes)`);
  });
}

await test("an app with no includes is unaffected: calendar", async () => {
  const r = await boot("calendar");
  assert.equal(r.error, null, `calendar failed on a static host: ${r.error}`);
  assert.ok(r.nodes > 200, `calendar rendered almost nothing (${r.nodes} nodes)`);
});

await browser.close();
server.close();
summarize("static-host");
