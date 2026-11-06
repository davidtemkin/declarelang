// verify-locators — Playwright's way of finding things and asserting on them, on an
// assert script's `page` and `expect`. Agents and testers write Playwright from habit;
// without it they left the checker for a harness of their own (Venue runs 11 and 13),
// and its layout checks went with it. So what they write works as Playwright's does —
// found by role and accessible name (Chrome's own, as a screen reader hears it), label,
// text; strict; waiting — and acts through the driver's own input: a press is a real
// press (a finger on a touch device), and every action lets the program settle, as the
// driver's verbs do. What Playwright has and this does not fails at the call, naming
// what to write instead.
//
// Locators: page.getByRole / getByLabel / getByText / getByPlaceholder / getByAltText /
// getByTitle / getByTestId / locator(css), each also on a locator (scoping); filter({
// hasText, hasNotText, has, hasNot }); first() / last() / nth(i); count() / all().
// Actions: click / dblclick / tap / hover / fill / clear / pressSequentially / type /
// press / check / uncheck / setChecked / focus / blur / selectOption /
// scrollIntoViewIfNeeded. Reads: isVisible / isHidden / isEnabled / isDisabled /
// isChecked / isEditable / innerText / textContent / inputValue / getAttribute /
// allInnerTexts / allTextContents / boundingBox / evaluate / evaluateAll / waitFor /
// screenshot. The page's selector shortcuts (page.click(sel), page.fill(sel, v), …) are
// the same locators. expect(locator) retries toBeVisible / toBeHidden / toBeEnabled /
// toBeDisabled / toBeChecked / toBeFocused / toBeEditable / toHaveText / toContainText /
// toHaveValue / toHaveAttribute / toHaveCount / toHaveAccessibleName, with `.not`;
// expect(page) toHaveURL / toHaveTitle; expect(value) the plain matchers. Waits and
// retries run on the driven clock, 5 s by default, as Playwright's expect does.

import { timing } from "./timing.mjs";

const LOCATOR = Symbol("locator");
const PAGE = Symbol("page");

/** Playwright's Page methods this page does not have, and what to write instead. */
const PAGE_HINTS = {
  waitForURL: "read where the program is with expect.attr(\"app\", \"location\", …), or expect(page).toHaveURL(…)",
  waitForLoadState: "drive.settleData() waits for the program's requests; drive.settleMotion() for its motion",
  waitForTimeout: "drive.wait(ms) moves the page's clock",
  waitForEvent: "settle with drive.settleData() / drive.settleMotion(), then assert",
  frameLocator: "frames are not driven here",
  route: "--fixtures <dir> answers the program's requests from files",
  unroute: "--fixtures <dir> answers the program's requests from files",
  context: "each run is a context of its own; drive.device() loads the page on another device",
  pause: "a script runs to its end; check a value with expect.attr, or look at the page with declare-look",
  dragAndDrop: "drive.drag(path, dx, dy) drags as a finger or a mouse does",
  setInputFiles: "file pickers are not driven here",
  getByLabelText: "getByLabel",
};

/** Playwright's Locator members this one does not have. */
const LOCATOR_HINTS = {
  dragTo: "drive.drag(path, dx, dy) drags as a finger or a mouse does",
  setInputFiles: "file pickers are not driven here",
  highlight: "take a picture with locator.screenshot() or page.screenshot()",
  elementHandle: "evaluate(fn) runs fn on the element",
  elementHandles: "evaluateAll(fn) runs fn on all of them",
  and: "chain the narrower query: getByRole(…).filter({ has: … })",
  or: "make two locators and check each",
};

/** Runs IN the page: the elements a chain of steps finds, in document order,
 *  kept as window.__locHits for the actions that follow. */
