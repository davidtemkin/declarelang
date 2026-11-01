#!/usr/bin/env node
// drive.mjs — the hidden acceptance for Presentify, round 1. It finds the few things the
// brief names (the tools, "Slide 1…", the slide labelled "Slide") in the browser's own
// accessibility tree, acts with a real pointer and keyboard, and judges by what the
// service stored. It knows nothing about how the app is built.
//
//   node evals/apps/presentify/drive.mjs <app-url> [--service=http://127.0.0.1:8360]
//        [--only=a,b] [--out=dir] [--headful]
//
// The service must be this app's (api/server.mjs, with _reset/_edit/_fail/_log/_state).
// Each scenario starts from a reset service in a fresh browser context. What the brief
// fixes and this relies on: the tool names; the list's "Slide N"; the slide labelled
// "Slide" whose edges are the slide's (1280 × 720 points); the three saving sentences.
// Everything else (menus, the inspector, presenting) is found by a loose match on its name.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchChrome } from "../../../tools/internal/chrome.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const APP = args.find((a) => !a.startsWith("--"));
if (!APP) { console.error("usage: drive.mjs <app-url> [--service=…] [--only=a,b] [--out=dir] [--headful]"); process.exit(2); }
const SERVICE = opt("service", "http://127.0.0.1:8360");
const ONLY = opt("only", "")?.split(",").filter(Boolean);
const OUT = opt("out", "/tmp/presentify-drive");
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
mkdirSync(OUT, { recursive: true });

const api = async (path, body) => (await fetch(SERVICE + path, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SEED = new Set(["d1", "d2", "d3"]);
// things seen on the way that aren't a scenario's verdict, reported with the results
const NOTES = new Set();

// ── the service's state ─────────────────────────────────────────────────────
const state = () => api("/api/_state");
const flat = (els) => els.flatMap((e) => (e.kind === "group" ? [e, ...flat(e.children)] : [e]));
async function deck(which) {
  const s = await state();
  const d = which === "new" ? s.decks.find((x) => !SEED.has(x.id)) : s.decks.find((x) => x.id === which || x.title === which);
  if (!d) return null;
  return { ...d, slides: d.slideOrder.map((id) => s.slides.find((x) => x.id === id)) };
}
// What was stored, once it holds: saving is the app's to schedule (within about two
// seconds of the last edit), so a check waits for the store to say so.
async function stored(test, what, timeout = 9000) {
  const until = Date.now() + timeout;
  let last;
  for (;;) {
    try { last = await test(); if (last) return last; } catch (e) { last = e.message; }
    if (Date.now() > until) throw new Error(`never stored: ${what}`);
    await sleep(250);
  }
}
const near = (a, b, tol = 12) => Math.abs(a - b) <= tol;

// ── the page, by role and name ──────────────────────────────────────────────
const ACTION_ROLES = new Set(["button", "link", "menuitem", "tab", "option", "radio", "checkbox", "switch", "row", "gridcell", "listitem", "cell", "treeitem", "menuitemradio", "menuitemcheckbox", "togglebutton"]);
const FIELD_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton", "TextField", "slider"]);
async function nodes(page) {
  const out = [];
  const walk = (n) => { out.push(n); for (const c of n.children ?? []) walk(c); };
  const root = await page.accessibility.snapshot({ interestingOnly: true });
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
      if (h) return { node: hit, handle: h };
    }
    if (Date.now() > until) throw new Error(`not found: ${what}`);
    await sleep(150);
  }
}
const named = (n, re) => typeof n.name === "string" && (typeof re === "string" ? n.name === re : re.test(n.name));
const control = (page, re, o = {}) => find(page, (n) => ACTION_ROLES.has(n.role) && named(n, re) && !n.disabled, { what: `a control named ${re}`, ...o });
const field = (page, re, o = {}) => find(page, (n) => FIELD_ROLES.has(n.role) && named(n, re), { what: `a field named ${re}`, ...o });
const maybe = async (p) => { try { return await p; } catch { return null; } };
async function press(page, el) {
  await el.handle.evaluate((e) => e.scrollIntoView({ block: "nearest" }));
  await el.handle.click();
}
async function typeInto(page, re, text) {
  const el = await field(page, re);
  await press(page, el);
  // Command-A, with the editing command it means: keys sent through DevTools on a Mac
  // don't run editing commands on their own (a bare <input> stays unselected)
  await page.keyboard.down("Meta"); await page.keyboard.press("a", { commands: ["SelectAll"] }); await page.keyboard.up("Meta");
  await page.keyboard.type(text, { delay: 15 });
  await page.keyboard.press("Enter");
  return el;
}
const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
async function seeText(page, text, timeout = 6000) {
  const until = Date.now() + timeout;
  for (;;) {
    const t = await bodyText(page);
    const names = (await nodes(page)).map((n) => `${n.name ?? ""} ${n.value ?? ""}`).join(" | ");
    if (typeof text === "string" ? t.includes(text) || names.includes(text) : text.test(t) || text.test(names)) return true;
    if (Date.now() > until) throw new Error(`never shown: ${text}`);
    await sleep(150);
  }
}
// The usual keys: Command on a Mac. An app that listens for Control instead is
// given the same chord, once, if Command changed nothing.
async function chord(page, key, { shift = false, alt = false, mod = "Meta" } = {}) {
  await page.keyboard.down(mod);
  if (shift) await page.keyboard.down("Shift");
  if (alt) await page.keyboard.down("Alt");
  await page.keyboard.press(key);
  if (alt) await page.keyboard.up("Alt");
  if (shift) await page.keyboard.up("Shift");
  await page.keyboard.up(mod);
}
async function chordUntil(page, key, test, what, o = {}) {
  await chord(page, key, o);
  if (await maybe(stored(test, what, 3000))) return;
  await chord(page, key, { ...o, mod: "Control" });
  await stored(test, what, 6000);
}

