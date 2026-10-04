// Virtualized lists — the fully built list is the virtualized one's oracle, on
// every host.
//
//   node test/conform/vlist.test.mjs                 DOM + canvas (headless Chrome)
//   node test/conform/vlist.test.mjs --webkit        + WebKit (PLAYWRIGHT_CORE=…/playwright-core/index.mjs)
//   node test/conform/vlist.test.mjs --mac           + the native host (DECLARE_CONTROL=1)
//   node test/conform/vlist.test.mjs --ios           + Safari on the iOS simulator (Appium at :4723, UDID=…):
//                                                    the phone set only (touch, turning, a keyboard's
//                                                    room, a chat's end) — slow, run when needed, never a gate
//   VLIST_ONLY="^table" node test/conform/vlist.test.mjs   scenarios whose name matches
//   VLIST_HOSTS=webkit node test/conform/vlist.test.mjs --webkit   only the named hosts (dom,canvas,webkit,mac,ios)
//
// The program is test/probe/vlist/vlist.declare: a chat log (Murmur's shape) and a
// table (Tracker's shape) over adversarial data, every record numbered. Each
// scenario runs twice on a host — virtualized, then fully built, over the same
// seeded data — and every checkpoint compares what is on screen: the same
// records, at the same places (1 px: a browser holds a scroll offset to whole
// pixels while a virtualized row may sit between them), with the same heights
// (½ px). The program
// answers its own questions (screen(), blank(), overlaps(), pinStep()), so the
// question is one string of code on every host; what differs between hosts is
// only how a step is taken. Text measures differently per renderer, so hosts
// are never compared with each other — each is held to its own full build.
//
// A checkpoint on the virtualized run also requires a covered viewport (no
// band wider than the list's spacing) and no overlapping rows. Flings are the
// platform's own fast gesture; where they stop is the platform's business, so
// after one only the invariants hold, and the comparison resumes after a pin.

import assert from "node:assert/strict";
import http from "node:http";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import { test, summarize } from "../harness.mjs";
import { createDeclareServer } from "../../server/create.mjs";
import { browserDriver, macDriver, macRequested, macLive, loadPlaywright, webkitRequested, playwrightDriver, iosRequested, iosDriver } from "./driver.mjs";
import { hostBinary } from "../../mac-host/app.mjs";
import { launchChrome } from "../../tools/internal/chrome.mjs";

const PROGRAM = "test/probe/vlist/";   // by its directory (the iOS driver needs the page and its source at different addresses)
const W = 1280, H = 800;
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const ONLY = process.env.VLIST_ONLY ?? "";
const HOSTS = (process.env.VLIST_HOSTS ?? "").split(",").filter(Boolean);
const wanted = (label) => HOSTS.length === 0 || HOSTS.includes(label);

