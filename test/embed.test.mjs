// test/embed.test.mjs — the TENANCY contract, driven through a real browser on
// a page that is deliberately NOT a Declare page (test/probe/embed-page.html):
// two apps in `data-declare-embed` boxes, booted with an explicit host element.
//
// The pins, one per clause of the embedding contract (guide ch. 18):
//   - both apps mount and lay out, each in its own box (multi-mount);
//   - an embedded app's appName does NOT retitle the page;
//   - an embedded app's location moves NEITHER the URL nor history;
//   - the verbs work: navigate() routes through the app's own hostServices
//     (and an embedder can replace the table — the interception seam);
//   - input stays in its box: a click in B never reaches A;
//   - the page is IDLE: zero rAF while nobody touches it (the loops are gone);
//   - `pageVisible` reaches embedded apps and flips with the document.

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

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 900 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const cdp = await page.createCDPSession();
await cdp.send("Network.setBypassServiceWorker", { bypass: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${B}/test/probe/embed-page.html`, { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForFunction(() => window.__embedsReady === true, { timeout: 60000 });
await sleep(300);

/** Click at an offset inside a slot's box (viewport coordinates). */
async function clickIn(slotId, dx, dy) {
  const r = await page.evaluate((id) => {
    const b = document.getElementById(id).getBoundingClientRect();
    return { x: b.x, y: b.y };
  }, slotId);
  await page.mouse.click(r.x + dx, r.y + dy);
  await sleep(120);
}

const apps = () => page.evaluate(() => {
  const a = document.getElementById("slot-a").__declareApp;
  const b = document.getElementById("slot-b").__declareApp;
  return {
    a: { location: a.location, clicks: a.clicks, name: a.appName, visible: a.pageVisible },
    b: { clicks: b.clicks, visible: b.pageVisible },
    title: document.title, hash: location.hash, hlen: history.length,
  };
});

await test("both apps mount into their own marked boxes", async () => {
  const s = await page.evaluate(() => ({
    a: !!document.getElementById("slot-a").__declareApp && document.getElementById("slot-a").children.length > 0,
    b: !!document.getElementById("slot-b").__declareApp && document.getElementById("slot-b").children.length > 0,
  }));
  assert.equal(s.a, true, "app A mounted");
  assert.equal(s.b, true, "app B mounted");
});

await test("an embedded appName never retitles the page", async () => {
  const s = await apps();
  assert.equal(s.a.name, "Probe A", "the app holds its name");
  assert.equal(s.title, "Host Page — not a Declare app", "the page holds its title");
});

await test("an embedded location moves neither the URL nor history", async () => {
  const before = await apps();
  await clickIn("slot-a", 90, 82);            // the "move location" button
  const after = await apps();
  assert.equal(after.a.location, "moved/1", "the app's location moved");
  assert.equal(after.hash, "", "the page URL carries no fragment");
  assert.equal(after.hlen, before.hlen, "no history entry was minted");
});

await test("navigate() routes through hostServices — and an embedder can intercept", async () => {
  await page.evaluate(() => {
    const a = document.getElementById("slot-a").__declareApp;
    window.__navCalls = [];
    a.hostServices = { ...a.hostServices, navigate: (to) => window.__navCalls.push(to) };
  });
  await clickIn("slot-a", 90, 122);           // the "navigate out" button
  const calls = await page.evaluate(() => window.__navCalls);
  assert.deepEqual(calls, ["https://example.com/away"], "the verb reached the service, synchronously");
  assert.equal(page.url().startsWith(`${B}/test/probe/embed-page.html`), true, "the page itself never navigated");
});

await test("input stays in its box — a click in B never reaches A", async () => {
  const before = await apps();
  await clickIn("slot-b", 90, 82);            // B's "tap me"
  const after = await apps();
  assert.equal(after.b.clicks, before.b.clicks + 1, "B counted its click");
  assert.equal(after.a.clicks, before.a.clicks, "A saw nothing");
});

await test("the untouched page is IDLE — zero rAF, the polling loops are gone", async () => {
  const rafs = await page.evaluate(async () => {
    let n = 0;
    const orig = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => { n++; return orig.call(window, cb); };
    await new Promise((r) => setTimeout(r, 1200));
    window.requestAnimationFrame = orig;
    return n;
  });
  assert.equal(rafs, 0, `expected 0 rAF over 1.2s idle, saw ${rafs}`);
});

await test("a tenant's relative data resolves beside ITS program, not another's", async () => {
  // probe C (test/probe/tenant/) fetches "here.json"; a decoy with a
  // different value sits at the other tenants' base (test/probe/). Per-app
  // data bases (setAppDataBase) make the relative url mean "beside MY file".
  await page.waitForFunction(() => {
    const c = document.getElementById("slot-c").__declareApp;
    return c && c.data && c.data.loaded === true;
  }, { timeout: 15000 });
  const who = await page.evaluate(() => document.getElementById("slot-c").__declareApp.data.value.who);
  assert.equal(who, "tenant", "the tenant's own here.json answered — not the decoy at another base");
});

await test("onScreen: a bound view learns it scrolled out of the page's viewport", async () => {
  const a = () => page.evaluate(() => document.getElementById("slot-a").__declareApp.onScreen);
  assert.equal(await a(), true, "on screen at boot (the probe binds it, which arms the feed)");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(250);
  assert.equal(await a(), false, "scrolled away — the fact flipped, with no app-side geometry work");
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(250);
  assert.equal(await a(), true, "and back");
  // the sibling facts ride the same feed (IntersectionObserver-backed): at
  // rest, the fully-shown app root reports its whole box and the device scale
  const v = await page.evaluate(() => {
    const app = document.getElementById("slot-a").__declareApp;
    return { rect: app.visibleRect, scale: app.apparentScale, dpr: devicePixelRatio };
  });
  assert.equal(Math.round(v.rect.width), 320, `the whole box width (got ${JSON.stringify(v.rect)})`);
  assert.equal(v.scale, v.dpr, "apparentScale is device pixels per local unit");
});

await test("pageVisible reaches embedded apps and flips with the document", async () => {
  const before = await apps();
  assert.equal(before.a.visible, true, "visible at boot");
  assert.equal(before.b.visible, true, "in both tenants");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await sleep(80);
  const hidden = await apps();
  assert.equal(hidden.a.visible, false, "A saw the page hide");
  assert.equal(hidden.b.visible, false, "B saw the page hide");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await sleep(80);
  const back = await apps();
  assert.equal(back.a.visible && back.b.visible, true, "and return");
});

await test("a TOP-LEVEL page is idle too — the shim books no standing frames", async () => {
  const p2 = await browser.newPage();
  const c2 = await p2.createCDPSession();
  await c2.send("Network.setBypassServiceWorker", { bypass: true });
  await p2.goto(`${B}/test/probe/waypoint.declare`, { waitUntil: "networkidle0", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 600));
  const rafs = await p2.evaluate(async () => {
    let n = 0;
    const orig = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => { n++; return orig.call(window, cb); };
    await new Promise((r) => setTimeout(r, 1200));
    window.requestAnimationFrame = orig;
    return n;
  });
  assert.equal(rafs, 0, `expected 0 rAF on an idle top-level page, saw ${rafs}`);
  await p2.close();
});

await test("no page errors through the whole run", async () => {
  assert.deepEqual(errors, []);
});

await browser.close();
httpServer.close();
summarize("embed");
