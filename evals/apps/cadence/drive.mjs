#!/usr/bin/env node
// drive.mjs — the hidden acceptance for cadence (the training log). It drives a built
// app the way a screen reader finds things — by role and accessible name, from the
// browser's own accessibility tree — and judges by what the service was asked (its
// request log) and what the page then says. It knows nothing about how the app is built.
//
//   node evals/apps/cadence/drive.mjs <app-url> [--service=http://127.0.0.1:8320]
//        [--only=a,b] [--out=dir] [--headful]
//
// The service must be this app's (api/server.mjs, with the _reset/_log endpoints).
// Each scenario starts from a reset service in a fresh browser context. What the brief
// fixes and this relies on: the week reads exactly "N sessions · 3h 40m"; the streak
// "12 days" or "no streak"; durations "3h 40m" / "45m", heart rate "148 bpm",
// distance "12.4 km". Everything else is found by a loose match on its name.
//
// The figures are computed from the service, never written in: "this week" is Monday
// to today, or the seven days ending today (the brief does not say which, so either
// reading passes); the streak is the run of days with a session ending yesterday or today
// (an app may count the session in progress today, so one more day is accepted).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchChrome } from "../../../tools/internal/chrome.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const APP = args.find((a) => !a.startsWith("--"));
if (!APP) { console.error("usage: drive.mjs <app-url> [--service=…] [--only=a,b] [--out=dir] [--headful]"); process.exit(2); }
const SERVICE = opt("service", "http://127.0.0.1:8320");
const ONLY = opt("only", "")?.split(",").filter(Boolean);
const OUT = opt("out", "/tmp/cadence-drive");
mkdirSync(OUT, { recursive: true });

