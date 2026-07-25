// test/prod-parity.test.mjs — dev-compile ↔ production-build BEHAVIORAL parity,
// pixel for pixel. The dual-mode tenet says both modes test one output oracle;
// this is that oracle enforced end-to-end across the two program pipelines:
//
//   dev page    <url>.declare       — parse → check → instantiate (renderAsync)
//   build page  /build/<dir>/       — declarec: compact → embed → hydrate →
//                                     instantiate (renderProgram, no parser)
//
// Same server, same browser, same viewport; the settled first paint of each
// must be BYTE-IDENTICAL. Each app first proves it renders deterministically
// (two dev loads, identical bytes) so a parity failure can never be blamed on
// animation or timing — a diff then means the production pipeline changed what
// a program IS, which is exactly the regression this exists to catch.
//
// Apps chosen for stillness at settle (no clocks, no continuous motion):
// calendar's "today" is time-derived but constant within a run.

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

const APPS = ["calendar", "controls", "settings-panel", "calendar-sample"];

const server = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});
const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${httpServer.address().port}`;

const browser = await puppeteer.launch({
  executablePath: findChrome(), headless: true, args: ["--no-sandbox"],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
});
const page = await browser.newPage();

async function shot(url) {
  await page.goto(url, { waitUntil: "networkidle0", timeout: 90000 });
  // settle: fonts + first paints + any load-driven relayout have landed
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 1800));
  return Buffer.from(await page.screenshot({ type: "png" }));
}

try {
  for (const app of APPS) {
    const devUrl = `${B}/apps/${app}/${app}.declare`;
    const buildUrl = `${B}/build/apps/${app}/`;

    await test(`${app}: renders deterministically (two dev loads, identical bytes)`, async () => {
      const a = await shot(devUrl);
      const b = await shot(devUrl);
      assert.ok(a.equals(b), "two loads of the same dev page must not differ — unstable app, parity unprovable");
    });

    await test(`${app}: production build renders byte-identically to the dev compile`, async () => {
      const dev = await shot(devUrl);
      const built = await shot(buildUrl);
      assert.ok(dev.equals(built),
        `dev and /build first paints differ (${dev.length} vs ${built.length} bytes) — the production pipeline changed the program`);
    });
  }
} finally {
  await browser.close();
  httpServer.close();
}

summarize("prod-parity");
