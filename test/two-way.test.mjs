// The two-way embedding SHOWCASE, pinned end to end (apps/two-way/ — guide
// ch. 18 both directions on ONE page, in a real browser):
//
//   Scenario I — an HTML page hosts THREE Declare apps (multi-embed): a plain
//   write on one app's boot handle fans out through the page's imperative bus
//   (observe → writes) into the other apps, the page's own DOM, and a CSS var;
//   a click inside an app is observed back out into plain HTML.
//
//   Scenario II — one of those apps (crossings) hosts two FOREIGN JS tenants
//   in DOMIslands: provided values go down (hue), exposed values come up
//   (count, speed), one fact crosses tenant→host→tenant by constraint
//   (tally's count becomes orbit's dots), and verbs travel both ways (reset
//   down; milestone/burst up). A tenant has no way to write what the host
//   provides, and a mistyped exposed value answers the host's default,
//   loudly (console, never a throw).
//
// This is the corpus's standing proof that the whole embedder surface —
// boot({host}), observe (the declare-boot export), el.__declareApp,
// el.__declareIsland, provides/exposed/post — composes on one page.
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
await page.setViewport({ width: 1200, height: 2400 });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
const cdp = await page.createCDPSession();
await cdp.send("Network.setBypassServiceWorker", { bypass: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${B}/apps/two-way/index.html`, { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForFunction(() => {
  const cb = document.getElementById("cross-box");
  const t = cb?.querySelector('[data-declare-slot="tally"]');
  const o = cb?.querySelector('[data-declare-slot="orbit"]');
  return document.getElementById("dial-box").__declareApp
    && document.getElementById("pulse-box").__declareApp
    && cb.__declareApp && t && t.children.length > 0 && o && o.children.length > 0;
}, { timeout: 60000 });
await sleep(300);

await test("three apps and two foreign tenants mount on one page", async () => {
  assert.ok(true); // the waitForFunction above IS the pin — reaching here proves it
});

await test("scenario I: one write fans out — apps, page DOM, CSS, and a foreign tenant", async () => {
  await page.evaluate(() => { document.getElementById("dial-box").__declareApp.hue = 120; });
  await sleep(250);
  const s = await page.evaluate(() => {
    // browsers normalize hsl() → rgb(); compare through a probe element
    const asRgb = (bg) => { const d = document.createElement("div"); d.style.background = bg; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; };
    return {
      pulseHue: document.getElementById("pulse-box").__declareApp.hue,
      crossHue: document.getElementById("cross-box").__declareApp.masterHue,
      cssHue: getComputedStyle(document.documentElement).getPropertyValue("--hue").trim(),
      slider: document.getElementById("page-hue").value,
      tallyBtn: asRgb(document.getElementById("cross-box").querySelector('[data-declare-slot="tally"] button').style.background),
      want: asRgb("hsl(120 62% 45%)"),
    };
  });
  assert.equal(s.pulseHue, 120, "the sibling app followed through the page bus");
  assert.equal(s.crossHue, 120, "…and so did the scenario-II host");
  assert.equal(s.cssHue, "120", "…and the page's own CSS variable");
  assert.equal(s.slider, "120", "…and the page's range input");
  assert.equal(s.tallyBtn, s.want, "…and the write crossed INTO the foreign tenant");
});

await test("scenario I: a click inside an app is observed out into plain HTML", async () => {
  const r = await page.evaluate(() => {
    const b = document.getElementById("pulse-box").getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.click(r.x, r.y);
  await sleep(250);
  const s = await page.evaluate(() => ({
    app: document.getElementById("pulse-box").__declareApp.beats,
    html: document.getElementById("out-beats").textContent,
  }));
  assert.equal(s.app, 1, "the app counted its click");
  assert.equal(s.html, "1", "observe() carried it into the readout");
});

await test("scenario II: tenant facts flow up, and one crosses tenant→host→tenant", async () => {
  const btn = await page.$('#cross-box [data-declare-slot="tally"] button');
  for (let i = 0; i < 10; i++) await btn.click();
  await sleep(300);
  const s = await page.evaluate(() => {
    const app = document.getElementById("cross-box").__declareApp;
    const orbitH = document.getElementById("cross-box").querySelector('[data-declare-slot="orbit"]').__declareIsland;
    return { count: app.tally.exposed("count", 0), gauge: app.gaugeFill.width, text: app.derived.text, dots: orbitH.hostProvided("dots"), log: app.log };
  });
  assert.equal(s.count, 10, "the tenant's exposed count reads on the host");
  assert.ok(s.gauge > 0 && s.text.startsWith("10 taps"), "host constraints re-derived from it");
  assert.equal(s.dots, 10, "…and a host constraint provided it to the OTHER tenant");
  assert.ok(/milestone/.test(s.log), "the 10th tap's verb reached the island's onPost");
});

await test("scenario II: a native control's fact reaches a host constraint", async () => {
  await page.evaluate(() => {
    const range = document.getElementById("cross-box").querySelector('[data-declare-slot="orbit"] input[type=range]');
    range.value = "2.5";
    range.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(250);
  const s = await page.evaluate(() => ({
    speed: document.getElementById("cross-box").__declareApp.orbit.exposed("speed", 1),
    text: document.getElementById("cross-box").__declareApp.derived.text,
  }));
  assert.equal(s.speed, 2.5);
  assert.ok(s.text.includes("2.5"), "the caption constraint saw it");
});

await test("scenario II: the reset verb reaches both tenants, which push back", async () => {
  await page.evaluate(() => { document.getElementById("cross-box").__declareApp.reset.press(); });
  await sleep(300);
  const s = await page.evaluate(() => ({
    count: document.getElementById("cross-box").__declareApp.tally.exposed("count", 0),
    speed: document.getElementById("cross-box").__declareApp.orbit.exposed("speed", 1),
  }));
  assert.equal(s.count, 0, "tally applied the command and exposed the zero");
  assert.equal(s.speed, 1, "orbit did the same");
});

await test("direction: a tenant cannot write what the host provides", async () => {
  await page.evaluate(() => { document.getElementById("cross-box").__declareApp.masterHue = 300; });
  await sleep(150);
  const s = await page.evaluate(() => {
    const h = document.getElementById("cross-box").querySelector('[data-declare-slot="tally"]').__declareIsland;
    h.expose("hue", 0);           // an exposed value of the same name is a different value
    return { provided: h.hostProvided("hue"), host: document.getElementById("cross-box").__declareApp.tally.hue };
  });
  assert.equal(s.provided, 300, "the provided value stands");
  assert.equal(s.host, 300, "…and so does the host's own");
});

await test("type boundary: a mistyped exposed value answers the host's default, loudly", async () => {
  const warns = [];
  const onWarn = (m) => { if (m.type() === "warn" || m.type() === "warning") warns.push(m.text()); };
  page.on("console", onWarn);
  const read = await page.evaluate(async () => {
    const box = document.getElementById("cross-box");
    const h = box.querySelector('[data-declare-slot="tally"]').__declareIsland;
    h.expose("count", "twelve");
    await new Promise((r) => setTimeout(r, 100));
    const v = box.__declareApp.tally.exposed("count", 0);
    h.expose("count", 0);
    return v;
  });
  await sleep(100);
  page.off("console", onWarn);
  assert.equal(read, 0, "the host's default answers");
  assert.ok(warns.some((w) => /count/.test(w) && /string/.test(w)), `the mismatch speaks (got: )`);
});

await test("a tenant verb from real input: double-click on the canvas posts up", async () => {
  // the TENANT'S canvas — the demo's own reference, not a slot-scoped query
  // (which is exactly what test history teaches: query by role, not position)
  const r = await page.evaluate(() => {
    const c = document.getElementById("cross-box")
      .querySelector('[data-declare-slot="orbit"] input[type=range]')
      .closest("div").parentElement.querySelector("canvas").getBoundingClientRect();
    return { x: c.x + c.width / 2, y: c.y + c.height / 2 };
  });
  await page.mouse.click(r.x, r.y, { clickCount: 2 });
  await sleep(250);
  const log = await page.evaluate(() => document.getElementById("cross-box").__declareApp.log);
  assert.ok(/burst/.test(log), `the burst verb reached the host's log (got: ${log})`);
});

await test("no page errors", async () => {
  const unexpected = errors;
  assert.deepEqual(unexpected, []);
});

await browser.close();
httpServer.close();
summarize("two-way");
