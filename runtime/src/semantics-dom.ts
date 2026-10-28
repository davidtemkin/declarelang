// semantics-dom — the semantic tree realized on the DOM renderer, in place
// (docs/system-design/accessibility.md §5.2). The DOM backend already has an
// element per view, and browsers build their own accessibility tree from
// annotated elements, so this writes onto the elements it has — a role and its
// aria-* states — rather than keeping a second tree. The runtime's semantic
// tree (semantics.ts) is the oracle the browser's is checked against.
//
// Four parts, installed once per document by the DOM backend:
//   - each view with a role gets ONE rule, keeping its element's annotations
//     true as the facts it reads change — installed after the frame that built
//     it, so neither first paint nor a scrolled-in row waits for it;
//   - REAL FOCUS: the element of the view the focus service names holds the
//     DOM's focus, so `document.activeElement` tells assistive technology where
//     the user is; a focus the browser or a screen reader moves comes back
//     through the focus service;
//   - an open modal makes the rest of its app `inert`, as it already is to Tab;
//   - a press a screen reader makes (a click with no pointer behind it) runs
//     the view's press(), the path the pointer and the keyboard share.

import { View, provideAnnotator, nodeLabel } from "./view.js";
import { Focus, bareScroller } from "./focus.js";
import { Constraint, untracked, afterSettle } from "./reactive.js";
import { onDiscard } from "./node.js";
import { readRowIndex } from "./view.js";
import { rowsUnder, roleOf, textOf, contentOf, nameOfContent, NAMED_BY_CONTENT, REACHED_APART } from "./semantics.js";
import { provideAnnouncer, type Politeness } from "./accessibility-service.js";
import { inPointer } from "./pointer-dispatch.js";

/** The ARIA role each word maps to on the web. */
const ARIA_ROLE: Readonly<Record<string, string>> = {
  button: "button", toggle: "button", checkbox: "checkbox", switch: "switch", radio: "radio", slider: "slider",
  progress: "progressbar", textField: "textbox", link: "link", image: "img", heading: "heading", list: "list",
  listItem: "listitem", grid: "grid", row: "row", cell: "gridcell", columnHeader: "columnheader", tabList: "tablist", tab: "tab",
  tabPanel: "tabpanel", menu: "menu", menuBar: "menubar", menuItem: "menuitem", dialog: "dialog",
  alertDialog: "alertdialog", group: "group", toolbar: "toolbar", region: "region", status: "status",
  listbox: "listbox", option: "option", tree: "tree", treeItem: "treeitem", radioGroup: "radiogroup",
  combobox: "combobox", separator: "separator", searchBox: "searchbox", spinButton: "spinbutton",
  navigation: "navigation", main: "main", search: "search", banner: "banner", complementary: "complementary",
};

type Attrs = Record<string, string>;
type Any = Record<string, unknown>;

/** The annotations a view's element carries: its role, its name and hint where
 *  set (a role whose name comes from content is named by the browser from the
 *  same text), and the states and value its role reads. Tracked: the rule
 *  wakes when any of them changes. */
/** The roles whose selection the browser reads off `aria-selected` — and, unstated,
 *  infers from focus, so an option or a tree item says it either way. */
const SELECTABLE = new Set(["tab", "row", "cell", "listItem", "option", "treeItem"]);

/** What describes the view: what is wrong with its value first, then its hint,
 *  else a tip that is not its name (a wordless control is named by its tip, and
 *  is not described by it again). A field that needs a value says so. */
function describe(v: View, a: Attrs): void {
  if (v.accessibilityRequired) a["aria-required"] = "true";
  if (v.accessibilityError !== "") {
    a["aria-invalid"] = "true";
    a["aria-description"] = v.accessibilityHint !== "" ? `${v.accessibilityError}. ${v.accessibilityHint}` : v.accessibilityError;
    return;
  }
  if (v.accessibilityHint !== "") { a["aria-description"] = v.accessibilityHint; return; }
  const tip = v.tooltipLabel;
  if (tip === "" || a["aria-label"] === tip) return;
  const words = v.accessibilityLabel !== "" ? v.accessibilityLabel : contentOf(v).words;
  if (words !== "" && words !== tip) a["aria-description"] = tip;
}

