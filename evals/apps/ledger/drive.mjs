#!/usr/bin/env node
// drive.mjs — the hidden acceptance for Ledger. It scores an app built from brief.md against
// the data service (api/server.mjs, API in api/API.md), and knows nothing about how the app is
// built: it finds things in the browser's own accessibility tree by role and a loose name, acts
// with a real pointer and keyboard, and judges by what the SERVICE stored or computes and by the
// words the brief fixes (§11: "Revenue", "Expenses", "Net profit", "Gross margin",
// "Uncategorised", "Split", "All caught up.", "Remaining to allocate", and the summary line
// "N transactions · In $… · Out $… · Net $…").
//
//   node evals/apps/ledger/drive.mjs <app-url> [--service-port=8370] [--today=YYYY-MM-DD]
//        [--only=a,b] [--out=dir] [--headful]
//
// The service keeps its books in memory and has no reset, so before EACH scenario this starts
// a fresh `node api/server.mjs --port=<p>` of its own, waits until it listens, and stops that
// child (by its own pid) afterwards. If anything else already listens on the port it refuses to
// start (exit 2): it never stops a process it did not start. Each scenario runs in a fresh
// browser context. A scenario's verdict is PASS or FAIL with a reason; what it had to fall back
// on to get there (a looser name, a second key, a keyboard route to a chart mark) is recorded
// with it, and incidental observations go to NOTES.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChrome } from "../../../tools/internal/chrome.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const APP = args.find((a) => !a.startsWith("--"));
if (!APP) { console.error("usage: drive.mjs <app-url> [--service-port=8370] [--today=YYYY-MM-DD] [--only=a,b] [--out=dir] [--headful]"); process.exit(2); }
const PORT = Number(opt("service-port", "8370"));
const TODAY_ARG = opt("today", "");
if (TODAY_ARG && !/^\d{4}-\d{2}-\d{2}$/.test(TODAY_ARG)) { console.error("--today must be YYYY-MM-DD"); process.exit(2); }
const SERVICE = `http://127.0.0.1:${PORT}`;
const ONLY = opt("only", "")?.split(",").filter(Boolean);
const OUT = opt("out", "/tmp/ledger-drive");
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NOTES = new Set();
const FIND_MS = 10000;

// ── the service: one fresh process per scenario ─────────────────────────────
function listening(port) {
  return new Promise((res) => {
    const s = createConnection({ host: "127.0.0.1", port });
    s.once("connect", () => { s.destroy(); res(true); });
    s.once("error", () => res(false));
  });
}
function whoListens(port) {
  try {
    const pids = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim().split(/\s+/).filter(Boolean);
    return pids.map((pid) => { let cmd = "?"; try { cmd = execFileSync("ps", ["-o", "command=", "-p", pid], { encoding: "utf8" }).trim(); } catch { /* gone */ } return `pid ${pid}: ${cmd}`; }).join("; ") || "unknown process";
  } catch { return "unknown process"; }
}
let SERVER = null;   // the child this process started, if running
async function startService() {
  if (await listening(PORT)) throw Object.assign(new Error(`port ${PORT} is already in use (${whoListens(PORT)})`), { refuse: true });
  const child = spawn(process.execPath, [join(HERE, "api/server.mjs"), `--port=${PORT}`, ...(TODAY_ARG ? [`--today=${TODAY_ARG}`] : [])], { stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (d) => { log += d; });
  child.stderr.on("data", (d) => { log += d; });
  SERVER = child;
  const until = Date.now() + 15000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`the service exited at start: ${log.trim()}`);
    try { if ((await fetch(`${SERVICE}/api/today`)).ok) return child; } catch { /* not yet */ }
    if (Date.now() > until) throw new Error(`the service never listened: ${log.trim()}`);
    await sleep(100);
  }
}
async function stopService() {
  const child = SERVER;
  SERVER = null;
  if (!child || child.exitCode !== null) return;
  const gone = new Promise((r) => child.once("exit", r));
  child.kill("SIGTERM");
  if (!(await Promise.race([gone.then(() => true), sleep(3000).then(() => false)]))) { child.kill("SIGKILL"); await gone; }
}
process.on("exit", () => { if (SERVER && SERVER.exitCode === null) try { SERVER.kill("SIGKILL"); } catch { /* gone */ } });

const api = async (path, init) => {
  const r = await fetch(SERVICE + path, init);
  const body = await r.json();
  if (!r.ok) throw new Error(`service ${path}: ${r.status} ${body.message ?? body.error}`);
  return body;
};
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();
const summary = (filter) => api(`/api/summary?${qs(filter)}`);
const rows = async (filter) => (await api(`/api/transactions?${qs({ ...filter, limit: 10000 })}`)).rows;
// What the service holds, once it holds: the app saves on its own schedule, so a check waits.
async function stored(test, what, timeout = 9000) {
  const until = Date.now() + timeout;
  let last;
  for (;;) {
    try { last = await test(); if (last) return last; } catch (e) { last = e.message; }
    if (Date.now() > until) throw new Error(`never stored: ${what}`);
    await sleep(250);
  }
}