const api = async (path, body, method = body === undefined ? "GET" : "POST") =>
  (await fetch(SERVICE + path, method === "GET" ? {} : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const writes = async () => (await api("/api/_log")).requests.filter((r) => r.method !== "GET");

// ── what the page should say, from the service ──────────────────────────────
const TODAY = "2026-08-05";
const day = (iso, d) => { const t = new Date(iso + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
const dur = (m) => m >= 60 ? (m % 60 === 0 ? [`${m / 60}h`, `${m / 60}h 0m`] : [`${Math.floor(m / 60)}h ${m % 60}m`]) : [`${m}m`];
async function expected() {
  const s = (await api("/api/sessions")).sessions;
  const dow = (new Date(TODAY + "T00:00:00Z").getUTCDay() + 6) % 7;   // Monday 0
  // either reading of "this week": Monday to today, or the seven days ending today
  const lines = (from) => {
    const week = s.filter((x) => x.date >= from && x.date <= TODAY);
    const mins = week.reduce((a, x) => a + x.minutes, 0);
    const n = week.length;
    return dur(mins).map((d) => `${n} session${n === 1 ? "" : "s"} · ${d}`);
  };
  const weekLines = [...new Set([...lines(day(TODAY, -dow)), ...lines(day(TODAY, -6))])];
  const days = new Set(s.map((x) => x.date));
  const run = (end) => { let k = 0; for (let d = end; days.has(d); d = day(d, -1)) k++; return k; };
  const base = days.has(TODAY) ? run(TODAY) : run(day(TODAY, -1));
  // the session in progress today may count as today's, one day more
  const streaks = [...new Set([base, days.has(TODAY) ? base : base + 1])].map((k) => k === 0 ? "no streak" : `${k} day${k === 1 ? "" : "s"}`);
  return { weekLines, streaks, last: s[0], sessions: s };
}

// ── the page, by role and name ──────────────────────────────────────────────
const FIELD_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton"]);
const ACTION_ROLES = new Set(["button", "link", "menuitem", "tab", "option", "radio", "checkbox", "switch", "row", "gridcell", "listitem", "cell", "treeitem", "menuitemradio", "togglebutton"]);
async function nodes(page) {
  const out = [];
  const walk = (n) => { out.push(n); for (const c of n.children ?? []) walk(c); };
  const root = await page.accessibility.snapshot({ interestingOnly: false });
  if (root) walk(root);
  return out;
}
async function find(page, test, { timeout = 6000, what = "an element" } = {}) {
  const until = Date.now() + timeout;
  for (;;) {
    const hit = (await nodes(page)).find(test);
    if (hit) {
      let h = await hit.elementHandle();
      if (h) h = (await h.evaluateHandle((e) => (e.nodeType === 1 ? e : e.parentElement))).asElement();
      if (h) return { node: hit, handle: h, again: () => find(page, test, { timeout, what }) };
    }
    if (Date.now() > until) throw new Error(`not found: ${what}`);
    await sleep(150);
  }
}
const named = (n, re) => typeof n.name === "string" && (typeof re === "string" ? n.name === re : re.test(n.name));
const button = (page, re, o = {}) => find(page, (n) => ACTION_ROLES.has(n.role) && named(n, re) && !n.disabled, { what: `a control named ${re}`, ...o });
const maybe = async (p) => { try { return await p; } catch { return null; } };
async function press(page, el) {
  if (el.again && !(await el.handle.evaluate((e) => e.isConnected).catch(() => false))) el = await el.again();
  await el.handle.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await el.handle.click();
}
const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
async function seeText(page, text, timeout = 6000) {
  const until = Date.now() + timeout;
  for (;;) {
    const t = await bodyText(page);
    const names = (await nodes(page)).map((n) => n.name ?? "").join(" | ").replace(/\s+/g, " ");
    const alts = Array.isArray(text) ? text : [text];
    if (alts.some((x) => typeof x === "string" ? t.includes(x) || names.includes(x) : x.test(t) || x.test(names))) return true;
    if (Date.now() > until) throw new Error(`never shown: ${alts.map(String).join(" or ")}`);
    await sleep(200);
  }
}
const open = async (page) => { await page.goto(APP, { waitUntil: "networkidle2" }); await sleep(800); };
const phone = (page) => page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
async function noSidewaysScroll(page, where) {
  const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  if (w.doc > w.win + 1) throw new Error(`${where}: the page scrolls sideways (${w.doc} wide in a ${w.win} window)`);
}

// ── the steps a person takes ────────────────────────────────────────────────
// the last session, as the app names it: its sport, duration or date
const SPORT_WORDS = { run: /run/i, ride: /ride|cycl|bike/i, lift: /lift|strength|weight|gym/i, swim: /swim/i };
async function openSession(page, s) {
  const words = [SPORT_WORDS[s.sport], new RegExp(dur(s.minutes).map((d) => d.replace(/ /g, "\\s*")).join("|"))];
  const ctl = await maybe(find(page, (n) => ACTION_ROLES.has(n.role) && words.every((re) => re.test(n.name ?? "")), { timeout: 4000 }))
    ?? await find(page, (n) => ACTION_ROLES.has(n.role) && words.some((re) => re.test(n.name ?? "")) && !/add|new|log/i.test(n.name ?? ""), { what: `the ${s.sport} session of ${s.date}`, timeout: 4000 });
  await press(page, ctl);
  await sleep(700);
}
async function addWithDefaults(page) {
  const add = await button(page, /^(\+|add|log|record|new)\b|add (a )?session|log (a )?session|new session|record (a )?session/i, { timeout: 8000 });
  await press(page, add);
  await sleep(700);
  const save = await button(page, /^(save|add|log|record|done|confirm)\b|save session|log it|add session|record session/i, { timeout: 6000 });
  await press(page, save);
  await sleep(1200);
}

// ── the scenarios ───────────────────────────────────────────────────────────
const SCENARIOS = {
  async today_desk(page) {
    const e = await expected();
    await open(page);
    await seeText(page, e.weekLines, 8000);
    await seeText(page, e.streaks, 4000);
  },
  async today_phone(page) {
    await phone(page);
    const e = await expected();
    await open(page);
    await seeText(page, e.weekLines, 8000);
    await seeText(page, e.streaks, 4000);
    await noSidewaysScroll(page, "Today on a phone");
  },
  async last_session_shown(page) {
    const e = await expected();
    await open(page);
    await seeText(page, dur(e.last.minutes), 6000);
    await seeText(page, SPORT_WORDS[e.last.sport], 2000);
  },
  async in_progress_running(page) {
    await open(page);
    await seeText(page, /in progress|running now|live|ongoing|now running|● ?run|recording/i, 8000);
  },
  async session_detail(page) {
    const e = await expected();
    await open(page);
    await openSession(page, e.last);
    await seeText(page, `${e.last.heartAvg} bpm`, 6000);
    await seeText(page, new RegExp(`effort\\D{0,12}${e.last.effort}\\b|\\b${e.last.effort}\\s*/\\s*10`, "i"), 3000);
  },
  async formats(page) {
    await open(page);
    await seeText(page, /\b\d{2,3} bpm\b/, 6000);
    await seeText(page, /\b\d+(\.\d)? km\b/, 6000);
    await seeText(page, /\b\d+h \d+m\b|\b\d+m\b/, 3000);
  },
  async add_desk(page) {
    await open(page);
    await addWithDefaults(page);
    const w = await writes();
    const post = w.find((r) => r.method === "POST" && r.path.startsWith("/api/sessions"));
    if (!post) throw new Error(`no session was sent (${w.map((r) => r.method + " " + r.path).join(", ") || "nothing written"})`);
    if (!post.body?.sport || !post.body?.date || !(post.body?.minutes > 0)) throw new Error(`the session sent lacks sport, date or minutes: ${JSON.stringify(post.body)}`);
    const e = await expected();
    await seeText(page, e.weekLines, 8000);
    await seeText(page, e.streaks, 4000);
  },
  async add_phone_no_keyboard(page) {
    await phone(page);
    await open(page);
    // only presses: the common case is confirming what is already there
    await addWithDefaults(page);
    const post = (await writes()).find((r) => r.method === "POST" && r.path.startsWith("/api/sessions"));
    if (!post) throw new Error("a session could not be recorded on a phone with presses alone");
    const e = await expected();
    await seeText(page, e.weekLines, 8000);
    await noSidewaysScroll(page, "after adding on a phone");
  },
  async delete_session(page) {
    const before = await expected();
    await open(page);
    await openSession(page, before.last);
    const del = await button(page, /delete|remove/i, { timeout: 6000 });
    await press(page, del);
    await sleep(500);
    // the confirmation: a dialog's button, or the same control asking again
    // ("Tap again to delete"), so the name is matched anywhere, not at its start
    const sure = await maybe(button(page, /\b(delete|remove|yes|confirm)\b/i, { timeout: 1500 }));
    if (sure) { await press(page, sure); await sleep(500); }
    const gone = (await writes()).find((r) => r.method === "DELETE" && r.path.includes(before.last.id));
    if (!gone) throw new Error(`the session ${before.last.id} was not deleted at the service`);
    const e = await expected();
    await maybe(button(page, /^(today|home|close|back|done)\b/i, { timeout: 800 }).then((b) => press(page, b)));
    await seeText(page, e.weekLines, 8000);
  },
};

// ── run ─────────────────────────────────────────────────────────────────────
const browser = await launchChrome({ headless: !args.includes("--headful"), args: ["--no-sandbox", "--mute-audio"] });
const results = [];
for (const [name, run] of Object.entries(SCENARIOS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  await api("/api/_reset", {});
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const t0 = Date.now();
  let error = null;
  try { await run(page); } catch (e) { error = e.message; }
  if (error) await page.screenshot({ path: join(OUT, `${name}.png`) }).catch(() => {});
  results.push({ name, pass: !error, error, ms: Date.now() - t0, requests: (await api("/api/_log")).requests.map((r) => `${r.method} ${r.path}`) });
  console.log(`${error ? "FAIL" : "pass"}  ${name}${error ? ` — ${error}` : ""}`);
  await ctx.close();
}
await browser.close();
await api("/api/_reset", {});
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
console.log(`${results.filter((r) => r.pass).length} of ${results.length} passed · ${OUT}/results.json`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