/** The item the keyboard is on, named by the element that keeps the focus. */
function activeItem(v: View, a: Attrs): void {
  const act = v.accessibilityActiveItem;
  if (act === null) return;
  const ae = act.visible ? focusElementOf(act) : null;
  if (ae !== null) { if (ae.id === "") ae.id = "declare-ax-" + (++AX_IDS); a["aria-activedescendant"] = ae.id; }
  else again(v, act);   // its element arrives with the settle that builds it
}

/** Whether a control a person reaches on their own shows inside v. */
function holdsReachable(v: View): boolean {
  const visit = (x: View): boolean => x.visible && x.opacity !== 0
    && ((x !== v && REACHED_APART.has(roleOf(x) ?? "")) || x.children.some((c) => c instanceof View && visit(c)));
  return visit(v);
}

function ariaOf(v: View): Attrs | null {
  if (!v.visible) return null;
  // seen, not read: it and all it holds
  if (v.accessibilityHidden) return { "aria-hidden": "true" };
  const role = roleOf(v);
  // a view that is a link (`link`) is read through its own <a>, which covers it
  // and holds none of its text: the <a> carries the name — what it is called, or
  // the text it holds (the surface writes it on the <a>)
  if (role === "none" && v.link !== "") {
    const name = v.accessibilityLabel !== "" ? v.accessibilityLabel : String((v as unknown as Any).label ?? "") || textOf(v);
    return name !== "" ? { "aria-label": name } : null;
  }
  // a scroller nothing inside takes focus is a stop of its own (focus.ts): the
  // browser and a screen reader see it as one
  if (role === "none" && v.scrolls !== "none") return bareScroller(v) ? { tabindex: "0" } : null;
  if (role === "none") return null;
  const a: Attrs = {};
  // a field is its own native editable: only a name it does not show, and a
  // search field's role, are said on it (the surface writes them on the input)
  if (role === "textField" || role === "searchBox") {
    if (role === "searchBox") a.role = "searchbox";
    if (v.accessibilityLabel !== "") a["aria-label"] = v.accessibilityLabel;
    describe(v, a);
    activeItem(v, a);   // a combobox's field names the suggestion the keys are on
    return Object.keys(a).length > 0 ? a : null;
  }
  if (role === "image" && v.accessibilityLabel === "") return { "aria-hidden": "true" };   // decoration
  a.role = role === "menuItem" && v.accessibilityChecked !== null ? "menuitemcheckbox" : ARIA_ROLE[role] ?? "group";
  // a separator is horizontal unless said otherwise: a toolbar's, standing upright, is vertical
  if (role === "separator" && v.height > v.width) a["aria-orientation"] = "vertical";
  if (v.accessibilityLabel !== "") a["aria-label"] = v.accessibilityLabel;
  // a view that is also a link is read through its <a>, which holds none of its text
  else if (v.link !== "") { const t = textOf(v); if (t !== "") a["aria-label"] = t; }
  // a control with no words is named by its tip, or by the mark it shows —
  // neither of which the browser reads off the element
  else if (NAMED_BY_CONTENT.has(role) && contentOf(v).words === "") { const n = nameOfContent(v); if (n !== "") a["aria-label"] = n; }
  // one holding a control is named by its own words: the browser's name from
  // content would take in the control's text and labels too
  else if (NAMED_BY_CONTENT.has(role) && holdsReachable(v)) a["aria-label"] = contentOf(v).words;
  describe(v, a);
  if (v.accessibilityChecked !== null) a["aria-checked"] = String(v.accessibilityChecked);
  if (v.accessibilityPressed !== null) a["aria-pressed"] = String(v.accessibilityPressed);
  if (v.accessibilitySelected !== null && SELECTABLE.has(role)) a["aria-selected"] = String(v.accessibilitySelected);
  if (v.accessibilitySort !== "none") a["aria-sort"] = v.accessibilitySort;
  if (v.accessibilityMultiselectable) a["aria-multiselectable"] = "true";
  activeItem(v, a);
  if (v.accessibilityValue !== null) a["aria-valuenow"] = String(v.accessibilityValue);
  if (v.accessibilityMin !== null) a["aria-valuemin"] = String(v.accessibilityMin);
  if (v.accessibilityMax !== null) a["aria-valuemax"] = String(v.accessibilityMax);
  if (v.accessibilityValueText !== "") a["aria-valuetext"] = v.accessibilityValueText;
  if (v.accessibilityLevel !== null) a["aria-level"] = String(v.accessibilityLevel);
  else if (role === "heading") a["aria-level"] = "2";   // ARIA's own default, said, as a heading must
  if (v.accessibilityExpanded !== null) a["aria-expanded"] = String(v.accessibilityExpanded);
  if ((v as unknown as Any).disabled === true) a["aria-disabled"] = "true";
  if (v.focusScope === "modal") a["aria-modal"] = "true";
  const live = v.accessibilityLive !== "off" ? v.accessibilityLive : role === "status" ? "polite" : "off";
  if (live !== "off") a["aria-live"] = live;
  // a list's size and each item's place in it — "4,012 of 30,500" with only
  // the built rows present
  if (role === "listItem" || role === "menuItem" || role === "tab" || role === "radio" || role === "option" || role === "treeItem") {
    // a place the view states (a tree row among its siblings) over the one
    // its replication gives
    const i = v.accessibilityPosInSet !== null ? v.accessibilityPosInSet - 1 : readRowIndex(v);
    if (i >= 0) {
      a["aria-posinset"] = String(i + 1);
      const n = v.accessibilitySetSize ?? rowsUnder(v.parent instanceof View ? listOf(v.parent) : v);
      if (n !== null) a["aria-setsize"] = String(n);
    }
  }
  // a grid's rows say their place the way grids do: the row count on the grid,
  // the index (1-based, of every row, built or not) on each row
  if (role === "grid") { const n = rowsUnder(v); if (n !== null) a["aria-rowcount"] = String(n); }
  if (role === "row") { const i = readRowIndex(v); if (i >= 0) a["aria-rowindex"] = String(i + 1); }
  // focusable to the browser and assistive technology too — the focus service
  // owns Tab (keys.ts takes it), so the browser's own order never runs; 0 says
  // honestly that the keyboard reaches it (never a positive index). A quiet view
  // is focused only by the program: -1, as the web marks one. A control disabled
  // while it has focus keeps it (focus-place.md), so its element must stay
  // focusable too, or the browser takes focus to the page; the focus read is
  // tracked only for a disabled view.
  if (v.focusable === true) a.tabindex = "0";
  else if (v.focusable === "quiet" || (v as unknown as Any).disabled === true && Focus.getFocus() === v) a.tabindex = "-1";
  return a;
}