// ── dates and money ─────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
async function dates() {
  const today = (await api("/api/today")).today;
  const [y, m] = today.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  const lastDay = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return {
    today, y, m, month: `${y}-${pad(m)}`, monthName: MONTHS[m - 1], lastMonthName: MONTHS[pm - 1],
    monthStart: `${y}-${pad(m)}-01`, monthEnd: `${y}-${pad(m)}-${pad(lastDay(y, m))}`,
    lastStart: `${py}-${pad(pm)}-01`, lastEnd: `${py}-${pad(pm)}-${pad(lastDay(py, pm))}`,
    yearStart: `${y}-01-01`,
  };
}
const money = (cents) => `$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const parseMoney = (s) => { const m = /([−-])?\s*\$\s?([\d,]+(?:\.\d+)?)/.exec(s); return m ? Math.round(Number(m[2].replace(/,/g, "")) * 100) * (m[1] ? -1 : 1) : null; };

// ── the page, by role and name ──────────────────────────────────────────────
const ACTION_ROLES = new Set(["button", "link", "menuitem", "tab", "option", "radio", "checkbox", "switch", "row", "gridcell", "listitem", "cell", "treeitem", "menuitemradio", "menuitemcheckbox", "togglebutton", "img", "image", "graphics-symbol"]);
const FIELD_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton", "TextField", "slider"]);
// The whole tree, less the unnamed wrappers: puppeteer's "interesting only" prunes whatever sits
// inside a control and can't take focus — a listbox's options, a combobox's choices — which a
// person sees and chooses all the same.
const PLAIN = new Set(["generic", "none", "InlineTextBox", "LineBreak", "presentation", "paragraph", "group", "Section"]);
async function nodes(page) {
  const out = [];
  const walk = (n) => { if (!(PLAIN.has(n.role) && !n.name) && n.role !== "InlineTextBox") out.push(n); for (const c of n.children ?? []) walk(c); };
  const root = await page.accessibility.snapshot({ interestingOnly: false });
  if (root) walk(root);
  return out;
}
async function elementOf(n) {
  let h = await n.elementHandle().catch(() => null);
  if (h) h = (await h.evaluateHandle((e) => (e.nodeType === 1 ? e : e.parentElement))).asElement();
  return h;
}
// A container (a row, a list item, a cell) takes the name of what it holds: a control inside it
// that matches is the thing a person presses, so it comes first.
const CONTAINER_ROLES = new Set(["row", "listitem", "cell", "gridcell", "columnheader", "rowheader", "treeitem"]);
async function find(page, test, { timeout = FIND_MS, what = "an element" } = {}) {
  const until = Date.now() + timeout;
  for (;;) {
    const hits = (await nodes(page)).filter(test);
    const hit = hits.find((n) => !CONTAINER_ROLES.has(n.role)) ?? hits[0];
    if (hit) { const h = await elementOf(hit); if (h) return { node: hit, handle: h }; }
    if (Date.now() > until) throw new Error(`not found: ${what}`);
    await sleep(150);
  }
}
async function findAll(page, test) {
  const out = [];
  for (const n of (await nodes(page)).filter(test)) { const h = await elementOf(n); if (h) out.push({ node: n, handle: h }); }
  return out;
}
const named = (n, re) => typeof n.name === "string" && (typeof re === "string" ? n.name === re : re.test(n.name));
const control = (page, re, o = {}) => find(page, (n) => ACTION_ROLES.has(n.role) && named(n, re) && !n.disabled, { what: `a control named ${re}`, ...o });
const field = (page, re, o = {}) => find(page, (n) => FIELD_ROLES.has(n.role) && named(n, re) && !n.disabled, { what: `a field named ${re}`, ...o });
const maybe = async (p) => { try { return await p; } catch { return null; } };
// A control by its name, else by a looser one — which is recorded as a fallback.
async function controlOr(page, ctx, strict, loose, o = {}) {
  const hit = await maybe(control(page, strict, { timeout: loose ? 3000 : FIND_MS, ...o }));
  if (hit || !loose) return hit ?? control(page, strict, { timeout: 1, ...o });
  const l = await control(page, loose, o);
  ctx.fallback(`found "${l.node.name}" by the looser name ${loose} (nothing named ${strict})`);
  return l;
}
let TOUCH = false;
async function press(page, el) {
  await el.handle.evaluate((e) => e.scrollIntoView({ block: "nearest", inline: "nearest" }));
  await sleep(60);
  const b = await el.handle.boundingBox();
  if (!b) { await el.handle.click(); return; }
  const p = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  if (TOUCH) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
}
// Focus has landed in the element (or inside it) — a person sees the caret before typing.
async function focusIn(el, timeout = 1500) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await el.handle.evaluate((e) => { const a = document.activeElement; return !!a && (a === e || e.contains(a) || a.contains(e)); }).catch(() => false)) return true;
    await sleep(50);
  }
  return false;
}
async function selectAll(page) {
  // Command-A with the editing command it means: keys sent through DevTools on a Mac don't run
  // editing commands on their own
  await page.keyboard.down("Meta"); await page.keyboard.press("a", { commands: ["SelectAll"] }); await page.keyboard.up("Meta");
}
async function typeIn(page, el, text, { enter = false } = {}) {
  await press(page, el);
  if (!(await focusIn(el))) { await el.handle.focus(); NOTES.add(`a click on the field "${el.node.name}" did not put the caret in it; focused it directly`); }
  await selectAll(page);
  await page.keyboard.type(text, { delay: 15 });
  if (enter) await page.keyboard.press("Enter");
  return el;
}
// A number: typed, else — a stepper that takes no typing — stepped with the arrow keys as a
// spin button is (WAI-ARIA), which is recorded.
async function setNumber(page, ctx, el, n) {
  await typeIn(page, el, String(n));
  await page.keyboard.press("Tab");
  await sleep(150);
  const now = async () => Number(await el.handle.evaluate((e) => e.getAttribute("aria-valuenow") ?? e.value));
  if ((await now()) === n) return;
  await el.handle.focus();
  for (let i = 0; i < 50 && (await now()) !== n; i++) await page.keyboard.press((await now()) < n ? "ArrowUp" : "ArrowDown");
  if ((await now()) !== n) throw new Error(`the field "${el.node.name}" can't be set to ${n} by typing or the arrow keys`);
  ctx.fallback(`"${el.node.name}" took no typed digits; set to ${n} with the arrow keys`);
}
// Text as read: runs of space are one space, and invisible joiners (a word joiner keeping a
// minus sign with its number) are not there.
const plainText = (s) => s.replace(/[​-‍⁠﻿]/g, "").replace(/\s+/g, " ");
const bodyText = (page) => page.evaluate(() => document.body.innerText).then(plainText);
const allText = async (page) => plainText(`${await bodyText(page)} | ${(await nodes(page)).map((n) => `${n.name ?? ""} ${n.value ?? ""}`).join(" | ")}`);
async function seeText(page, text, timeout = FIND_MS) {
  const until = Date.now() + timeout;
  for (;;) {
    const t = await allText(page);
    const m = typeof text === "string" ? (t.includes(text) ? [text] : null) : text.exec(t);
    if (m) return m;
    if (Date.now() > until) throw new Error(`never shown: ${text}`);
    await sleep(150);
  }
}
async function chord(page, key, { shift = false, mod = "Meta" } = {}) {
  await page.keyboard.down(mod);
  if (shift) await page.keyboard.down("Shift");
  await page.keyboard.press(key);
  if (shift) await page.keyboard.up("Shift");
  await page.keyboard.up(mod);
}
// An option in an open list, menu or popover.
const OPTION_ROLES = new Set(["option", "menuitem", "menuitemradio", "menuitemcheckbox", "checkbox", "radio", "listitem", "button", "treeitem", "gridcell", "cell"]);
const option = (page, re, o = {}) => find(page, (n) => OPTION_ROLES.has(n.role) && named(n, re) && !n.disabled, { what: `a choice named ${re}`, ...o });
// A combobox: type part of the name, then choose the offered option.
async function choose(page, ctx, el, typed, optRe) {
  await typeIn(page, el, typed);
  const pick = await maybe(find(page, (n) => ["option", "menuitem", "listitem", "treeitem"].includes(n.role) && named(n, optRe), { timeout: 4000, what: `an option ${optRe}` }));
  if (pick) { await press(page, pick); return pick.node.name; }
  const offered = (await nodes(page)).filter((n) => ["option", "menuitem", "listitem", "treeitem"].includes(n.role)).map((n) => n.name).slice(0, 5);
  ctx.fallback(`no option named ${optRe} offered after typing "${typed}" into "${el.node.name}" (offered: ${offered.length ? offered.map((x) => `"${x}"`).join(", ") : "nothing"}); pressed Enter`);
  await page.keyboard.press("Enter");
  return null;
}

// ── the summary line (§3, §11) ──────────────────────────────────────────────
const SUMMARY_RE = /([\d,]+) transactions? · In ([−-]?\$[\d,]+\.\d\d) · Out ([−-]?\$[\d,]+\.\d\d) · Net ([−-]?\$[\d,]+\.\d\d)/;
async function shownSummary(page) {
  const m = SUMMARY_RE.exec(await allText(page));
  return m && { text: m[0], count: Number(m[1].replace(/,/g, "")), in: parseMoney(m[2]), out: parseMoney(m[3]), net: parseMoney(m[4]) };
}
const sameSummary = (a, b) => a && b && a.count === b.count && Math.abs(a.in) === Math.abs(b.in) && Math.abs(a.out) === Math.abs(b.out) && a.net === b.net;
// The summary line, once it says what the service says (filters apply as they change).
async function summaryBecomes(page, want, what, timeout = FIND_MS) {
  const until = Date.now() + timeout;
  let last = null;
  for (;;) {
    last = await shownSummary(page);
    if (sameSummary(last, want)) return last;
    if (Date.now() > until) throw new Error(`${what}: the summary line reads ${last ? `"${last.text}"` : "nothing in the form N transactions · In … · Out … · Net …"}, the service says ${want.count} transactions · In ${money(want.in)} · Out ${money(want.out)} · Net ${want.net < 0 ? "−" : ""}${money(want.net)}`);
    await sleep(200);
  }
}

