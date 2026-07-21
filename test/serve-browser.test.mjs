// test/serve-browser.test.mjs — the embeddable server driven by a REAL browser.
// serve.test.mjs covers routing at the HTTP layer; this proves the whole
// in-browser path still works when the platform is served through the mount
// system: the homepage boots and mounts, a live demo preview runs, and the
// in-browser compiler (the same compiler-client the demos' onInput() drives)
// compiles an edit and reports a broken one. Same puppeteer-core + findChrome
// setup as perceptual.test.mjs, so it runs wherever that one does.

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

// distro mode, in-process, on an ephemeral port
const server = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});
const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${httpServer.address().port}`;

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
page.on("requestfailed", (r) => { if (!r.url().endsWith("favicon.ico")) errs.push("REQFAIL " + r.url().slice(-60)); });

try {
  await page.goto(`${B}/`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(() => (document.getElementById("host")?.children.length ?? 0) > 0, { timeout: 30000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));

  await test("the homepage boots and mounts (served through the mount system)", async () => {
    assert.ok(await page.evaluate(() => (document.getElementById("host")?.children.length ?? 0) > 0), "host should be filled");
  });

  await test("a live demo preview is running (an embedded compiled child app)", async () => {
    assert.ok(await page.evaluate(() => document.body.innerText.includes("click anywhere to change v")),
      "the reactivity demo's text should be on screen");
  });

  await test("the in-browser compiler compiles an edit (the demo onInput path)", async () => {
    const r = await page.evaluate(async (origin) => {
      const mod = await import(origin + "/browser/compiler-client.js");
      const client = await mod.loadCompiler();
      await mod.ensureLibrary(client);
      const out = await client.compile('App [ label: Text [ text = "edited-in-browser" ] ]', {});
      return { ok: !!out.source, hasText: (out.source || "").includes("edited-in-browser") };
    }, B);
    assert.ok(r.ok && r.hasText, "in-browser compile should return the edited program's source");
  });

  await test("a broken edit yields a report, not a crash", async () => {
    const r = await page.evaluate(async (origin) => {
      const mod = await import(origin + "/browser/compiler-client.js");
      const client = await mod.loadCompiler();
      const out = await client.compile('App [ label: Text [ text = ', {});   // truncated
      return { source: out.source, hasReport: !!(out.report && out.report.length) };
    }, B);
    assert.equal(r.source, null);
    assert.ok(r.hasReport, "a broken edit should surface a compile report");
  });

  await test("no page errors or failed requests through the whole run", () => {
    assert.deepEqual(errs, []);
  });
} finally {
  await browser.close();
  httpServer.close();
}

summarize("serve (browser)");
