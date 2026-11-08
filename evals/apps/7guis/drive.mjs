#!/usr/bin/env node
// drive.mjs — the hidden acceptance for 7GUIs. It scores a program built from brief.md and knows
// nothing about how the program is built: it finds things in the browser's own accessibility
// tree by role and a loose name, acts with a real pointer and keyboard, and judges by what the
// page shows — its text, its accessibility tree, and, where the brief speaks of drawing and
// colour (circles, a field marked red), the pixels of a screenshot. The words it relies on are
// the ones the brief fixes: "Count", "Celsius", "Fahrenheit", "one-way flight", "return flight",
// "Book", "You have booked a one-way flight on …", "Reset", "Filter prefix", "Name", "Surname",
// "Create", "Update", "Delete", "Undo", "Redo", "Adjust diameter…", and a sheet's column letters
// A–Z and row numbers 0–99.
//
//   node evals/apps/7guis/drive.mjs <app-url> [--only=a,b] [--out=dir] [--headful]
//
// There is no service. Each scenario runs in a fresh browser context, opens the program, and goes
// to its task the program's own way (a link, tab or list item named for the task). A scenario's
// verdict is PASS or FAIL with a reason; what it had to fall back on to get there (a looser name,
// a keyboard route, a position read from visible headings) is recorded with it, and incidental
// observations go to NOTES. A FAIL that begins "accessibility:" is something a sighted mouse user
// can do that the accessibility tree doesn't expose.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchChrome } from "../../../tools/internal/chrome.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const APP = args.find((a) => !a.startsWith("--"));
if (!APP) { console.error("usage: drive.mjs <app-url> [--only=a,b] [--out=dir] [--headful]"); process.exit(2); }
const ONLY = opt("only", "")?.split(",").filter(Boolean);
const OUT = opt("out", "/tmp/7guis-drive");
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NOTES = new Set();
const FIND_MS = 8000;
const fail = (m) => { throw new Error(m); };

// ── the page, by role and name ──────────────────────────────────────────────
const ACTION_ROLES = new Set(["button", "link", "menuitem", "tab", "option", "radio", "checkbox", "switch", "row", "gridcell", "listitem", "cell", "treeitem", "menuitemradio", "menuitemcheckbox", "togglebutton", "img", "graphics-symbol", "PopUpButton", "combobox"]);
const FIELD_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton", "TextField", "slider", "date", "Date", "DateTime", "InputTime"]);
const TEXT_FIELD_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton", "TextField", "date", "Date", "DateTime"]);
// The whole tree, less the unnamed wrappers: puppeteer's "interesting only" prunes whatever sits
// inside a control and can't take focus — a listbox's options, a menu's items — which a person
// sees and chooses all the same. Each node keeps its parent, so "inside a link" can be asked.
const PLAIN = new Set(["generic", "none", "InlineTextBox", "LineBreak", "presentation", "paragraph", "group", "Section"]);
async function nodes(page) {
  const out = [];
  const walk = (n, parent) => {
    n.parent = parent;
    if (!(PLAIN.has(n.role) && !n.name) && n.role !== "InlineTextBox") out.push(n);
    for (const c of n.children ?? []) walk(c, n);
  };
  const root = await page.accessibility.snapshot({ interestingOnly: false });
  if (root) walk(root, null);
  return out;
}
const ancestors = (n) => { const a = []; for (let p = n.parent; p; p = p.parent) a.push(p); return a; };
const inside = (n, roles) => ancestors(n).some((a) => roles.includes(a.role));
// A node's own words: its name, its value, and the names of what it holds.
const textOf = (n) => [n.name, typeof n.value === "string" || typeof n.value === "number" ? n.value : "", ...(n.children ?? []).map(textOf)].filter((x) => x !== "" && x !== undefined && x !== null).join(" ");
async function elementOf(n) {
  let h = await n.elementHandle().catch(() => null);
  if (h) h = (await h.evaluateHandle((e) => (e.nodeType === 1 ? e : e.parentElement))).asElement();
  return h;
}
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
// the same, enabled or not: for asking whether it is enabled
const controlAny = (page, re, o = {}) => find(page, (n) => ACTION_ROLES.has(n.role) && named(n, re), { what: `a control named ${re}`, ...o });
const field = (page, re, o = {}) => find(page, (n) => FIELD_ROLES.has(n.role) && named(n, re) && !n.disabled, { what: `a field named ${re}`, ...o });
const fieldAny = (page, re, o = {}) => find(page, (n) => FIELD_ROLES.has(n.role) && named(n, re), { what: `a field named ${re}`, ...o });
const maybe = async (p) => { try { return await p; } catch { return null; } };
async function controlOr(page, ctx, strict, loose, o = {}) {
  const hit = await maybe(control(page, strict, { timeout: loose ? 2500 : FIND_MS, ...o }));
  if (hit || !loose) return hit ?? control(page, strict, { timeout: 1, ...o });
  const l = await control(page, loose, o);
  ctx.fallback(`found "${l.node.name}" by the looser name ${loose} (nothing named ${strict})`);
  return l;
}
async function centre(el) {
  await el.handle.evaluate((e) => e.scrollIntoView({ block: "nearest", inline: "nearest" })).catch(() => {});
  await sleep(40);
  const b = await el.handle.boundingBox();
  return b && { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
}
async function press(page, el) {
  const c = await centre(el);
  if (!c) { await el.handle.click(); return; }
  await page.mouse.click(c.x, c.y);
}
async function focusIn(el, timeout = 1500) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await el.handle.evaluate((e) => { const a = document.activeElement; return !!a && (a === e || e.contains(a) || a.contains(e)); }).catch(() => false)) return true;
    await sleep(50);
  }
  return false;
}
// Keyboard focus the way a person gives it: Tab (then Shift-Tab) until the element has it.
async function tabTo(page, ctx, el, max = 40) {
  const has = () => el.handle.evaluate((e) => { const a = document.activeElement; return !!a && (a === e || e.contains(a)); }).catch(() => false);
  if (await has()) return;
  for (const shift of [false, true]) {
    for (let i = 0; i < max; i++) {
      if (shift) await page.keyboard.down("Shift");
      await page.keyboard.press("Tab");
      if (shift) await page.keyboard.up("Shift");
      if (await has()) return;
    }
  }
  ctx.fallback(`Tab never reached "${el.node.name}"; focused it directly`);
  await el.handle.focus();
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
  if (text === "") await page.keyboard.press("Backspace");
  else await page.keyboard.type(text, { delay: 15 });
  if (enter) await page.keyboard.press("Enter");
  return el;
}
const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
const allText = async (page) => `${await bodyText(page)} | ${(await nodes(page)).map((n) => `${n.name ?? ""} ${n.value ?? ""}`).join(" | ")}`;
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
// What a field holds now (read again from the tree, so it is what is shown).
async function valueOf(page, test) {
  const n = (await nodes(page)).find(test);
  if (!n) return null;
  if (n.value !== undefined && n.value !== null && n.value !== "") return String(n.value);
  const h = await elementOf(n);
  return h ? String(await h.evaluate((e) => e.value ?? e.innerText ?? "")).trim() : "";
}
const fieldTest = (re) => (n) => FIELD_ROLES.has(n.role) && named(n, re);
// A condition that should hold soon; the last value seen is given to the failure.
async function until(test, what, timeout = 3000) {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    try { last = await test(); if (last && last.ok !== false) return last; } catch (e) { last = e.message; }
    if (Date.now() > end) throw new Error(`${what}${last !== undefined ? ` (last seen: ${typeof last === "object" ? JSON.stringify(last.seen ?? last) : last})` : ""}`);
    await sleep(100);
  }
}
const num = (s) => { const m = /[−-]?\d+(?:\.\d+)?/.exec(String(s ?? "").replace("−", "-")); return m ? Number(m[0].replace("−", "-")) : null; };

// ── pixels ──────────────────────────────────────────────────────────────────
// A screenshot of a box, decoded in a blank page of the drive's own; px(x, y) in page coordinates.
let DECODER = null;
async function grab(page, box) {
  const clip = { x: Math.max(0, Math.floor(box.x)), y: Math.max(0, Math.floor(box.y)), width: Math.ceil(box.width), height: Math.ceil(box.height) };
  const b64 = await page.screenshot({ clip, encoding: "base64" });
  const raw = await DECODER.evaluate(async (b64) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let s = ""; for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
    return { w: c.width, h: c.height, b: btoa(s) };
  }, b64);
  const data = Buffer.from(raw.b, "base64");
  const scale = raw.w / clip.width;
  return {
    clip,
    px(x, y) {
      const ix = Math.round((x - clip.x) * scale), iy = Math.round((y - clip.y) * scale);
      if (ix < 0 || iy < 0 || ix >= raw.w || iy >= raw.h) return null;
      const i = (iy * raw.w + ix) * 4; return [data[i], data[i + 1], data[i + 2]];
    },
    each(f) { for (let iy = 0; iy < raw.h; iy++) for (let ix = 0; ix < raw.w; ix++) { const i = (iy * raw.w + ix) * 4; f(data[i], data[i + 1], data[i + 2]); } },
  };
}
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
const rgb = (p) => p ? `rgb(${p.join(",")})` : "nothing";
const reddish = (r, g, b) => r > 120 && r - Math.max(g, b) > 50;
async function redCount(page, el) {
  const b = await el.handle.boundingBox();
  const img = await grab(page, { x: b.x - 4, y: b.y - 4, width: b.width + 8, height: b.height + 8 });
  let n = 0; img.each((r, g, bl) => { if (reddish(r, g, bl)) n++; });
  return n;
}