function resolveInPage(steps) {
  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const fits = (s, want, exact) => {
    if (want == null) return true;
    s = norm(s);
    if (want.re !== undefined) return new RegExp(want.re, want.flags).test(s);
    return exact ? s === norm(want.s) : s.toLowerCase().includes(norm(want.s).toLowerCase());
  };
  const IMPLICIT = (el) => {
    const r = el.getAttribute("role");
    if (r) return r.split(/\s+/)[0];
    const t = el.tagName.toLowerCase();
    if (t === "button") return "button";
    if (t === "a" && el.hasAttribute("href")) return "link";
    if (/^h[1-6]$/.test(t)) return "heading";
    if (t === "textarea") return "textbox";
    if (t === "select") return "combobox";
    if (t === "img") return "img";
    if (t === "ul" || t === "ol") return "list";
    if (t === "li") return "listitem";
    if (t === "dialog") return "dialog";
    if (t === "nav") return "navigation";
    if (t === "main") return "main";
    if (t === "input") {
      const ty = (el.getAttribute("type") || "text").toLowerCase();
      return ty === "checkbox" ? "checkbox" : ty === "radio" ? "radio" : ty === "range" ? "slider"
        : ty === "search" ? "searchbox" : ty === "button" || ty === "submit" ? "button" : "textbox";
    }
    return null;
  };
  // Roles from the element itself — its role attribute (which the runtime writes
  // on what it draws) or its tag. Chrome's computed role and name cost ~3 ms an
  // element to read, so they are asked only of the few candidates a name query
  // leaves (below): a page of 650 seats cannot pay that on every query.
  const roleOf = IMPLICIT;
  const text = (el) => norm(el.innerText ?? el.textContent);
  const squash = (x) => String(x ?? "").replace(/\s+/g, "").toLowerCase();
  const labelOf = (el) => {
    const a = el.getAttribute("aria-label");
    if (a) return a;
    const by = el.getAttribute("aria-labelledby");
    if (by) return by.split(/\s+/).map((id) => text(document.getElementById(id) ?? document.createElement("i"))).join(" ").trim();
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return text(l); }
    const wrap = el.closest("label");
    return wrap ? text(wrap) : "";
  };
  // an aria-label is the name unless aria-labelledby is given (the name algorithm's
  // order), so Chrome is asked only otherwise — and once an element per query: a
  // seat map's 650 labelled buttons cost ~1.3 s a query asked each time
  const names = new Map();
  const nameOf = (el) => {
    let n = names.get(el);
    if (n !== undefined) return n;
    const a = el.getAttribute("aria-label");
    n = a && a.trim() !== "" && !el.hasAttribute("aria-labelledby") ? a
      : typeof el.computedName === "string" ? el.computedName
      : labelOf(el) || (IMPLICIT(el) === "textbox" ? el.getAttribute("placeholder") || "" : text(el));
    names.set(el, n);
    return n;
  };
  // every source an accessible name is made from, cheaply: a name that fits none of
  // them, nor all of them together, cannot be the element's name
  const mayBeNamed = (el, want, exact) => {
    if (want == null) return true;
    const by = el.getAttribute("aria-labelledby");
    const sources = [el.getAttribute("aria-label"), by ? by.split(/\s+/).map((id) => text(document.getElementById(id) ?? document.createElement("i"))).join(" ") : null,
      labelOf(el), text(el), el.getAttribute("title"), el.getAttribute("placeholder"), el.getAttribute("alt"), el.value].filter((x) => typeof x === "string" && x !== "");
    return sources.some((x) => fits(x, want, false)) || fits(sources.join(" "), want, false) || (exact && sources.length === 0);
  };
  // what assistive technology cannot reach is not found by a role, a label or a
  // text — the page behind an open sheet (inert), what is hidden from a screen
  // reader, what is not displayed
  const hidden = (el) => el.closest('[inert], [aria-hidden="true"]') !== null
    || (typeof el.checkVisibility === "function" ? !el.checkVisibility({ visibilityProperty: true }) : getComputedStyle(el).display === "none");
  const aria = (el, k) => el.getAttribute("aria-" + k);
  const roleState = {
    checked: (el) => el.checked === true || aria(el, "checked") === "true",
    pressed: (el) => aria(el, "pressed") === "true",
    expanded: (el) => aria(el, "expanded") === "true",
    selected: (el) => el.selected === true || aria(el, "selected") === "true",
    disabled: (el) => el.disabled === true || el.closest('[aria-disabled="true"]') !== null,
    level: (el) => Number(aria(el, "level") ?? (/^H([1-6])$/.exec(el.tagName)?.[1] ?? NaN)),
  };
  const order = (list) => list.sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  const below = (roots, pred) => {
    const seen = new Set();
    for (const r of roots) for (const el of r.querySelectorAll("*")) if (!seen.has(el) && pred(el)) seen.add(el);
    return order([...seen]);
  };
  const css = (roots, sel) => {
    const seen = new Set();
    for (const r of roots) for (const el of r.querySelectorAll(sel)) seen.add(el);
    return order([...seen]);
  };
  const run = (chain, roots) => {
    let cur = roots;
    for (const s of chain) {
      if (s.by === "role") {
        // cheapest first: role, state, the name's sources; only then whether it is
        // shown (a style read) and its computed name (Chrome's, ~3 ms an element)
        cur = below(cur, (el) => roleOf(el) === s.role
          && ["checked", "pressed", "expanded", "selected", "disabled"].every((k) => s.opts[k] === undefined || roleState[k](el) === s.opts[k])
          && (s.opts.level === undefined || roleState.level(el) === s.opts.level)
          && mayBeNamed(el, s.name, s.exact) && (s.opts.includeHidden || !hidden(el)) && fits(s.name == null ? "" : nameOf(el), s.name, s.exact));
      } else if (s.by === "label") {
        cur = below(cur, (el) => !hidden(el) && (IMPLICIT(el) !== null || el.isContentEditable) && labelOf(el) !== "" && fits(labelOf(el), s.name, s.exact));
      } else if (s.by === "placeholder") {
        cur = below(cur, (el) => !hidden(el) && el.hasAttribute("placeholder") && fits(el.getAttribute("placeholder"), s.name, s.exact));
      } else if (s.by === "text") {
        // innerText lays the page out; an element whose textContent cannot hold the
        // words (spacing aside) cannot either, so it is never asked — a page of 650
        // seats paid innerText for every element and its children on each query
        const could = (el) => s.name == null || s.name.re !== undefined || squash(el.textContent).includes(squash(s.name.s));
        cur = below(cur, (el) => could(el) && fits(text(el), s.name, s.exact) && !hidden(el) && ![...el.children].some((c) => could(c) && fits(text(c), s.name, s.exact)));
      } else if (s.by === "altText") {
        cur = below(cur, (el) => !hidden(el) && el.hasAttribute("alt") && fits(el.getAttribute("alt"), s.name, s.exact));
      } else if (s.by === "title") {
        cur = below(cur, (el) => !hidden(el) && el.hasAttribute("title") && fits(el.getAttribute("title"), s.name, s.exact));
      } else if (s.by === "testId") {
        cur = below(cur, (el) => el.getAttribute("data-testid") === s.id);
      } else if (s.by === "css") {
        cur = css(cur, s.sel);
      } else if (s.by === "filter") {
        cur = cur.filter((el) => (s.hasText === undefined || fits(text(el), s.hasText, false))
          && (s.hasNotText === undefined || !fits(text(el), s.hasNotText, false))
          && (s.has === undefined || run(s.has, [el]).length > 0)
          && (s.hasNot === undefined || run(s.hasNot, [el]).length === 0));
      } else if (s.by === "nth") {
        const el = s.index < 0 ? cur[cur.length + s.index] : cur[s.index];
        cur = el === undefined ? [] : [el];
      }
    }
    return cur;
  };
  const hits = run(steps, [document]);
  const shown = (el) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  window.__locHits = hits;
  return hits.map((el, i) => ({ i, shown: shown(el), what: `<${el.tagName.toLowerCase()}${el.getAttribute("role") ? ` role=${el.getAttribute("role")}` : ""}> "${nameOf(el).slice(0, 60)}"` }));
}

