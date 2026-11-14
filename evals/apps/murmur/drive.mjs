#!/usr/bin/env node
// drive.mjs — the hidden acceptance for murmur (the conversation app). It drives a built
// app the way a screen reader finds things — by role and accessible name, from the
// browser's own accessibility tree, and by the words on screen — and judges by what the
// app sent on its live feed (the page's WebSocket frames, watched from outside) and what
// the page then shows. It knows nothing about how the app is built.
//
//   node evals/apps/murmur/drive.mjs <app-url> [--service=http://127.0.0.1:8330]
//        [--only=a,b] [--out=dir] [--headful]
//
// The service must be this app's (api/server.mjs, the seeded schedule, at the size the
// run used: --scale=100). Each scenario is a fresh browser context, so a fresh feed and
// a fresh schedule; nothing the app sends is kept by the service. Arrivals the drive
// needs on cue go through the service's /inject.
//
// What it relies on: the conversations' names (a title, or the other person's name), the
// words of messages as the service gives them, and loose names for controls (send, photo,
// react, play, close). A conversation's history is reached to its first message by
// setting its scroller to the top, as dragging the thumb there does. The service's "sent"
// answer is held back 2 s inside the page, so "appears as sent, at once" means before it.
//
// Calibrated 2026-11-13 on runs 16 and 17 (15 of 15 each), and against run 17 broken
// on purpose: no unread words on a row, a send shown only on the service's answer —
// each failed its check.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchChrome } from "../../../tools/internal/chrome.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const APP = args.find((a) => !a.startsWith("--"));
if (!APP) { console.error("usage: drive.mjs <app-url> [--service=…] [--only=a,b] [--out=dir] [--headful]"); process.exit(2); }
const SERVICE = opt("service", "http://127.0.0.1:8330");
const ONLY = opt("only", "")?.split(",").filter(Boolean);
const OUT = opt("out", "/tmp/murmur-drive");
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const maybe = async (p) => { try { return await p; } catch { return null; } };

// ── the history, from the service ───────────────────────────────────────────
const H = await (await fetch(SERVICE + "/threads.json")).json();
const PEOPLE = Object.fromEntries(H.people.map((p) => [p.id, p.name]));
const T = Object.fromEntries(H.threads.map((t) => [t.id, t]));
// a conversation's name: its title, else the other person's name
const nameOf = (t) => t.title ?? t.participants.filter((p) => p !== H.me).map((p) => PEOPLE[p]).join(", ");
const firstName = (s) => s.split(/\s+/)[0];
const lastText = (t) => [...t.messages].reverse().find((m) => m.kind === "text").text;
const firstText = (t) => t.messages.find((m) => m.kind === "text").text;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const inject = (q) => fetch(`${SERVICE}/inject?${new URLSearchParams(q)}`).then((r) => r.json());

// ── the page, by role and name ──────────────────────────────────────────────
const ACTION_ROLES = new Set(["button", "link", "menuitem", "tab", "option", "radio", "checkbox", "switch", "row", "gridcell", "listitem", "cell", "treeitem", "menuitemradio", "togglebutton", "image", "img"]);
const FIELD_ROLES = new Set(["textbox", "searchbox", "combobox"]);
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
async function press(page, el) {
  if (el.again && !(await el.handle.evaluate((e) => e.isConnected).catch(() => false))) el = await el.again();
  await el.handle.evaluate((e) => e.scrollIntoView({ block: "nearest" }));
  await el.handle.click();
}
// the visible words: what is in the window, and what the tree names
const screenText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
async function seeText(page, text, timeout = 6000) {
  const alts = Array.isArray(text) ? text : [text];
  const until = Date.now() + timeout;
  for (;;) {
    const t = await screenText(page);
    const names = (await nodes(page)).map((n) => n.name ?? "").join(" | ").replace(/\s+/g, " ");
    if (alts.some((x) => typeof x === "string" ? t.includes(x) || names.includes(x) : x.test(t) || x.test(names))) return true;
    if (Date.now() > until) throw new Error(`never shown: ${alts.map(String).join(" or ").slice(0, 160)}`);
    await sleep(200);
  }
}
// where a phrase is drawn in the window, in a conversation — never the list's preview of
// it (a row that names a conversation, or a navigation landmark); the last such in
// document order
const PICK = `(text, exact) => {
  const rowish = "button, a, [role=button], [role=link], [role=option], [role=listitem], [role=row], [role=tab], li";
  const NAMES = ${JSON.stringify(H.threads.map(nameOf))};
  // a row of the conversation list: a pressable thing near it that also names a conversation
  const inListRow = (e) => {
    if (e.closest("nav, [role=navigation]")) return true;
    let a = e.parentElement;
    for (let i = 0; a && i < 5; i++, a = a.parentElement) {
      if (a.matches(rowish) && NAMES.some((n) => (a.textContent ?? "").includes(n) || (a.getAttribute("aria-label") ?? "").includes(n))) return true;
    }
    return false;
  };
  const e = [...document.querySelectorAll("body *")].filter((e) => {
    if (e.childElementCount !== 0 && ![...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) return false;
    const t = (e.textContent ?? "").trim();
    if (exact ? t !== text : !t.includes(text)) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && !inListRow(e);
  }).at(-1);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}`;
