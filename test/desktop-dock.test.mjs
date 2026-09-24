// test/desktop-dock.test.mjs — a minimized window and its dock tile agree.
//
// A parked window finds its place in the dock from its record's index among
// the parked records (desktop.declare, Window.dockSlot). Its tile is
// replicated over the same records. So the two must always agree: every
// parked record's window holds that record's slot, no free window holds one,
// and every tile whose window has finished parking shows its app badge (the
// badge's own test is that the window's visual width equals the tile's slot).
// When the slot was written imperatively after a list move, the lookup read
// stale ids: a window could park at the fallback slot, x 0 at the screen's
// left edge, and the tiles after it lost their badges.
//
// Driven in a real browser through the window manager's own verbs, after a
// fixed set of sequences and a seeded random walk.

import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { test, summarize } from "./harness.mjs";
import { createDeclareServer } from "../server/create.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
console.log("desktop-dock");

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
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function fresh() {
  const page = await browser.newPage();
  await page.goto(B + "/apps/desktop/", { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(() => globalThis.__app?.wm != null, { timeout: 30000 });
  await wait(1500);
  return page;
}

/** One action through the window manager's verbs; returns what it did. */
const act = (page, kind, arg) => page.evaluate((kind, arg) => {
  const A = globalThis.__app, wm = A.wm, L = A.launcher;
  const wins = A.wins.childViews.map((s) => s.win).filter((w) => w && !w.plain);
  const free = wins.filter((w) => !wm.isMin(w));
  if (kind === "open") { L.roster.find((a) => a.id === arg).launch(null); return "open " + arg; }
  if (kind === "minimize" && free.length) { const w = free[arg % free.length]; wm.minimizeWin(w); return "minimize " + w.recId; }
  if (kind === "restore" && wm.miniList().length) { const i = arg % wm.miniList().length; wm.restoreMiniAt(i); return "restore tile " + i; }
  if (kind === "close" && wins.length) { const w = wins[arg % wins.length]; wm.closeWin(w); return "close " + w.recId; }
  return "noop";
}, kind, arg);

/** The agreement, once the journeys have finished. */
const disagreements = (page) => page.evaluate(() => {
  const A = globalThis.__app, wm = A.wm, bad = [];
  const ms = wm.minis();
  ms.forEach((r, i) => {
    const w = wm.winOf("" + r.id);
    if (w == null) { bad.push(`parked record ${r.id} has no window`); return; }
    if (w.dockSlot !== i) bad.push(`record ${r.id} is tile ${i}, its window holds slot ${w.dockSlot}`);
    if (w.miniT > 0.99 && w.x < A.dock.x) bad.push(`window ${r.id} parked left of the dock (x ${Math.round(w.x)})`);
  });
  for (const s of A.wins.childViews) { const w = s.win; if (w && w.dockSlot >= 0 && !ms.some((r) => r.id == w.recId)) bad.push(`free window ${w.recId} holds slot ${w.dockSlot}`); }
  const tiles = [];
  const walk = (v) => { if (v.constructor?.name === "MiniTile") tiles.push(v); for (const c of v.childViews ?? []) walk(c); };
  walk(A.dock);
  for (const t of tiles) {
    const w = wm.winOf(t.recId);
    if (w && !w.homing && w.miniT > 0.99 && !t.seated) bad.push(`tile ${t.ix} (${t.recId}) shows no badge`);
  }
  return bad;
});

await test("minimizing a window that is not the last one parks it in its own slot", async () => {
  const page = await fresh();
  await act(page, "open", "jots");
  await wait(900);
  await act(page, "minimize", 0);   // the first window: its record moves, the case that broke
  await wait(900);
  assert.deepEqual(await disagreements(page), []);
  await page.close();
});

await test("three windows minimized in the same turn park in order, each with its badge", async () => {
  const page = await fresh();
  for (const id of ["calendar", "birds", "jots"]) { await act(page, "open", id); await wait(700); }
  await page.evaluate(() => {
    const A = globalThis.__app;
    for (const w of A.wins.childViews.map((s) => s.win).filter((w) => w && !w.plain)) A.wm.minimizeWin(w);
  });
  await wait(1200);
  assert.deepEqual(await disagreements(page), []);
  // …and they hold under the dock's magnification, the pointer at rest over the right end
  const lay = await page.evaluate(() => globalThis.__app.dock.miniLayout.map((e) => e.cx));
  await page.mouse.move(Math.round(lay[lay.length - 1]), 900 - 50);
  await wait(800);
  assert.deepEqual(await disagreements(page), [], "magnified");
  await page.close();
});

await test("restoring and closing parked windows keeps the rest in their slots", async () => {
  const page = await fresh();
  for (const id of ["calendar", "birds", "jots", "markdown"]) { await act(page, "open", id); await wait(600); }
  for (let i = 0; i < 4; i++) { await act(page, "minimize", 0); await wait(400); }
  await wait(600);
  await act(page, "restore", 1); await wait(900);
  assert.deepEqual(await disagreements(page), [], "after a restore from the middle");
  await page.evaluate(() => { const wm = globalThis.__app.wm; wm.closeWin(wm.miniList()[0]); });
  await wait(900);
  assert.deepEqual(await disagreements(page), [], "after closing a parked window");
  await page.close();
});

await test("a seeded random walk of open, minimize, restore, and close never disagrees", async () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const ids = ["calendar", "birds", "declareviewer", "jots", "markdown"];
  for (let trial = 0; trial < 3; trial++) {
    const page = await fresh();
    const steps = [];
    for (let s = 0; s < 14; s++) {
      const r = rnd(), n = Math.floor(rnd() * 100);
      const kind = r < 0.25 ? "open" : r < 0.6 ? "minimize" : r < 0.85 ? "restore" : "close";
      steps.push(await act(page, kind, kind === "open" ? ids[n % ids.length] : n));
      await wait([0, 60, 300][Math.floor(rnd() * 3)]);
      await wait(700);
      const bad = await disagreements(page);
      assert.deepEqual(bad, [], `trial ${trial} after: ${steps.join(", ")}`);
    }
    await page.close();
  }
});

await browser.close();
httpServer.close();
summarize("desktop-dock");
