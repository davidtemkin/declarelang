// test/prod-parity.test.mjs — dev-compile ↔ production-build BEHAVIORAL parity,
// pixel for pixel. The dual-mode tenet says both modes test one output oracle;
// this is that oracle enforced end-to-end across the two program pipelines:
//
//   dev page    <url>.declare       — compile → instantiate the compiled program
//   build page  /build/<dir>/       — declarec: compact → embed → hydrate →
//                                     instantiate (renderProgram, no parser)
//
// Same server, same browser, same viewport; the settled first paint of each
// must be BYTE-IDENTICAL. When they differ, a second dev load tells the two
// causes apart: if the dev page differs from itself the app is unstable (animation,
// timing) and parity is unprovable; if not, the production pipeline changed what a
// program IS, which is exactly the regression this exists to catch.
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
import { launchChrome } from "../tools/internal/chrome.mjs";
import { settled } from "./settle.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function findChrome() {
  for (const c of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean))
    if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}

// Each entry is the program's PATH, not just a name: the smallest case is a
// test fixture rather than an app, and parity at the floor — a 36-line program
// whose bundle is almost all runtime — is worth covering beside the big ones.
// It gets its own directory because /build/<dir>/ resolves by the
// DIRECTORY-PROGRAM rule (<dir>/<dir>.declare), which a folder holding several
// programs cannot satisfy.
const APPS = [
  { name: "calendar", dir: "apps/calendar", main: "calendar.declare" },
  { name: "lzx-calendar", dir: "apps/lzx-calendar", main: "lzx-calendar.declare" },
  { name: "settings-panel", dir: "test/probe/settings-panel", main: "settings-panel.declare" },
];

const server = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});
const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${httpServer.address().port}`;

const browser = await launchChrome({
  executablePath: findChrome(), headless: true, args: ["--no-sandbox"],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
});
const page = await browser.newPage();

async function shot(url) {
  await page.goto(url, { waitUntil: "networkidle0", timeout: 90000 });
  // booted: every top-level app, dev or production, sets window.__declare as
  // the last step of booting (the bridge, or a stub in a build without it).
  // Without this, a dev compile slowed by a busy machine is shot as the
  // empty page before it, which holds still and so passes for settled.
  await page.waitForFunction(() => globalThis.__declare !== undefined, { timeout: 90000 });
  // settle: fonts + first paints + any load-driven relayout have landed
  await page.evaluate(() => document.fonts.ready);
  await settled(page);
  // A production page has no dev bridge, so settled() cannot see its motion
  // (lzx-calendar animates at boot): the picture is the condition — shoot
  // until two shots 100 ms apart agree.
  let prev = Buffer.from(await page.screenshot({ type: "png" }));
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const next = Buffer.from(await page.screenshot({ type: "png" }));
    if (next.equals(prev)) return next;
    prev = next;
  }
  throw new Error(`${url} never stopped changing`);
}

try {
  for (const { name: app, dir, main } of APPS) {
    const devUrl = `${B}/${dir}/${main}`;
    const buildUrl = `${B}/build/${dir}/`;

    await test(`${app}: production build renders byte-identically to the dev compile`, async () => {
      const dev = await shot(devUrl);
      const built = await shot(buildUrl);
      if (dev.equals(built)) return;
      const again = await shot(devUrl);
      assert.ok(dev.equals(again), "two loads of the same dev page differ — the app is unstable, so parity is unprovable");
      assert.fail(`dev and /build first paints differ (${dev.length} vs ${built.length} bytes) — the production pipeline changed the program`);
    });
  }
} finally {
  await browser.close();
  httpServer.close();
}

summarize("prod-parity");