// ── the slide: points to the screen ─────────────────────────────────────────
// "Slide" may also name a menu or a heading; the slide is the largest thing so named that
// isn't a menu item, a button or a heading.
const NOT_THE_SLIDE = new Set(["menuitem", "menu", "menubar", "button", "heading", "tab", "StaticText"]);
async function slide(page) {
  const until = Date.now() + 15000;
  for (;;) {
    // the DOM's own label first: Chrome's accessibility snapshot can hand back a stale
    // node after an overlay comes and goes, while the element itself is right
    const viaDom = await page.evaluateHandle(() => {
      let best = null, area = 0;
      for (const e of document.querySelectorAll('[aria-label="Slide"]')) {
        const role = e.getAttribute("role") ?? "";
        if (/menu|button|heading|tab/.test(role) || !e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const r = e.getBoundingClientRect();
        if (r.width >= 100 && r.width * r.height > area) { best = e; area = r.width * r.height; }
      }
      return best;
    });
    let best = viaDom.asElement() ? { node: null, handle: viaDom.asElement(), box: await viaDom.asElement().boundingBox() } : null;
    if (!best) {
      for (const n of (await nodes(page)).filter((x) => x.name === "Slide" && !NOT_THE_SLIDE.has(x.role))) {
        let h = await n.elementHandle();
        if (h) h = (await h.evaluateHandle((e) => (e.nodeType === 1 ? e : e.parentElement))).asElement();
        const box = h && await h.boundingBox();
        const seen = h && await h.evaluate((e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true })).catch(() => false);
        if (box && seen && box.width >= 100 && (!best || box.width > best.box.width)) best = { node: n, handle: h, box };
      }
    }
    if (best && best.box) {
      const { box } = best;
      return { ...best, at: (x, y) => ({ x: box.x + (x / 1280) * box.width, y: box.y + (y / 720) * box.height }) };
    }
    if (Date.now() > until) throw new Error("not found: the slide labelled Slide, with a size on screen");
    await sleep(200);
  }
}
async function drag(page, from, to, { shift = false, steps = 14 } = {}) {
  await page.mouse.move(from.x, from.y);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await sleep(12);
  }
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
  await sleep(150);
}
async function click(page, p, { shift = false } = {}) {
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.click(p.x, p.y);
  if (shift) await page.keyboard.up("Shift");
  await sleep(120);
}
const tool = async (page, name) => press(page, await control(page, new RegExp(`^${name}\\b`, "i")));
async function draw(page, s, kind, x1, y1, x2, y2, o = {}) {
  await tool(page, kind);
  await drag(page, s.at(x1, y1), s.at(x2, y2), o);
  await page.keyboard.press("Escape");
  await sleep(100);
}