const whereIs = (page, text, exact = false) => page.evaluate(`(${PICK})(${JSON.stringify(text)}, ${exact})`);
const onScreen = async (page, text) => (await whereIs(page, text)) !== null;
// the words of messages in view: which of these texts are drawn in the window now, and where
async function visibleTexts(page, texts) {
  const out = [];
  const all = await page.evaluate(`(${JSON.stringify(texts)}).map((t) => [t, (${PICK})(t, true)])`);
  for (const [t, r] of all) if (r) out.push({ t, y: r.y });
  return out;
}
// the conversation's scroller: the scrolling element that holds the given words
const scrollerHandle = (page, text) => page.evaluateHandle((text) => {
  const hits = [...document.querySelectorAll("body *")].filter((x) => x.childElementCount === 0 && (x.textContent ?? "").includes(text));
  let e = hits.filter((x) => !x.closest("nav, [role=navigation]")).at(-1) ?? hits.at(-1);
  for (; e; e = e.parentElement) {
    const s = getComputedStyle(e);
    if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 20) return e;
  }
  return document.scrollingElement;
}, text);

const open = async (page) => { await page.goto(APP, { waitUntil: "networkidle2", timeout: 60000 }); await sleep(1200); };
const phone = (page) => page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
async function noSidewaysScroll(page, where) {
  const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  if (w.doc > w.win + 1) throw new Error(`${where}: the page scrolls sideways (${w.doc} wide in a ${w.win} window)`);
}
// the frames the app sends on its live feed
function watchFeed(page, cdp) {
  const sent = [];
  cdp.on("Network.webSocketFrameSent", (e) => { try { sent.push(JSON.parse(e.response.payloadData)); } catch {} });
  return sent;
}
async function waitFor(fn, timeout, what) {
  const until = Date.now() + timeout;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > until) throw new Error(what); await sleep(150); }
}

// ── the steps a person takes ────────────────────────────────────────────────
// a conversation in the list, by its name (or the other person's first name)
async function rowOf(page, t) {
  const full = nameOf(t);
  const re = new RegExp(esc(full) + (t.title ? "" : `|^${esc(firstName(full))}\\b`), "i");
  return find(page, (n) => ACTION_ROLES.has(n.role) && named(n, re), { what: `the conversation ${full}`, timeout: 8000 });
}
async function openThread(page, t) {
  await press(page, await rowOf(page, t));
  await seeText(page, lastText(t), 8000);
  await sleep(500);
}
async function back(page) {
  const b = await maybe(button(page, /^(back|conversations|chats|messages|inbox|all)\b|^‹|^←|^</i, { timeout: 1500 }));
  if (b) { await press(page, b); await sleep(600); }
}
const composer = (page) => find(page, (n) => FIELD_ROLES.has(n.role) && !n.disabled, { what: "the field to write a message", timeout: 6000 });
async function sendText(page, text) {
  const f = await composer(page);
  await press(page, f);
  await page.keyboard.type(text, { delay: 10 });
  const send = await maybe(button(page, /^send( message)?$|^send$/i, { timeout: 800 }));
  if (send) await press(page, send); else await page.keyboard.press("Enter");
}
// a conversation's scroller moved: to the top (the thumb dragged up) until its first
// message is reached, or by a fraction of its height
async function toFirst(page, t, timeout = 30000) {
  const want = firstText(t);
  const sc = await scrollerHandle(page, lastText(t));
  const until = Date.now() + timeout;
  for (;;) {
    await sc.evaluate((e) => { e.scrollTop = 0; e.dispatchEvent(new Event("scroll")); });
    await sleep(400);
    if (await onScreen(page, want)) return;
    if (Date.now() > until) throw new Error(`the first message ("${want.slice(0, 40)}") was never reached`);
  }
}
async function scrollBackBy(page, t, px) {
  const sc = await scrollerHandle(page, lastText(t));
  await sc.evaluate((e, px) => { e.scrollTop = Math.max(0, e.scrollTop - px); e.dispatchEvent(new Event("scroll")); }, px);
  await sleep(700);
}
// the texts of a thread a reader could be looking at, oldest last
const textsOf = (t, n = 400) => t.messages.filter((m) => m.kind === "text" && m.text.length > 8).slice(-n).map((m) => m.text);
// the order of conversations in the list, top to bottom, by where their names sit
async function listOrder(page) {
  const out = [];
  for (const t of H.threads) {
    const r = await maybe(rowOf(page, t));
    if (!r) continue;
    const box = await r.handle.boundingBox();
    if (box) out.push({ id: t.id, y: box.y });
  }
  return out.sort((a, b) => a.y - b.y).map((x) => x.id);
}
const byActivity = () => [...H.threads].sort((a, b) => b.messages.at(-1).at.localeCompare(a.messages.at(-1).at)).map((t) => t.id);