/** `page`, with Playwright's locators on it, and an `expect` that takes a locator,
 *  the page or a value. `act` presses at a window point, as the driver does; `settle`
 *  lets the program answer an action; `advance` moves the page's clock (its timers
 *  are virtual) while a locator waits; `fail` ends the script with a message;
 *  `judged` counts an assertion that judged something. */
// KEYS AS PEOPLE NAME THEM. A chord is written as a person reads it — "Cmd+K",
// "Shift+Option+ArrowLeft", "Mod+S" (⌘ on a Mac, Ctrl elsewhere) — and pressed as
// the keyboard makes it: modifiers down, the key, modifiers up. A Mac's editing
// chords (⌘C, ⌥←, ⌘Z…) are also the editing commands a real keyboard runs and a
// headless one does not, so they are sent with the key, as Playwright does.
const MOD = { cmd: "Meta", command: "Meta", meta: "Meta", "⌘": "Meta", ctrl: "Control", control: "Control", "⌃": "Control",
  option: "Alt", opt: "Alt", alt: "Alt", "⌥": "Alt", shift: "Shift", "⇧": "Shift",
  mod: process.platform === "darwin" ? "Meta" : "Control", controlormeta: process.platform === "darwin" ? "Meta" : "Control" };
const KEY = { esc: "Escape", return: "Enter", del: "Delete", up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", space: "Space" };
const MAC_COMMANDS = {
  "Meta+a": ["selectAll"], "Meta+c": ["copy"], "Meta+x": ["cut"], "Meta+v": ["paste"], "Meta+z": ["undo"], "Meta+Shift+z": ["redo"],
  "Alt+ArrowLeft": ["moveWordLeft"], "Alt+ArrowRight": ["moveWordRight"], "Meta+ArrowLeft": ["moveToBeginningOfLine"], "Meta+ArrowRight": ["moveToEndOfLine"],
  "Meta+ArrowUp": ["moveToBeginningOfDocument"], "Meta+ArrowDown": ["moveToEndOfDocument"],
  "Alt+Backspace": ["deleteWordBackward"], "Meta+Backspace": ["deleteToBeginningOfLine"],
};
export function parseChord(name) {
  const text = String(name);
  const parts = text.length > 1 && text.endsWith("++") ? [...text.slice(0, -2).split("+"), "+"] : text.length > 1 ? text.split("+") : [text];
  const mods = parts.slice(0, -1).map((m) => MOD[m.toLowerCase()] ?? m);
  const last = parts[parts.length - 1];
  const key = KEY[last.toLowerCase()] ?? (last.length === 1 ? last : last);
  return { mods, key };
}
export async function pressChord(page, name) {
  const { mods, key } = parseChord(name);
  const id = [...new Set(mods)].sort((a, b) => ["Meta", "Control", "Alt", "Shift"].indexOf(a) - ["Meta", "Control", "Alt", "Shift"].indexOf(b)).join("+");
  const commands = process.platform === "darwin" ? MAC_COMMANDS[`${id}${id ? "+" : ""}${key.length === 1 ? key.toLowerCase() : key}`] : undefined;
  for (const m of mods) await page.keyboard.down(m);
  await page.keyboard.press(key, commands !== undefined ? { commands } : undefined);
  for (const m of [...mods].reverse()) await page.keyboard.up(m);
}
const CLICK_OPTIONS = new Set(["button", "clickCount", "force", "modifiers", "noWaitAfter", "position", "timeout", "trial"]);

export function withLocators(page, { act, settle, advance, pause = async () => {}, fail = (m) => { throw new Error(m); }, judged = () => {} }) {
  const find = (steps) => timing.time("locator: query the page", () => page.evaluate(resolveInPage, steps));
  const on = (i, fn, arg) => page.evaluate((i, fn, arg) => new Function("el", "arg", `return (${fn})(el, arg)`)(window.__locHits[i], arg), i, fn.toString(), arg);
  const onAll = (fn, arg) => page.evaluate((fn, arg) => new Function("els", "arg", `return (${fn})(els, arg)`)(window.__locHits, arg), fn.toString(), arg);
  const tick = async () => timing.time("locator: wait a tick for it", async () => { await advance(50); await new Promise((r) => setTimeout(r, 30)); });

  const say = (n) => n == null ? "" : n.re !== undefined ? `/${n.re}/${n.flags}` : JSON.stringify(n.s);
  const describe = (steps) => "page." + steps.map((s) => {
    if (s.by === "role") return `getByRole("${s.role}"${s.name != null ? `, { name: ${say(s.name)} }` : ""})`;
    if (s.by === "css") return `locator(${JSON.stringify(s.sel)})`;
    if (s.by === "testId") return `getByTestId(${JSON.stringify(s.id)})`;
    if (s.by === "filter") return "filter(…)";
    if (s.by === "nth") return s.index === 0 ? "first()" : s.index === -1 ? "last()" : `nth(${s.index})`;
    return `getBy${s.by[0].toUpperCase()}${s.by.slice(1)}(${say(s.name)})`;
  }).join(".");

  // ONE element to act on, as Playwright's strict mode has it: two or more is an error
  // naming them; none, or one not yet shown, is waited for (the driven clock moving)
  const one = async (steps, timeout = 5000) => {
    const until = Date.now() + timeout;
    for (;;) {
      const found = await find(steps);
      if (found.length > 1) fail(`${describe(steps)} matches ${found.length} elements — name it more closely, scope it inside another locator, or take .first() / .nth(i): ${found.slice(0, 8).map((h) => h.what).join(", ")}${found.length > 8 ? ", …" : ""}`);
      if (found.length === 1 && found[0].shown) return found[0].i;
      if (Date.now() > until) fail(found.length === 0 ? `${describe(steps)} found nothing within ${timeout / 1000} s` : `${describe(steps)} found ${found[0].what}, which is not shown`);
      await tick();
    }
  };
  const centre = (i) => on(i, (el) => { el.scrollIntoView({ block: "nearest" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  // WHERE A PRESS LANDS, as the driver's own: on a still target (three looks in
  // a row agree — a glide or a scroll moving it is waited out), and only where
  // the element is what a person would touch there — a point another element
  // covers is said, never pressed (force: true presses it anyway)
  const spot = (i, at) => on(i, (el, at) => { const r = el.getBoundingClientRect(); return at ? { x: r.left + at.x, y: r.top + at.y } : { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, at ?? null);
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  const aim = async (i, steps, o = {}) => {
    await on(i, (el) => el.scrollIntoView({ block: "nearest" }));
    let c = await spot(i, o.position);
    for (let tries = 0, same = 0; same < 3; tries++) {
      await frame();
      const again = await spot(i, o.position);
      if (Math.abs(again.x - c.x) < 0.5 && Math.abs(again.y - c.y) < 0.5) { same++; continue; }
      same = 0; c = again;
      if (tries >= 40) fail(`${describe(steps)} is still moving — a press would land where it was, not where it is going. Let its motion finish first (drive.wait, or drive.settleMotion)`);
    }
    if (o.force !== true) {
      const cover = await on(i, (el, p) => {
        const t = document.elementFromPoint(p.x, p.y);
        // a view sliding in (a sheet opening) holds still where its motion paused,
        // since time is the script's: said, or it reads as a view laid out off-screen
        if (t === null) return "nothing — the point is outside the window (a view still opening or sliding in stays where its motion paused until the script lets time pass: drive.settleMotion() first)";
        if (el === t || el.contains(t)) return null;
        const v = window.__declare?.profile?.viewOf?.(t)?.view;
        const label = t.getAttribute("aria-label") || (t.textContent ?? "").trim().slice(0, 40);
        return `${v ?? "<" + t.tagName.toLowerCase() + ">"}${label ? ` ("${label}")` : ""}`;
      }, c);
      if (cover !== null) fail(`${describe(steps)}: a press at its ${o.position ? "point" : "centre"} (${Math.round(c.x)}, ${Math.round(c.y)}) would land on ${cover}, which covers it there — what a person would touch. Close or move what covers it; force: true presses there anyway`);
    }
    return c;
  };
  const clickOptions = (verb, o) => {
    const odd = Object.keys(o).filter((k) => !CLICK_OPTIONS.has(k));
    if (odd.length > 0) fail(`${verb}({ ${odd.join(", ")} }): not an option here — ${[...CLICK_OPTIONS].join(", ")}${odd.includes("delay") ? " (time between presses is the script's: drive.wait(ms))" : ""}`);
    if (o.button !== undefined && !["left", "right", "middle"].includes(o.button)) fail(`${verb}({ button: ${JSON.stringify(o.button)} }): a button is "left", "right" or "middle"`);
  };
  const typeInto = async (i, text) => {
    await on(i, (el) => el.focus());
    await page.keyboard.type(String(text));
    await settle();
  };

  const name = (n) => n == null ? null : n instanceof RegExp ? { re: n.source, flags: n.flags } : { s: String(n) };
  const stepsOf = (l) => l?.[LOCATOR] ?? null;
  const parseSelector = (sel) => {
    if (typeof sel !== "string") { const st = stepsOf(sel); if (st) return st; fail(`locator(…) takes a CSS selector or another locator`); }
    if (sel.startsWith("text=")) return [{ by: "text", name: { s: sel.slice(5).replace(/^"(.*)"$/, "$1") }, exact: /^".*"$/.test(sel.slice(5)) }];
    if (sel.startsWith("css=")) return [{ by: "css", sel: sel.slice(4) }];
    if (/^(role|xpath|internal:|id|data-testid)=/.test(sel) || sel.startsWith("//")) fail(`locator(${JSON.stringify(sel)}): this page takes CSS and text= selectors — for a role, getByRole(role, { name })`);
    return [{ by: "css", sel }];
  };
  const by = (steps, step) => locator([...steps, step]);
  const chainers = (steps) => ({
    getByRole: (role, o = {}) => by(steps, { by: "role", role, name: name(o.name), exact: o.exact === true, opts: { checked: o.checked, pressed: o.pressed, expanded: o.expanded, selected: o.selected, disabled: o.disabled, level: o.level, includeHidden: o.includeHidden === true } }),
    getByLabel: (n, o = {}) => by(steps, { by: "label", name: name(n), exact: o.exact === true }),
    getByText: (n, o = {}) => by(steps, { by: "text", name: name(n), exact: o.exact === true }),
    getByPlaceholder: (n, o = {}) => by(steps, { by: "placeholder", name: name(n), exact: o.exact === true }),
    getByAltText: (n, o = {}) => by(steps, { by: "altText", name: name(n), exact: o.exact === true }),
    getByTitle: (n, o = {}) => by(steps, { by: "title", name: name(n), exact: o.exact === true }),
    getByTestId: (id) => by(steps, { by: "testId", id: String(id) }),
    locator: (sel, o = {}) => {
      const l = locator([...steps, ...parseSelector(sel)]);
      return o.hasText !== undefined || o.has !== undefined || o.hasNotText !== undefined || o.hasNot !== undefined ? l.filter(o) : l;
    },
  });

  function locator(steps) {
    const api = {
      [LOCATOR]: steps,
      ...chainers(steps),
      filter: (o = {}) => by(steps, { by: "filter", hasText: o.hasText === undefined ? undefined : name(o.hasText), hasNotText: o.hasNotText === undefined ? undefined : name(o.hasNotText), has: o.has === undefined ? undefined : stepsOf(o.has), hasNot: o.hasNot === undefined ? undefined : stepsOf(o.hasNot) }),
      first: () => by(steps, { by: "nth", index: 0 }),
      last: () => by(steps, { by: "nth", index: -1 }),
      nth: (n) => by(steps, { by: "nth", index: n }),
      async count() { return (await find(steps)).length; },
      async all() { return (await find(steps)).map((_, i) => by(steps, { by: "nth", index: i })); },
      async click(o = {}) {
        clickOptions("click", o);
        const i = await one(steps, o.timeout);
        const c = await aim(i, steps, o);
        if (o.trial === true) return;
        const mods = (o.modifiers ?? []).map((m) => parseChord(m + "+x").mods[0]);
        for (const m of mods) await page.keyboard.down(m);
        // a double is two presses a person's beat apart, inside the platform's window
        for (let k = 0; k < (o.clickCount ?? 1); k++) { if (k > 0) await pause(100); await act(c.x, c.y, { button: o.button, count: k + 1 }); }
        for (const m of [...mods].reverse()) await page.keyboard.up(m);
        await settle();
      },
      async dblclick(o = {}) { clickOptions("dblclick", o); return api.click({ ...o, clickCount: 2 }); },
      async tap(o = {}) { return api.click(o); },
      async hover(o = {}) { const c = await aim(await one(steps, o.timeout), steps, o); await page.mouse.move(c.x, c.y); await settle(); },
      async fill(value, o = {}) {
        const i = await one(steps, o.timeout);
        await on(i, (el) => { el.focus(); if (typeof el.select === "function") el.select(); });
        if (String(value) === "") await page.keyboard.press("Backspace");
        else await page.keyboard.type(String(value));
        await settle();
      },
      async clear(o = {}) { return api.fill("", o); },
      async pressSequentially(text, o = {}) { await typeInto(await one(steps, o.timeout), text); },
      async type(text, o = {}) { await typeInto(await one(steps, o.timeout), text); },
      async press(key, o = {}) { const i = await one(steps, o.timeout); await on(i, (el) => el.focus()); await pressChord(page, key); await settle(); },
      async check(o = {}) { if (!(await api.isChecked(o))) await api.click(o); },
      async uncheck(o = {}) { if (await api.isChecked(o)) await api.click(o); },
      async setChecked(v, o = {}) { return v ? api.check(o) : api.uncheck(o); },
      async focus(o = {}) { const i = await one(steps, o.timeout); await on(i, (el) => el.focus()); await settle(); },
      async blur(o = {}) { const i = await one(steps, o.timeout); await on(i, (el) => el.blur()); await settle(); },
      async selectOption(values, o = {}) {
        const i = await one(steps, o.timeout);
        const want = (Array.isArray(values) ? values : [values]).map((v) => typeof v === "string" ? { value: v, label: v } : v);
        const chosen = await on(i, (el, want) => {
          if (el.tagName !== "SELECT") return null;
          const picked = [...el.options].filter((op) => want.some((w) => (w.value !== undefined && op.value === w.value) || (w.label !== undefined && op.label === w.label) || (w.index !== undefined && op.index === w.index)));
          for (const op of el.options) op.selected = picked.includes(op);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return picked.map((op) => op.value);
        }, want);
        if (chosen === null) fail(`${describe(steps)}.selectOption(…) works on a <select> — a Combobox is chosen by typing into it and pressing Enter, or by clicking its option`);
        await settle();
        return chosen;
      },
      async scrollIntoViewIfNeeded(o = {}) { const i = await one(steps, o.timeout); await on(i, (el) => el.scrollIntoView({ block: "nearest" })); await settle(); },
      async isVisible() { const hs = await find(steps); return hs.some((h) => h.shown); },
      async isHidden() { return !(await api.isVisible()); },
      async isDisabled(o = {}) { const i = await one(steps, o.timeout); return on(i, (el) => el.disabled === true || el.closest('[aria-disabled="true"]') !== null); },
      async isEnabled(o = {}) { return !(await api.isDisabled(o)); },
      async isEditable(o = {}) { const i = await one(steps, o.timeout); return on(i, (el) => !el.disabled && !el.readOnly && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))); },
      async isChecked(o = {}) { const i = await one(steps, o.timeout); return on(i, (el) => el.checked === true || el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-pressed") === "true"); },
      async innerText(o = {}) { const i = await one(steps, o.timeout); return on(i, (el) => el.innerText); },
      async textContent(o = {}) { const i = await one(steps, o.timeout); return on(i, (el) => el.textContent); },
      async inputValue(o = {}) { const i = await one(steps, o.timeout); return on(i, (el) => el.value ?? ""); },
      async getAttribute(n, o = {}) { const i = await one(steps, o.timeout); return on(i, (el, n) => el.getAttribute(n), n); },
      async allInnerTexts() { await find(steps); return onAll((els) => els.map((el) => el.innerText)); },
      async allTextContents() { await find(steps); return onAll((els) => els.map((el) => el.textContent)); },
      async boundingBox(o = {}) { const i = await one(steps, o.timeout); return on(i, (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }); },
      async evaluate(fn, arg, o = {}) { const i = await one(steps, o.timeout); return on(i, fn, arg); },
      async evaluateAll(fn, arg) { await find(steps); return onAll(fn, arg); },
      async screenshot(o = {}) {
        const i = await one(steps, o.timeout);
        const h = (await page.evaluateHandle((i) => window.__locHits[i], i)).asElement();
        return h.screenshot(o);
      },
      async waitFor({ state = "visible", timeout = 5000 } = {}) {
        const until = Date.now() + timeout;
        for (;;) {
          const hs = await find(steps);
          const vis = hs.some((h) => h.shown);
          if ((state === "visible" && vis) || (state === "hidden" && !vis) || (state === "attached" && hs.length > 0) || (state === "detached" && hs.length === 0)) return;
          if (Date.now() > until) fail(`${describe(steps)} did not become ${state} within ${timeout / 1000} s`);
          await tick();
        }
      },
    };
    timing.wrap("locator", api);
    return new Proxy(api, {
      get(t, k) {
        if (k in t || typeof k === "symbol" || k === "then") return t[k];
        const hint = LOCATOR_HINTS[k];
        return () => fail(`${describe(steps)}.${String(k)}() — ${hint ? `not on this page's locators: ${hint}` : `a locator here has ${Object.keys(api).filter((x) => typeof x === "string").join(", ")}`} (verify.md § Assert scripts)`);
      },
    });
  }

  // ── expect ─────────────────────────────────────────────────────────────
  const retry = async (label, check, timeout = 5000) => timing.time("expect(locator), in all", () => retryOnce(label, check, timeout));
  const retryOnce = async (label, check, timeout) => {
    const until = Date.now() + timeout;
    let last = null;
    for (;;) {
      const r = await check();
      if (r.ok) { judged(); return; }
      last = r.got;
      if (Date.now() > until) fail(`${label} — got ${last} (after ${timeout / 1000} s)`);
      await tick();
    }
  };
  const textMatch = (got, want, contain) => {
    const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
    if (want instanceof RegExp) return want.test(norm(got));
    return contain ? norm(got).includes(norm(want)) : norm(got) === norm(want);
  };
  const locatorMatchers = (l, not) => {
    const steps = stepsOf(l);
    const d = describe(steps);
    const first = async () => { const hs = await find(steps); return hs.length === 0 ? null : hs[0]; };
    const read = async (fn, arg) => { const h = await first(); return h === null ? undefined : on(h.i, fn, arg); };
    const m = (label, test, show) => async (o = {}) => retry(`expect(${d})${not ? ".not" : ""}.${label}`, async () => {
      const got = await test();
      return { ok: not ? !got.pass : got.pass, got: show(got) };
    }, o.timeout);
    const T = (el) => el.innerText ?? el.textContent ?? "";
    return {
      toBeVisible: m("toBeVisible()", async () => { const hs = await find(steps); return { pass: hs.some((h) => h.shown), n: hs.length }; }, (g) => g.n === 0 ? "no element" : g.pass ? "visible" : "not visible"),
      toBeHidden: m("toBeHidden()", async () => { const hs = await find(steps); return { pass: !hs.some((h) => h.shown) }; }, (g) => g.pass ? "hidden" : "visible"),
      toBeEnabled: m("toBeEnabled()", async () => { const v = await read((el) => !(el.disabled === true || el.closest('[aria-disabled="true"]') !== null)); return { pass: v === true, v }; }, (g) => g.v === undefined ? "no element" : g.v ? "enabled" : "disabled"),
      toBeDisabled: m("toBeDisabled()", async () => { const v = await read((el) => el.disabled === true || el.closest('[aria-disabled="true"]') !== null); return { pass: v === true, v }; }, (g) => g.v === undefined ? "no element" : g.v ? "disabled" : "enabled"),
      toBeChecked: (o = {}) => m("toBeChecked()", async () => { const v = await read((el) => el.checked === true || el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-pressed") === "true"); return { pass: v === (o.checked ?? true), v }; }, (g) => g.v === undefined ? "no element" : g.v ? "checked" : "not checked")(o),
      toBeFocused: m("toBeFocused()", async () => { const v = await read((el) => document.activeElement === el); return { pass: v === true, v }; }, (g) => g.v ? "focused" : "not focused"),
      toBeEditable: m("toBeEditable()", async () => { const v = await read((el) => !el.disabled && !el.readOnly && (el.isContentEditable || ["INPUT", "TEXTAREA"].includes(el.tagName))); return { pass: v === true, v }; }, (g) => g.v ? "editable" : "not editable"),
      toHaveText: (want, o = {}) => m(`toHaveText(${want instanceof RegExp ? want : JSON.stringify(want)})`, async () => { const v = await read(T); return { pass: v !== undefined && textMatch(v, want, false), v }; }, (g) => g.v === undefined ? "no element" : JSON.stringify(g.v))(o),
      toContainText: (want, o = {}) => m(`toContainText(${want instanceof RegExp ? want : JSON.stringify(want)})`, async () => { const v = await read(T); return { pass: v !== undefined && textMatch(v, want, true), v }; }, (g) => g.v === undefined ? "no element" : JSON.stringify(g.v))(o),
      toHaveValue: (want, o = {}) => m(`toHaveValue(${JSON.stringify(String(want))})`, async () => { const v = await read((el) => el.value ?? ""); return { pass: v !== undefined && (want instanceof RegExp ? want.test(v) : v === String(want)), v }; }, (g) => g.v === undefined ? "no element" : JSON.stringify(g.v))(o),
      toHaveAttribute: (n, want, o = {}) => m(`toHaveAttribute(${JSON.stringify(n)}${want === undefined ? "" : `, ${JSON.stringify(String(want))}`})`, async () => { const v = await read((el, n) => el.getAttribute(n), n); return { pass: v != null && (want === undefined || (want instanceof RegExp ? want.test(v) : v === String(want))), v }; }, (g) => g.v == null ? "no such attribute" : JSON.stringify(g.v))(o),
      toHaveAccessibleName: (want, o = {}) => m(`toHaveAccessibleName(${JSON.stringify(String(want))})`, async () => { const v = await read((el) => el.computedName ?? el.getAttribute("aria-label") ?? ""); return { pass: v !== undefined && textMatch(v, want, false), v }; }, (g) => JSON.stringify(g.v))(o),
      toHaveCount: (n, o = {}) => m(`toHaveCount(${n})`, async () => { const v = (await find(steps)).length; return { pass: v === n, v }; }, (g) => String(g.v))(o),
    };
  };
  const pageMatchers = (not) => {
    const m = (label, test) => async (want, o = {}) => retry(`expect(page)${not ? ".not" : ""}.${label}(${want instanceof RegExp ? want : JSON.stringify(want)})`, async () => {
      const v = await test();
      const pass = want instanceof RegExp ? want.test(v) : v === String(want) || v.endsWith(String(want));
      return { ok: not ? !pass : pass, got: JSON.stringify(v) };
    }, o.timeout);
    return { toHaveURL: m("toHaveURL", () => page.url()), toHaveTitle: m("toHaveTitle", () => page.title()) };
  };
  const valueMatchers = (v, not) => {
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const m = (label, pass) => (...a) => {
      const ok = pass(...a);
      if (not ? ok : !ok) fail(`expect(${JSON.stringify(v)})${not ? ".not" : ""}.${label}(${a.map((x) => x instanceof RegExp ? String(x) : JSON.stringify(x)).join(", ")})`);
      judged();
    };
    return {
      toBe: m("toBe", (w) => Object.is(v, w)),
      toEqual: m("toEqual", (w) => same(v, w)),
      toStrictEqual: m("toStrictEqual", (w) => same(v, w)),
      toBeTruthy: m("toBeTruthy", () => !!v),
      toBeFalsy: m("toBeFalsy", () => !v),
      toBeNull: m("toBeNull", () => v === null),
      toBeUndefined: m("toBeUndefined", () => v === undefined),
      toBeDefined: m("toBeDefined", () => v !== undefined),
      toContain: m("toContain", (w) => (typeof v === "string" || Array.isArray(v)) && v.includes(w)),
      toMatch: m("toMatch", (w) => typeof v === "string" && (w instanceof RegExp ? w.test(v) : v.includes(w))),
      toHaveLength: m("toHaveLength", (n) => v != null && v.length === n),
      toBeGreaterThan: m("toBeGreaterThan", (n) => v > n),
      toBeGreaterThanOrEqual: m("toBeGreaterThanOrEqual", (n) => v >= n),
      toBeLessThan: m("toBeLessThan", (n) => v < n),
      toBeLessThanOrEqual: m("toBeLessThanOrEqual", (n) => v <= n),
      toBeCloseTo: m("toBeCloseTo", (n, digits = 2) => Math.abs(v - n) < 10 ** -digits / 2),
    };
  };
  const matchersFor = (target, not) => stepsOf(target) !== null ? locatorMatchers(target, not)
    : target?.[PAGE] === true ? pageMatchers(not) : valueMatchers(target, not);
  const guarded = (ms, target) => new Proxy(ms, {
    get(t, k) {
      if (k in t || typeof k === "symbol" || k === "then") return t[k];
      return () => fail(`expect(…).${String(k)} — not here: ${Object.keys(t).filter((x) => x !== "not").join(", ")}${stepsOf(target) !== null ? "" : " (a locator takes the retrying ones: toBeVisible, toHaveText, …)"}`);
    },
  });
  const expectOf = (target) => {
    const ms = matchersFor(target, false);
    ms.not = guarded(matchersFor(target, true), target);
    return guarded(ms, target);
  };

  // ── the page ───────────────────────────────────────────────────────────
  const top = chainers([]);
  // Playwright's page-level selector actions are the same locators
  const shortcuts = {};
  // Playwright's waitForFunction(fn, arg, options), the form this page speaks; the
  // browser driver underneath takes (fn, options, …args), and read Playwright's
  // `null` arg as its options (Venue run 21: "reading 'polling'")
  shortcuts.waitForFunction = (fn, arg, options) => page.waitForFunction(fn, options ?? {}, ...(arg === undefined ? [] : [arg]));
  for (const k of ["click", "dblclick", "tap", "hover", "fill", "check", "uncheck", "focus", "press", "type", "selectOption", "textContent", "innerText", "inputValue", "getAttribute", "isVisible", "isHidden", "isChecked", "isEnabled", "isDisabled"]) {
    shortcuts[k] = (sel, ...rest) => locator(parseSelector(sel))[k](...rest);
  }
  const keyboard = new Proxy(page.keyboard, {
    get(t, k) {
      if (k === "press") return (name, o) => o === undefined || Object.keys(o).length === 0 ? pressChord(page, name) : t.press(parseChord(name).key, o);
      if (k === "down" || k === "up") return (name, o) => t[k](MOD[String(name).toLowerCase()] ?? KEY[String(name).toLowerCase()] ?? name, o);
      const v = t[k];
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  const proxy = new Proxy(page, {
    get(t, k) {
      if (k === PAGE) return true;
      if (k === "keyboard") return keyboard;
      if (k in top) return top[k];
      if (k in shortcuts) return shortcuts[k];
      const v = t[k];
      if (v !== undefined) return typeof v === "function" ? v.bind(t) : v;
      if (typeof k === "string" && k in PAGE_HINTS) return () => fail(`page.${k}() is Playwright's and not on this page — ${PAGE_HINTS[k]} (verify.md § Assert scripts)`);
      return v;
    },
  });
  return { page: proxy, expect: expectOf };
}