/** The nearest view above that replicates — whose records an item counts among. */
function listOf(v: View): View {
  for (let p: unknown = v; p instanceof View; p = p.parent) if (rowsUnder(p) !== null) return p;
  return v;
}

const elementOf = (v: View): HTMLElement | null => (v.$surface as { element?: HTMLElement } | null)?.element ?? null;
/** The element that holds the view's DOM focus: the <a> a link view is read
 *  through, else the view's own element. */
const focusElementOf = (v: View): HTMLElement | null => (v.$surface as { linkEl?: HTMLElement | null } | null)?.linkEl ?? elementOf(v);
const VIEW_OF = new WeakMap<HTMLElement, View>();

// ── the annotation rules, installed after the frame ──────────────────────────

const pending = new Set<View>();
let flushQueued = false;
const later = (fn: () => void): void => {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (typeof ric === "function") ric(fn, { timeout: 200 });
  else setTimeout(fn, 0);
};

function annotate(v: View): void {
  pending.add(v);
  if (flushQueued) return;
  flushQueued = true;
  later(flush);
}

function flush(): void {
  flushQueued = false;
  for (const v of [...pending]) {
    pending.delete(v);
    if (v.$surface === null) continue;   // gone before its turn
    install(v);
  }
}

const RULES = new WeakSet<View>();
/** Each annotated view's rule, so one can be run again once a settle has built what it names. */
const RULE_OF = new WeakMap<View, Constraint>();
let AX_IDS = 0;
/** Runs asked for, per item named, while the item has no element: a few settles, then none. */
const AGAIN = new WeakMap<View, number>();
function again(v: View, item: View): void {
  const n = AGAIN.get(item) ?? 0;
  if (n < 0 || n >= 3) return;
  AGAIN.set(item, -1 - n);   // one asked for: none more until it has run
  afterSettle(() => { AGAIN.set(item, n + 1); RULE_OF.get(v)?.run(); });
}
function install(v: View): void {
  if (RULES.has(v)) return;
  RULES.add(v);
  // the surface is the view's NOW: a view shown after it was built trades its
  // stand-in for a real surface (which replays what the stand-in kept), and the
  // element a modal leaves the rest of the app inert around exists once the
  // settle that showed it has closed
  const k = new Constraint(`${nodeLabel(v)} (accessibility)`, () => ariaOf(v), (attrs) => {
    (v.$surface as { setSemantics?: (a: Attrs | null) => void } | null)?.setSemantics?.(attrs as Attrs | null);
    const el = focusElementOf(v);
    if (el !== null) VIEW_OF.set(el, v);
    if (v.focusScope === "modal") afterSettle(() => { const e = elementOf(v); if (e !== null) VIEW_OF.set(e, v); holdInert(v, attrs !== null); });
  });
  RULE_OF.set(v, k);
  k.run();
  onDiscard(v, () => { k.dispose(); if (v.focusScope === "modal") holdInert(v, false); });
  // a press a screen reader makes arrives as a click with no pointer behind it
  // (`detail` 0); the pointer's own clicks reach press() through the router
  const el = elementOf(v);
  if (el !== null && typeof (v as unknown as Any).press === "function") {
    el.addEventListener("click", (e) => {
      if (e.detail !== 0 || (v as unknown as Any).disabled === true) return;
      e.preventDefault();
      untracked(() => (v as unknown as { press(): void }).press());
    });
  }
}