// ── the steps a person takes ────────────────────────────────────────────────
// The fill is set by hex, in a field of its own or in whatever the Fill control opens.
async function setFill(page, hex) {
  const direct = await maybe(field(page, /^fill( colou?r)?$/i, { timeout: 800 }));
  if (!direct) {
    await press(page, await control(page, /^fill( colou?r)?$/i));
    await sleep(300);
  }
  await typeInto(page, direct ? /^fill( colou?r)?$/i : /hex|^colou?r$|^#/i, hex);
  await page.keyboard.press("Escape");
  await sleep(200);
}
// A control that belongs to one presentation in the list: named for it, or the nearest
// of the controls so named to the presentation's own.
async function controlFor(page, title, re) {
  const own = await maybe(control(page, new RegExp(`(?:${re.source}).*${title}|${title}.*(?:${re.source})`, "i"), { timeout: 800 }));
  if (own) return own;
  const card = await find(page, (n) => named(n, new RegExp(title, "i")) && n.role !== "StaticText", { what: `the presentation ${title}` });
  const cb = await card.handle.boundingBox();
  let best = null;
  for (const n of (await nodes(page)).filter((x) => ACTION_ROLES.has(x.role) && named(x, re))) {
    let h = await n.elementHandle();
    if (h) h = (await h.evaluateHandle((e) => (e.nodeType === 1 ? e : e.parentElement))).asElement();
    const b = h && await h.boundingBox();
    if (!b) continue;
    const d = Math.hypot(b.x + b.width / 2 - (cb.x + cb.width / 2), b.y + b.height / 2 - (cb.y + cb.height / 2));
    if (!best || d < best.d) best = { node: n, handle: h, d };
  }
  if (!best) throw new Error(`not found: a control named ${re} for ${title}`);
  return best;
}
const NOT_SLIDE = "(?!.*slide)";
async function newPresentation(page) {
  await page.goto(APP, { waitUntil: "networkidle2" });
  const make = await control(page, /new presentation|^new\b|create|^\+$|blank/i, { timeout: 15000 });
  await press(page, make);
  const s = await slide(page);
  await stored(() => deck("new"), "a new presentation");
  return s;
}
async function openPresentation(page, title) {
  await page.goto(APP, { waitUntil: "networkidle2" });
  const card = await find(page, (n) => (ACTION_ROLES.has(n.role) || n.role === "img" || n.role === "heading" || n.role === "StaticText") && named(n, new RegExp(title, "i")), { what: `the presentation ${title}`, timeout: 15000 });
  await press(page, card);
  await sleep(300);
  // a single click may only select it in the list
  if (!(await maybe(thumb(page, 1)))) await card.handle.click({ clickCount: 2 }).catch(() => {});
  return slide(page);
}
const thumb = (page, n) => find(page, (x) => x.name === `Slide ${n}` || new RegExp(`^Slide ${n}\\b`).test(x.name ?? ""), { what: `Slide ${n} in the list` });
const kinds = (d, i = 0) => flat(d.slides[i].elements).map((e) => e.kind);

// ── the scenarios ───────────────────────────────────────────────────────────
const SCENARIOS = {
  async list_and_open(page) {
    await page.goto(APP, { waitUntil: "networkidle2" });
    for (const t of ["Field notes from the coast", "Studio launch plan", "Reading group"]) await seeText(page, t, 12000);
    await openPresentation(page, "Field notes from the coast");
    for (let i = 1; i <= 8; i++) await thumb(page, i);
  },
  async new_presentation(page) {
    await newPresentation(page);
    const d = await deck("new");
    if (d.slides.length !== 1 || d.slides[0].elements.length !== 0) throw new Error("a new presentation isn't one empty slide");
    await seeText(page, "All changes saved", 8000);
  },
  async draw_each_kind(page) {
    const s = await newPresentation(page);
    await draw(page, s, "Rectangle", 100, 100, 400, 300);
    await draw(page, s, "Ellipse", 520, 120, 720, 260);
    await draw(page, s, "Line", 100, 500, 600, 620);
    await tool(page, "Text");
    await click(page, s.at(820, 420));
    await page.keyboard.type("Hello there", { delay: 20 });
    await page.keyboard.press("Escape");
    const d = await stored(async () => { const d = await deck("new"); const k = kinds(d); return ["rect", "ellipse", "line", "text"].every((x) => k.includes(x)) && d; }, "a rectangle, an ellipse, a line and a text box");
    const els = flat(d.slides[0].elements);
    const r = els.find((e) => e.kind === "rect");
    if (!near(r.x, 100) || !near(r.y, 100) || !near(r.width, 300) || !near(r.height, 200)) throw new Error(`the rectangle is ${r.x},${r.y} ${r.width}×${r.height}, not where it was drawn`);
    const l = els.find((e) => e.kind === "line");
    if (!near(Math.min(l.x1, l.x2), 100) || !near(Math.max(l.x1, l.x2), 600)) throw new Error("the line is not where it was drawn");
    const t = els.find((e) => e.kind === "text");
    if (t.text.content !== "Hello there") throw new Error(`the text box holds "${t.text.content}"`);
  },
  async shift_draws_square_and_circle(page) {
    const s = await newPresentation(page);
    await draw(page, s, "Rectangle", 100, 100, 400, 250, { shift: true });
    await draw(page, s, "Ellipse", 600, 100, 760, 400, { shift: true });
    const d = await stored(async () => { const d = await deck("new"); return kinds(d).includes("rect") && kinds(d).includes("ellipse") && d; }, "the two shapes");
    for (const e of flat(d.slides[0].elements)) {
      if (!near(e.width, e.height, 2)) throw new Error(`a ${e.kind} drawn with shift is ${e.width}×${e.height}`);
      if (e.keepProportions !== true) throw new Error(`a ${e.kind} drawn with shift doesn't keep its proportions`);
    }
  },
  async rounded_corners_hold(page) {
    const s = await newPresentation(page);
    await tool(page, "Rectangle");
    await drag(page, s.at(200, 200), s.at(500, 400));
    await typeInto(page, /corner|radius|round/i, "24");
    await stored(async () => (await deck("new")).slides[0].elements.find((e) => e.kind === "rect")?.cornerRadius === 24, "a corner radius of 24");
    await drag(page, s.at(500, 300), s.at(700, 300));
    const r = await stored(async () => { const r = (await deck("new")).slides[0].elements.find((e) => e.kind === "rect"); return near(r.width, 500) && r; }, "the rectangle widened to about 500 by its side handle");
    if (r.cornerRadius !== 24) throw new Error(`the radius became ${r.cornerRadius} when the rectangle was resized`);
  },
  async keep_proportions(page) {
    const s = await newPresentation(page);
    await tool(page, "Rectangle");
    await drag(page, s.at(200, 200), s.at(400, 300));
    const box = await find(page, (n) => ["checkbox", "switch", "togglebutton", "button"].includes(n.role) && named(n, /proportion|aspect|ratio/i), { what: "the keep-proportions setting" });
    await press(page, box);
    await stored(async () => (await deck("new")).slides[0].elements.find((e) => e.kind === "rect")?.keepProportions === true, "keepProportions set");
    await drag(page, s.at(400, 300), s.at(600, 320));
    const r = await stored(async () => { const r = (await deck("new")).slides[0].elements.find((e) => e.kind === "rect"); return r.width > 260 && r; }, "the rectangle resized by its corner");
    if (Math.abs(r.width / r.height - 2) > 0.06) throw new Error(`a 2:1 rectangle that keeps its proportions became ${r.width}×${r.height}`);
  },
  async box_select_and_delete(page) {
    const s = await newPresentation(page);
    await draw(page, s, "Rectangle", 100, 100, 300, 250);
    await draw(page, s, "Rectangle", 400, 100, 600, 250);
    await draw(page, s, "Rectangle", 900, 480, 1100, 640);
    await stored(async () => (await deck("new")).slides[0].elements.length === 3 && true, "three rectangles");
    await maybe(tool(page, "Select"));
    await drag(page, s.at(50, 50), s.at(650, 320));
    await page.keyboard.press("Delete");
    if (!(await maybe(stored(async () => (await deck("new")).slides[0].elements.length === 1, "", 2500)))) await page.keyboard.press("Backspace");
    const d = await stored(async () => { const d = await deck("new"); return d.slides[0].elements.length === 1 && d; }, "only the rectangle the box didn't touch");
    if (!near(d.slides[0].elements[0].x, 900)) throw new Error("the box deleted the wrong rectangle");
  },
  async move_and_nudge(page) {
    const s = await newPresentation(page);
    await draw(page, s, "Rectangle", 200, 200, 400, 300);
    await maybe(tool(page, "Select"));
    await drag(page, s.at(300, 250), s.at(457, 333));
    const moved = await stored(async () => { const r = (await deck("new")).slides[0].elements[0]; return r.x > 300 && r; }, "the rectangle dragged");
    if (!near(moved.x, 357) || !near(moved.y, 283)) throw new Error(`dragged to ${moved.x},${moved.y}, not about 357,283`);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.down("Shift"); await page.keyboard.press("ArrowDown"); await page.keyboard.up("Shift");
    await stored(async () => { const r = (await deck("new")).slides[0].elements[0]; return r.x === moved.x + 1 && r.y === moved.y + 10; }, "a nudge of one point right and ten down");
  },
  async inspector_mixed_and_applied(page) {
    const s = await newPresentation(page);
    await draw(page, s, "Rectangle", 100, 100, 300, 250);
    await draw(page, s, "Rectangle", 500, 100, 700, 250);
    await maybe(tool(page, "Select"));
    await click(page, s.at(200, 175));
    await setFill(page, "#AA2200");
    await stored(async () => (await deck("new")).slides[0].elements.some((e) => /^#AA2200/i.test(e.fill ?? "")), "one rectangle filled #AA2200");
    await click(page, s.at(200, 175));
    await click(page, s.at(600, 175), { shift: true });
    await sleep(400);
    const fills = (await deck("new")).slides[0].elements.map((e) => (e.fill ?? "").toUpperCase().slice(0, 7));
    const said = await bodyText(page) + " " + (await nodes(page)).map((n) => `${n.name ?? ""} ${n.value ?? ""}`).join(" ");
    const shown = fills.filter((f) => f && said.toUpperCase().includes(f));
    if (shown.length) throw new Error(`with two different fills selected, the inspector shows ${shown.join(" and ")} as if it were true of both`);
    await setFill(page, "#123456");
    await stored(async () => (await deck("new")).slides[0].elements.every((e) => /^#123456/i.test(e.fill ?? "")), "both rectangles filled #123456");
  },
  async group_and_ungroup(page) {
    const s = await newPresentation(page);
    await draw(page, s, "Rectangle", 100, 100, 300, 250);
    await draw(page, s, "Ellipse", 500, 100, 700, 250);
    const before = await stored(async () => { const d = await deck("new"); return d.slides[0].elements.length === 2 && d.slides[0].elements; }, "two shapes");
    await maybe(tool(page, "Select"));
    await click(page, s.at(200, 175));
    await click(page, s.at(600, 175), { shift: true });
    const g = await maybe(control(page, /^group$|^group (selection|items)/i, { timeout: 1200 }));
    if (g) await press(page, g);
    else await chordUntil(page, "g", async () => (await deck("new")).slides[0].elements.length === 1, "grouped");
    const grouped = await stored(async () => { const e = (await deck("new")).slides[0].elements; return e.length === 1 && e[0].kind === "group" && e[0]; }, "one group of two");
    for (const c of grouped.children) {
      const was = before.find((b) => b.kind === c.kind);
      if (!near(c.x, was.x, 1) || !near(c.y, was.y, 1)) throw new Error("grouping moved its parts");
    }
    const u = await maybe(control(page, /ungroup/i, { timeout: 1200 }));
    if (u) await press(page, u); else await chordUntil(page, "g", async () => (await deck("new")).slides[0].elements.length === 2, "ungrouped", { shift: true });
    const after = await stored(async () => { const e = (await deck("new")).slides[0].elements; return e.length === 2 && e; }, "two shapes again");
    for (const c of after) {
      const was = before.find((b) => b.kind === c.kind);
      if (!near(c.x, was.x, 1) || !near(c.y, was.y, 1)) throw new Error("ungrouping didn't put each part where it was");
    }
  },
  async align_and_distribute(page) {
    const s = await newPresentation(page);
    await draw(page, s, "Rectangle", 100, 100, 200, 180);
    await draw(page, s, "Rectangle", 300, 180, 400, 260);
    await draw(page, s, "Rectangle", 800, 260, 900, 340);
    await stored(async () => (await deck("new")).slides[0].elements.length === 3, "three rectangles");
    await maybe(tool(page, "Select"));
    await drag(page, s.at(40, 40), s.at(1000, 400));
    await press(page, await control(page, /align.*top|^tops?$/i));
    const top = await stored(async () => { const e = (await deck("new")).slides[0].elements; return new Set(e.map((x) => Math.round(x.y))).size === 1 && e; }, "three tops aligned");
    if (!near(top[0].y, 100, 1)) throw new Error(`aligned to ${top[0].y}, not the topmost edge`);
    await press(page, await control(page, /distribute.*(horiz|across|width)|horizontal(ly)? distribute|distribute$/i));
    await stored(async () => {
      const e = [...(await deck("new")).slides[0].elements].sort((a, b) => a.x - b.x);
      const g1 = e[1].x - (e[0].x + e[0].width), g2 = e[2].x - (e[1].x + e[1].width);
      return near(g1, g2, 1) && near(e[0].x, 100, 1) && near(e[2].x, 800, 1);
    }, "three rectangles evenly spaced across, the outer two staying put");
  },
  async bring_to_front(page) {
    const s = await newPresentation(page);
    await draw(page, s, "Rectangle", 200, 200, 500, 400);
    await draw(page, s, "Ellipse", 350, 300, 650, 500);
    await stored(async () => (await deck("new")).slides[0].elements.length === 2, "two shapes");
    await maybe(tool(page, "Select"));
    await click(page, s.at(230, 230));
    const c = await maybe(control(page, /bring to front/i, { timeout: 1500 }));
    if (c) await press(page, c);
    else await chordUntil(page, "BracketRight", async () => (await deck("new")).slides[0].elements[1].kind === "rect", "the rectangle in front", { shift: true });
    await stored(async () => (await deck("new")).slides[0].elements.map((e) => e.kind).join() === "ellipse,rect", "the rectangle brought to the front");
  },
  async undo_is_one_step(page) {
    const s = await newPresentation(page);
    await draw(page, s, "Rectangle", 200, 200, 400, 300);
    const r0 = await stored(async () => (await deck("new")).slides[0].elements[0], "a rectangle");
    await maybe(tool(page, "Select"));
    await drag(page, s.at(300, 250), s.at(600, 400), { steps: 30 });
    await stored(async () => (await deck("new")).slides[0].elements[0].x > 400, "the rectangle dragged");
    await chordUntil(page, "z", async () => { const r = (await deck("new")).slides[0].elements[0]; return near(r.x, r0.x, 0.5) && near(r.y, r0.y, 0.5); }, "one undo taking the whole drag back");
    await tool(page, "Text");
    await click(page, s.at(700, 500));
    await page.keyboard.type("one two three", { delay: 25 });
    await page.keyboard.press("Escape");
    await stored(async () => flat((await deck("new")).slides[0].elements).some((e) => e.kind === "text" && e.text.content === "one two three"), "the typed text");
    await chordUntil(page, "z", async () => !flat((await deck("new")).slides[0].elements).some((e) => e.kind === "text" && /^one/.test(e.text.content)), "one undo taking the whole run of typing back");
  },
  async slides_add_duplicate_delete(page) {
    const s = await newPresentation(page);
    await draw(page, s, "Ellipse", 500, 200, 700, 400);
    await stored(async () => (await deck("new")).slides[0].elements.length === 1, "an ellipse on slide 1");
    await press(page, await control(page, /(add|new|insert) slide|^\+ ?slide|^new$/i));
    await stored(async () => (await deck("new")).slides.length === 2, "a second slide");
    await press(page, await thumb(page, 1));
    const dup = await maybe(control(page, /duplicate slide|^duplicate$/i, { timeout: 1500 }));
    if (dup) await press(page, dup); else await chord(page, "d");
    const d3 = await stored(async () => { const d = await deck("new"); return d.slides.length === 3 && d; }, "a third slide, a duplicate");
    if (d3.slides[1].elements.length !== 1 || d3.slides[1].elements[0].kind !== "ellipse") throw new Error("the duplicate isn't a copy placed after slide 1");
    await press(page, await thumb(page, 3));
    const del = await maybe(control(page, /delete slide|remove slide/i, { timeout: 1500 }));
    if (del) await press(page, del); else await page.keyboard.press("Delete");
    await stored(async () => (await deck("new")).slides.length === 2, "two slides after a delete");
  },
  async slides_reorder_by_drag(page) {
    await openPresentation(page, "Studio launch plan");
    const before = (await deck("d2")).slideOrder;
    const three = await thumb(page, 3), one = await thumb(page, 1);
    const b3 = await three.handle.boundingBox(), b1 = await one.handle.boundingBox();
    await drag(page, { x: b3.x + b3.width / 2, y: b3.y + b3.height / 2 }, { x: b1.x + b1.width / 2, y: b1.y + 4 }, { steps: 30 });
    await stored(async () => (await deck("d2")).slideOrder.join() === [before[2], before[0], before[1]].join(), "slide 3 dragged to the top of the list");
  },
  async saving_and_retry(page) {
    const s = await newPresentation(page);
    await seeText(page, "All changes saved", 8000);
    await api("/api/_fail", { count: 3 });
    await draw(page, s, "Rectangle", 200, 200, 400, 300);
    await seeText(page, "Not saved: can't reach the service", 12000);
    await seeText(page, "All changes saved", 25000);
    await stored(async () => (await deck("new")).slides[0].elements.length === 1, "the rectangle, kept and saved once the service answered");
  },
  async conflict_is_offered(page) {
    const s0 = await openPresentation(page, "Field notes from the coast");
    await press(page, await thumb(page, 2));
    await sleep(500);
    await api("/api/_edit", { slideId: "s2", background: "#101820" });
    const s = await slide(page);
    await draw(page, s, "Rectangle", 1000, 560, 1200, 660);
    await seeText(page, /changed (somewhere|elsewhere|in another|by someone)|someone else|another window|another device|conflict/i, 12000);
    const take = await control(page, /their|as it is now|latest|newer|other (version|window)|use (the )?(other|new|latest|server)|reload|keep (the )?other|discard (mine|my)/i);
    await press(page, take);
    await sleep(2500);
    const s2 = (await deck("d1")).slides[1];
    if (s2.background !== "#101820") throw new Error("the colleague's version was written over");
    if (s2.elements.some((e) => e.kind === "rect" && near(e.x, 1000))) throw new Error("the person's change was saved over the colleague's after they chose the colleague's");
    void s0;
  },
  async present_and_return(page) {
    await openPresentation(page, "Field notes from the coast");
    await press(page, await thumb(page, 1));
    await press(page, await control(page, /^(present|play|slide ?show|start (the )?presentation)\b/i));
    await sleep(800);
    await page.keyboard.press("ArrowRight"); await sleep(400);
    await page.keyboard.press("Space"); await sleep(400);
    await page.keyboard.press("Escape"); await sleep(800);
    // where presenting ended is the slide now being edited: draw on it and see where it lands
    const s = await slide(page);
    await draw(page, s, "Rectangle", 1100, 600, 1200, 680);
    const d = await stored(async () => { const d = await deck("d1"); const i = d.slides.findIndex((x) => x.elements.some((e) => e.kind === "rect" && near(e.x, 1100))); return i >= 0 && { d, i }; }, "a rectangle drawn after presenting");
    if (d.i !== 2) throw new Error(`presenting from slide 1 and moving on twice returned to slide ${d.i + 1}, not 3`);
  },
  async rename_and_delete_presentation(page) {
    await page.goto(APP, { waitUntil: "networkidle2" });
    await seeText(page, "Reading group", 12000);
    const viaMenu = async (title, item) => {
      const direct = await maybe(controlFor(page, title, new RegExp(`^${item}${NOT_SLIDE}`, "i")));
      if (direct && direct.d === undefined) return press(page, direct);
      await press(page, await controlFor(page, title, /more|actions|options|menu|…|\.\.\./i));
      await press(page, await control(page, new RegExp(`^${item}${NOT_SLIDE}`, "i")));
    };
    await viaMenu("Reading group", "rename");
    await sleep(300);
    await typeInto(page, /title|name|rename/i, "Book club");
    await stored(async () => (await deck("d3"))?.title === "Book club", "the title Book club");
    await viaMenu("Book club", "delete");
    await sleep(500);
    if (!(await deck("d3"))) throw new Error("deleted with a single slip: nothing asked first");
    await press(page, await control(page, new RegExp(`^(delete|yes|confirm|remove)${NOT_SLIDE}`, "i")));
    await stored(async () => !(await deck("d3")), "Book club deleted");
    if ((await deck("d1")).slideOrder.length !== 8) throw new Error("deleting a presentation touched another");
  },
};

// ── run ─────────────────────────────────────────────────────────────────────
const browser = await launchChrome({ executablePath: CHROME, headless: !args.includes("--headful"), args: ["--no-sandbox"] });
const results = [];
for (const [name, run] of Object.entries(SCENARIOS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  await api("/api/_reset", {});
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
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
for (const n of NOTES) console.log(`note  ${n}`);
console.log(`${results.filter((r) => r.pass).length} of ${results.length} passed · ${OUT}/results.json`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
