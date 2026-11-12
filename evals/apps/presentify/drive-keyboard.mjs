#!/usr/bin/env node
// drive-keyboard.mjs — the hidden acceptance for Presentify's keyboard round
// (brief-keyboard.md). Keyboard only: after loading the page it never moves or presses the
// pointer. It finds what the brief names in the browser's own accessibility tree, reads
// where the focus is from that tree, and judges by what the service stored. It knows
// nothing about how the app is built; where the brief leaves the means open (how a shape
// is added from the keyboard, how a dialog is reached), it tries the usual ways in turn.
//
//   node evals/apps/presentify/drive-keyboard.mjs <app-url> [--service=http://127.0.0.1:8360]
//        [--only=a,b] [--out=dir] [--headful]
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchChrome } from "../../../tools/internal/chrome.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const APP = args.find((a) => !a.startsWith("--"));
if (!APP) { console.error("usage: drive-keyboard.mjs <app-url> [--service=…] [--only=a,b] [--out=dir] [--headful]"); process.exit(2); }
const SERVICE = opt("service", "http://127.0.0.1:8360");
const ONLY = opt("only", "")?.split(",").filter(Boolean);
const OUT = opt("out", "/tmp/presentify-drive-keyboard");
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
mkdirSync(OUT, { recursive: true });
const NOTES = new Set();