// ── the scenarios ────────────────────────────────────────────────────────────
// Steps:  ["do", expr]  an action  · ["pin", recordExpr]  record at the viewport's top
//         ["wheel", dy]  a real wheel (a touch host scrolls by program instead)
//         ["flick", ±1]  the platform's fling · ["click", recordExpr] its row · ["key", k]
//         ["check", label]  rows on screen, compared · ["value", label, expr]  compared
//         ["inv", label]  the invariants alone · ["expect", label, expr]  must be true (virtualized run)
//         ["resize", w, h]  the viewport (a phone turns: wider than tall is landscape) · ["wait", s]
const LOG = { n: 2000 };
const SCENARIOS = [
  { name: "log · pinned records", phone: true, cfg: LOG, steps: [
    ...[0, 1999, 700, 1300, 37, 1950].flatMap((k) => [["pin", `app.record(${k})`], ["check", `#${k} at top`]]) ] },
  { name: "log · the ends", cfg: LOG, steps: [
    ["do", "app.toEnd(true)"], ["wait", 0.6], ["do", "app.toEnd(true)"], ["wait", 0.6], ["check", "at the bottom"],
    ["do", "app.toEnd(false)"], ["wait", 0.6], ["check", "at the top"] ] },
  { name: "log · wheel steps", cfg: LOG, steps: [
    ["pin", "app.record(900)"],
    ...[1, 2, 3, 4].flatMap((k) => [["wheel", 400], ["wheel", 400], ["check", `down ${k * 800}`]]),
    ...[1, 2, 3, 4].flatMap((k) => [["wheel", -400], ["wheel", -400], ["check", `back ${k * 800}`]]) ] },
  { name: "log · rows sprung open by app state", cfg: LOG, steps: [
    ["do", "app.openSome(60)"], ["wait", 1.2],
    ...[0, 1, 2].flatMap((k) => [["pin", `Number(Object.keys(app.opened).sort((a, b) => a - b)[${k * 20}])`], ["wait", 0.8], ["check", `open record ${k * 20}`]]),
    ["do", "app.closeAll()"], ["wait", 1.2], ["check", "all closed"] ] },
  { name: "log · a row opened in place keeps its state", cfg: LOG, steps: [
    ["pin", "app.record(800)"], ["value", "opened", "app.openLocal()"], ["wait", 0.6], ["check", "opened"],
    ["pin", "app.record(1800)"], ["check", "far away"],
    ["pin", "app.record(800)"], ["check", "back"] ] },
  { name: "log · a focused field survives its row leaving", cfg: LOG, steps: [
    ["do", "app.openSome(300)"], ["wait", 1.2],
    ["pin", "Number(Object.keys(app.opened).sort((a, b) => a - b)[100])"], ["wait", 0.8],
    ["value", "focused", "app.focusIn()"],
    ["pin", "app.record(1900)"], ["value", "still focused far away", "app.focusedRecord()"], ["check", "far away"],
    ["pin", "Number(Object.keys(app.opened).sort((a, b) => a - b)[100])"], ["wait", 0.8], ["value", "still focused back", "app.focusedRecord()"], ["check", "back"] ] },
  { name: "log · inserted above the reader", cfg: LOG, steps: [
    ["pin", "app.record(1000)"], ["do", "app.insertTop(50)"], ["wait", 0.8], ["check", "after +50 at the top"] ] },
  { name: "log · rows growing around the reader", cfg: LOG, steps: [
    ["pin", "app.record(1000)"], ["value", "grown", "app.grow(4)"], ["wait", 0.8], ["check", "after growth"] ] },
  { name: "log · rows removed", cfg: LOG, steps: [
    ["pin", "app.record(1000)"], ["do", "app.removeSome(40)"], ["wait", 0.8], ["check", "after −40"] ] },
  { name: "log · the data replaced while scrolled far", cfg: LOG, steps: [
    ["pin", "app.record(1900)"], ["do", "app.reset()"], ["wait", 1.0], ["inv", "replaced"], ["pin", "app.record(1900)"], ["check", "#1900 again"],
    ["pin", "app.record(600)"], ["do", "app.reset()"], ["wait", 1.0], ["pin", "app.record(600)"], ["check", "#600 again"] ] },
  { name: "log · filtered and reversed", cfg: LOG, steps: [
    ["do", "app.onlyAuthor('Ada')"], ["wait", 0.8], ["do", "app.toEnd(false)"], ["wait", 0.6], ["check", "filtered, top"],
    ["pin", "app.record(200)"], ["check", "filtered, #200"],
    ["do", "app.reverse()"], ["wait", 0.8], ["do", "app.toEnd(false)"], ["wait", 0.6], ["check", "reversed, top"] ] },
  { name: "log · reflowed narrower and back", cfg: LOG, steps: [
    ["pin", "app.record(1000)"], ["do", "app.colW = 420"], ["wait", 1.0], ["pin", "app.record(1000)"], ["check", "narrow"],
    ["do", "app.colW = 760"], ["wait", 1.0], ["pin", "app.record(1000)"], ["check", "wide again"] ] },
  { name: "chat · opens at the end, sends, switches threads", phone: true, cfg: { n: 2000, end: true, threads: 2 }, steps: [
    ["wait", 0.8], ["check", "opened at the end"],
    ["do", "app.append(3)"], ["wait", 0.8], ["check", "three arrive at the end"],
    ["do", "app.typing = true"], ["wait", 0.6], ["check", "writing… after the rows"],
    ["do", "app.typing = false"], ["pin", "app.record(1200)"], ["do", "app.append(2)"], ["wait", 0.8], ["check", "arrivals while reading back"],
    ["do", "app.send()"], ["wait", 1.0], ["check", "sent: at the end"],
    ["do", "app.switchThread()"], ["wait", 1.0], ["check", "the other thread, at its end"],
    ["do", "app.switchThread()"], ["wait", 1.0], ["check", "back to the first"] ] },
  { name: "log · flings", phone: true, cfg: LOG, needs: "flick", steps: [
    ["pin", "app.record(300)"], ["flick", 1], ["wait", 1.5], ["inv", "after a fling down"], ["flick", 1], ["wait", 1.5], ["inv", "after another"],
    ["flick", -1], ["wait", 1.5], ["inv", "after a fling up"], ["pin", "app.record(1000)"], ["check", "pinned after flinging"] ] },
  { name: "table · pinned records and the ends", cfg: { n: 2000, table: true }, steps: [
    ...[0, 1999, 700, 1300].flatMap((k) => [["pin", `app.record(${k})`], ["check", `#${k} at top`]]),
    ["do", "app.toEnd(true)"], ["wait", 0.6], ["do", "app.toEnd(true)"], ["wait", 0.6], ["check", "at the bottom"],
    ["do", "app.toEnd(false)"], ["wait", 0.6], ["check", "at the top"] ] },
  { name: "table · wheel steps", cfg: { n: 2000, table: true }, steps: [
    ["pin", "app.record(900)"],
    ...[1, 2, 3].flatMap((k) => [["wheel", 400], ["wheel", 400], ["check", `down ${k * 800}`]]),
    ...[1, 2, 3].flatMap((k) => [["wheel", -400], ["wheel", -400], ["check", `back ${k * 800}`]]) ] },
  { name: "table · many rows open", cfg: { n: 2000, table: true }, steps: [
    ["do", "app.openSome(200)"], ["wait", 1.2],
    ...[0, 1, 2].flatMap((k) => [["pin", `Number(Object.keys(app.opened).sort((a, b) => a - b)[${k * 60}])`], ["wait", 0.8], ["check", `open record ${k * 60}`]]),
    ["do", "app.toEnd(true)"], ["wait", 0.8], ["do", "app.toEnd(true)"], ["wait", 0.8], ["check", "at the bottom, many open"] ] },
  { name: "table · the keyboard walks the rows", cfg: { n: 2000, table: true }, needs: "keys", steps: [
    ["pin", "app.record(500)"], ["click", "app.record(502)"], ["wait", 0.3],
    ...Array.from({ length: 24 }, () => ["key", "ArrowDown"]), ["wait", 0.8], ["check", "24 rows down"],
    ["key", "End"], ["wait", 1.2], ["check", "End"], ["key", "Home"], ["wait", 1.2], ["check", "Home"] ] },
  { name: "table · flings", phone: true, cfg: { n: 2000, table: true }, needs: "flick", steps: [
    ["pin", "app.record(300)"], ["flick", 1], ["wait", 1.5], ["inv", "after a fling down"], ["flick", -1], ["wait", 1.5], ["inv", "after a fling up"],
    ["pin", "app.record(1000)"], ["check", "pinned after flinging"] ] },
  // the list changing height: its own container (a keyboard, a pane resized)
  // and the window itself (resized, a device turned) — mid-list, at the ends,
  // reading back in a chat, with many rows open, and straight after a fling
  { name: "log · the list's own height changes", cfg: LOG, steps: [
    ["pin", "app.record(1000)"], ["do", "app.cut = 500"], ["wait", 0.8], ["check", "shrunk mid-list"],
    ["do", "app.cut = 0"], ["wait", 0.8], ["check", "grown back"],
    ["do", "app.toEnd(true)"], ["wait", 0.6], ["do", "app.toEnd(true)"], ["wait", 0.6], ["do", "app.cut = 500"], ["wait", 0.8], ["check", "shrunk at the bottom"],
    ["do", "app.cut = 0"], ["wait", 0.8], ["check", "grown back at the bottom"],
    ["do", "app.toEnd(false)"], ["wait", 0.6], ["do", "app.cut = 500"], ["wait", 0.8], ["check", "shrunk at the top"],
    ["do", "app.cut = 0"], ["wait", 0.8], ["check", "grown back at the top"] ] },
  { name: "chat · the bottom shrinks like a keyboard", phone: true, cfg: { n: 2000, end: true, threads: 2 }, steps: [
    ["wait", 0.8], ["do", "app.cut = 330"], ["wait", 0.8], ["check", "keyboard up at the end"],
    ["do", "app.send()"], ["wait", 1.0], ["check", "sent with the keyboard up"],
    ["do", "app.cut = 0"], ["wait", 0.8], ["check", "keyboard down"],
    ["pin", "app.record(1200)"], ["do", "app.cut = 330"], ["wait", 0.8], ["check", "keyboard up, reading back"],
    ["do", "app.cut = 0"], ["wait", 0.8], ["check", "keyboard down, reading back"] ] },
  { name: "table · height changes with many rows open", cfg: { n: 2000, table: true }, steps: [
    ["do", "app.openSome(200)"], ["wait", 1.2], ["pin", "Number(Object.keys(app.opened).sort((a, b) => a - b)[60])"], ["wait", 0.8],
    ["do", "app.cut = 500"], ["wait", 0.8], ["check", "shrunk"], ["do", "app.cut = 0"], ["wait", 0.8], ["check", "grown back"],
    ["do", "app.toEnd(true)"], ["wait", 0.8], ["do", "app.toEnd(true)"], ["wait", 0.8], ["do", "app.cut = 500"], ["wait", 0.8], ["check", "shrunk at the bottom"],
    ["do", "app.cut = 0"], ["wait", 0.8], ["check", "grown back at the bottom"] ] },
  { name: "log · the window turns", phone: true, cfg: LOG, steps: [
    ["pin", "app.record(1000)"], ["resize", 760, 1000], ["wait", 1.0], ["check", "portrait, mid-list"], ["resize", 1280, 800], ["wait", 1.0], ["check", "landscape, mid-list"],
    ["do", "app.toEnd(true)"], ["wait", 0.6], ["do", "app.toEnd(true)"], ["wait", 0.6],
    ["resize", 760, 1000], ["wait", 1.0], ["check", "portrait, at the bottom"], ["resize", 1280, 800], ["wait", 1.0], ["check", "landscape, at the bottom"] ] },
  { name: "chat · the window turns at the end", phone: true, cfg: { n: 2000, end: true, threads: 2 }, steps: [
    ["wait", 0.8], ["resize", 760, 1000], ["wait", 1.0], ["check", "portrait, at the end"], ["resize", 1280, 800], ["wait", 1.0], ["check", "landscape, at the end"] ] },
  { name: "log · resized straight after a fling", phone: true, cfg: LOG, needs: "flick", steps: [
    ["pin", "app.record(300)"], ["flick", 1], ["do", "app.cut = 400"], ["wait", 1.5], ["inv", "shrunk as a fling ends"],
    ["do", "app.cut = 0"], ["flick", -1], ["do", "app.cut = 400"], ["wait", 1.5], ["inv", "shrunk as a fling back ends"],
    ["do", "app.cut = 0"], ["wait", 0.8], ["pin", "app.record(1000)"], ["check", "pinned after"] ] },
  { name: "table · 1M rows, height changes (virtualized only)", cfg: { n: 1000000, table: true }, virtOnly: true, steps: [
    ["pin", "app.record(500000)"], ["do", "app.cut = 500"], ["wait", 0.8], ["inv", "shrunk"],
    ["expect", "the reader is still on screen", "app.screen().some((r) => r.i == app.record(500000))"],
    ["do", "app.cut = 0"], ["wait", 0.8], ["inv", "grown back"],
    ["do", "app.toEnd(true)"], ["wait", 0.8], ["do", "app.toEnd(true)"], ["wait", 0.8],
    ["expect", "the bottom is exact", "(s => s[s.length - 1].i == app.record(app.count() - 1) && Math.abs(s[s.length - 1].top + s[s.length - 1].h - app.scroller().height) < 1)(app.screen())"],
    // a pane kept by its content keeps its top as it shrinks: the rows on screen stay put
    ["expect", "noted", "(globalThis.__vlTop = app.screen()[0], true)"],
    ["do", "app.cut = 500"], ["wait", 0.8],
    ["expect", "shrunk at the bottom, the rows on screen stay put", "(r => r !== undefined && Math.abs(r.top - globalThis.__vlTop.top) < 1)(app.screen().find((x) => x.i == globalThis.__vlTop.i))"],
    ["do", "app.cut = 0"], ["wait", 0.8],
    ["expect", "the bottom is exact, grown back", "(s => s[s.length - 1].i == app.record(app.count() - 1) && Math.abs(s[s.length - 1].top + s[s.length - 1].h - app.scroller().height) < 1)(app.screen())"] ] },
  // the virtualized list alone: a full build of these is the thing virtualizing avoids
  { name: "table · 1M rows (virtualized only)", cfg: { n: 1000000, table: true }, virtOnly: true, steps: [
    ["expect", "the top is exact", "app.screen()[0].i == app.record(0) && Math.abs(app.screen()[0].top) < 0.5"],
    ["do", "app.toEnd(true)"], ["wait", 0.8], ["do", "app.toEnd(true)"], ["wait", 0.8],
    ["expect", "the bottom is exact", "(s => s[s.length - 1].i == app.record(app.count() - 1) && Math.abs(s[s.length - 1].top + s[s.length - 1].h - app.scroller().height) < 1)(app.screen())"],
    ...[500000, 123456, 999000].flatMap((k) => [["pin", `app.record(${k})`], ["inv", `#${k}`]]) ] },
];