// ── going places ────────────────────────────────────────────────────────────
async function open(page) {
  await page.goto(APP, { waitUntil: "networkidle2", timeout: 30000 });
  await seeText(page, /Revenue|Transactions|Overview/, 15000).catch(() => { throw new Error(`the app never showed Overview or Transactions at ${APP}`); });
}
async function view(page, ctx, name) {
  const re = new RegExp(`^${name}$`, "i");
  const v = await maybe(find(page, (n) => ["link", "tab", "button", "menuitem", "radio"].includes(n.role) && named(n, re), { timeout: 3000 }));
  if (v) { await press(page, v); }
  else await press(page, await controlOr(page, ctx, re, new RegExp(`\\b${name}\\b`, "i")));
  await sleep(400);
}
// The editor for a kind: its own control ("New expense"), else a "New" menu or the kind chosen at the top.
async function newEditor(page, ctx, kind) {
  const direct = await maybe(control(page, new RegExp(`^(\\+ ?)?((new|add|record) (an? )?)?${kind}\\b(?!s)`, "i"), { timeout: 3000 }));
  if (direct) { await press(page, direct); }
  else {
    ctx.fallback(`no "New ${kind}" control; opened a general New`);
    await press(page, await control(page, /^(\+ ?)?(new|add|record)\b|^\+$/i));
    const item = await maybe(control(page, new RegExp(`^${kind}$|\\b${kind}\\b`, "i"), { timeout: 2500 }));
    if (item) await press(page, item);
  }
  await sleep(400);
  const kindChoice = await maybe(find(page, (n) => ["radio", "tab", "option", "menuitemradio", "button", "togglebutton"].includes(n.role) && named(n, new RegExp(`^${kind}$`, "i")), { timeout: 800 }));
  if (kindChoice && kindChoice.node.checked !== true && kindChoice.node.selected !== true && kindChoice.node.pressed !== true && ["radio", "tab", "option", "menuitemradio"].includes(kindChoice.node.role)) await press(page, kindChoice);
}
const SAVE = /^save$|^save (expense|sale|refund|transaction)$|^(record|add) (expense|sale|refund)$/i;
// The Save that isn't "Save & new", the last on screen (the editor's own).
async function saveButton(page) {
  const all = await findAll(page, (n) => n.role === "button" && named(n, SAVE));
  return all.at(-1) ?? control(page, SAVE);
}