// ── going places ────────────────────────────────────────────────────────────
const TASKS = {
  counter: ["Counter", /\bcounter\b/i],
  temperature: ["Temperature Converter", /\btemperature\b|\bconverter\b/i],
  flight: ["Flight Booker", /\bflight\b|\bbooker\b/i],
  timer: ["Timer", /\btimer\b/i],
  crud: ["CRUD", /\bcrud\b/i],
  circles: ["Circle Drawer", /\bcircles?\b|\bdrawer\b/i],
  cells: ["Cells", /\bcells\b|spreadsheet/i],
};
const NAV_ROLES = ["link", "tab", "button", "menuitem", "option", "listitem", "treeitem", "radio"];
async function open(page, ctx, task) {
  await page.goto(APP, { waitUntil: "networkidle2", timeout: 30000 });
  const [title, loose] = TASKS[task];
  // the task's own name, perhaps numbered ("5 CRUD", "5. CRUD")
  const strict = new RegExp(`^(\\d+[.):]?\\s*)?${title}$`, "i");
  let nav = await maybe(find(page, (n) => NAV_ROLES.includes(n.role) && named(n, strict), { timeout: 12000 }));
  if (!nav) {
    nav = await maybe(find(page, (n) => NAV_ROLES.includes(n.role) && named(n, loose), { timeout: 2000 }));
    if (nav) ctx.fallback(`went to ${title} by "${nav.node.name}" (${nav.node.role}), a looser name`);
  }
  if (nav) {
    await press(page, nav);
    await sleep(500);
    ctx.observed.via = `${nav.node.role} "${nav.node.name}"`;
  } else {
    ctx.fallback(`no link, tab or list item named for ${title}; looked for the task on the page as it opened`);
  }
}

// ── the Circle Drawer's canvas, read in pixels ──────────────────────────────
async function circleKit(page, ctx) {
  const undo = () => controlAny(page, /^undo\b/i), redo = () => controlAny(page, /^redo\b/i);
  const u0 = await undo(), r0 = await redo();
  // the canvas: named for itself, else the area right below Undo
  let canvas = await maybe(find(page, (n) => ["img", "graphics-document", "application", "group", "figure", "canvas", "Canvas", "region"].includes(n.role) && named(n, /canvas|drawing|circles?/i), { timeout: 2500 }));
  if (!canvas) {
    const ub = await u0.handle.boundingBox();
    const h = await page.evaluateHandle((y) => {
      let best = null;
      for (const e of document.elementsFromPoint(innerWidth / 2, y)) { const r = e.getBoundingClientRect(); if (r.width > 200 && r.height > 150 && (!best || r.height * r.width < best.getBoundingClientRect().width * best.getBoundingClientRect().height)) best = e; }
      return best;
    }, ub.y + ub.height + 120);
    canvas = { node: { name: "(the area below Undo)" }, handle: h.asElement() };
    if (!canvas.handle) fail("accessibility: no canvas in the tree, and nothing large below Undo");
    ctx.fallback("no canvas named in the tree; used the largest area below Undo");
  }
  const cb = await canvas.handle.boundingBox();
  ctx.observed.canvas = [cb.x, cb.y, cb.width, cb.height].map(Math.round);
  const shot = () => grab(page, cb);
  const E = { x: cb.x + 12, y: cb.y + cb.height - 12 };   // an empty spot, far from the circles
  await page.mouse.move(E.x, E.y);
  await sleep(150);
  const bg = (await shot()).px(cb.x + cb.width / 2, cb.y + cb.height / 2);
  const nonbg = (p) => p && dist(p, bg) > 45;
  const grey = (p) => p && nonbg(p) && Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]) < 24;
  // the radius from a centre: the first background pixel after the circle's own pixels, along
  // the given directions (away from other circles), the median of them
  const radius = async (c, dirs = [[-1, 0], [0, -1], [0, 1]], img = null) => {
    img ??= await shot();
    const rs = [];
    for (const [dx, dy] of dirs) {
      let seen = false;
      for (let t = 1; t < 260; t++) {
        const p = img.px(c.x + dx * t, c.y + dy * t);
        if (!p) break;
        if (nonbg(p)) seen = true; else if (seen) { rs.push(t - 0.5); break; }
      }
    }
    rs.sort((a, b) => a - b);
    return rs.length ? rs[Math.floor(rs.length / 2)] : null;
  };
  const there = async (c, r, dirs = [[1, 0], [0, -1], [0, 1]]) => { const img = await shot(); return dirs.some(([dx, dy]) => { for (let t = Math.max(1, r - 4); t < r + 4; t++) if (nonbg(img.px(c.x + dx * t, c.y + dy * t))) return true; return false; }); };
  const fillAt = async (p) => (await shot()).px(p.x, p.y);
  if (!u0.node.disabled) NOTES.add("circles: Undo is enabled with nothing to undo");
  if (!r0.node.disabled) NOTES.add("circles: Redo is enabled with nothing to redo");

  return { undo, redo, u0, r0, cb, shot, E, bg, nonbg, grey, radius, there, fillAt };
}