const api = async (path, body) => (await fetch(SERVICE + path, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SEED = new Set(["d1", "d2", "d3"]);
const state = () => api("/api/_state");
const flat = (els) => els.flatMap((e) => (e.kind === "group" ? [e, ...flat(e.children)] : [e]));
async function deck(which) {
  const s = await state();
  const d = which === "new" ? s.decks.find((x) => !SEED.has(x.id)) : s.decks.find((x) => x.id === which || x.title === which);
  if (!d) return null;
  return { ...d, slides: d.slideOrder.map((id) => s.slides.find((x) => x.id === id)) };
}
async function stored(test, what, timeout = 9000) {
  const until = Date.now() + timeout;
  for (;;) {
    try { if (await test()) return true; } catch { /* not yet */ }
    if (Date.now() > until) throw new Error(`never stored: ${what}`);
    await sleep(250);
  }
}
const maybe = async (p) => { try { return await p; } catch { return null; } };

// ── where the focus is, by role and name ────────────────────────────────────
async function focused(page) {
  const h = (await page.evaluateHandle(() => {
    let e = document.activeElement;
    while (e && e.shadowRoot && e.shadowRoot.activeElement) e = e.shadowRoot.activeElement;
    // a one-stop widget (a list, a grid) names its current item, as a screen reader reads it
    const id = e?.getAttribute?.("aria-activedescendant");
    const item = id ? e.ownerDocument.getElementById(id) : null;
    if (item) return item;
    // else a list holding focus whose selected or current item says which it is
    // (noted: a screen reader is not told of it as the arrows move)
    const role = e?.getAttribute?.("role");
    if (role === "list" || role === "listbox" || role === "grid" || role === "tree") {
      const sel = e.querySelector('[aria-selected="true"], [aria-current]:not([aria-current="false"])');
      if (sel) { sel.dataset.kbdUnannounced = "1"; return sel; }
    }
    return e;
  })).asElement();
  if (!h) return { name: "", role: "", tag: "" };
  const tag = await h.evaluate((e) => e.tagName);
  if (tag === "BODY" || tag === "HTML") return { name: "", role: "", tag };
  const s = await page.accessibility.snapshot({ root: h, interestingOnly: false }).catch(() => null);
  const holdsSlide = await h.evaluate((e) => e.getAttribute("aria-label") === "Slide" || e.querySelector('[aria-label="Slide"]') !== null);
  if (await h.evaluate((e) => e.dataset.kbdUnannounced === "1")) NOTES.add("the slide list's current item is not exposed to assistive technology (no aria-activedescendant or focus on the item): read from its selected item");
  return { name: s?.name ?? "", role: s?.role ?? "", value: s?.value, tag, holdsSlide };
}
const SLIDE = /^Slide$/;
// the slide's stop: the slide itself (labelled "Slide"), or a stop that holds it
const named = (f, re) => typeof f.name === "string" && (re.test(f.name) || (re === SLIDE && f.holdsSlide === true && !/^Slide \d/.test(f.name)));
const say = (f) => f.tag === "BODY" || f.tag === "HTML" || f.tag === "" ? "nothing" : `${f.role || f.tag} "${f.name}"`;
async function key(page, k, mods = []) {
  for (const m of mods) await page.keyboard.down(m);
  await page.keyboard.press(k);
  for (const m of [...mods].reverse()) await page.keyboard.up(m);
  await sleep(120);
}
// Command on a Mac; an app that listens for Control is given the same chord once.
async function chordUntil(page, k, test, what, mods = []) {
  await key(page, k, ["Meta", ...mods]);
  if (await maybe(stored(test, what, 3000))) return;
  await key(page, k, ["Control", ...mods]);
  await stored(test, what, 6000);
}
/** Tab (or Shift-Tab) until the focus is on what `re` names, as a person does. */
async function tabTo(page, re, { max = 90, back = false, roles = null, what = String(re) } = {}) {
  const seen = [];
  for (let i = 0; i <= max; i++) {
    const f = await focused(page);
    if (named(f, re) && (roles === null || roles.includes(f.role))) return f;
    seen.push(say(f));
    if (i === max) break;
    await key(page, "Tab", back ? ["Shift"] : []);
  }
  throw new Error(`Tab never reached ${what} (passed: ${[...new Set(seen)].slice(-14).join(", ")})`);
}
async function open(page) {
  await page.goto(APP, { waitUntil: "networkidle2" });
  await sleep(1500);
}
/** Open a presentation from the list with the keyboard alone. */
async function openDeck(page, title) {
  await tabTo(page, new RegExp(title, "i"), { what: `the presentation "${title}"` });
  await key(page, "Enter");
  await sleep(1200);
  await tabTo(page, SLIDE, { what: "the slide (labelled Slide)" });
}
async function newDeck(page) {
  await open(page);
  await tabTo(page, /new presentation|^new\b|create|blank/i, { what: "New presentation" });
  await key(page, "Enter");
  await stored(async () => (await deck("new")) !== null, "a new presentation");
  await sleep(1200);
}
const slideCount = async (which) => (await deck(which))?.slides.length ?? 0;
const elementsOn = async (which, i = 0) => (await deck(which))?.slides[i]?.elements ?? [];

// ── scenarios ───────────────────────────────────────────────────────────────
const SCENARIOS = {
  // §1: Tab reaches each part, in reading order, and Shift-Tab comes back
  async tab_through_the_parts(page) {
    await open(page);
    await openDeck(page, "Field notes from the coast");
    // from the slide, the inspector lies ahead and the list and the tools behind
    await tabTo(page, /^(select|rectangle|ellipse|line|text)\b/i, { back: true, what: "a tool, Shift-Tab from the slide" });
    await tabTo(page, /^Slide \d+\b/, { what: "a slide in the list, Tab from the tools" });
    const there = await tabTo(page, SLIDE, { max: 4, what: "the slide, within a few Tabs of the list (the list one stop)" });
    if (!there) throw new Error("the slide not reached");
    // back from the slide, the list's part comes first (its own controls may sit around it)
    await tabTo(page, /^Slide \d+\b/, { back: true, max: 3, what: "the slide list, within a few Shift-Tabs of the slide" });
  },

  // §1: the list is one stop; arrows, Home and End move; Option-arrows reorder
  async slide_list_keys(page) {
    await open(page);
    await openDeck(page, "Field notes from the coast");
    await tabTo(page, /^Slide \d+\b/, { back: true, what: "the slide list" });
    await key(page, "Home");
    if (!/^Slide 1\b/.test((await focused(page)).name)) throw new Error(`Home: focus on ${say(await focused(page))}`);
    await key(page, "ArrowDown");
    if (!/^Slide 2\b/.test((await focused(page)).name)) throw new Error(`ArrowDown: focus on ${say(await focused(page))}`);
    await key(page, "End");
    if (!/^Slide 8\b/.test((await focused(page)).name)) throw new Error(`End: focus on ${say(await focused(page))}`);
    await key(page, "Home");
    const before = (await deck("d1")).slideOrder;
    await key(page, "ArrowDown", ["Alt"]);
    await stored(async () => { const o = (await deck("d1")).slideOrder; return o[0] === before[1] && o[1] === before[0]; }, "Option-Down moved slide 1 below slide 2");
    await chordUntil(page, "z", async () => (await deck("d1")).slideOrder[0] === before[0], "undo put the order back");
  },

  // §2: a shape added from the keyboard alone, selected, in the middle of the slide
  async add_shape_by_keyboard(page) {
    await newDeck(page);
    await tabTo(page, SLIDE, { what: "the slide" });
    const added = async () => (await elementsOn("new")).some((e) => e.kind === "rect" || e.kind === "rectangle");
    const tries = [
      async () => { await key(page, "r"); await key(page, "Enter"); },
      async () => { await tabTo(page, /^rectangle\b/i, { back: true, what: "the Rectangle tool" }); await key(page, "Enter"); await key(page, "Enter"); },
      async () => { await tabTo(page, /^rectangle\b/i, { back: true, what: "the Rectangle tool" }); await key(page, "Enter"); await tabTo(page, SLIDE, { what: "the slide" }); await key(page, "Enter"); },
    ];
    for (const t of tries) { await maybe(t()); if (await maybe(stored(added, "a rectangle", 2500))) break; }
    await stored(added, "a rectangle added without the pointer");
    const r = (await elementsOn("new")).find((e) => e.kind === "rect" || e.kind === "rectangle");
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    if (Math.abs(cx - 640) > 160 || Math.abs(cy - 360) > 120) throw new Error(`the rectangle is not in the middle: centre (${Math.round(cx)}, ${Math.round(cy)})`);
  },

  // §2: the editing and arranging keys, on the slide
  async edit_and_arrange_keys(page) {
    await open(page);
    await openDeck(page, "Field notes from the coast");
    const n0 = (await elementsOn("d1")).length;
    await key(page, "Escape");
    await tabTo(page, SLIDE, { what: "the slide", max: 6 });
    await key(page, "a", ["Meta"]);
    await chordUntil(page, "g", async () => (await elementsOn("d1")).length === 1 && (await elementsOn("d1"))[0].kind === "group", "Command-G grouped everything");
    await chordUntil(page, "g", async () => (await elementsOn("d1")).length >= n0, "Shift-Command-G ungrouped", ["Shift"]);
    await chordUntil(page, "d", async () => (await elementsOn("d1")).length > n0, "Command-D duplicated the selection");
    const n1 = (await elementsOn("d1")).length;
    await key(page, "Backspace");
    await stored(async () => (await elementsOn("d1")).length < n1, "Delete removed the selection");
    await chordUntil(page, "z", async () => (await elementsOn("d1")).length === n1, "undo brought it back");
    await chordUntil(page, "z", async () => (await elementsOn("d1")).length === n1, "redo, then the state as it was", ["Shift"]).catch(() => {});
  },

  // §2, §3: a key means what it means where the focus is
  async keys_follow_the_focus(page) {
    await open(page);
    await openDeck(page, "Field notes from the coast");
    const n0 = (await elementsOn("d1")).length;
    await key(page, "a", ["Meta"]);
    // into a number in the inspector: the arrows change it, Backspace and Command-A are the field's
    const f = await tabTo(page, /^(x|y|w|h|width|height|size|outline|stroke|border|radius|corner|opacity|font size)\b/i, { roles: ["spinbutton", "textbox", "TextField", "slider"], what: "a number in the inspector" });
    await key(page, "a", ["Meta"]);
    await key(page, "Backspace");
    await sleep(300);
    if ((await elementsOn("d1")).length !== n0) throw new Error(`Command-A and Backspace in "${f.name}" deleted things on the slide`);
    await key(page, "Escape");
    await sleep(300);
    const before = JSON.stringify(await elementsOn("d1"));
    await key(page, "ArrowUp");
    await key(page, "Enter");
    await stored(async () => JSON.stringify(await elementsOn("d1")) !== before, `ArrowUp in "${f.name}" changed the value`);
    const moved = (await elementsOn("d1")).map((e) => `${e.x},${e.y}`).join(" ");
    if (moved !== JSON.parse(before).map((e) => `${e.x},${e.y}`).join(" ") && !/^(x|y)\b/i.test(f.name)) throw new Error(`ArrowUp in "${f.name}" nudged the selection on the slide`);
  },

  // §3: Escape in an inspector field puts back what was there
  async escape_reverts_a_field(page) {
    await newDeck(page);
    await tabTo(page, SLIDE, { what: "the slide" });
    await maybe((async () => { await key(page, "r"); await key(page, "Enter"); })());
    await stored(async () => (await elementsOn("new")).length > 0, "a shape to inspect (added as in add_shape_by_keyboard)");
    const before = JSON.stringify(await elementsOn("new"));
    const f = await tabTo(page, /^(w|width|x)\b/i, { roles: ["spinbutton", "textbox", "TextField"], what: "the width or x field" });
    await key(page, "a", ["Meta"]);
    await page.keyboard.type("999", { delay: 20 });
    await key(page, "Escape");
    await sleep(2500);
    if (JSON.stringify(await elementsOn("new")) !== before) throw new Error(`Escape in "${f.name}" did not put the value back: it was applied`);
  },

  // §4: a dialog answers Return and Escape, and gives the focus back
  async delete_dialog_by_keyboard(page) {
    await open(page);
    const reach = async () => {
      // the presentation's own actions, reached by Tab: a Delete, or a menu holding one
      const own = await maybe(tabTo(page, /^delete\b.*reading group|reading group.*delete/i, { what: "Delete for Reading group" }));
      if (own) { await key(page, "Enter"); return; }
      await open(page);
      await tabTo(page, /(more|actions|options|menu|…|\.\.\.).*reading group|reading group.*(more|actions|options|menu)/i, { what: "Reading group's actions" });
      await key(page, "Enter");
      await sleep(400);
      for (let i = 0; i < 8; i++) { if (/^delete\b/i.test((await focused(page)).name)) break; await key(page, "ArrowDown"); }
      if (!/^delete\b/i.test((await focused(page)).name)) throw new Error(`the menu's Delete not reached by the arrows (focus on ${say(await focused(page))})`);
      await key(page, "Enter");
    };
    await reach();
    await sleep(500);
    if (!(await deck("d3"))) throw new Error("deleted without asking");
    await key(page, "Escape");
    await sleep(600);
    if (!(await deck("d3"))) throw new Error("Escape deleted it");
    const back = await focused(page);
    if (!/reading group/i.test(back.name)) NOTES.add(`after Escape the focus is on ${say(back)}, not on Reading group or its actions`);
    await reach();
    await sleep(500);
    await key(page, "Enter");
    await stored(async () => !(await deck("d3")), "Return took the dialog's main choice: Reading group deleted");
  },

  // §5: every shortcut in one place, and keys beside commands in menus
  async shortcuts_are_shown(page) {
    await open(page);
    await openDeck(page, "Field notes from the coast");
    const keyText = /[⌘⌥⇧⌃]|\b(cmd|ctrl|command|control)\b/i;
    const shown = async () => {
      const t = await page.evaluate(() => document.body.innerText);
      return (t.match(/[⌘⌃]\s*⇧?\s*[A-Z0-9]/g) ?? []).length + (t.match(/\b(Ctrl|Cmd)\s*\+\s*\w/g) ?? []).length;
    };
    const base = await shown();
    const tries = [
      async () => key(page, "/", ["Meta"]),
      async () => key(page, "?", ["Shift"]),
      async () => { await tabTo(page, /shortcut|keyboard/i, { what: "a Keyboard shortcuts control" }); await key(page, "Enter"); },
    ];
    let ok = false;
    for (const t of tries) {
      await maybe(t()); await sleep(600);
      if ((await shown()) >= base + 12) { ok = true; break; }
      await key(page, "Escape");
    }
    if (!ok) throw new Error("no place listing the shortcuts was found by ⌘/, ? or a Keyboard shortcuts control");
    const t = await page.evaluate(() => document.body.innerText);
    for (const w of ["undo", "group", "duplicate", "bring", "align"]) if (!new RegExp(w, "i").test(t)) throw new Error(`the shortcuts listed leave out ${w}`);
    if (!keyText.test(t)) throw new Error("the listing shows no keys");
  },

  // §6: what done looks like — a short deck made, reordered, undone and presented, keys only
  async keyboard_only_deck(page) {
    await newDeck(page);
    const slides = async () => slideCount("new");
    // two more slides: the new-slide key, or the control for it
    for (let n = 2; n <= 3; n++) {
      await tabTo(page, SLIDE, { what: "the slide" });
      const want = async () => (await slides()) >= n;
      await key(page, "Enter", ["Meta", "Shift"]); // tried first; the app's own key may differ
      if (!(await maybe(stored(want, "a slide", 1500)))) await maybe(chordUntil(page, "n", want, `slide ${n}`, ["Shift"]));
      if (!(await maybe(stored(want, "a slide", 1500)))) { await tabTo(page, /(new|add) slide/i, { back: true, what: "New slide" }); await key(page, "Enter"); }
      await stored(want, `slide ${n} added without the pointer`);
    }
    const order = (await deck("new")).slideOrder;
    await tabTo(page, /^Slide \d+\b/, { back: true, what: "the slide list" });
    await key(page, "End");
    await key(page, "ArrowUp", ["Alt"]);
    await stored(async () => { const o = (await deck("new")).slideOrder; return o[1] === order[2]; }, "Option-Up moved the last slide up");
    await chordUntil(page, "z", async () => JSON.stringify((await deck("new")).slideOrder) === JSON.stringify(order), "undo put the order back");
    // present from the first: the app's key, or its control
    await key(page, "Home");
    const presenting = async () => page.evaluate(() => {
      const els = [...document.querySelectorAll("*")].filter((e) => { const r = e.getBoundingClientRect(); return r.width >= innerWidth - 2 && r.height >= innerHeight - 2; });
      return document.fullscreenElement !== null || els.some((e) => /present/i.test(e.getAttribute("aria-label") ?? "") || /dialog|application/.test(e.getAttribute("role") ?? ""));
    });
    await key(page, "Enter", ["Meta", "Alt"]);
    if (!(await maybe(stored(presenting, "presenting", 1500)))) { await maybe(tabTo(page, /^(present|play)/i, { back: true, what: "Present" })); await key(page, "Enter"); }
    await sleep(800);
    await key(page, "ArrowRight"); await key(page, "ArrowRight");
    await key(page, "Escape");
    await sleep(800);
    await tabTo(page, SLIDE, { what: "the slide, back in the editor after presenting" });
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
  results.push({ name, pass: !error, error, ms: Date.now() - t0 });
  console.log(`${error ? "FAIL" : "pass"}  ${name}${error ? ` — ${error}` : ""}`);
  await ctx.close();
}
await browser.close();
await api("/api/_reset", {});
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
for (const n of NOTES) console.log(`note  ${n}`);
console.log(`${results.filter((r) => r.pass).length} of ${results.length} passed · ${OUT}/results.json`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
