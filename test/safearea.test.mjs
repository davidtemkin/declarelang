// test/safearea.test.mjs — the SAFE-AREA contract, driven by a real browser.
//
// The promise (schema.ts App `edges`/`safeTop…safeRight`; boot.ts wireSafeArea):
// letterboxed by default — the viewport meta is untouched and every inset reads
// 0; `edges = cover` patches `viewport-fit=cover` into the meta WITHOUT losing
// its served terms, and the four insets become live numbers that follow the
// device (rotation re-reads them). Chromium's CDP inset override stands in for
// the phone: the same env(safe-area-inset-*) channel iOS feeds, hand-set.

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
const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${httpServer.address().port}`;

const browser = await puppeteer.launch({
  executablePath: findChrome(), headless: true, args: ["--no-sandbox"],
  defaultViewport: { width: 390, height: 720, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const cdp = await page.createCDPSession();
// A phone's worth of system chrome: notch above, home indicator below.
const PHONE = { top: 47, left: 0, bottom: 34, right: 0 };

const boot = async (program) => {
  await page.goto(`${B}/${program}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => globalThis.__declare != null, { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 100)); // the post-patch re-measure tick
};
const facts = () => page.evaluate(() => {
  const a = globalThis.__declare.find("app");
  return { top: a.safeTop, bottom: a.safeBottom, left: a.safeLeft, right: a.safeRight };
});
const meta = () => page.evaluate(() => {
  const m = document.querySelector('meta[name="viewport"]');
  return m ? m.content : null;
});

await test("edges = cover patches viewport-fit into the meta, keeping its served terms", async () => {
  await boot("test/probe/safearea.declare");
  const m = await meta();
  assert.ok(m !== null && m.includes("viewport-fit=cover"), `meta should carry viewport-fit=cover, got: ${m}`);
  assert.ok(m.includes("width=device-width"), `the served meta terms are load-bearing and must survive the patch: ${m}`);
});

await test("cover stamps the standalone web-app metas — a Safari tab can never fully cover, Add to Home Screen can", async () => {
  await boot("test/probe/safearea.declare");
  const stamped = await page.evaluate(() => ({
    generic: document.querySelector('meta[name="mobile-web-app-capable"]')?.content ?? null,
    apple: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content ?? null,
    bar: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content ?? null,
  }));
  assert.deepEqual(stamped, { generic: "yes", apple: "yes", bar: "black-translucent" });
});

await test("the letterbox default stamps none of them", async () => {
  await boot("test/probe/safearea-default.declare");
  const any = await page.evaluate(() =>
    document.querySelector('meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]') !== null);
  assert.equal(any, false, "an undeclared app must not become installable-fullscreen by surprise");
});

await test("under cover, the insets are the device's real numbers — and constraints read them", async () => {
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: PHONE });
  await boot("test/probe/safearea.declare");
  assert.deepEqual(await facts(), { top: 47, bottom: 34, left: 0, right: 0 });
  const barY = await page.evaluate(() => globalThis.__declare.find("app.bar").y);
  assert.equal(barY, 47, "pinned chrome placed itself with app.safeTop");
});

await test("the insets are LIVE: a rotation-shaped change re-feeds them", async () => {
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: 0, left: 47, bottom: 21, right: 47 }, // landscape: notch to the side
  });
  await page.evaluate(() => { window.dispatchEvent(new Event("resize")); return null; });
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(await facts(), { top: 0, bottom: 21, left: 47, right: 47 });
});

// `underlapBottom` — the browser's own retractable chrome, told apart from the
// device's. iOS reports it by growing the VISUAL viewport past the layout one
// when the bars collapse (measured iPhone 16 Pro, iOS 18.2: 678 layout in both
// states, 678 visual with the bars up and 760 once they retract); no desktop
// browser does that, so the fact is fed a stand-in visual viewport here and
// asserted on the device by the simulator rig.
const withVisualHeight = async (h) => page.evaluate((hh) => {
  Object.defineProperty(window.visualViewport, "height", { get: () => hh, configurable: true });
  window.visualViewport.dispatchEvent(new Event("resize"));
  return null;
}, h);

await test("bars shown: nothing of the app is under the browser's chrome", async () => {
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: PHONE });
  await boot("test/probe/safearea.declare");
  const layout = await page.evaluate(() => document.documentElement.clientHeight);
  await withVisualHeight(layout);
  const a = await page.evaluate(() => {
    const x = globalThis.__declare.find("app");
    return { host: x.hostHeight, under: x.underlapBottom };
  });
  assert.deepEqual(a, { host: layout, under: 0 });
});

await test("bars retracted: the band they vacated is hostHeight's, and underlapBottom names it", async () => {
  const layout = await page.evaluate(() => document.documentElement.clientHeight);
  await withVisualHeight(layout + 82);
  const a = await page.evaluate(() => {
    const x = globalThis.__declare.find("app");
    return { host: x.hostHeight, under: x.underlapBottom };
  });
  assert.deepEqual(a, { host: layout + 82, under: 82 },
    "hostHeight reaches the true bottom; underlapBottom is how much of it a finger cannot rely on");
});

await test("the default is the letterbox: no edges declaration leaves the meta untouched", async () => {
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: PHONE });
  await boot("test/probe/safearea-default.declare");
  const m = await meta();
  assert.ok(m === null || !m.includes("viewport-fit"), `an undeclared app must not patch the meta: ${m}`);
});

await browser.close();
httpServer.close();
summarize("safearea");