// ── the scenarios (brief §12) ───────────────────────────────────────────────
const SCENARIOS = {
  // 1. Overview's four figures for this month, their change against last month; this month's
  //    expense bar opens exactly those expenses, the summary equal to the cent.
  async overview_drill(page, ctx) {
    const d = await dates();
    const per = await api(`/api/aggregates/periods?${qs({ from: d.monthStart, to: d.today, by: "month" })}`);
    const p = per.periods.at(-1);
    await open(page);
    const want = [["Revenue", p.revenue.amount, "$"], ["Expenses", p.expenses.amount, "$"], ["Net profit", p.net.amount, "$"], ["Gross margin", p.grossMargin.percent, "%"]];
    for (const [label, value, unit] of want) {
      // the figure: a node whose name starts with the label and carries the value, else the
      // page's text right after the label
      const re = unit === "$" ? new RegExp(`${label}[^$%]{0,40}?([−-]?\\s*\\$[\\d,]+(?:\\.\\d\\d)?)`) : new RegExp(`${label}[^%]{0,40}?([\\d.]+)\\s*%`);
      // every place the label is followed by a value (the label also names filters and charts):
      // one of them must carry this month's value, and its change against last month
      await seeText(page, re, FIND_MS).catch(() => { throw new Error(`Overview shows no "${label}" figure with a value`); });
      const ch = new RegExp(`^[\\s\\S]{0,120}?([▲▼↑↓]|\\b(up|down)\\b|[+−-]\\s?\\d)[\\s\\S]{0,40}?(vs\\.?|from|than|against|compared( to| with)?)\\s*(${d.lastMonthName.slice(0, 3)}|last month|previous)`, "i");
      const text = await allText(page);
      const g = new RegExp(re.source, "g");
      const seen = [...text.matchAll(g)].map((m) => ({ shown: unit === "$" ? parseMoney(m[1]) : Number(m[1]), raw: m[1], after: text.slice(m.index + m[0].length, m.index + m[0].length + 160), at: m[0] }));
      const right = seen.filter((x) => (unit === "$" ? Math.abs(x.shown - value) < 100 : value !== null && Math.abs(x.shown - value) <= 1));
      if (!right.length) throw new Error(`${label} shows ${seen.map((x) => x.raw).join(" / ")}; the service's this-month value is ${unit === "$" ? money(value) : value + "%"}`);
      const c = right.find((x) => ch.test(x.after));
      if (!c) throw new Error(`the ${label} figure shows no change against last month (no "▲ 12% vs ${d.lastMonthName.slice(0, 3)}" or the like)`);
      ctx.observed[label] = (c.at + ch.exec(c.after)[0]).replace(/\s+/g, " ").slice(0, 90);
    }
    await seeText(page, /income vs\.? expenses/i).catch(() => { throw new Error('no "Income vs expenses" chart on Overview'); });
    // this month's expense bar
    const thisMonth = new RegExp(`(${d.monthName}|\\b${d.monthName.slice(0, 3)}\\b|${d.month})[^,]*,?.*\\bexpenses?\\b`, "i");
    const isBar = (n) => !["StaticText", "heading", "link"].includes(n.role) && named(n, thisMonth) && !/^expenses\b/i.test(n.name);
    let bar = await maybe(find(page, isBar, { timeout: 2500 }));
    let reachedByKeys = false;
    if (!bar) {
      // A chart that is one keyboard stop (§6, for someone who can't see the chart): focused, its
      // arrow keys walk periods and series and each point is announced — as the focused mark's own
      // name, its active descendant, or the text the chart is described by. Walked to this month's
      // expenses by what is announced, then opened with Enter.
      const mon = `(${d.monthName}|\\b${d.monthName.slice(0, 3)}\\b)`;
      const monthRe = new RegExp(mon, "i"), target = new RegExp(`${mon}[^|]*\\bexpenses?\\b`, "i");
      const announced = () => page.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return "";
        const byId = (id) => document.getElementById(id);
        const said = [a.getAttribute("aria-label") ?? ""];
        const ad = a.getAttribute("aria-activedescendant");
        if (ad && byId(ad)) said.push(byId(ad).getAttribute("aria-label") ?? byId(ad).textContent);
        for (const id of (a.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean)) said.push(byId(id)?.textContent ?? "");
        // or what it said aloud: a live region's latest announcement
        for (const r of document.querySelectorAll('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"]')) said.push(r.textContent ?? "");
        return said.join(" | ");
      });
      // where the walk starts: a period's mark in the tree, else the chart itself, named for its title
      const period = new RegExp(`${d.monthName}\\b[^|]*\\b(revenue|expenses|net profit|income)\\b[^|]*\\$`, "i");
      const start = await maybe(find(page, (n) => !["StaticText", "heading"].includes(n.role) && named(n, period), { timeout: 2500 }))
        ?? await maybe(find(page, (n) => ["application", "img", "image", "figure", "graphics-document", "group", "grid", "list"].includes(n.role) && named(n, /income vs\.? expenses/i), { timeout: 2500 }));
      if (start) {
        await start.handle.evaluate((e) => e.focus());   // an <svg> chart too, which puppeteer's focus() refuses
        await sleep(150);
        let ann = "";
        for (let i = 0; i < 16; i++) {
          ann = await announced();
          if (target.test(ann)) break;
          await page.keyboard.press(!ann.includes("$") ? "ArrowRight" : monthRe.test(ann) ? "ArrowDown" : "End");
          await sleep(150);
        }
        if (target.test(ann)) {
          reachedByKeys = true;
          bar = { node: { name: (ann.split(" | ").find((x) => target.test(x)) ?? ann).trim() }, handle: null };
          ctx.fallback(`this month's expense bar has no node of its own in the tree until the chart is arrowed to it ("${bar.node.name}")`);
        }
      }
    }
    let via = "the expense bar";
    if (bar && !reachedByKeys) {
      ctx.observed.bar = bar.node.name;
      await press(page, bar);
      await sleep(600);
      if (!(await maybe(seeText(page, SUMMARY_RE, 2500)))) { await bar.handle.focus().catch(() => {}); await page.keyboard.press("Enter"); ctx.fallback("the bar opened nothing on a click; Enter on it"); }
    } else if (bar) {
      // reached by the arrow keys, it is opened as the keyboard opens it: Enter (§6). Its
      // element's box need not be the drawn bar's, so a click at its centre is no person's aim.
      ctx.observed.bar = bar.node.name;
      via = "the expense bar, by keyboard";
      await page.keyboard.press("Enter");
    } else {
      via = "the Expenses figure";
      ctx.fallback("no expense bar for this month found by pointer or keyboard; chose the Expenses figure instead");
      await press(page, await control(page, /^expenses\b/i));
    }
    ctx.observed.via = via;
    const exp = await summary({ from: d.monthStart, to: d.today, kind: "expense" });
    if (exp.out !== p.expenses.amount) NOTES.add("service: periods' expenses differ from the expense summary (drive assumption broken)");
    await summaryBecomes(page, exp, `after choosing ${via}`, 12000);
  },

  // 2. A split expense: saving waits until nothing remains; then it is stored, three parts.
  async split_expense(page, ctx) {
    const d = await dates();
    const contacts0 = new Set((await api("/api/contacts")).contacts.map((c) => c.id));
    await open(page);
    await newEditor(page, ctx, "expense");
    await typeIn(page, await field(page, /^(total )?amount\b/i), "120");
    const vendor = await field(page, /vendor|contact|payee|supplier|from/i);
    const vname = await choose(page, ctx, vendor, "Printworks", /printworks/i);
    ctx.observed.vendorOption = vname;
    await sleep(300);
    await press(page, await controlOr(page, ctx, /^split\b/i, /split/i));
    await sleep(400);
    const parts = async () => ({
      cats: await findAll(page, (n) => ["combobox", "textbox", "searchbox"].includes(n.role) && (/categor/i.test(n.name ?? "") && !/^category$/i.test(n.name) || /part|split/i.test(n.name ?? "") && !/amount/i.test(n.name ?? ""))),
      amts: await findAll(page, (n) => ["textbox", "spinbutton"].includes(n.role) && /amount/i.test(n.name ?? "") && /part|split|line|categor|\d/i.test(n.name ?? "")),
    });
    let ps = await parts();
    if (ps.cats.length < 1 || ps.amts.length < 1) {
      // parts named only "Category" and "Amount": every such field after the first amount
      const cats = await findAll(page, (n) => ["combobox", "textbox"].includes(n.role) && /categor/i.test(n.name ?? ""));
      const amts = (await findAll(page, (n) => ["textbox", "spinbutton"].includes(n.role) && /amount/i.test(n.name ?? ""))).slice(1);
      ps = { cats, amts };
      ctx.fallback("split parts aren't named as parts; took every category field and every amount field after the total");
    }
    ctx.observed.partFields = `${ps.cats.map((c) => c.node.name)[0]} / ${ps.amts.map((c) => c.node.name)[0]}`;
    const addPart = async () => {
      await press(page, await controlOr(page, ctx, /add (a |another )?(part|split|category|line|row)/i, /^\+|add/i));
      await sleep(300);
      ps = await parts();
    };
    while (ps.cats.length < 2 || ps.amts.length < 2) { const n = ps.cats.length; await addPart(); if (ps.cats.length === n) throw new Error("couldn't add a second part to the split"); }
    await choose(page, ctx, ps.cats[0], "Stock", /stock & materials/i);
    ps = await parts(); await typeIn(page, ps.amts[0], "90");
    ps = await parts(); await choose(page, ctx, ps.cats[1], "Shipping", /shipping & postage/i);
    ps = await parts(); await typeIn(page, ps.amts[1], "20");
    await page.keyboard.press("Tab");
    await sleep(300);
    await press(page, await saveButton(page));
    await sleep(1500);
    const early = await rows({ q: "Printworks" });
    if (early.length) throw new Error(`saving did not wait: the service holds ${early.length} Printworks transaction(s) with $10.00 unallocated`);
    const rem = await maybe(seeText(page, /Remaining to allocate[^$]{0,40}\$\s?10\.00|\$10\.00[^$]{0,20}Remaining to allocate/, 4000));
    if (!rem) {
      const t = await allText(page);
      throw new Error(`with $10.00 unallocated, no "Remaining to allocate … $10.00" shown${/remaining/i.test(t) ? ` (shown: "${/.{0,30}remaining.{0,40}/i.exec(t)[0]}")` : ""}`);
    }
    ctx.observed.remaining = rem[0];
    await addPart();
    if (ps.cats.length < 3 || ps.amts.length < 3) throw new Error("couldn't add a third part");
    await choose(page, ctx, ps.cats[2], "Packaging", /packaging/i);
    ps = await parts(); await typeIn(page, ps.amts[2], "10");
    await page.keyboard.press("Tab");
    await sleep(300);
    await press(page, await saveButton(page));
    const t = await stored(async () => (await rows({ q: "Printworks", kind: "expense" }))[0], "an expense from Printworks", 9000);
    const det = await api(`/api/transactions/${t.id}`);
    if (det.amount !== 12000) throw new Error(`stored amount ${money(det.amount)}, not $120.00`);
    if (!det.contactId || contacts0.has(det.contactId)) throw new Error("the vendor is not a new contact");
    const c = await api(`/api/contacts/${det.contactId}`);
    if (c.name !== "Printworks") throw new Error(`the new contact is named "${c.name}"`);
    const parts3 = det.parts ?? [];
    const want = { stock: 9000, shipping: 2000, packaging: 1000 };
    const got = Object.fromEntries(parts3.map((x) => [x.categoryId, x.amount]));
    if (parts3.length !== 3 || parts3.reduce((s, x) => s + x.amount, 0) !== 12000 || Object.entries(want).some(([k, v]) => got[k] !== v)) throw new Error(`stored parts ${JSON.stringify(parts3)}, not stock 9000 / shipping 2000 / packaging 1000`);
    if (det.date !== d.today) NOTES.add(`split_expense: stored dated ${det.date}, not today`);
    // in the list at once, without a reload
    await view(page, ctx, "Transactions");
    await seeText(page, /Printworks/, 6000).catch(() => { throw new Error("stored, but not in the list without a reload"); });
    await seeText(page, "Split (3)", 4000).catch(() => { throw new Error('the split shows in the list without the label "Split (3)"'); });
  },

  // 3. A sale at the Market (two mugs, a print); then one mug refunded; the sale shows it.
  async sale_refund(page, ctx) {
    const d = await dates();
    const products = (await api("/api/products")).products.filter((x) => !x.archived);
    const before = new Set((await rows({ from: d.today, to: d.today })).map((r) => r.id));
    await open(page);
    await newEditor(page, ctx, "sale");
    // the channel: a radio/option/tab named Market, else a channel field
    const mk = await maybe(find(page, (n) => ["radio", "option", "tab", "button", "togglebutton", "menuitemradio"].includes(n.role) && named(n, /^market$/i), { timeout: 2500 }));
    if (mk) await press(page, mk);
    else {
      const ch = await field(page, /channel/i);
      if (ch.node.role === "combobox") await choose(page, ctx, ch, "Market", /^market$/i);
      else { await press(page, ch); await press(page, await option(page, /^market$/i)); }
    }
    // the products: tapped (twice for two), else typed into a product field
    const pick = async (re, times) => {
      for (let i = 0; i < times; i++) {
        const b = await maybe(find(page, (n) => ["button", "option", "listitem", "menuitem", "gridcell", "cell"].includes(n.role) && named(n, re) && !/remove|delete/i.test(n.name), { timeout: 2500 }));
        if (b) { await press(page, b); await sleep(250); continue; }
        ctx.fallback(`no product button ${re}; chose it in a product field`);
        const f = await field(page, /product|item|add/i);
        await choose(page, ctx, f, re.source.replace(/[^a-z ]/gi, "").split(" ")[0], re);
        await sleep(250);
      }
    };
    const mug = products.find((x) => /mug/i.test(x.name)), print = products.find((x) => /print/i.test(x.name));
    if (!mug || !print) throw new Error("the service has no mug or print product (drive assumption)");
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await pick(new RegExp(`^(add )?${esc(mug.name)}\\b`, "i"), 2);
    await pick(new RegExp(`^(add )?${esc(print.name)}\\b`, "i"), 1);
    ctx.observed.products = `${mug.name} ×2, ${print.name} ×1`;
    await sleep(300);
    const total = mug.price * 2 + print.price;
    await maybe(seeText(page, money(total), 3000)) ?? NOTES.add(`sale_refund: the editor's total never read ${money(total)}`);
    await press(page, await saveButton(page));
    const sale = await stored(async () => (await rows({ from: d.today, to: d.today, kind: "sale" })).find((r) => !before.has(r.id)), "the new sale");
    const sd = await api(`/api/transactions/${sale.id}`);
    const qty = (pid) => sd.lines.filter((l) => l.productId === pid).reduce((s, l) => s + l.quantity, 0);
    if (sd.channel !== "market") throw new Error(`the sale's channel is ${sd.channel}, not market`);
    if (qty(mug.id) !== 2 || qty(print.id) !== 1 || sd.lines.some((l) => l.productId !== mug.id && l.productId !== print.id)) throw new Error(`the sale holds ${sd.lines.map((l) => `${l.quantity}× ${l.description}`).join(", ")}`);
    // refund one mug: from the sale (its detail), else a Refund editor that starts from a sale
    await view(page, ctx, "Transactions");
    const row = await maybe(find(page, (n) => ACTION_ROLES.has(n.role) && named(n, new RegExp(esc(money(total)))) && /market|mug|print|sale/i.test(n.name), { timeout: 4000 }))
      ?? await maybe(find(page, (n) => ACTION_ROLES.has(n.role) && named(n, new RegExp(esc(money(total)))), { timeout: 3000 }));
    if (!row) throw new Error(`the new sale (${money(total)}) is not in the list`);
    await press(page, row);
    await sleep(500);
    const refundBtn = await maybe(control(page, /^refund\b|refund (this|sale|items?)|issue (a )?refund|^record refund/i, { timeout: 4000 }));
    if (refundBtn) await press(page, refundBtn);
    else {
      // the refund editor, started from the sale chosen in it (§4: "A refund starts from a sale")
      ctx.fallback("the sale's detail offers no Refund; opened the refund editor and chose the sale there");
      await newEditor(page, ctx, "refund");
      const sf = await field(page, /sale|order|transaction|refund of|original/i);
      await choose(page, ctx, sf, (total / 100).toFixed(2), new RegExp(esc(money(total))));
    }
    await sleep(500);
    // the refund's lines: quantity fields, one per sale line; one mug, no print
    const qfields = await findAll(page, (n) => ["spinbutton", "textbox"].includes(n.role) && /quantity|qty|refund|units?|items?/i.test(n.name ?? ""));
    const mugQ = qfields.find((f) => new RegExp(esc(mug.name), "i").test(f.node.name)) ?? qfields[0];
    const printQ = qfields.find((f) => new RegExp(esc(print.name), "i").test(f.node.name)) ?? qfields[1];
    if (mugQ) {
      ctx.observed.refundFields = qfields.map((f) => `${f.node.name}=${f.node.value ?? ""}`).join("; ");
      await setNumber(page, ctx, mugQ, 1);
      if (printQ && printQ !== mugQ && Number(printQ.node.value ?? 0) !== 0) await setNumber(page, ctx, printQ, 0);
    } else {
      // no quantity fields: a line toggled into the refund, once
      ctx.fallback("no quantity fields in the refund; chose the mug's line");
      const line = await find(page, (n) => ["checkbox", "button", "option", "row"].includes(n.role) && named(n, new RegExp(esc(mug.name), "i")), { what: "the mug line in the refund" });
      await press(page, line);
    }
    await page.keyboard.press("Tab");
    await sleep(300);
    await press(page, await saveButton(page));
    const ref = await stored(async () => (await rows({ kind: "refund", from: d.today, to: d.today })).find((r) => r.refundOf === sale.id), "a refund linked to the sale");
    const rd = await api(`/api/transactions/${ref.id}`);
    const mugLine = sd.lines.find((l) => l.productId === mug.id);
    if (rd.amount !== mug.price || rd.lines.length !== 1 || rd.lines[0].saleLineId !== mugLine.id || rd.lines[0].quantity !== 1) throw new Error(`the refund holds ${money(rd.amount)}: ${rd.lines.map((l) => `${l.quantity}× ${l.description}`).join(", ")}, not one ${mug.name}`);
    // the sale shows what was refunded
    await page.keyboard.press("Escape");
    await sleep(300);
    const row2 = await maybe(find(page, (n) => ACTION_ROLES.has(n.role) && named(n, new RegExp(esc(money(total)))) && !/refund/i.test(n.role), { timeout: 4000 }));
    if (row2) { await press(page, row2); await sleep(600); }
    // the sale's detail: the smallest thing on screen that holds both its products' names
    const detailText = () => page.evaluate((a, b) => {
      let best = null;
      for (const e of document.querySelectorAll("body *")) {
        const t = e.innerText ?? "";
        if (t.includes(a) && t.includes(b) && e.checkVisibility() && (!best || t.length < best.length)) best = t;
      }
      return (best ?? "").replace(/\s+/g, " ");
    }, mug.name, print.name);
    const r = new RegExp(`refund[^.]{0,80}${esc(money(mug.price))}|${esc(money(mug.price))}[^.]{0,80}refund`, "i");
    let shown = null;
    for (const until = Date.now() + 5000; !shown && Date.now() < until; await sleep(200)) shown = r.exec(await detailText());
    if (!shown) throw new Error(`the sale's detail doesn't show the refund of ${money(mug.price)} (no text with "refund" and the amount beside its lines: "${(await detailText()).slice(0, 200)}")`);
    ctx.observed.refundShown = shown[0].slice(0, 120);
  },

  // 4. This year, "adobe", $20–$100 by keyboard alone; the summary equals the service's; the
  //    Breakdown shows the same total; Overview says it's filtered.
  async filters_keyboard(page, ctx) {
    const d = await dates();
    await open(page);
    await view(page, ctx, "Transactions");
    // date range → This year
    const dr = await controlOr(page, ctx, /^date range\b|^(this|last) (month|year|quarter)\b|^date\b/i, /^(?!.*(previous|next|compare)).*(month|range|date)/i);
    await press(page, dr);
    await press(page, await option(page, /^this year\b/i));
    await sleep(400);
    await typeIn(page, await field(page, /search/i), "adobe");
    await sleep(300);
    await page.keyboard.press("Tab");
    // the amount slider: two handles, each named for what it sets
    let sliders = await findAll(page, (n) => n.role === "slider");
    if (sliders.length < 2) {
      await press(page, await controlOr(page, ctx, /^amount\b/i, /amount/i));
      await sleep(400);
      sliders = await findAll(page, (n) => n.role === "slider");
    }
    if (sliders.length < 2) throw new Error(`no two-handled amount slider (found ${sliders.length} slider(s))`);
    const handleOf = (re) => sliders.find((s) => re.test(s.node.name ?? ""));
    const lo = handleOf(/min|low|from|lower|start/i) ?? sliders[0], hi = handleOf(/max|high|to\b|upper|end/i) ?? sliders[1];
    ctx.observed.handles = [lo.node.name, hi.node.name];
    if (!/min|low|from|lower|least|start/i.test(lo.node.name ?? "") || !/max|high|\bto\b|upper|most|end/i.test(hi.node.name ?? "")) throw new Error(`the handles aren't named for what they set: "${lo.node.name}", "${hi.node.name}"`);
    const valueOf = (h) => h.handle.evaluate((e) => [e.getAttribute("aria-valuetext"), e.getAttribute("aria-label"), e.getAttribute("aria-valuenow"), e.value].filter(Boolean).join(" | "));
    const dollars = async (h) => { const v = await valueOf(h); const m = /\$\s?([\d,]+(?:\.\d+)?)(k)?/i.exec(v); return m ? Math.round(Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1) * 100) : null; };
    const setBy = async (h, cents, which) => {
      await h.handle.focus();   // the keyboard reaches it (Tab order is the app's; focus is a person's Tab)
      for (let i = 0; i < 300; i++) {
        let now = await dollars(h);
        if (now === null) {
          // at an open end ("No maximum"): step inward and read again
          if (i < 3 && /\bno\b|any|∞|unlimited|none/i.test(await valueOf(h))) { await page.keyboard.press(which === "maximum" ? "ArrowLeft" : "ArrowRight"); await sleep(20); continue; }
          throw new Error(`the ${which} handle doesn't say its value in dollars ("${await valueOf(h)}")`);
        }
        if (now === cents) return;
        const far = Math.abs(now - cents) > 30000;
        await page.keyboard.press(now < cents ? (far ? "PageUp" : "ArrowRight") : (far ? "PageDown" : "ArrowLeft"));
        await sleep(20);
        const next = await dollars(h);
        if ((now < cents && next > cents) || (now > cents && next < cents)) {
          // stepped past it: the finer key back, once, else it can't be set to the value
          await page.keyboard.press(next > cents ? "ArrowLeft" : "ArrowRight");
          if ((await dollars(h)) !== cents) throw new Error(`the ${which} handle can't be set to ${money(cents)} by keyboard: it steps ${money(now)} → ${money(next)}`);
          return;
        }
      }
      throw new Error(`the ${which} handle never reached ${money(cents)} by keyboard`);
    };
    // the top first, so the bottom never needs to cross it
    await setBy(hi, 10000, "maximum");
    await setBy(lo, 2000, "minimum");
    ctx.observed.handlesAfter = [lo.node.name, hi.node.name].length && [await valueOf(lo), await valueOf(hi)];
    await page.keyboard.press("Escape");
    await sleep(500);
    const want = await summary({ from: d.yearStart, to: d.today, q: "adobe", min: 2000, max: 10000 });
    ctx.observed.service = want;
    await summaryBecomes(page, want, "filtered to this year, adobe, $20–$100", 12000);
    const chip = await maybe(seeText(page, /\$20(\.00)?\s*[–—-]\s*\$100(\.00)?/, 2000));
    if (!chip) throw new Error('no chip reads the amount range "$20 – $100"');
    // Insights → Breakdown, the same total
    await view(page, ctx, "Insights");
    await press(page, await controlOr(page, ctx, /^breakdown\b/i, /breakdown|categor/i));
    await sleep(800);
    const total = Math.abs(want.out) || Math.abs(want.in);
    await seeText(page, money(total), 8000).catch(() => { throw new Error(`Insights → Breakdown doesn't show the filtered total ${money(total)}`); });
    // Overview says it is filtered
    await view(page, ctx, "Overview");
    const f = await maybe(seeText(page, /[^|]{0,40}\bfilter(ed|s)?\b[^|]{0,40}/i, 6000));
    if (!f) throw new Error("Overview doesn't say its figures are filtered");
    ctx.observed.filteredNote = f[0].trim();
  },

  // 5. Uncategorised, select all, categorise as Other; ⌘Z undoes.
  async bulk_undo(page, ctx) {
    const d = await dates();
    await open(page);
    await view(page, ctx, "Transactions");
    const clear = await maybe(control(page, /clear (all|filters)/i, { timeout: 1500 }));
    if (clear) await press(page, clear); else ctx.fallback('no "Clear all" (a fresh start has no filters to clear)');
    await press(page, await controlOr(page, ctx, /^categor(y|ies)\b/i, /categor/i));
    await press(page, await option(page, /^uncategori[sz]ed\b/i));
    await page.keyboard.press("Escape");
    await sleep(600);
    // the range the app shows (this month after Clear all): whichever service count the summary is
    const ranges = { "this month": { from: d.monthStart, to: d.today }, "all time": {} };
    let range = null, n0 = null;
    const until = Date.now() + FIND_MS;
    while (!range && Date.now() < until) {
      const s = await shownSummary(page);
      for (const [k, r] of Object.entries(ranges)) { const w = await summary({ ...r, category: "none" }); if (sameSummary(s, w)) { range = k; n0 = w; } }
      if (!range) await sleep(250);
    }
    if (!range) throw new Error(`filtered to Uncategorised, the summary line reads "${(await shownSummary(page))?.text ?? "nothing"}", matching neither this month's nor all time's uncategorised`);
    ctx.observed.range = range; ctx.observed.before = n0.count;
    if (n0.count === 0) throw new Error("nothing uncategorised to categorise (drive assumption)");
    const sel = await controlOr(page, ctx, /select all/i, /^all\b|select/i);
    await press(page, sel);
    await sleep(400);
    const cat = await controlOr(page, ctx, /^categori[sz]e\b/i, /\bcategori[sz]e\b|set category/i);
    await press(page, cat);
    await sleep(300);
    const other = await maybe(option(page, /^other$/i, { timeout: 3000 }));
    if (other) await press(page, other);
    else { const f = await field(page, /categor/i); await choose(page, ctx, f, "Other", /^other$/i); }
    // a confirmation, only if choosing Other didn't already do it
    if (!(await maybe(stored(async () => (await summary({ ...ranges[range], category: "none" })).count === 0, "", 1500)))) {
      const confirm = await maybe(control(page, /^(categori[sz]e|apply|confirm|ok|done)\b(?!.*categories)/i, { timeout: 1200 }));
      if (confirm) { await press(page, confirm); ctx.observed.confirmed = confirm.node.name; }
    }
    await stored(async () => (await summary({ ...ranges[range], category: "none" })).count === 0, `no uncategorised left in ${range}`);
    const told = await maybe(seeText(page, /categori[sz]ed \d+[^|]{0,40}/i, 3000));
    if (told) ctx.observed.toast = told[0]; else NOTES.add("bulk_undo: no \"Categorised N transactions · Undo\" message seen");
    // ⌘Z, with focus where the person left it; Control-Z if Command did nothing
    await sleep(300);
    await chord(page, "z");
    const back = async () => (await summary({ ...ranges[range], category: "none" })).count === n0.count;
    if (!(await maybe(stored(back, "", 3500)))) {
      await chord(page, "z", { mod: "Control" });
      if (await maybe(stored(back, "", 3500))) ctx.fallback("⌘Z did nothing; Control-Z undid");
      else throw new Error(`⌘Z (and Control-Z) did not undo: the service has ${(await summary({ ...ranges[range], category: "none" })).count} uncategorised, was ${n0.count}`);
    }
  },

  // 6. This month's expenses as CSV: one row per transaction, ISO dates, plain numbers, the
  //    total matching the summary.
  async export_csv(page, ctx) {
    const d = await dates();
    const dir = join(OUT, "export_csv-download");
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    const cdp = await page.browser().target().createCDPSession();
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dir, browserContextId: page.browserContext().id, eventsEnabled: true });
    await open(page);
    await view(page, ctx, "Transactions");
    const kindCtl = await maybe(control(page, /^kind\b/i, { timeout: 3000 }));
    if (kindCtl) { await press(page, kindCtl); await press(page, await option(page, /^expenses?\b/i)); await page.keyboard.press("Escape"); }
    else {
      // no Kind menu: the kinds shown as toggles in the filter bar (a group named Kind, or the bar itself)
      const t = await find(page, (n) => ["button", "togglebutton", "checkbox", "radio", "tab", "switch"].includes(n.role) && named(n, /^expenses?$/i) && !n.disabled, { what: "an Expenses kind filter" });
      ctx.fallback(`no Kind menu; pressed the "${t.node.name}" kind toggle (${t.node.role})`);
      await press(page, t);
    }
    const want = await summary({ from: d.monthStart, to: d.today, kind: "expense" });
    await summaryBecomes(page, want, "this month, expenses only");
    await press(page, await controlOr(page, ctx, /export( csv)?\b/i, /export|csv|download/i));
    await sleep(500);
    const sub = await maybe(control(page, /csv|download|^export$/i, { timeout: 1200 }));
    const until = Date.now() + 10000;
    let file = null;
    while (!file && Date.now() < until) {
      const f = readdirSync(dir).filter((x) => !x.endsWith(".crdownload"));
      if (f.length) file = join(dir, f[0]);
      else { if (sub && Date.now() > until - 9000 && !sub.clicked) { sub.clicked = true; await press(page, sub).catch(() => {}); } await sleep(200); }
    }
    if (!file) throw new Error("no file was downloaded");
    await sleep(300);
    const text = readFileSync(file, "utf8").replace(/^﻿/, "");
    ctx.observed.file = file;
    const parse = (s) => {
      const out = []; let row = [], cell = "", q = false;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
        else if (c === '"') q = true;
        else if (c === ",") { row.push(cell); cell = ""; }
        else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); out.push(row); row = []; cell = ""; }
        else cell += c;
      }
      if (cell || row.length) { row.push(cell); out.push(row); }
      return out.filter((r) => r.some((x) => x.trim() !== ""));
    };
    const [head, ...body] = parse(text);
    ctx.observed.header = head.join(",");
    const di = head.findIndex((h) => /^date$/i.test(h.trim())), ai = head.findIndex((h) => /^amount\b/i.test(h.trim()));
    if (di < 0 || ai < 0) throw new Error(`the CSV has no Date or Amount column (header: ${head.join(",")})`);
    if (body.length !== want.count) throw new Error(`the CSV has ${body.length} rows; ${want.count} transactions match`);
    const bad = body.find((r) => !/^\d{4}-\d{2}-\d{2}$/.test(r[di].trim()));
    if (bad) throw new Error(`a date isn't ISO: "${bad[di]}"`);
    const badAmt = body.find((r) => !/^-?\d+(\.\d{1,2})?$/.test(r[ai].trim()));
    if (badAmt) throw new Error(`an amount isn't a plain number: "${badAmt[ai]}"`);
    const sum = body.reduce((s, r) => s + Math.round(Math.abs(Number(r[ai])) * 100), 0);
    if (sum !== want.out) throw new Error(`the CSV's amounts add up to ${money(sum)}; the summary says Out ${money(want.out)}`);
    const shown = await shownSummary(page);
    if (shown && Math.abs(shown.out) !== sum) throw new Error(`the CSV's total ${money(sum)} doesn't match the summary line's Out ${money(shown.out)}`);
  },

  // 7. A $30 monthly budget for Software; Budgets says in words where it stands.
  async budget_words(page, ctx) {
    const d = await dates();
    await open(page);
    await view(page, ctx, "Budgets");
    await sleep(500);
    // the Software budget's amount: a field named for Software, else one added for it
    let f = await maybe(field(page, /software/i, { timeout: 2500 }));
    if (!f) {
      const add = await maybe(controlOr(page, ctx, /(add|set|new) (a )?budget|budget a category/i, /^add\b|^\+|budget/i));
      if (add) { await press(page, add); await sleep(400); }
      const sw = await maybe(find(page, (n) => ["option", "menuitem", "button", "checkbox", "radio", "row", "listitem"].includes(n.role) && named(n, /^software\b/i), { timeout: 2500 }));
      if (sw) { await press(page, sw); await sleep(300); }
      else { const c = await maybe(field(page, /categor/i, { timeout: 2500 })); if (c) await choose(page, ctx, c, "Software", /^software$/i); }
      f = await maybe(field(page, /software/i, { timeout: 2500 })) ?? await field(page, /amount|budget/i);
      ctx.fallback(`the Software budget was set through "${add?.node.name ?? sw?.node.name ?? "a category field"}", then the field "${f.node.name}"`);
    }
    ctx.observed.field = f.node.name;
    await typeIn(page, f, "30", { enter: true });
    await sleep(300);
    const save = await maybe(control(page, /^(save|set|add|done)\b(?!.*&)/i, { timeout: 800 }));
    if (save) await press(page, save);
    const b = await stored(async () => (await api(`/api/budgets?month=${d.month}`)).budgets.find((x) => x.categoryId === "software" && x.amount === 3000), "a $30 Software budget this month");
    ctx.observed.service = b;
    const STATE = /on track|under (budget|pace)|\$[\d,.]+ (over|under) pace|over pace|over by \$[\d,.]+|near (the )?limit/i;
    // the words of Software's own row: the smallest block on screen holding "Software" and a state
    // (a block that also names another expense category is a list, not Software's row)
    const cats = (await api("/api/categories")).categories;
    const others = cats.filter((c) => c.kind === "expense" && c.id !== "software").map((c) => c.name);
    const rowText = () => page.evaluate((src, others) => {
      const st = new RegExp(src, "i");
      let best = null;
      for (const e of document.querySelectorAll("body *")) {
        const t = e.innerText ?? "";
        if (/\bSoftware\b/.test(t) && st.test(t) && !others.some((o) => t.includes(o)) && e.checkVisibility() && (!best || t.length < best.length)) best = t;
      }
      return best && best.replace(/\s+/g, " ");
    }, STATE.source, others);
    let words = null;
    for (const until = Date.now() + 6000; !words && Date.now() < until; await sleep(200)) { const t = await rowText(); if (t) words = [t]; }
    if (!words) throw new Error("Budgets doesn't say in words where Software stands (On track / $… over pace / Over by $…)");
    ctx.observed.words = words[0].slice(0, 140);
    // over by the right amount, when over
    if (b.remaining < 0 && /over by \$([\d,.]+)/i.test(words[0])) {
      const said = parseMoney(/over by (\$[\d,.]+)/i.exec(words[0])[1]);
      if (said !== -b.remaining) throw new Error(`Budgets says Over by ${money(said)}; the service says over by ${money(-b.remaining)}`);
    }
  },

  // 8. On a phone: Overview's figures; an expense recorded with taps.
  async phone(page, ctx) {
    const d = await dates();
    TOUCH = true;
    await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
    const before = new Set((await rows({ from: d.today, to: d.today, kind: "expense" })).map((r) => r.id));
    await open(page);
    for (const l of ["Revenue", "Expenses", "Net profit", "Gross margin"]) await seeText(page, new RegExp(`${l}[^|]{0,40}?(\\$[\\d,]+|\\d+(\\.\\d)?\\s*%)`), 8000).catch(() => { throw new Error(`Overview on a phone shows no ${l} figure`); });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    if (wide > 392) NOTES.add(`phone: the page scrolls sideways (${wide}px wide at 390)`);
    await page.screenshot({ path: join(OUT, "phone-overview.png") }).catch(() => {});
    await newEditor(page, ctx, "expense");
    await typeIn(page, await field(page, /^(total )?amount\b/i), "12.34");
    // a category by taps: the field opened, an offered category tapped
    const cat = await field(page, /^categor/i);
    await press(page, cat);
    await sleep(400);
    let tapped = await maybe(find(page, (n) => ["option", "menuitem", "radio", "button", "listitem"].includes(n.role) && named(n, /^shipping & postage\b/i), { timeout: 2500 }));
    if (!tapped) { ctx.fallback("the category list offered nothing until typed into; typed \"Ship\""); await page.keyboard.type("Ship", { delay: 20 }); tapped = await maybe(find(page, (n) => ["option", "menuitem", "listitem"].includes(n.role) && named(n, /shipping & postage/i), { timeout: 3000 })); }
    if (tapped) await press(page, tapped); else { ctx.fallback("no category option to tap; pressed Enter"); await page.keyboard.press("Enter"); }
    await sleep(300);
    await press(page, await saveButton(page));
    const t = await stored(async () => (await rows({ from: d.today, to: d.today, kind: "expense" })).find((r) => !before.has(r.id)), "the expense recorded on a phone");
    if (t.amount !== 1234) throw new Error(`stored ${money(t.amount)}, not $12.34`);
    if (t.categoryId !== "shipping") throw new Error(`stored in category ${t.categoryId}, not Shipping & postage`);
    const small = await page.evaluate(() => [...document.querySelectorAll("button, a, input, [role=button], [role=tab], [role=link]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight && (r.width < 32 || r.height < 32); }).length);
    if (small) NOTES.add(`phone: ${small} visible target(s) smaller than 32 px on a side`);
  },
};

// ── run ─────────────────────────────────────────────────────────────────────
if (await listening(PORT)) { console.error(`refusing to start: port ${PORT} is already in use (${whoListens(PORT)}); this drive starts its own service there and never stops a process it didn't start`); process.exit(2); }
const browser = await launchChrome({ executablePath: CHROME, headless: !args.includes("--headful"), args: ["--no-sandbox"] });
const results = [];
const RUN_T0 = Date.now();
const SCENARIO_MS = 45000;   // a stuck app fails fast: each find gives up after 10 s
const RUN_MS = 330000;       // the whole run stays under six minutes
for (const [name, run] of Object.entries(SCENARIOS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const ctx = { fallbacks: [], observed: {}, fallback(s) { this.fallbacks.push(s); } };
  const t0 = Date.now();
  let error = null, page = null, bctx = null;
  try {
    await startService();
    bctx = await browser.createBrowserContext();
    page = await bctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on("pageerror", (e) => NOTES.add(`${name}: page error: ${String(e.message).slice(0, 160)}`));
    TOUCH = false;
    if (Date.now() - RUN_T0 > RUN_MS) throw new Error(`not run: the whole run's ${RUN_MS / 60000} minutes were spent`);
    const going = run(page, ctx);
    going.catch(() => {});   // a scenario that timed out may still fail later, on a closed page
    await Promise.race([going, sleep(SCENARIO_MS).then(() => { throw new Error(`timed out after ${SCENARIO_MS / 1000} s`); })]);
  } catch (e) {
    if (e.refuse) { console.error(`refusing to go on: ${e.message}`); await browser.close(); process.exit(2); }
    error = e.message;
  }
  if (page) await page.screenshot({ path: join(OUT, `${name}.png`) }).catch(() => {});
  if (bctx) await bctx.close().catch(() => {});
  await stopService();
  const r = { name, pass: !error, reason: error ?? "met", ms: Date.now() - t0, fallbacks: ctx.fallbacks, observed: ctx.observed, screenshot: join(OUT, `${name}.png`) };
  results.push(r);
  console.log(`${error ? "FAIL" : "PASS"}  ${name}  (${(r.ms / 1000).toFixed(1)} s)${error ? ` — ${error}` : ""}`);
  for (const f of ctx.fallbacks) console.log(`      fallback: ${f}`);
}
await browser.close();
const lines = results.map((r) => `${r.pass ? "PASS" : "FAIL"}  ${r.name}  ${(r.ms / 1000).toFixed(1)} s  ${r.reason}${r.fallbacks.length ? `\n      fallbacks: ${r.fallbacks.join(" | ")}` : ""}`);
lines.push(...[...NOTES].map((n) => `note  ${n}`));
lines.push(`${results.filter((r) => r.pass).length} of ${results.length} passed in ${((Date.now() - RUN_T0) / 1000).toFixed(0)} s`);
writeFileSync(join(OUT, "results.json"), JSON.stringify({ app: APP, results, notes: [...NOTES] }, null, 2));
writeFileSync(join(OUT, "results.txt"), lines.join("\n") + "\n");
for (const n of NOTES) console.log(`note  ${n}`);
console.log(`${results.filter((r) => r.pass).length} of ${results.length} passed · ${OUT}/results.json`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