// ── an open modal makes the rest of its app inert ────────────────────────────

const INERT = new Map<View, HTMLElement[]>();
function holdInert(modal: View, open: boolean): void {
  const held = INERT.get(modal);
  for (const el of held ?? []) el.inert = false;
  INERT.delete(modal);
  // the page is live again: the focus the modal handed back (to its opener,
  // behind it) can land now, where the browser refused it while inert
  if (held !== undefined && !open) { const f = untracked(() => Focus.getFocus()); if (f !== null) follow(f); }
  const el = elementOf(modal);
  if (!open || el === null) return;
  const made: HTMLElement[] = [];
  for (let at: HTMLElement | null = el; at !== null && at.parentElement !== null; at = at.parentElement) {
    for (const sib of Array.from(at.parentElement.children)) {
      if (sib !== at && sib instanceof HTMLElement && !sib.inert) { sib.inert = true; made.push(sib); }
    }
    if (at.parentElement.dataset.declareApp !== undefined) break;
  }
  INERT.set(modal, made);
}

// ── real focus ───────────────────────────────────────────────────────────────

let moving = false;
function follow(v: View | null): void {
  if (v !== null && v.$leafRole?.() === "textField") return;   // a field focuses its own native editable
  const doc = typeof document === "undefined" ? null : document;
  if (doc === null) return;
  if (v === null) {
    const a = doc.activeElement;
    if (a instanceof HTMLElement && VIEW_OF.has(a)) { moving = true; a.blur(); moving = false; }
    return;
  }
  const el = focusElementOf(v);
  if (el === null) { retry(v, 4); return; }   // its element arrives with the settle that shows it
  VIEW_OF.set(el, v);
  if (!el.hasAttribute("tabindex")) { el.tabIndex = v.focusable === "quiet" ? -1 : 0; el.style.outline = "none"; }   // the ring is Declare's own
  if (doc.activeElement === el) return;
  moving = true;
  el.focus({ preventScroll: true });
  moving = false;
  // The browser refuses focus to an element that is inert or not yet shown — an
  // opener behind a closing modal, a dialog's button in the settle that opens it —
  // and says nothing. Try again once that settle has closed, then for a few
  // frames, for as long as the runtime's focus is still this view.
  if (doc.activeElement !== el) retry(v, 4);
}