// ── the scenarios ───────────────────────────────────────────────────────────
const SCENARIOS = {
  // 1. Counter: a read-only field showing 0; each press of "Count" adds one.
  async counter(page, ctx) {
    await open(page, ctx, "counter");
    const count = await control(page, /^count$/i).catch(() => controlOr(page, ctx, /^count$/i, /\bcount\b/i));
    // the field: the thing that reads 0 and isn't the navigation — a read-only text field
    // first, else a status or output, else plain text
    const shows = (n) => !inside(n, ["link", "tab", "button", "listitem", "menuitem", "option"]) && n.role !== "button" && num(n.value ?? n.name) === 0 && /^\D{0,12}0$/.test(String(n.value ?? n.name).trim());
    const all = (await nodes(page)).filter(shows);
    const pick = all.find((n) => TEXT_FIELD_ROLES.has(n.role)) ?? all.find((n) => ["status", "output", "log", "note"].includes(n.role)) ?? all.find((n) => n.role === "StaticText");
    if (!pick) fail(`nothing on the page reads 0 beside "Count" (a count that starts at 0)`);
    const el = { node: pick, handle: await elementOf(pick) };
    ctx.observed.field = `${pick.role} "${pick.name ?? ""}"${pick.value !== undefined ? ` value ${pick.value}` : ""}`;
    if (!TEXT_FIELD_ROLES.has(pick.role)) NOTES.add(`counter: the count is exposed as ${pick.role}, not a read-only text field`);
    else if (!pick.readonly) {
      // read-only: typing into it changes nothing
      await typeIn(page, el, "7");
      await page.keyboard.press("Tab");
      const v = await el.handle.evaluate((e) => e.value ?? e.innerText);
      if (/7/.test(v)) fail(`the count field takes typing (it reads "${v}" after typing 7); the brief's field is read-only`);
    }
    const read = async () => num(await el.handle.evaluate((e) => e.value ?? e.getAttribute("aria-label") ?? e.innerText));
    for (let i = 1; i <= 3; i++) {
      await press(page, count);
      await until(async () => ({ ok: (await read()) === i, seen: await read() }), `after ${i} press(es) of Count the field doesn't read ${i}`, 2000);
    }
  },

  // 2. Temperature Converter: both empty; typing in either updates the other at once, by the
  //    formulas; text that isn't a number leaves the other unchanged.
  async temperature(page, ctx) {
    await open(page, ctx, "temperature");
    const C = /celsius|°\s*c\b/i, F = /fahrenheit|°\s*f\b/i;
    const c = await field(page, C), f = await field(page, F);
    const cv = () => valueOf(page, fieldTest(C)), fv = () => valueOf(page, fieldTest(F));
    if ((await cv()) || (await fv())) fail(`the fields don't start empty: Celsius "${await cv()}", Fahrenheit "${await fv()}"`);
    const close = (s, want) => { const n = num(s); return n !== null && Math.abs(n - want) <= 0.05 + Math.abs(want) * 0.001; };
    const typed = async (el, text, other, want, what) => {
      await typeIn(page, el, text);
      // at once: no Enter, no leaving the field
      const ok = await maybe(until(async () => ({ ok: close(await other(), want), seen: await other() }), "", 1500));
      if (!ok) {
        const seenNow = await other();
        await page.keyboard.press("Tab");
        await sleep(300);
        if (close(await other(), want)) fail(`${what}: typing "${text}" updated the other field only on leaving it (it read "${seenNow}" while typing), not at once`);
        fail(`${what}: typing "${text}" shows "${await other()}" in the other field, not ${want}`);
      }
      ctx.observed[what] = `${text} → ${await other()}`;
    };
    await typed(c, "100", fv, 212, "C→F");
    await typed(c, "-40", fv, -40, "C→F (negative)");
    await typed(c, "37", fv, 98.6, "C→F (decimal)");
    await typed(f, "212", cv, 100, "F→C");
    await typed(f, "50", cv, 10, "F→C (2)");
    // not a number: the other field keeps what it had (texts with no number as a prefix either,
    // since each keystroke is a change)
    const before = await fv();
    await typeIn(page, c, "abc");
    await sleep(800);
    if ((await fv()) !== before) fail(`typing "abc" into Celsius changed Fahrenheit from "${before}" to "${await fv()}"`);
    await typeIn(page, c, "20");
    await until(async () => ({ ok: close(await fv(), 68), seen: await fv() }), 'typing "20" into Celsius doesn\'t show 68 in Fahrenheit', 1500);
    const beforeC = await cv();
    await typeIn(page, f, "x12");
    await sleep(800);
    if ((await cv()) !== beforeC) fail(`typing "x12" into Fahrenheit changed Celsius from "${beforeC}" to "${await cv()}"`);
    ctx.observed.notANumber = `C "abc" left F "${before}"; F "x12" left C "${beforeC}"`;
  },

  // 3. Flight Booker: one-way at the start, both dates the same, the return date not editable;
  //    the return date editable for a return flight; a return before the start disables Book; a
  //    date that isn't one is marked and disables Book; Book says what was booked.
  async flight(page, ctx) {
    await open(page, ctx, "flight");
    const DATE_ROLES = new Set([...TEXT_FIELD_ROLES]);
    const isDateField = (n) => DATE_ROLES.has(n.role) && !/flight|kind|type/i.test(n.name ?? "");
    const START = /start|depart|outbound|leav|^from\b|first/i, BACK = /return|back|inbound|^to\b|second/i;
    let startT = (n) => isDateField(n) && named(n, START) && !named(n, /return/i), backT = (n) => isDateField(n) && named(n, BACK);
    if (!(await maybe(find(page, startT, { timeout: 4000 }))) || !(await maybe(find(page, backT, { timeout: 1000 })))) {
      // fields not named for what they hold: the first and second date fields, in reading order
      const ds = (await nodes(page)).filter(isDateField);
      if (ds.length < 2) fail(`accessibility: no two date fields (found ${ds.map((n) => `${n.role} "${n.name}"`).join(", ") || "none"})`);
      const [a, b] = ds;
      startT = (n) => n === a || (isDateField(n) && n.name === a.name && n.value === a.value);
      backT = (n) => n === b || (isDateField(n) && n.name === b.name);
      ctx.fallback(`the date fields aren't named start/return; took the first ("${a.name}") and second ("${b.name}")`);
      NOTES.add(`flight: date fields named "${a.name}" and "${b.name}", not for start and return`);
    }
    const getStart = () => find(page, startT, { what: "the start date field" });
    const getBack = () => find(page, backT, { what: "the return date field" });
    const startV = () => valueOf(page, startT), backV = () => valueOf(page, backT);
    const book = () => controlAny(page, /^book\b/i);
    const bookEnabled = async () => !(await book()).node.disabled;

    // the kind of flight: a radio, option or tab named for it, else a pop-up / combo naming the
    // current choice, opened and chosen from
    const KIND = /one-?way flight|return flight/i;
    const kindNow = async () => {
      const ns = await nodes(page);
      const radio = ns.find((n) => ["radio", "menuitemradio", "option", "tab", "togglebutton"].includes(n.role) && named(n, KIND) && (n.checked === true || n.checked === "true" || n.selected || n.pressed === true || n.pressed === "true"));
      if (radio) return /return/i.test(radio.name) ? "return" : "one-way";
      const pop = ns.find((n) => ["combobox", "button", "PopUpButton", "listbox"].includes(n.role) && KIND.test(textOf(n)));
      if (pop) { const t = textOf(pop); const m = /one-?way flight|return flight/i.exec(t.replace(/^.*?(?=one-?way flight|return flight)/i, "")); return m && /return/i.test(m[0]) ? "return" : "one-way"; }
      return null;
    };
    const chooseKind = async (want) => {
      const wantRe = want === "return" ? /^return flight$/i : /^one-?way flight$/i;
      const direct = await maybe(find(page, (n) => ["radio", "menuitemradio", "tab", "togglebutton"].includes(n.role) && named(n, wantRe) && !n.disabled, { timeout: 800 }));
      if (direct) { await press(page, direct); return; }
      const pop = await find(page, (n) => ["combobox", "button", "PopUpButton"].includes(n.role) && KIND.test(textOf(n)) && !n.disabled, { what: 'a control showing "one-way flight" or "return flight"' });
      ctx.observed.kindControl = `${pop.node.role} "${pop.node.name}" showing "${textOf(pop.node)}"`;
      if (!KIND.test(pop.node.name ?? "")) NOTES.add(`flight: the kind-of-flight control is named "${pop.node.name}"; the choice it shows is in its text, not its name`);
      await press(page, pop);
      const opt = await maybe(find(page, (n) => ["option", "menuitem", "menuitemradio", "menuitemcheckbox", "radio", "listitem"].includes(n.role) && named(n, new RegExp(wantRe.source.replace(/[$^]/g, ""), "i")) && !n.disabled, { timeout: 2500 }));
      if (opt) { await press(page, opt); await sleep(250); return; }
      // a native select: its list isn't in the page; chosen with the keyboard
      ctx.fallback(`no "${want} flight" option to click after opening "${pop.node.name}"; chose it with the arrow keys`);
      await page.keyboard.press("Escape");
      await pop.handle.focus();
      for (let i = 0; i < 4 && (await kindNow()) !== want; i++) await page.keyboard.press(want === "return" ? "ArrowDown" : "ArrowUp");
      await page.keyboard.press("Enter");
      await sleep(250);
    };

    // the start
    const k0 = await kindNow();
    if (k0 !== "one-way") fail(k0 ? `the flight starts as "${k0}", not one-way` : 'accessibility: no control shows the choice "one-way flight" / "return flight"');
    const s0 = await startV(), b0 = await backV();
    ctx.observed.start = { kind: k0, startDate: s0, returnDate: b0 };
    if (!s0 || s0 !== b0) fail(`at the start the dates differ: start "${s0}", return "${b0}"`);
    const backEditable = async () => {
      const b = await getBack();
      if (b.node.disabled || b.node.readonly) return false;
      // not exposed as disabled: does it take typing?
      const was = await backV();
      await typeIn(page, b, "1");
      await sleep(200);
      const now = await backV();
      if (now !== was) { await typeIn(page, b, was); await page.keyboard.press("Tab"); return true; }
      NOTES.add("flight: the return date takes no typing but isn't exposed as disabled or read-only");
      return "silent";
    };
    const e0 = await backEditable();
    if (e0 === true) fail("for a one-way flight the return date can be edited");
    if (e0 === "silent") fail("accessibility: the return date can't be edited for a one-way flight, but the tree doesn't say so (not disabled, not read-only)");

    // the date format, from the date the fields hold: day.month.year, ISO, month/day/year …
    const parse = (s, fmt) => {
      const m = fmt.re.exec(String(s ?? "").trim());
      if (!m) return null;
      const g = m.groups, y = Number(g.y), mo = Number(g.m), d = Number(g.d);
      const t = new Date(Date.UTC(y, mo - 1, d));
      return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? t : null;
    };
    const p2 = (n) => String(n).padStart(2, "0");
    const FORMATS = [
      { name: "DD.MM.YYYY", re: /^(?<d>\d{1,2})\.(?<m>\d{1,2})\.(?<y>\d{4})$/, out: (t) => `${p2(t.getUTCDate())}.${p2(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}` },
      { name: "YYYY-MM-DD", re: /^(?<y>\d{4})-(?<m>\d{1,2})-(?<d>\d{1,2})$/, out: (t) => t.toISOString().slice(0, 10) },
      { name: "MM/DD/YYYY", re: /^(?<m>\d{1,2})\/(?<d>\d{1,2})\/(?<y>\d{4})$/, out: (t) => `${p2(t.getUTCMonth() + 1)}/${p2(t.getUTCDate())}/${t.getUTCFullYear()}` },
      { name: "DD/MM/YYYY", re: /^(?<d>\d{1,2})\/(?<m>\d{1,2})\/(?<y>\d{4})$/, out: (t) => `${p2(t.getUTCDate())}/${p2(t.getUTCMonth() + 1)}/${t.getUTCFullYear()}` },
      { name: "DD-MM-YYYY", re: /^(?<d>\d{1,2})-(?<m>\d{1,2})-(?<y>\d{4})$/, out: (t) => `${p2(t.getUTCDate())}-${p2(t.getUTCMonth() + 1)}-${t.getUTCFullYear()}` },
    ];
    const now = new Date(), today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const fits = FORMATS.filter((f) => parse(s0, f));
    let fmt = fits.find((f) => +parse(s0, f) === +today) ?? fits[0];
    if (!fmt) fail(`the start date "${s0}" is in no format the drive reads (D.M.Y, Y-M-D, M/D/Y, D/M/Y)`);
    if (fits.length > 1 && +parse(s0, fmt) !== +today) ctx.fallback(`"${s0}" reads as several formats; guessed ${fmt.name}`);
    ctx.observed.format = fmt.name;
    const base = parse(s0, fmt);
    const day = (n) => new Date(+base + n * 86400000);
    const setDate = async (getEl, t) => { await typeIn(page, await getEl(), typeof t === "string" ? t : fmt.out(t)); await page.keyboard.press("Tab"); await sleep(250); };
    const sameDay = (text, t) => FORMATS.some((f) => { const x = parse(text, f); return x && +x === +t; });
    const dismiss = async () => {
      await page.keyboard.press("Escape");
      await sleep(250);
      const ok = await maybe(control(page, /^(ok|close|done|dismiss|got it)$/i, { timeout: 500 }));
      if (ok) { await press(page, ok); await sleep(250); }
    };
    // Book's words: "You have booked a one-way flight on <date>"
    const DATE_TOKEN = /\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/g;
    const booked = async (kind, dates) => {
      if (!(await bookEnabled())) fail(`Book is disabled for a valid ${kind} flight (${dates.map((d) => fmt.out(d)).join(" – ")})`);
      await press(page, await book());
      const re = new RegExp(`You have booked an? ${kind === "return" ? "return" : "one-?way"} flight[^|]{0,120}`, "i");
      const m = await maybe(seeText(page, re, 4000));
      if (!m) {
        const t = await allText(page);
        const near = /[^|]{0,40}\bbooked\b[^|]{0,80}/i.exec(t);
        fail(`Book doesn't say "You have booked a ${kind} flight on …"${near ? ` (it says "${near[0].trim()}")` : ""}`);
      }
      const said = m[0];
      const tokens = said.match(DATE_TOKEN) ?? [];
      for (const d of dates) if (!tokens.some((x) => sameDay(x, d))) fail(`Book says "${said.trim()}", without the date ${fmt.out(d)}`);
      if (!said.includes(`on ${fmt.out(dates[0])}`)) NOTES.add(`flight: Book's words "${said.trim().slice(0, 90)}" write the date unlike the field (${fmt.out(dates[0])})`);
      ctx.observed[`booked ${kind}${ctx.observed[`booked ${kind}`] ? " (again)" : ""}`] = said.trim().slice(0, 120);
      await dismiss();
    };
    await booked("one-way", [base]);

    // a return flight: the return date editable
    await chooseKind("return");
    if ((await kindNow()) !== "return") fail("choosing return flight did not take");
    if ((await backEditable()) !== true) fail("for a return flight the return date can't be edited");
    // a return before the start disables Book
    await setDate(getStart, day(6));
    await setDate(getBack, day(3));
    if (await bookEnabled()) fail(`with return ${fmt.out(day(3))} before start ${fmt.out(day(6))}, Book is enabled`);
    // the same day is allowed (only strictly before disables)
    await setDate(getBack, day(6));
    if (!(await bookEnabled())) fail(`with return on the start day (${fmt.out(day(6))}), Book is disabled; only a return strictly before disables it`);
    await setDate(getBack, day(13));
    await booked("return", [day(6), day(13)]);

    // a date that isn't one: marked (red, or invalid to assistive technology) and Book disabled
    const marked = async (getEl, label) => {
      const el = await getEl();
      const red0 = await redCount(page, el);
      const good = label === "start" ? await startV() : await backV();
      let bad = "not a date";
      await typeIn(page, el, bad);
      await sleep(250);
      let v = label === "start" ? await startV() : await backV();
      if (v === good || !/not/.test(v ?? "")) {
        // a field that takes no letters: an impossible date in its own format
        bad = fmt.name.startsWith("DD") ? fmt.out(new Date(Date.UTC(base.getUTCFullYear() + 1, 1, 28))).replace(/^28/, "31") : fmt.name.startsWith("MM") ? fmt.out(new Date(Date.UTC(base.getUTCFullYear() + 1, 1, 28))).replace(/\/28\//, "/31/") : `${base.getUTCFullYear() + 1}-02-31`;
        ctx.fallback(`the ${label} date field took no letters; typed the impossible date ${bad}`);
        await typeIn(page, el, bad);
        await sleep(250);
      }
      await page.keyboard.press("Tab");
      await sleep(300);
      const n = (await nodes(page)).find(label === "start" ? startT : backT);
      const aria = n && (n.invalid === true || (typeof n.invalid === "string" && n.invalid !== "false"));
      const red1 = await redCount(page, await getEl());
      const b = await (label === "start" ? getStart() : getBack()).then((x) => x.handle.boundingBox());
      const grew = red1 - red0 > Math.max(12, (b.width + b.height) * 0.25);
      ctx.observed[`${label} "${bad}"`] = `aria-invalid ${aria ? "yes" : "no"}; red pixels ${red0} → ${red1}`;
      if (!aria && !grew) fail(`the ${label} date "${bad}" isn't marked: not invalid to assistive technology, and no red appears (red pixels ${red0} → ${red1})`);
      if (!aria) NOTES.add(`flight: the bad ${label} date is marked only in colour, not exposed as invalid (aria-invalid)`);
      if (await bookEnabled()) fail(`with the ${label} date "${bad}", Book is enabled`);
      await setDate(getEl, good);
      if (!(await bookEnabled())) fail(`with the ${label} date put back to ${good}, Book stays disabled`);
    };
    await marked(getStart, "start");
    await marked(getBack, "return");

    // back to one-way: the return date not editable again
    await chooseKind("one-way");
    if ((await kindNow()) !== "one-way") fail("choosing one-way flight again did not take");
    const e2 = await backEditable();
    if (e2 === true) fail("back on one-way, the return date can still be edited");
    await booked("one-way", [day(6)]);
  },

  // 4. Timer: a gauge, a label in seconds with one decimal, a duration slider, Reset. The timer
  //    runs while e < d and stops at d with the gauge full; the slider changes d at once (while it
  //    is dragged too); raising d resumes; Reset zeroes e.
  async timer(page, ctx) {
    await open(page, ctx, "timer");
    const reset = await control(page, /^reset\b/i);
    const gaugeT = (n) => ["progressbar", "meter"].includes(n.role);
    const gauge = await maybe(find(page, gaugeT, { timeout: 4000 }));
    if (!gauge) fail("accessibility: no progress bar or meter for the elapsed time");
    ctx.observed.gauge = `${gauge.node.role} "${gauge.node.name ?? ""}"`;
    const slider = await maybe(find(page, (n) => n.role === "slider" && named(n, /duration|^d$/i), { timeout: 2000 })) ?? await find(page, (n) => n.role === "slider", { what: "a duration slider" });
    if (!/duration/i.test(slider.node.name ?? "")) NOTES.add(`timer: the slider is named "${slider.node.name}", not for the duration`);
    const g = async () => { const n = (await nodes(page)).find(gaugeT); const max = Number(n.valuemax ?? 1), min = Number(n.valuemin ?? 0); return (Number(n.value) - min) / (max - min || 1); };
    const sv = async () => Number((await nodes(page)).find((n) => n === slider.node || (n.role === "slider" && n.name === slider.node.name))?.value);
    // the label: the "N.N" text that moves with time
    await press(page, reset);
    await sleep(100);
    const DEC = /(^|[^\d.])(\d+\.\d)(?!\d)/;
    const texts = async () => (await nodes(page)).filter((n) => n.role === "StaticText" && DEC.test(n.name ?? ""));
    const a = await texts();
    await sleep(700);
    const b = await texts();
    const moving = b.find((n) => { const was = a.find((x) => x.parent && n.parent && x.parent.backendDOMNodeId && x.parent.backendDOMNodeId === n.parent.backendDOMNodeId) ?? a[b.indexOf(n)]; return was && num(DEC.exec(was.name)[2]) !== num(DEC.exec(n.name)[2]); });
    if (!moving) fail(`no label showing seconds with one decimal advances while the timer runs (texts: ${b.map((n) => `"${n.name}"`).join(", ") || "none"})`);
    const labelEl = { node: moving, handle: await elementOf(moving) };
    ctx.observed.label = moving.name;
    if (!/\d\s*(s|sec|secs|seconds?)\b/i.test(moving.name)) NOTES.add(`timer: the elapsed label "${moving.name}" carries no unit`);
    const e = async () => { const t = await labelEl.handle.evaluate((x) => x.innerText ?? x.textContent); const m = DEC.exec(t); return m ? Number(m[2]) : NaN; };
    // with real time
    const e1 = await e(), t1 = Date.now();
    await sleep(1500);
    const e2 = await e(), dt = (Date.now() - t1) / 1000;
    ctx.observed.realTime = `${e1} → ${e2} over ${dt.toFixed(2)} s`;
    if (Math.abs(e2 - e1 - dt) > 0.45) fail(`the label went ${e1} → ${e2} over ${dt.toFixed(1)} s of real time`);
    const d0 = await sv();
    const g0 = await g();
    if (Math.abs(g0 - (await e()) / d0) > 0.06) fail(`the gauge reads ${g0.toFixed(2)} of full at e ${await e()} s, d ${d0} s`);
    // the slider by keyboard: lower d to just above e — it changes at once, the gauge follows
    await tabTo(page, ctx, slider);
    const setD = async (target) => {
      for (let i = 0; i < 400; i++) {
        const v = await sv();
        if (Math.abs(v - target) < 0.051) return v;
        const far = Math.abs(v - target) > 3;
        await page.keyboard.press(v < target ? (far ? "PageUp" : "ArrowRight") : (far ? "PageDown" : "ArrowLeft"));
        const w = await sv();
        if ((v < target && w > target) || (v > target && w < target)) {
          if (far) continue;
          return w;   // a coarser step than 0.1: as close as it goes
        }
      }
      return sv();
    };
    const target1 = Math.round(((await e()) + 1.5) * 10) / 10;
    const before = await g();
    await page.keyboard.press("ArrowLeft");
    await sleep(150);
    const afterOne = await sv();
    if (!(afterOne < d0)) fail(`ArrowLeft on the duration slider didn't change d (still ${afterOne})`);
    const d1 = await setD(target1);
    ctx.observed.d1 = d1;
    const gNow = await g(), eNow = await e();
    if (Math.abs(gNow - Math.min(1, eNow / d1)) > 0.08) fail(`after d was set to ${d1} by keyboard, the gauge reads ${gNow.toFixed(2)} at e ${eNow} (should be ${(eNow / d1).toFixed(2)})`);
    if (!(gNow > before)) NOTES.add(`timer: lowering d didn't raise the gauge (${before.toFixed(2)} → ${gNow.toFixed(2)})`);
    // it stops at d, the gauge full
    await until(async () => { const x = await e(); return { ok: Math.abs(x - d1) <= 0.11, seen: x }; }, `the timer never reached d = ${d1}`, 6000);
    await sleep(800);
    const es = await e();
    if (Math.abs(es - d1) > 0.11) fail(`at d = ${d1} the timer didn't stop: the label reads ${es}`);
    const gf = await g();
    if (gf < 0.99) fail(`stopped at ${es} s (d ${d1}) the gauge reads ${gf.toFixed(2)} of full`);
    ctx.observed.stopped = `${es} s, gauge ${gf.toFixed(2)}`;
    // raising d (by keyboard) runs it again, to the new d
    await tabTo(page, ctx, slider);
    const d2 = await setD(d1 + 1.5);
    await sleep(80);
    if ((await g()) > 0.97) fail(`raising d to ${d2} left the gauge full (${(await g()).toFixed(2)})`);
    await until(async () => ({ ok: (await e()) > es + 0.2, seen: await e() }), `raising d to ${d2} didn't start the timer again`, 1500);
    await until(async () => { const x = await e(); return { ok: Math.abs(x - d2) <= 0.11, seen: x }; }, `after raising d the timer never reached d = ${d2}`, 4000);
    await sleep(600);
    if (Math.abs((await e()) - d2) > 0.11) fail(`at the new d = ${d2} the timer didn't stop (${await e()})`);
    ctx.observed.resumed = `to ${await e()} s at d ${d2}`;
    // dragged: the value and the gauge change while the button is still down
    const sb = await slider.handle.boundingBox();
    const sn = (await nodes(page)).find((n) => n.role === "slider");
    const min = Number(sn.valuemin ?? 0), max = Number(sn.valuemax ?? 100);
    const x0 = sb.x + ((d2 - min) / (max - min)) * sb.width, y0 = sb.y + sb.height / 2;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await sleep(100);
    const atDown = await sv();
    const gDown = await g();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(x0 + i * 10, y0); await sleep(30); }
    await sleep(150);
    const midV = await sv(), midG = await g();
    ctx.observed.drag = `d ${atDown} → ${midV}, gauge ${gDown.toFixed(2)} → ${midG.toFixed(2)} while the button is down`;
    await page.mouse.up();
    if (!(midV > atDown)) fail(`dragging the slider's thumb right didn't change d while dragging (${atDown} → ${midV})`);
    if (!(midG < gDown - 0.02)) fail(`while d was dragged up (${atDown} → ${midV}) the gauge didn't follow (${gDown.toFixed(2)} → ${midG.toFixed(2)})`);
    // Reset sets e to zero
    await sleep(300);
    await press(page, reset);
    const er = await e();
    if (er > 0.3) fail(`after Reset the label reads ${er}, not 0.0`);
    if ((await g()) > 0.05) fail(`after Reset the gauge reads ${(await g()).toFixed(2)}`);
    await sleep(800);
    if (!((await e()) > er)) fail("after Reset the timer doesn't run again");
    ctx.observed.reset = `${er} then ${await e()}`;
  },

  // 5. CRUD: three people as "Surname, Name"; the prefix filter as typed; create, update, delete;
  //    Update and Delete only with a selection.
  async crud(page, ctx) {
    await open(page, ctx, "crud");
    const ITEM_ROLES = ["option", "row", "listitem", "gridcell", "cell", "treeitem", "StaticText"];
    const people = async () => {
      const ns = (await nodes(page)).filter((n) => ITEM_ROLES.includes(n.role) && /^[^,|]{1,40}, [^,|]{1,40}$/.test(n.name ?? ""));
      // a list item and the text inside it are one person
      const sel = ns.filter((n) => n.role !== "StaticText" || !inside(n, ITEM_ROLES.filter((r) => r !== "StaticText")));
      return [...new Set(sel.map((n) => n.name.trim()))];
    };
    const shown = async (want, what) => until(async () => { const p = await people(); return { ok: JSON.stringify([...p].sort()) === JSON.stringify([...want].sort()), seen: p }; }, `${what}: the list doesn't show exactly ${want.map((x) => `"${x}"`).join(", ") || "nobody"}`, 3000);
    await shown(["Emil, Hans", "Mustermann, Max", "Tisch, Roman"], "at the start");
    const upd = () => controlAny(page, /^update\b/i), del = () => controlAny(page, /^delete\b/i);
    const enabled = async (c) => !(await c()).node.disabled;
    if (await enabled(upd)) fail("with nobody selected, Update is enabled");
    if (await enabled(del)) fail("with nobody selected, Delete is enabled");
    // the filter, as typed
    const filter = await maybe(field(page, /filter|prefix/i, { timeout: 3000 })) ?? fail('accessibility: no field named "Filter prefix"');
    if (!/filter prefix/i.test(filter.node.name)) NOTES.add(`crud: the filter field is named "${filter.node.name}"`);
    await press(page, filter);
    await page.keyboard.type("M", { delay: 20 });
    await shown(["Mustermann, Max"], 'typing "M" in the filter');
    await page.keyboard.type("u", { delay: 20 });
    await shown(["Mustermann, Max"], 'typing "Mu"');
    await page.keyboard.type("x", { delay: 20 });
    await shown([], 'typing "Mux"');
    await typeIn(page, filter, "t");
    await shown(["Tisch, Roman"], 'a lower-case "t" (a prefix of Tisch)');
    await typeIn(page, filter, "is");
    await shown([], '"is" (inside Tisch, not its start)');
    await typeIn(page, filter, "");
    await shown(["Emil, Hans", "Mustermann, Max", "Tisch, Roman"], "the filter cleared");
    // create
    const NAME = /^name\b|^first name/i, SURNAME = /^surname\b|^last name|^family name/i;
    const nameF = await maybe(field(page, NAME, { timeout: 3000 })) ?? fail('accessibility: no field named "Name"');
    const surF = await maybe(field(page, SURNAME, { timeout: 2000 })) ?? fail('accessibility: no field named "Surname"');
    await typeIn(page, nameF, "Ada");
    await typeIn(page, surF, "Lovelace");
    await press(page, await control(page, /^create\b/i));
    await shown(["Emil, Hans", "Mustermann, Max", "Tisch, Roman", "Lovelace, Ada"], "after Create (Ada Lovelace)");
    // select one: Update and Delete enabled; at most one selected
    const item = (re) => find(page, (n) => ITEM_ROLES.includes(n.role) && named(n, re), { what: `the list item ${re}` });
    const selectedOnes = async () => (await nodes(page)).filter((n) => ITEM_ROLES.includes(n.role) && /, /.test(n.name ?? "") && (n.selected === true || n.checked === true)).map((n) => n.name);
    await press(page, await item(/^Emil, Hans$/));
    await sleep(250);
    await press(page, await item(/^Mustermann, Max$/));
    await sleep(250);
    const sel = await selectedOnes();
    ctx.observed.selected = sel;
    if (sel.length > 1) fail(`two people are selected at once: ${sel.join(" / ")}`);
    if (sel.length === 0) NOTES.add("crud: the selected person isn't exposed as selected (aria-selected) in the list");
    else if (sel[0] !== "Mustermann, Max") fail(`after choosing Mustermann, Max the selected one is "${sel[0]}"`);
    if (!(await enabled(upd)) || !(await enabled(del))) fail(`with Mustermann, Max selected, Update ${(await enabled(upd)) ? "is" : "isn't"} enabled and Delete ${(await enabled(del)) ? "is" : "isn't"}`);
    // update
    await typeIn(page, await field(page, NAME), "Maxine");
    await typeIn(page, await field(page, SURNAME), "Musterfrau");
    await press(page, await control(page, /^update\b/i));
    await shown(["Emil, Hans", "Musterfrau, Maxine", "Tisch, Roman", "Lovelace, Ada"], "after Update (Maxine Musterfrau in place of Max Mustermann)");
    // delete
    await press(page, await item(/^Tisch, Roman$/));
    await sleep(250);
    await press(page, await control(page, /^delete\b/i));
    await shown(["Emil, Hans", "Musterfrau, Maxine", "Lovelace, Ada"], "after Delete (Roman Tisch)");
    await sleep(200);
    const s2 = await selectedOnes();
    if (s2.length === 0 && ((await enabled(upd)) || (await enabled(del)))) {
      // something still selected, though nothing is marked: a later Update or Delete would act on someone
      NOTES.add(`crud: after Delete nothing is shown selected, yet Update/Delete stay enabled`);
    }
    // filter with a selection: the filter still works on the changed list
    await typeIn(page, filter, "Mu");
    await shown(["Musterfrau, Maxine"], 'typing "Mu" after the changes');
    // the layout: the filter above the list, the fields and buttons below or beside it
    const list = await maybe(find(page, (n) => ["listbox", "list", "grid", "table", "tree"].includes(n.role), { timeout: 1000 }));
    if (!list) fail("accessibility: the people aren't in a list (no listbox, list, grid or table)");
    const fb = await filter.handle.boundingBox(), lb = await list.handle.boundingBox(), cb = await (await control(page, /^create\b/i)).handle.boundingBox();
    ctx.observed.layout = { filter: [fb.x, fb.y, fb.height].map(Math.round), list: [lb.x, lb.y, lb.width, lb.height].map(Math.round), create: [cb.x, cb.y].map(Math.round) };
    if (!(fb.y + fb.height <= lb.y + 2)) fail(`the filter isn't above the list (filter bottom ${Math.round(fb.y + fb.height)}, list top ${Math.round(lb.y)})`);
    if (!(cb.y >= lb.y + lb.height - 2 || cb.x >= lb.x + lb.width - 2)) fail("the buttons are neither below nor beside the list");
    if (lb.height < 120) NOTES.add(`crud: the list is ${Math.round(lb.height)} px tall — it doesn't take the room that's left`);
  },

  // 6a. Circle Drawer: a click on an empty spot draws an unfilled circle of a fixed diameter; the
  //     circle nearest the pointer that contains it is filled grey; none with the pointer away.
  async circles_select(page, ctx) {
    await open(page, ctx, "circles");
    const { cb, E, bg, nonbg, grey, radius, shot, fillAt } = await circleKit(page, ctx);
    // a click draws an unfilled circle; under the pointer it is selected, filled grey
    const A = { x: Math.round(cb.x + cb.width * 0.6), y: Math.round(cb.y + Math.min(140, cb.height * 0.3)) };
    await page.mouse.click(A.x, A.y);
    await sleep(250);
    const underA = await fillAt({ x: A.x - 5, y: A.y });
    if (!grey(underA)) fail(`after a click at (${A.x}, ${A.y}) the spot under the pointer is ${rgb(underA)} — no circle filled grey there (background ${rgb(bg)})`);
    await page.mouse.move(E.x, E.y);
    await sleep(200);
    const rA = await radius(A);
    if (!rA || rA < 4) fail(`with the pointer away, no circle's outline found around (${A.x}, ${A.y})`);
    const insideA = await fillAt({ x: A.x - 5, y: A.y });
    if (nonbg(insideA)) fail(`with the pointer away the circle stays filled (${rgb(insideA)}): none should be selected`);
    ctx.observed.diameter = rA * 2;
    // a second, overlapping one: the pointer in the overlap, nearer B, selects B, not A
    const B = { x: Math.round(A.x + 1.5 * rA), y: A.y };
    await page.mouse.click(B.x, B.y);
    await sleep(200);
    await page.mouse.move(E.x, E.y);
    await sleep(150);
    const rB = await radius(B, [[1, 0], [0, -1], [0, 1]]);
    if (!rB || Math.abs(rB - rA) > 2) fail(`a click beside the first circle drew no second circle of the same size (radius ${rB} vs ${rA})`);
    await page.mouse.move(A.x + 0.9 * rA, A.y);
    await sleep(200);
    let img = await shot();
    const bOnly = img.px(B.x + rB * 0.5, B.y), aOnly = img.px(A.x - rA * 0.5, A.y);
    if (!grey(bOnly) || nonbg(aOnly)) fail(`with the pointer where both circles overlap, nearer the second, the second is ${grey(bOnly) ? "filled" : "not filled"} (${rgb(bOnly)}) and the first ${nonbg(aOnly) ? "filled" : "not filled"} (${rgb(aOnly)}) — the nearest containing circle should be the one filled`);
    await page.mouse.move(A.x - rA * 0.5, A.y);
    await sleep(200);
    img = await shot();
    if (!grey(img.px(A.x - rA * 0.6, A.y)) || nonbg(img.px(B.x + rB * 0.5, B.y))) fail("with the pointer in the first circle only, it isn't the one filled");

  },

  // 6b. Circle Drawer: right-click → "Adjust diameter…" → a slider changes the diameter live;
  //     closing makes one step; Undo/Redo over draws and adjustments; a new step clears Redo.
  async circles_history(page, ctx) {
    await open(page, ctx, "circles");
    const { undo, redo, cb, E, nonbg, radius, there, shot } = await circleKit(page, ctx);
    const A = { x: Math.round(cb.x + cb.width * 0.6), y: Math.round(cb.y + Math.min(140, cb.height * 0.3)) };
    await page.mouse.click(A.x, A.y);
    await page.mouse.move(E.x, E.y);
    await sleep(200);
    const rA = await radius(A);
    if (!rA || rA < 4) fail(`a click at (${A.x}, ${A.y}) drew no circle`);
    const B = { x: Math.round(A.x + 1.5 * rA), y: A.y };
    await page.mouse.click(B.x, B.y);
    await page.mouse.move(E.x, E.y);
    await sleep(200);
    const rB = await radius(B, [[1, 0], [0, -1], [0, 1]]);
    if (!rB) fail("a second click beside the first circle drew nothing");
    // the pointer onto the first circle, as a person points before right-clicking
    await page.mouse.move(A.x - rA * 0.3, A.y, { steps: 4 });
    await sleep(150);
    // right-click the selected circle: "Adjust diameter…"
    await page.mouse.click(A.x - rA * 0.3, A.y, { button: "right" });
    await sleep(300);
    const item = await maybe(find(page, (n) => ["menuitem", "button", "option", "listitem", "link"].includes(n.role) && named(n, /^adjust diameter/i) && !n.disabled, { timeout: 3000 }))
      ?? await maybe(find(page, (n) => ["menuitem", "button", "option", "listitem", "StaticText"].includes(n.role) && named(n, /adjust|diameter/i), { timeout: 1500 }));
    if (!item) fail(`right-clicking the selected circle offers no "Adjust diameter…"${await maybe(seeText(page, /adjust diameter/i, 300)) ? " in the accessibility tree (it is on screen) — accessibility" : ""}`);
    if (!/^adjust diameter/i.test(item.node.name)) ctx.fallback(`the menu item is "${item.node.name}" (${item.node.role})`);
    ctx.observed.menuItem = `${item.node.role} "${item.node.name}"`;
    await press(page, item);
    await sleep(400);
    const dialog = await maybe(find(page, (n) => ["dialog", "alertdialog", "window"].includes(n.role), { timeout: 2000 }));
    if (!dialog) NOTES.add("circles: the adjust window isn't exposed as a dialog");
    const slider = await maybe(find(page, (n) => n.role === "slider" && named(n, /diameter|size|radius/i), { timeout: 2000 })) ?? await maybe(find(page, (n) => n.role === "slider", { timeout: 2000 }));
    if (!slider) fail('accessibility: "Adjust diameter…" opened no slider in the tree');
    ctx.observed.slider = `"${slider.node.name}" ${slider.node.value}`;
    if (dialog) {
      const db = await dialog.handle.boundingBox();
      if (db && A.x + rA > db.x && A.x - rA < db.x + db.width && A.y + rA > db.y && A.y - rA < db.y + db.height) NOTES.add("circles: the adjust window covers the circle being adjusted");
    }
    // the keyboard's way in, recorded: Tab to the slider
    const tabbed = await (async () => { for (let i = 0; i < 30; i++) { await page.keyboard.press("Tab"); if (await slider.handle.evaluate((e) => { const a = document.activeElement; return !!a && (a === e || e.contains(a)); })) return true; } return false; })();
    if (!tabbed) NOTES.add('circles: Tab never reaches the adjust window\'s slider (30 presses) — keyboard users can\'t adjust a diameter');
    // the slider dragged by its thumb: the diameter changes as it moves, before the button is up
    const sv = async () => Number((await nodes(page)).find((n) => n.role === "slider")?.value);
    const sn = (await nodes(page)).find((n) => n.role === "slider");
    const v0 = await sv(), smin = Number(sn.valuemin ?? 0), smax = Number(sn.valuemax ?? 100);
    const sb = await slider.handle.boundingBox();
    const tx = sb.x + ((v0 - smin) / (smax - smin || 1)) * sb.width, ty = sb.y + sb.height / 2;
    await page.mouse.move(tx, ty);
    await page.mouse.down();
    let rLive = rA, moved = 0;
    for (let i = 1; i <= 12 && rLive < rA + 8; i++) {
      await page.mouse.move(tx + i * 8, ty);
      moved = i * 8;
      await sleep(80);
      if (i % 3 === 0) rLive = await radius(A);
    }
    rLive = await radius(A);
    const vMid = await sv();
    await page.mouse.up();
    ctx.observed.live = `thumb dragged ${moved} px: slider ${v0} → ${vMid}, radius ${rA} → ${rLive} before the button was up`;
    if (!(rLive >= rA + 4)) fail(`dragging the diameter slider (${v0} → ${vMid}) didn't change the circle's diameter as it moved (radius ${rA} → ${rLive})`);
    // and by keyboard, once the pointer has put focus in it: recorded
    await sleep(150);
    const vk = await sv();
    await page.keyboard.press("ArrowRight");
    await sleep(150);
    const vk2 = await sv();
    if (vk2 === vk) NOTES.add(`circles: the diameter slider doesn't move by ArrowRight after it was dragged (${vk} → ${vk2})`);
    await sleep(150);
    rLive = await radius(A);
    // close the window: its own close, else Escape
    const closeB = await maybe(control(page, /^(close|done|ok|apply)\b/i, { timeout: 1200 }));
    if (closeB) { await press(page, closeB); ctx.observed.closedBy = closeB.node.name; }
    else { ctx.fallback("no Close/Done/OK in the adjust window; pressed Escape"); await page.keyboard.press("Escape"); }
    await sleep(300);
    if (await maybe(find(page, (n) => n.role === "slider", { timeout: 300 }))) fail("the adjust window didn't close");
    await page.mouse.move(E.x, E.y);
    await sleep(150);
    const rA1 = await radius(A);
    if (Math.abs(rA1 - rLive) > 1.5) fail(`after closing the window the circle's radius is ${rA1}, not the adjusted ${rLive}`);
    // Undo: back to the diameter it had; Redo: the adjusted one again
    await press(page, await controlOr(page, ctx, /^undo\b/i, /undo/i));
    await page.mouse.move(E.x, E.y);
    await sleep(250);
    const rU = await radius(A);
    if (Math.abs(rU - rA) > 1.5) fail(`Undo after the adjustment left radius ${rU}; it was ${rA} before (adjusted to ${rA1})`);
    if (!(await there(B, rB))) fail("Undo of the adjustment took away the second circle too");
    const rd = await redo();
    if (rd.node.disabled) fail("after Undo, Redo is disabled");
    await press(page, rd);
    await page.mouse.move(E.x, E.y);
    await sleep(250);
    const rR = await radius(A);
    if (Math.abs(rR - rA1) > 1.5) fail(`Redo left radius ${rR}, not the adjusted ${rA1}`);
    ctx.observed.history = `radius ${rA} → adjusted ${rA1} → undo ${rU} → redo ${rR}`;
    // Undo twice: the adjustment, then the second circle's drawing
    await press(page, await control(page, /^undo\b/i)); await sleep(150);
    await press(page, await control(page, /^undo\b/i));
    await page.mouse.move(E.x, E.y);
    await sleep(250);
    if (await there(B, rB)) fail("Undo of a circle's drawing left the circle");
    if (!(await there(A, rA, [[-1, 0]]))) fail("Undo of the second circle's drawing took away the first too");
    await press(page, await control(page, /^redo\b/i));
    await page.mouse.move(E.x, E.y);
    await sleep(250);
    if (!(await there(B, rB))) fail("Redo didn't put the undone circle back");
    // undo it again, then a new step: Redo has nothing left
    await press(page, await control(page, /^undo\b/i));
    await page.mouse.move(E.x, E.y);
    await sleep(200);
    if (await there(B, rB)) fail("Undo (again) of the second circle left it");
    const C = { x: Math.round(A.x - 3.5 * rA), y: Math.round(A.y + 3 * rA) };
    await page.mouse.click(C.x, C.y);
    await page.mouse.move(E.x, E.y);
    await sleep(250);
    if (!(await there(C, rA, [[-1, 0], [0, 1]]))) fail("a click on an empty spot drew no circle (after undoing)");
    const r2 = await redo();
    if (!r2.node.disabled) {
      await press(page, r2);
      await page.mouse.move(E.x, E.y);
      await sleep(250);
      if (await there(B, rB)) fail("after a new step, Redo still brought back the undone circle");
      NOTES.add("circles: after a new step Redo stays enabled, though it does nothing");
    }
  },

  // 7. Cells: rows 0–99 and columns A–Z; double-click edits a formula; numbers, text, + - * /,
  //    parentheses, SUM and PROD over a range or a list; dependents recompute; a bad formula shows
  //    an error; Enter ends an edit (Escape cancelling is recorded, not required).
  async cells(page, ctx) {
    await open(page, ctx, "cells");
    await sleep(300);
    // the sheet's headings: column and row headers in the tree, else the visible letters and
    // numbers lined up along the top and the left
    const vp = page.viewport();
    const SEEN = new Set();   // every column letter seen on screen, as the sheet scrolls
    const headings = async () => {
      const ns = (await nodes(page)).filter((n) => !inside(n, ["link", "tab", "listitem", "button", "menuitem", "option"]));
      const pick = (role, re) => { const h = ns.filter((n) => n.role === role && re.test((n.name ?? "").trim())); return h; };
      let cols = pick("columnheader", /^[A-Z]{1,2}$/), rows = pick("rowheader", /^\d{1,3}$/);
      const byRole = cols.length >= 3 && rows.length >= 3;
      if (!byRole) { cols = pick("StaticText", /^[A-Z]{1,2}$/); rows = pick("StaticText", /^\d{1,3}$/); }
      const boxed = async (list) => (await Promise.all(list.map(async (n) => { const h = await elementOf(n); const b = h && await h.boundingBox(); return b && { name: n.name.trim(), x: b.x + b.width / 2, y: b.y + b.height / 2, h: b.height }; }))).filter(Boolean);
      let cb = await boxed(cols), rb = await boxed(rows);
      // the column letters share a line; the row numbers share a column (the line holding "0" …)
      const mode = (xs) => { const c = new Map(); for (const x of xs) c.set(Math.round(x), (c.get(Math.round(x)) ?? 0) + 1); return [...c].sort((a, b) => b[1] - a[1])[0]?.[0]; };
      const cy = mode(cb.map((b) => b.y));
      cb = cb.filter((b) => Math.abs(b.y - cy) < 3);
      const groups = new Map();
      for (const b of rb) { const k = Math.round(b.x / 4); groups.set(k, [...(groups.get(k) ?? []), b]); }
      // (rows scrolled under the column headings, or built beyond the screen, don't count)
      const below = (b) => b.y > cy + b.h * 0.75 && b.y < vp.height - b.h / 2;
      rb = [...groups.values()].map((g) => g.filter(below)).sort((a, b) => b.length - a.length).find((g) => g.length >= 3) ?? [];
      for (const b of cb) if (b.x > 0 && b.x < vp.width) SEEN.add(b.name);
      return { byRole, cols: new Map(cb.map((b) => [b.name, b])), rows: new Map(rb.map((b) => [b.name, b])) };
    };
    let H = (await until(async () => { const h = await headings(); return { ok: h.cols.has("A") && h.rows.has("0") ? h : false, seen: `${h.cols.size} column letters, ${h.rows.size} row numbers` }; }, 'no sheet with column "A" and row "0" visible', 6000)).ok;
    if (!H.byRole) ctx.fallback("cells are found by the visible column letters and row numbers: the sheet exposes no column/row headers (accessibility)");
    if (!H.byRole) ctx.a11y("the sheet has no grid, gridcell, columnheader or rowheader in the tree — its cells can't be reached by role or name");
    const letters = [...H.cols.keys()];
    ctx.observed.columns = letters.join("");
    const steps = () => {
      const cs = [...H.cols.values()].sort((a, b) => a.x - b.x), rs = [...H.rows.values()].sort((a, b) => a.y - b.y);
      return { cw: cs.length > 1 ? (cs.at(-1).x - cs[0].x) / (cs.length - 1) : 80, rh: rs.length > 1 ? (rs.at(-1).y - rs[0].y) / (rs.length - 1) : 22 };
    };
    const cellAt = (id) => {
      const [, col, row] = /^([A-Z])(\d+)$/.exec(id);
      const c = H.cols.get(col), r = H.rows.get(row);
      if (!c || !r) return null;
      return { x: c.x, y: r.y };
    };
    // what a cell shows: the text on screen within it
    const shownIn = async (id) => {
      const at = cellAt(id);
      if (!at) fail(`cell ${id} isn't on screen`);
      const { cw, rh } = steps();
      const ns = (await nodes(page)).filter((n) => n.role === "StaticText" && (n.name ?? "").trim() !== "" && !inside(n, ["link", "tab", "listitem", "columnheader", "rowheader"]));
      const hits = [];
      for (const n of ns) {
        const h = await elementOf(n); const b = h && await h.boundingBox();
        if (!b) continue;
        const x = b.x + b.width / 2, y = b.y + b.height / 2;
        // the text's box lies within the cell (a value right-aligned in it, or left-aligned)
        if (Math.abs(y - at.y) < rh / 2 - 1 && b.x >= at.x - cw / 2 - 2 && b.x + b.width <= at.x + cw / 2 + 2 && !H.cols.has(n.name.trim()) && ![...H.rows.values()].some((r) => Math.abs(r.x - x) < 3)) hits.push(n.name.trim());
        else if (Math.abs(y - at.y) < rh / 2 - 1 && Math.abs(x - at.x) < cw / 2 - 2 && !H.cols.has(n.name.trim())) hits.push(n.name.trim());
      }
      return [...new Set(hits)].join(" ");
    };
    const editor = async () => (await nodes(page)).find((n) => n.focused && TEXT_FIELD_ROLES.has(n.role));
    const startEdit = async (id) => {
      const at = cellAt(id);
      if (!at) fail(`cell ${id} isn't on screen to double-click`);
      await page.mouse.click(at.x, at.y, { count: 2 });
      const ed = await maybe(until(async () => (await editor()) ?? false, "", 1500));
      if (!ed) {
        // a field not named or not exposed: focus at least in something editable
        const any = await page.evaluate(() => { const a = document.activeElement; return !!a && (a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName)); });
        if (!any) fail(`double-clicking ${id} opened no editor (nothing editable has focus)`);
        NOTES.add("cells: the cell editor has focus but isn't a text field in the tree");
        return null;
      }
      return ed;
    };
    const enter = async (id, formula) => {
      await startEdit(id);
      await selectAll(page);
      await page.keyboard.type(formula, { delay: 8 });
      await page.keyboard.press("Enter");
      await sleep(200);
      if (await editor()) {
        // Enter left the editor open: the edit ends by leaving the cell
        ctx.fallback(`Enter didn't end the edit of ${id}; pressed Tab`);
        await page.keyboard.press("Tab");
        await sleep(200);
      }
    };
    const expect = async (id, want, what) => until(async () => {
      const s = await shownIn(id);
      const ok = typeof want === "number" ? num(s) !== null && Math.abs(num(s) - want) < 1e-6 && /^[−-]?[\d.,]+$/.test(s.replace(/,/g, "")) : typeof want === "string" ? s === want : want.test(s);
      return { ok, seen: s };
    }, `${what}: ${id} doesn't show ${want}`, 2500);

    // the grid's extent: A–Z, and row 0
    if (!H.rows.has("0")) fail("the sheet's rows don't start at 0");
    // values and formulas
    await enter("A1", "5");
    await expect("A1", 5, "a number");
    const ed = await startEdit("A1");
    const formulaShown = ed ? String(ed.value ?? "") : await page.evaluate(() => document.activeElement.value ?? document.activeElement.innerText);
    if (formulaShown.trim() !== "5") fail(`double-clicking A1 edits "${formulaShown}", not its formula "5"`);
    await page.keyboard.press("Enter");
    await sleep(150);
    await enter("A2", "7");
    await enter("A3", "3");
    await enter("B2", "2");
    await enter("C1", "hello");
    await expect("C1", "hello", "a piece of text");
    await enter("C2", "=A1+B2*2");
    await expect("C2", 9, "=A1+B2*2");
    // its formula, kept: double-clicking shows the formula, not the value
    const ed2 = await startEdit("C2");
    const f2 = ed2 ? String(ed2.value ?? "") : await page.evaluate(() => document.activeElement.value ?? document.activeElement.innerText);
    if (f2.replace(/\s/g, "").toUpperCase() !== "=A1+B2*2") fail(`double-clicking C2 edits "${f2}", not its formula =A1+B2*2`);
    await page.keyboard.press("Enter");
    await sleep(150);
    await expect("C2", 9, "after re-opening and ending the edit unchanged");
    await enter("C3", "=SUM(A1:A3)");
    await expect("C3", 15, "=SUM(A1:A3)");
    await enter("C4", "=PROD(A1:A3)");
    await expect("C4", 105, "=PROD(A1:A3)");
    await enter("C5", "=SUM(A1, B2, 10)");
    await expect("C5", 17, "=SUM(A1, B2, 10), a list");
    await enter("C6", "=PROD(A2, B2)");
    await expect("C6", 14, "=PROD(A2, B2), a list");
    await enter("D1", "=(A1+A2)/2-C2");
    await expect("D1", -3, "=(A1+A2)/2-C2, parentheses and - /");
    await enter("D2", "=D1*2");
    await expect("D2", -6, "=D1*2");
    // a change propagates through the chain: A1 → C2, C3, C4, C5, D1 → D2
    await enter("A1", "6");
    for (const [id, v] of [["A1", 6], ["C2", 10], ["C3", 16], ["C4", 126], ["C5", 18], ["D1", -3.5], ["D2", -7]]) await expect(id, v, "after A1 changed from 5 to 6");
    await expect("C6", 14, "a cell that doesn't read A1, after A1 changed");
    // a formula that can't be evaluated shows an error in its cell
    await enter("E1", "=1+");
    const err = await maybe(expect("E1", /err|#|invalid|!|\?|bad|fail/i, "an error"));
    if (!err) fail(`the formula "=1+" shows "${await shownIn("E1")}" — no error in its cell`);
    ctx.observed.error = await shownIn("E1");
    await enter("E2", "=FOO(A1)");
    const err2 = await maybe(expect("E2", /err|#|invalid|!|\?|bad|fail|unknown/i, "an error"));
    if (!err2) fail(`the formula "=FOO(A1)" shows "${await shownIn("E2")}" — no error in its cell`);
    // Escape: recorded, not required
    await startEdit("A2");
    await selectAll(page);
    await page.keyboard.type("999", { delay: 8 });
    await page.keyboard.press("Escape");
    await sleep(250);
    if (await editor()) { await page.keyboard.press("Escape"); await sleep(150); }
    const afterEsc = await shownIn("A2");
    ctx.observed.escape = afterEsc === "7" ? "Escape cancels the edit" : `Escape kept "${afterEsc}"`;
    if (afterEsc !== "7") NOTES.add(`cells: Escape doesn't cancel an edit (A2 shows "${afterEsc}")`);
    if (await editor()) { await page.keyboard.press("Enter"); }
    // scrolled both ways to Z99
    const A0 = H.cols.get("A");
    const over = { x: A0.x + 200, y: H.rows.get("0").y + 150 };
    await page.mouse.move(over.x, over.y);
    const visible = (b) => b && b.y > 0 && b.y < vp.height - 30 && b.x > 0 && b.x < vp.width - 30;
    for (let i = 0; i < 60; i++) {
      H = await headings();
      if (visible(H.rows.get("99"))) break;
      await page.mouse.wheel({ deltaY: 400 });
      await sleep(120);
    }
    if (!visible(H.rows.get("99"))) fail(`scrolling down never showed row 99 (rows shown: ${[...H.rows.keys()].slice(0, 3).join(", ")} … ${[...H.rows.keys()].slice(-3).join(", ")})`);
    for (let i = 0; i < 30; i++) {
      H = await headings();
      if (visible(H.cols.get("Z"))) break;
      await page.mouse.wheel({ deltaX: 400 });
      await sleep(120);
    }
    if (!visible(H.cols.get("Z"))) {
      // a mouse whose wheel only turns one way: Shift turns it sideways
      for (let i = 0; i < 30 && !visible(H.cols.get("Z")); i++) {
        await page.keyboard.down("Shift"); await page.mouse.wheel({ deltaY: 400 }); await page.keyboard.up("Shift");
        await sleep(120); H = await headings();
      }
      if (visible(H.cols.get("Z"))) ctx.fallback("the sheet scrolled sideways only by Shift and the wheel");
    }
    if (!visible(H.cols.get("Z"))) fail("scrolling right never showed column Z");
    // no columns past Z, every letter on the way
    await page.mouse.wheel({ deltaX: 2000 });
    await sleep(250);
    H = await headings();
    const beyond = [...SEEN].filter((k) => k.length > 1);
    if (beyond.length) fail(`the sheet has columns past Z (${beyond.slice(0, 3).join(", ")})`);
    const unseen = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").filter((c) => !SEEN.has(c));
    if (unseen.length) fail(`scrolled across the sheet, the column letters ${unseen.join("")} were never shown`);
    // no rows past 99
    await page.mouse.wheel({ deltaY: 2000 });
    await sleep(250);
    H = await headings();
    if ([...H.rows.keys()].some((k) => Number(k) > 99)) fail(`the sheet has rows past 99 (${[...H.rows.keys()].filter((k) => Number(k) > 99).slice(0, 3).join(", ")})`);
    if (!visible(H.rows.get("99")) || !visible(H.cols.get("Z"))) { H = await headings(); }
    await enter("Z99", "=SUM(A1:A3)*2");
    await expect("Z99", 32, "Z99 = SUM(A1:A3)*2, scrolled to the far corner");
    ctx.observed.Z99 = await shownIn("Z99");
  },
};

// ── run ─────────────────────────────────────────────────────────────────────
const browser = await launchChrome({ executablePath: CHROME, headless: !args.includes("--headful"), args: ["--no-sandbox"] });
DECODER = await browser.newPage();
const results = [];
const RUN_T0 = Date.now();
const SCENARIO_MS = { cells: 120000, timer: 60000, flight: 60000, circles: 60000 };
const RUN_MS = 480000;       // the whole run stays under eight minutes
for (const [name, run] of Object.entries(SCENARIOS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  // a11y(): what a sighted mouse user can do that the tree doesn't expose — the scenario goes on,
  // and FAILs at the end with it if nothing else failed first
  const ctx = { fallbacks: [], observed: {}, a11yFails: [], fallback(s) { this.fallbacks.push(s); }, a11y(s) { this.a11yFails.push(s); } };
  const t0 = Date.now();
  let error = null, page = null, bctx = null;
  const limit = SCENARIO_MS[name] ?? 45000;
  try {
    bctx = await browser.createBrowserContext();
    page = await bctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    // the page in front, as a person's window is: focus events reach only the front page
    await page.bringToFront();
    page.on("pageerror", (e) => NOTES.add(`${name}: page error: ${String(e.message).slice(0, 160)}`));
    if (Date.now() - RUN_T0 > RUN_MS) throw new Error(`not run: the whole run's ${RUN_MS / 60000} minutes were spent`);
    const going = run(page, ctx);
    going.catch(() => {});   // a scenario that timed out may still fail later, on a closed page
    await Promise.race([going, sleep(limit).then(() => { throw new Error(`timed out after ${limit / 1000} s`); })]);
    if (ctx.a11yFails.length) throw new Error(`accessibility: ${ctx.a11yFails.join("; ")} (everything else met)`);
  } catch (e) {
    error = e.message;
    if (ctx.a11yFails.length && !error.startsWith("accessibility:")) error += ` · also accessibility: ${ctx.a11yFails.join("; ")}`;
  }
  if (page) await page.screenshot({ path: join(OUT, `${name}.png`) }).catch(() => {});
  if (bctx) await bctx.close().catch(() => {});
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