// ── hosts ────────────────────────────────────────────────────────────────────
const MAC = macRequested(), WEBKIT = webkitRequested(), IOS = iosRequested();
const declare = createDeclareServer({});
const server = http.createServer(declare.handler);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const URL_ = `${ORIGIN}/${PROGRAM}`;

const findChrome = () => [process.env.PUPPETEER_EXECUTABLE_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find((c) => existsSync(c));
const chrome = await launchChrome({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"], defaultViewport: { width: W, height: H }, protocolTimeout: 300000 });
const closers = [() => chrome.close()];

async function browserHost(render) {
  const page = await chrome.newPage();
  page.on("pageerror", (e) => errors.push(`${render}: ${e.message.slice(0, 160)}`));
  await page.goto(`${URL_}?render=${render}`, { waitUntil: "load", timeout: 60000 });
  return browserDriver(page, render);
}
const errors = [];
const hosts = [];
for (const r of ["dom", "canvas"]) if (wanted(r)) hosts.push(() => browserHost(r));
if (WEBKIT && wanted("webkit")) {
  const pw = await loadPlaywright();
  if (pw === null) { console.error("vlist: --webkit asked for, but no playwright-core (set PLAYWRIGHT_CORE to its index.mjs)"); process.exit(2); }
  const wk = await pw.webkit.launch({ headless: true });
  closers.push(() => wk.close());
  hosts.push(async () => {
    const page = await wk.newPage({ viewport: { width: W, height: H } });
    page.on("pageerror", (e) => errors.push(`webkit: ${e.message.slice(0, 160)}`));
    await page.goto(URL_, { waitUntil: "load", timeout: 60000 });
    return playwrightDriver(page, "webkit");
  });
}
let ownHost = null;
if (MAC && wanted("mac")) {
  if (!macLive() && hostBinary() !== null) {
    ownHost = spawn(hostBinary(), [], { detached: true, stdio: "ignore", env: { ...process.env, DECLARE_CONTROL: "1", DECLARE_APPEARANCE: "light" } });
    for (let i = 0; i < 150 && !macLive(); i++) await sleep(0.1);
  }
  if (!macLive()) { console.error("vlist: --mac asked for, but no native host is running (DECLARE_CONTROL=1)"); process.exit(2); }
  hosts.push(async () => { const m = macDriver(); await m.open(URL_); return m; });
}
if (IOS && wanted("ios")) hosts.push(async () => { const d = await iosDriver(); closers.push(() => d.close()); await d.open(URL_); return d; });

// ── running a scenario ───────────────────────────────────────────────────────
const askApp = (h, expr) => h.ask(`((app) => (${expr}))(__declare.find("app"))`);
const LIST_X = 640, LIST_Y = 420;   // the list's middle, in model coordinates (below the 40 px bar)

async function ready(h) {
  for (let i = 0; i < 120; i++) {
    try { if (await askApp(h, "app.screen().length > 0")) return; } catch {}
    await sleep(0.25);
  }
  throw new Error("the list never showed rows");
}

// A pin runs INSIDE the page — one question starts it, a few cheap polls
// collect it — rather than a round trip per step (on a phone a question costs
// a second or two). The steps are the program's own pinStep, unchanged.
async function pin(h, k, tol = 1) {
  await askApp(h, `(() => {
    const st = globalThis.__vlPin = { state: "running", last: "", steps: 0 };
    app.pinStart();
    let done = 0;
    const step = () => {
      const s = app.pinStep(${k}, ${tol});
      st.last = s; st.steps++;
      if (s === "done") { if (++done >= 2) { st.state = "done"; return; } }
      else done = 0;
      if (s === "gone" || s === "empty" || st.steps >= 80) { st.state = "failed"; return; }
      setTimeout(step, s === "done" || s === "adjust" ? 250 : 350);
    };
    step();
    return true;
  })()`);
  for (let i = 0; i < 120; i++) {
    const st = await h.ask("globalThis.__vlPin");
    if (st.state === "done") return;
    if (st.state === "failed") throw new Error(`could not pin record ${k} (last step: ${st.last}, ${st.steps} steps)`);
    await sleep(0.4);
  }
  throw new Error(`pinning record ${k} never finished`);
}

// A phone compares against a smaller list: the fully built oracle of 2,000
// rows stalls Safari on the simulator for a minute after a long jump (its
// main thread), and the comparison holds at any size. Record numbers in the
// steps scale with it.
const PHONE_ROWS = 300;
function forHost(h, sc) {
  if (!h.touch || sc.virtOnly || sc.cfg.n === undefined || sc.cfg.n <= PHONE_ROWS) return sc;
  const f = PHONE_ROWS / sc.cfg.n;
  const scale = (x) => typeof x === "string" ? x.replace(/app\.record\((\d+)\)/g, (_, k) => `app.record(${Math.min(PHONE_ROWS - 1, Math.round(Number(k) * f))})`) : x;
  return { ...sc, cfg: { ...sc.cfg, n: PHONE_ROWS }, steps: sc.steps.map((st) => st.map(scale)) };
}

async function run(h, sc0, virt) {
  const sc = forHost(h, sc0);
  const out = [];
  // every run starts at the host's own size (a phone upright) — a step only when it is not there
  const home = h.touch ? [400, 800] : [W, H];
  if (h.size === undefined || h.size[0] !== home[0] || h.size[1] !== home[1]) { await h.drive(["resize", ...home]); h.size = home; }
  await askApp(h, `app.configure(${JSON.stringify({ ...sc.cfg, virt })})`);
  await sleep(0.8);
  await ready(h);
  // each run starts where a fresh one would: at its top, or a chat at its end
  await askApp(h, `app.toEnd(${sc.cfg.end === true})`);
  await sleep(0.6);
  // a checkpoint is one question (look): it waits for the pictures on screen
  // (they arrive when they arrive), then holds the invariants on the
  // virtualized run and hands back the rows
  const look = async (label) => {
    let v = await askApp(h, "app.look()");
    for (let i = 0; i < 40 && v.pending > 0; i++) { await sleep(0.25); v = await askApp(h, "app.look()"); }
    if (virt && (v.blank > 0 || v.overlaps > 0)) throw new Error(`${label}: ${v.blank > 0 ? `a ${v.blank} px band of the viewport is blank` : ""}${v.blank > 0 && v.overlaps > 0 ? ", " : ""}${v.overlaps > 0 ? `${v.overlaps} rows overlap` : ""}`);
    return v.rows;
  };
  for (const step of sc.steps) {
    const [verb, a, b] = step;
    if (verb === "wait") await sleep(a);
    else if (verb === "do") await askApp(h, a);
    else if (verb === "pin") await pin(h, await askApp(h, a), sc.virtOnly ? 3 : 1);
    else if (verb === "wheel") {
      if (h.touch) await askApp(h, `app.scroller().scrollTo(app.scroller().scrollY + ${a})`);
      else await h.drive(["scroll", LIST_X, LIST_Y, a]);
      await sleep(0.5);
    } else if (verb === "flick") await h.drive(["flick", LIST_X, LIST_Y, a]);
    else if (verb === "resize") { await h.drive(["resize", a, b]); h.size = [a, b]; }
    else if (verb === "click") {
      const k = await askApp(h, a), s = await askApp(h, "app.screen()"), r = s.find((x) => x.i === k);
      if (r === undefined) throw new Error(`record ${k} is not on screen to click`);
      await h.drive(["click", 200, 40 + r.top + Math.min(20, r.h / 2)]);
    } else if (verb === "key") await h.drive(["key", a]);
    else if (verb === "check") out.push({ label: a, rows: await look(a) });
    else if (verb === "value") out.push({ label: a, value: await askApp(h, b) });
    else if (verb === "inv") await look(a);
    else if (verb === "expect") { if (virt && (await askApp(h, b)) !== true) throw new Error(`${a}: not so — ${JSON.stringify(await askApp(h, "app.screen().slice(0, 2)"))} · ${JSON.stringify(await askApp(h, "app.at()"))}`); }
    else throw new Error(`unknown step ${verb}`);
  }
  return out;
}

function compareRuns(v, f) {
  const bad = [];
  for (let k = 0; k < v.length; k++) {
    const a = v[k], b = f[k];
    if ("value" in a) { if (JSON.stringify(a.value) !== JSON.stringify(b.value)) bad.push(`${a.label}: ${JSON.stringify(a.value)} vs ${JSON.stringify(b.value)}`); continue; }
    const mb = new Map(b.rows.map((x) => [x.i, x])), diffs = [];
    if (a.rows.length !== b.rows.length) diffs.push(`${a.rows.length} rows on screen vs ${b.rows.length}`);
    for (const x of a.rows) {
      const y = mb.get(x.i);
      if (y === undefined) { diffs.push(`#${x.i} only virtualized (at ${x.top})`); continue; }
      if (Math.abs(x.top - y.top) > 1) diffs.push(`#${x.i} at ${x.top} vs ${y.top}`);
      if (Math.abs(x.h - y.h) > 0.5) diffs.push(`#${x.i} height ${x.h} vs ${y.h}`);
    }
    for (const y of b.rows) if (!a.rows.some((x) => x.i === y.i)) diffs.push(`#${y.i} missing (full at ${y.top})`);
    if (diffs.length) bad.push(`${a.label}: ${diffs.slice(0, 4).join("; ")}`);
  }
  return bad;
}

try {
for (const make of hosts) {
  let h;
  try { h = await make(); await h.focus?.(); await ready(h); }
  catch (e) { await test(`${h?.label ?? "a host"} · opens the program`, () => { throw e; }); continue; }
  for (const sc of SCENARIOS) {
    if (ONLY && !new RegExp(ONLY).test(sc.name)) continue;
    if (!ONLY && h.touch && sc.phone !== true) continue;   // a phone runs the phone set
    if (sc.needs === "keys" && h.touch) { console.log(`  · ${h.label} · ${sc.name}: no keyboard on this host`); continue; }
    await test(`${h.label} · ${sc.name}`, async () => {
      await h.focus?.();
      const v = await run(h, sc, true);
      if (sc.virtOnly) return;
      const f = await run(h, sc, false);
      const bad = compareRuns(v, f);
      assert.equal(bad.length, 0, `virtualized ≠ full build:\n      ${bad.join("\n      ")}`);
    });
  }
  if (h.label !== "mac" && h.page) await h.page.close().catch(() => {});
}

if (errors.length) await test("no page errors", () => { assert.deepEqual([...new Set(errors)].slice(0, 5), []); });
} finally {
  for (const c of closers) await c().catch(() => {});
  if (ownHost) try { process.kill(ownHost.pid); } catch {}
  server.close();
}
summarize("vlist");
process.exit(process.exitCode ?? 0);
