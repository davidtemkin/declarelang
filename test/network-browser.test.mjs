// test/network-browser.test.mjs — the network-touching LANGUAGE surfaces at
// the real-transport tier. The model tier (unit.test.mjs) proves DataSource
// semantics over a stubbed fetch — lifecycle burst, POST/PUT body encoding,
// auto-fetch, onLoad, failure, stale discard; this suite proves what stubs
// cannot: a real fetch from a running app in a real browser. One fixture app
// (test/fixtures/net-live.declare) exercises a DataSource GET of a served
// asset (auto + relative url resolution), a DataSource POST with an object
// body against a TEST-OWNED /__echo route (the streams-browser arrangement:
// the shipped server carries no fixture code), and an Image loading a served
// bitmap. Every assertion reads app state off the screen.
//
// Not covered here (noted, not forgotten): declared font Faces with url()
// sources (loadFonts → FontFace) and AppIsland's program fetch — both ride
// the same platform loaders and deserve cases if they ever regress.
//
// Same puppeteer-core + findChrome setup as perceptual.test.mjs.

import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { test, summarize } from "./harness.mjs";
import { createDeclareServer } from "../server/create.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function findChrome() {
  for (const c of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean))
    if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}

const server = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});

// /__echo — the POST target the fixture's `sent` source hits: reflects the
// method and the JSON body's `q` back, so the app can display the roundtrip.
const httpServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/__echo") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      let q = null;
      try { q = JSON.parse(body).q ?? null; } catch { /* not JSON — q stays null */ }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ method: req.method, q, contentType: req.headers["content-type"] ?? "" }));
    });
    return;
  }
  server.handler(req, res);
}).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${httpServer.address().port}`;

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
page.on("requestfailed", (r) => { if (!r.url().endsWith("favicon.ico")) errs.push("REQFAIL " + r.url().slice(-60)); });

try {
  await page.goto(`${B}/test/fixtures/net-live.declare`, { waitUntil: "networkidle2", timeout: 60000 });

  await test("a DataSource GET lands over real HTTP (auto + relative url beside the program)", async () => {
    await page.waitForFunction(() => document.body.innerText.includes("get:hello-get"), { timeout: 15000 });
    assert.ok(await page.evaluate(() => document.body.innerText.includes("get:hello-get")));
  });

  await test("a DataSource POST sends its object body as JSON and reads the reply", async () => {
    await page.waitForFunction(() => document.body.innerText.includes("post:POST:ping"), { timeout: 15000 });
    assert.ok(await page.evaluate(() => document.body.innerText.includes("post:POST:ping")),
      "the echo proves method, JSON encoding, and the reply landing in .value");
  });

  await test("an Image loads a served bitmap and reports .loaded", async () => {
    await page.waitForFunction(() => document.body.innerText.includes("img:loaded"), { timeout: 15000 });
    assert.ok(await page.evaluate(() => document.body.innerText.includes("img:loaded")));
  });

  await test("an undecodable Image source reports .failed (the broken-avatar fact)", async () => {
    await page.waitForFunction(() => document.body.innerText.includes("imgfail:yes"), { timeout: 15000 });
    assert.ok(await page.evaluate(() => document.body.innerText.includes("imgfail:yes")));
  });

  await test("no page errors or failed requests through the run", () => {
    assert.deepEqual(errs, []);
  });
} finally {
  await browser.close();
  httpServer.close();
}

summarize("network (browser transport)");
