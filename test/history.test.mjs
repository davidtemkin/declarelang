// test/history.test.mjs — the ENTRY PAIR (location + waypoint), driven through
// a REAL browser against the REAL host path (bootHost's mirror), because the
// contract under test IS the browser's history: what the URL shows, what an
// entry carries, what Back restores, what a reload resumes, and what a pasted
// URL deliberately does not carry.
//
// The pins, one per clause of the App.waypoint contract:
//   - a waypoint write mints an entry and the URL DOES NOT MOVE;
//   - Back/Forward restore the step; a pair written in one settle is ONE entry,
//     restored atomically;
//   - a RELOAD is an arrival: the address comes back from the URL and the step
//     does NOT — a coordinate is restored by traversal, never by arrival;
//   - a fresh page at the same URL starts at the declared initial (a URL
//     carries no waypoint — the stranger test, enforced by construction);
//   - `follow(ref, true)` (the replace verb) overwrites the pair, no entry;
//   - a traversal lands at the departed entry's scroll (the per-entry stamp),
//     and a reload does not — the same rule, applied to the other coordinate.

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
const URL0 = `${B}/test/probe/waypoint.declare`;

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 600, height: 500 });
page.on("pageerror", (e) => console.error("PAGEERROR:", String(e).slice(0, 200)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** One settle + one mirror tick (the mirror runs on rAF). */
const tick = () => sleep(150);
const state = () =>
  page.evaluate(() => ({
    loc: window.__app.location,
    wp: window.__app.waypoint,
    hash: location.hash,
    entryW: history.state?.declare?.w ?? null,
  }));
const back = async () => { await page.evaluate(() => history.back()); await tick(); };
const fwd = async () => { await page.evaluate(() => history.forward()); await tick(); };

try {
  await page.goto(URL0, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(() => !!window.__app, { timeout: 30000 });
  await tick();

  await test("a waypoint write mints an entry and the URL does not move", async () => {
    await page.evaluate(() => { window.__app.waypoint = "turn1"; });
    await tick();
    const s = await state();
    assert.equal(s.hash, "", "the URL bar never shows a step");
    assert.equal(s.entryW, "turn1", "the entry's state object carries it");
    await back();
    assert.equal((await state()).wp, "", "Back undoes the step");
    await fwd();
    assert.equal((await state()).wp, "turn1", "Forward redoes it");
  });

  await test("a pair written in one settle is ONE entry, restored atomically", async () => {
    await page.evaluate(() => { window.__app.waypoint = "turn2"; window.__app.location = "results"; });
    await tick();
    let s = await state();
    assert.equal(s.hash, "#results");
    assert.equal(s.entryW, "turn2");
    await back();                                     // ONE step back restores BOTH halves
    s = await state();
    assert.equal(s.loc, "", "the address came back with one Back");
    assert.equal(s.wp, "turn1", "…and the step came back with the same press");
    await fwd();
    s = await state();
    assert.equal(s.loc, "results");
    assert.equal(s.wp, "turn2");
  });

  await test("a reload is an arrival — the address returns, the step does not", async () => {
    await page.reload({ waitUntil: "networkidle2" });
    await page.waitForFunction(() => !!window.__app, { timeout: 30000 });
    await tick();
    let s = await state();
    assert.equal(s.loc, "results", "the address rebuilds from the URL");
    assert.equal(s.wp, "", "the step starts at the declared initial — a coordinate is not storage");
    assert.equal(s.entryW, "", "the arrived-on entry was squared to the app, not left stale");
    // Only the entry arrived on is rebuilt. The route BEHIND it keeps its own
    // coordinates, which is why Back still walks into the session the reload
    // started fresh from — a coordinate sits on its entry.
    await back();
    assert.equal((await state()).wp, "turn1", "Back still reaches the step on the previous entry");
    await fwd();
    s = await state();
    assert.equal(s.loc, "results", "Forward returns to the rebuilt entry");
    assert.equal(s.wp, "", "…still at the declared initial step");
  });

  await test("a fresh page at the same URL starts at the declared initial step", async () => {
    // the stranger test enforced by construction: the URL is all a recipient
    // gets, and the URL carries no waypoint
    const p2 = await browser.newPage();
    await p2.goto(`${URL0}#results`, { waitUntil: "networkidle2", timeout: 60000 });
    await p2.waitForFunction(() => !!window.__app, { timeout: 30000 });
    await sleep(150);
    const s = await p2.evaluate(() => ({ loc: window.__app.location, wp: window.__app.waypoint }));
    assert.equal(s.loc, "results", "the place travels");
    assert.equal(s.wp, "", "the session does not");
    await p2.close();
  });

  await test("the replace verb overwrites the pair without minting an entry", async () => {
    await page.evaluate(() => { window.__app.waypoint = "turn3"; window.__app.follow("#results/2", true); });
    await tick();
    let s = await state();
    assert.equal(s.hash, "#results/2");
    assert.equal(s.entryW, "turn3");
    await back();                                     // ONE Back skips the replaced state entirely
    s = await state();
    assert.equal(s.loc, "", "replace buried nothing — Back lands beneath the overwritten entry");
    assert.equal(s.wp, "turn1");
    await fwd();
    s = await state();
    assert.equal(s.loc, "results/2");
    assert.equal(s.wp, "turn3");
  });

  await test("a traversal lands at the departed entry's scroll", async () => {
    await page.evaluate(() => scrollTo(0, 900));
    await sleep(100);
    await page.evaluate(() => { window.__app.location = "elsewhere"; });   // departure stamps the scroll
    await tick();
    await page.evaluate(() => scrollTo(0, 0));
    await sleep(100);
    await back();
    await sleep(250);                                  // restore waits two frames past the settle
    const y = await page.evaluate(() => scrollY);
    assert.ok(Math.abs(y - 900) <= 2, `Back returned to the departed scroll (got ${y})`);
  });

  await test("a reload lands at the top, even on an entry carrying a scroll stamp", async () => {
    // We are standing on the entry the traversal above restored: it holds that
    // entry's departure stamp and the page sits at it. The scroll is the other
    // coordinate, and it follows the same rule — traversal restores it, an
    // arrival does not, because the top is what the URL says.
    const stamped = await page.evaluate(() => history.state?.declare?.s);
    assert.ok(stamped > 0, `precondition: the entry carries its stamp (got ${stamped})`);
    await page.reload({ waitUntil: "networkidle2" });
    await page.waitForFunction(() => !!window.__app, { timeout: 30000 });
    await sleep(400);                                  // past the restore's two-frame window
    const y = await page.evaluate(() => scrollY);
    assert.equal(Math.round(y), 0, `the arrival landed at the top (got ${y})`);
  });
} finally {
  await browser.close();
  httpServer.close();
}

process.exit(summarize("history"));