// ── the scenarios ───────────────────────────────────────────────────────────
const SCENARIOS = {
  // 1: every conversation is listed, by most recent activity
  async list_desk(page) {
    await open(page);
    for (const t of H.threads) await rowOf(page, t);
    const order = await listOrder(page);
    const want = byActivity();
    if (order.join() !== want.join()) throw new Error(`the list is in the order ${order.join(", ")}, not by latest activity (${want.join(", ")})`);
  },
  // 1: which have something new — a screen reader hears it on the row too
  async unread_marked(page) {
    await open(page);
    const unread = H.threads.filter((t) => t.messages.at(-1).id !== t.lastSeen);
    const read = H.threads.filter((t) => t.messages.at(-1).id === t.lastSeen);
    const says = async (t) => {
      const r = await rowOf(page, t);
      const text = await r.handle.evaluate((e) => (e.innerText ?? "") + " " + (e.getAttribute("aria-label") ?? "") + " " + (e.getAttribute("aria-description") ?? ""));
      return /unread|\bnew\b/i.test(r.node.name + " " + (r.node.description ?? "") + " " + text);
    };
    for (const t of unread) if (!(await says(t))) throw new Error(`${nameOf(t)} has unread messages, but its row does not say so (to a screen reader, or in words)`);
    for (const t of read) if (await says(t)) throw new Error(`${nameOf(t)} is read, but its row says it is unread`);
  },
  // the list stays in order as messages arrive, while it is looked at
  async list_reorders_live(page) {
    await open(page);
    // the schedule: t3 at 6.1 s, t6 at 12 s
    await sleep(13500);
    const order = await listOrder(page);
    if (order[0] !== "t6") throw new Error(`after a message arrived in ${nameOf(T.t6)}, the list's first is ${order[0] ? nameOf(T[order[0]]) : "nothing"} (order ${order.join(", ")})`);
    await seeText(page, /six hundred pages of WHAT though/, 2000).catch(() => {});
  },
  // 2: read back through the whole history, to its first message
  async read_to_first(page) {
    await open(page);
    await openThread(page, T.t4);
    await toFirst(page, T.t4);
    // and back to the latest
    const sc = await scrollerHandle(page, firstText(T.t4));
    for (let i = 0; i < 40 && !(await onScreen(page, lastText(T.t4))); i++) {
      await sc.evaluate((e) => { e.scrollTop = e.scrollHeight; e.dispatchEvent(new Event("scroll")); });
      await sleep(400);
    }
    if (!(await onScreen(page, lastText(T.t4)))) throw new Error("after the first message, the latest could not be reached again");
  },
  // 2: dates are apparent when reading back
  async dates_when_reading_back(page) {
    await open(page);
    await openThread(page, T.t4);
    await scrollBackBy(page, T.t4, 6000);
    const t = await screenText(page);
    if (!/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b|\b\d{1,2} (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}/i.test(t))
      throw new Error("reading back through history, no date is on screen");
  },
  // 3, and: returning to a conversation returns to where you were
  async return_to_place(page) {
    await open(page);
    await openThread(page, T.t4);
    await scrollBackBy(page, T.t4, 4000);
    const before = await visibleTexts(page, textsOf(T.t4));
    if (!before.length) throw new Error("after reading back, none of the conversation's words are in view");
    if (before.some((x) => x.t === lastText(T.t4))) throw new Error("reading back did not move away from the latest message");
    await back(page);
    await openThread(page, T.t2).catch(async () => { await press(page, await rowOf(page, T.t2)); });
    await sleep(600);
    await back(page);
    await press(page, await rowOf(page, T.t4));
    await sleep(1200);
    const after = await visibleTexts(page, before.map((x) => x.t));
    if (!after.length) throw new Error(`returning to ${nameOf(T.t4)} did not return to where the reader was (they read "${before[0].t.slice(0, 40)}")`);
  },
  // 4: text appears as sent, at once; the conversation answers
  async send_text(page, { sent }) {
    await open(page);
    await openThread(page, T.t2);
    const words = "drive check, the walk is on";
    await sendText(page, words);
    await waitFor(() => onScreen(page, words), 600, "what was sent did not appear at once");
    const frame = await waitFor(() => sent.find((f) => f.t === "send" && f.kind === "text" && f.text === words), 3000, "nothing was sent on the live feed");
    if (frame.thread !== "t2") throw new Error(`the text was sent to ${frame.thread}, not t2`);
    await seeText(page, /perfect|see you at eleven|ha, yes/, 6000);
  },
  // 5: send one of the offered photographs
  async send_photo(page, { sent }) {
    await open(page);
    await openThread(page, T.t5);
    const pick = await maybe(button(page, /(send|add|attach|choose|share|insert) (a )?(photo|picture|image)|^attach|camera|gallery/i, { timeout: 3000 }))
      ?? await button(page, /^(photo|picture|image)s?$|^\+$/i, { timeout: 2000 });
    await press(page, pick);
    await sleep(600);
    const alts = H.sendable.map((s) => esc(s.alt));
    const choice = await find(page, (n) => ACTION_ROLES.has(n.role) && named(n, new RegExp(alts.join("|"), "i")), { what: "one of the offered photographs", timeout: 5000 });
    await press(page, choice);
    await sleep(500);
    const confirm = await maybe(button(page, /^send\b|send photo/i, { timeout: 1000 }));
    if (confirm && !sent.some((f) => f.t === "send" && f.kind === "photo")) { await press(page, confirm); await sleep(500); }
    const frame = await waitFor(() => sent.find((f) => f.t === "send" && f.kind === "photo"), 3000, "no photograph was sent on the live feed");
    if (!H.sendable.some((s) => s.src === frame.src)) throw new Error(`the photo sent (${frame.src}) is not one the service offers`);
    if (frame.thread !== "t5") throw new Error(`the photo was sent to ${frame.thread}, not t5`);
  },
  // 6: react to a message — someone else's here
  async react(page, { sent }) {
    await open(page);
    await openThread(page, T.t3);
    const target = lastText(T.t3);
    // a reaction is offered by a control by the message (shown on hover), its context menu, or a hold
    const at = await whereIs(page, target, true);
    if (!at) throw new Error("the latest message is not on screen");
    const mid = [at.x + at.w / 2, at.y + at.h / 2];
    const MARK = /❤|👍|😂|😮|😢|🙏|🔥|👀|💀|love|like|laugh|heart|thumbs/i;
    const offered = () => maybe(button(page, MARK, { timeout: 800 }));
    await page.mouse.move(...mid); await sleep(400);
    const ctl = await maybe(button(page, /react|reaction/i, { timeout: 800 }));
    if (ctl) { await press(page, ctl); await sleep(500); }
    if (!(await offered())) { await page.mouse.click(...mid, { button: "right" }); await sleep(600); }
    if (!(await offered())) { await page.mouse.move(...mid); await page.mouse.down(); await sleep(800); await page.mouse.up(); await sleep(600); }
    const mark = await button(page, /❤|👍|😂|😮|😢|🙏|🔥|👀|💀|love|like|laugh|heart|thumbs/i, { timeout: 3000 });
    await press(page, mark);
    const frame = await waitFor(() => sent.find((f) => f.t === "react"), 3000, "no reaction was sent on the live feed");
    if (frame.thread !== "t3") throw new Error(`the reaction was sent to ${frame.thread}, not t3`);
  },
  // 7: listen to a voice message and move within it
  async voice(page) {
    await open(page);
    const t = H.threads.find((x) => x.messages.slice(-60).some((m) => m.kind === "voice"));
    if (!t) throw new Error("no recent voice message in the history");
    await openThread(page, t);
    const play = await button(page, /play/i, { timeout: 6000 });
    const durationShown = await page.evaluate(() => /\b\d{1,2}:\d{2}\b|\b\d+\s?s(ec)?\b/.test(document.body.innerText));
    if (!durationShown) throw new Error("no voice message's length is shown before it plays");
    await press(page, play);
    await waitFor(() => page.evaluate(() => [...new Set([...document.querySelectorAll("audio, video"), ...(window.__drivePlayed ?? [])])].some((a) => !a.paused && a.currentTime > 0.2)), 6000, "pressing play started no audio");
    // a point within it, chosen directly: the slider by keys, else a press along it
    const slider = await maybe(find(page, (n) => n.role === "slider", { timeout: 2000, what: "the voice scrubber" }));
    if (!slider) throw new Error("the voice message has no scrubber a screen reader or keyboard can reach");
    const before = await page.evaluate(() => Math.max(...[...new Set([...document.querySelectorAll("audio, video"), ...(window.__drivePlayed ?? [])])].map((a) => a.currentTime)));
    const box = await slider.handle.boundingBox();
    if (box) await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
    await sleep(500);
    const after = await page.evaluate(() => Math.max(...[...new Set([...document.querySelectorAll("audio, video"), ...(window.__drivePlayed ?? [])])].map((a) => a.currentTime)));
    if (!(after > before + 0.5)) {
      await slider.handle.focus().catch(() => {});
      for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
      await sleep(500);
      const keyed = await page.evaluate(() => Math.max(...[...new Set([...document.querySelectorAll("audio, video"), ...(window.__drivePlayed ?? [])])].map((a) => a.currentTime)));
      if (!(keyed > before + 0.5)) throw new Error(`choosing a point did not move the playback (${before.toFixed(1)} s → ${keyed.toFixed(1)} s)`);
    }
  },
  // 8: a photograph at full size, and back
  async photo_full_size(page) {
    await open(page);
    const t = H.threads.find((x) => x.messages.slice(-30).some((m) => m.kind === "photo"));
    await openThread(page, t);
    const ph = [...t.messages.slice(-30)].reverse().find((m) => m.kind === "photo");
    const el = await find(page, (n) => ACTION_ROLES.has(n.role) && (named(n, new RegExp(esc(ph.alt), "i")) || named(n, /photo|image|picture/i)), { what: "a photograph in the conversation", timeout: 6000 });
    const small = await el.handle.boundingBox();
    await press(page, el);
    await sleep(800);
    const big = await page.evaluate((src) => {
      const imgs = [...document.querySelectorAll("img, canvas, [style*=background]")].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
      return Math.max(0, ...imgs.map((r) => r.width * r.height));
    }, ph.src);
    if (small && big < small.width * small.height * 1.5) throw new Error("pressing the photograph showed nothing larger");
    await page.keyboard.press("Escape");
    await sleep(700);
    const closed = await page.evaluate((a) => [...document.querySelectorAll("img, canvas")].map((e) => e.getBoundingClientRect()).every((r) => r.width * r.height < a), big * 0.9);
    if (!closed) {
      const c = await button(page, /close|done|back|dismiss|×|✕/i, { timeout: 2000 });
      await press(page, c);
      await sleep(700);
    }
  },
  // arrival while reading back: the words stay put, and something says new is below
  async arrival_reading_back(page) {
    await open(page);
    await openThread(page, T.t4);
    await scrollBackBy(page, T.t4, 5000);
    const before = await visibleTexts(page, textsOf(T.t4));
    if (!before.length) throw new Error("after reading back, none of the conversation's words are in view");
    const anchor = before[Math.floor(before.length / 2)];
    const text = "drive: a new one below you";
    await inject({ thread: "t4", kind: "message", person: "p5", text });
    await sleep(1500);
    const now = (await visibleTexts(page, [anchor.t]))[0];
    if (!now) throw new Error("a message arriving below moved the words being read out of view");
    if (Math.abs(now.y - anchor.y) > 3) throw new Error(`a message arriving below moved the words being read by ${Math.round(now.y - anchor.y)} px`);
    if (await onScreen(page, text)) throw new Error("the new message was brought into view while the reader was reading back");
    await seeText(page, /\bnew\b|unread|↓|jump|latest|below/i, 2000).catch(() => { throw new Error("nothing says a new message is below"); });
  },
  // arrival at the latest: it comes into view
  async arrival_at_latest(page) {
    await open(page);
    await openThread(page, T.t2);
    const text = "drive: arriving at the bottom";
    await inject({ thread: "t2", kind: "message", person: "p2", text });
    await waitFor(() => onScreen(page, text), 3000, "a message arriving while the latest was in view did not come into view");
  },
  // a reaction that makes a message larger does not disturb what is being read
  async reaction_keeps_place(page) {
    await open(page);
    await openThread(page, T.t4);
    await scrollBackBy(page, T.t4, 300);
    const before = await visibleTexts(page, textsOf(T.t4, 60));
    if (!before.length) throw new Error("none of the conversation's words are in view");
    const anchor = before[0];
    await inject({ thread: "t4", kind: "reaction", back: "1", person: "p7", emoji: "🔥" });
    await sleep(1200);
    const now = (await visibleTexts(page, [anchor.t]))[0];
    if (!now || Math.abs(now.y - anchor.y) > 3) throw new Error(`a reaction arriving moved the words being read (${now ? Math.round(now.y - anchor.y) + " px" : "out of view"})`);
  },
  // the phone: the list, a conversation, the composer, nothing sideways
  async phone(page, { sent }) {
    await phone(page);
    await open(page);
    for (const t of H.threads) await rowOf(page, t);
    await noSidewaysScroll(page, "the list on a phone");
    await openThread(page, T.t2);
    await noSidewaysScroll(page, "a conversation on a phone");
    const words = "drive check from a phone";
    await sendText(page, words);
    await waitFor(() => onScreen(page, words), 800, "what was sent from the phone did not appear at once");
    await waitFor(() => sent.find((f) => f.t === "send" && f.text === words), 3000, "nothing was sent from the phone");
    await back(page);
    await rowOf(page, T.t3);
  },
};