function retry(v: View, frames: number): void {
  const again = (): void => {
    if (untracked(() => Focus.getFocus()) !== v) return;
    const el = focusElementOf(v);
    if (el !== null && el.ownerDocument.activeElement === el) return;
    if (el !== null) {
      VIEW_OF.set(el, v);
      if (!el.hasAttribute("tabindex")) { el.tabIndex = v.focusable === "quiet" ? -1 : 0; el.style.outline = "none"; }
      moving = true;
      el.focus({ preventScroll: true });
      moving = false;
      if (el.ownerDocument.activeElement === el) return;
    }
    if (frames > 0) requestAnimationFrame(() => retry(v, frames - 1));
  };
  if (frames === 4) afterSettle(again); else again();
}

// ── announcements: one off-screen live region per politeness, per document ──

const REGIONS = new Map<Politeness, HTMLElement>();
function announce(doc: Document, text: string, politeness: Politeness): void {
  let el = REGIONS.get(politeness);
  if (el === undefined) {
    el = doc.createElement("div");
    el.setAttribute("aria-live", politeness);
    el.setAttribute("aria-atomic", "true");
    el.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap";
    doc.body.appendChild(el);
    REGIONS.set(politeness, el);
  }
  // emptied first, so the same words said twice are heard twice
  el.textContent = "";
  const region = el;
  setTimeout(() => { region.textContent = text; }, 50);
}

let installed = false;
/** Install the DOM realization for this document — once, by the DOM backend. */
export function installDomSemantics(doc: Document): void {
  if (installed) return;
  installed = true;
  provideAnnotator(annotate);
  provideAnnouncer((text, politeness) => announce(doc, text, politeness));
  Focus.onFocusChange(follow);
  // a focus the runtime did not cause — a screen reader, the browser — is the
  // user's, and the focus service follows it. One the browser gives while a
  // pointer is down is a press's focus — in selectable text the press keeps its
  // native default, and a press on a link's <a> focuses it — and like the
  // runtime's own press it is not revealed: scrolling the page between the
  // press and its release moved the link out from under it, and the click was
  // lost (a link half under a pinned bar)
  let pressing = false;
  doc.addEventListener("pointerdown", () => { pressing = true; }, true);
  for (const t of ["pointerup", "pointercancel"]) doc.addEventListener(t, () => { pressing = false; }, true);
  doc.addEventListener("focusin", (e) => {
    if (moving) return;
    const v = e.target instanceof HTMLElement ? VIEW_OF.get(e.target) : undefined;
    if (v === undefined || untracked(() => Focus.getFocus()) === v) return;
    const take = (): void => untracked(() => Focus.focus(v));
    if (pressing) inPointer(take); else take();
  }, true);
  // a view already focused before the first annotation still gets its element
  const now = untracked(() => Focus.getFocus());
  if (now !== null) follow(now);
}

/** For tests: how many views wait for their rule now. */
export function pendingAnnotations(): number { return pending.size; }
/** For tests: install every waiting rule now, instead of after the frame. */
export function flushAnnotations(): void { flush(); }