// ── run ─────────────────────────────────────────────────────────────────────
const browser = await launchChrome({ headless: !args.includes("--headful"), args: ["--no-sandbox", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const results = [];
for (const [name, run] of Object.entries(SCENARIOS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const cdp = await page.createCDPSession();
  await cdp.send("Network.enable");
  const sent = watchFeed(page, cdp);
  // every media element the page plays, in the document or not (a player may keep its own);
  // and the service's answer to a send ("sent") held back 2 s, as a slow network would, so
  // what was sent must appear before the service says it arrived
  await page.evaluateOnNewDocument(() => {
    const WS = window.WebSocket;
    const late = (ev) => { try { return JSON.parse(ev.data).t === "sent"; } catch { return false; } };
    const hold = (fn, self) => function (ev) { if (late(ev)) setTimeout(() => fn.call(self, ev), 2000); else return fn.call(self, ev); };
    window.WebSocket = class extends WS {
      addEventListener(type, fn, o) { return super.addEventListener(type, type === "message" && typeof fn === "function" ? hold(fn, this) : fn, o); }
      set onmessage(fn) { super.onmessage = typeof fn === "function" ? hold(fn, this) : fn; }
      get onmessage() { return super.onmessage; }
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...a) { (window.__drivePlayed ??= []).push(this); return play.apply(this, a); };
  });
  const t0 = Date.now();
  let error = null;
  try { await run(page, { sent }); } catch (e) { error = e.message; }
  if (error) await page.screenshot({ path: join(OUT, `${name}.png`) }).catch(() => {});
  results.push({ name, pass: !error, error, ms: Date.now() - t0, sent: sent.map((f) => f.t + (f.kind ? ":" + f.kind : "")) });
  console.log(`${error ? "FAIL" : "pass"}  ${name}${error ? ` — ${error}` : ""}`);
  await ctx.close();
}
await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
console.log(`${results.filter((r) => r.pass).length} of ${results.length} passed · ${OUT}/results.json`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
