// semantics — the SEMANTIC TREE: what a program is to assistive technology,
// derived from the view tree once, in JS, the same for every platform
// (docs/system-design/accessibility.md §2–§4). A DOM host annotates its
// elements from it, the Mac host builds NSAccessibility elements from it, a
// canvas host mirrors it; tests and `declare-look --semantics` read it as the
// oracle each of those is compared with.
//
// It is a projection, not the view tree: a view with no role is TRANSPARENT
// (its children rise to the nearest ancestor that has one), hidden views are
// pruned, text is content, and a role's facts come from its contract
// (a11y-roles.ts). Nothing here names a library class — a role is a contract,
// and an author's Waveform reads exactly as the library's Slider does. The
// runtime's own leaves (Text, rich text, TextInput, Image) are what they are.

import { View } from "./view.js";
import { readRowIndex } from "./view.js";
import { blocksOf } from "./replicate.js";
import { rootFrameBox, type InteractionView } from "./interaction.js";
import { untracked } from "./reactive.js";
import type { Block, Inline, ReadOptions } from "./md.js";

// What the tree needs of a rich document, from the runtime's own class: its
// blocks, read from its source (no inline views: those are real children, read
// after it), and which children are the flow's own rendered views.
interface Doc { $parseSource(o: ReadOptions): Block[]; built: View[] }
const documentOf = (v: View): readonly Block[] => (v as unknown as Doc).$parseSource({});
const isFlowView = (v: View, c: View): boolean => (v as unknown as Doc).built.includes(c);
const isText = (v: View): boolean => v.$leafRole?.() === "text";
const isDocument = (v: View): boolean => v.$leafRole?.() === "document";
const textOfRun = (v: View): string => String((v as unknown as { text: string }).text ?? "");

/** One node of the semantic tree. Absent fields are absent facts. */
export interface SemNode {
  /** The view's id, or -1 for a node the runtime made from a rich document. */
  id: number;
  role: string;
  name: string;
  hint?: string;
  /** What is wrong with the value, said with it (an invalid field). */
  error?: string;
  value?: { text?: string; now?: number | null; min?: number; max?: number; step?: number };
  states: string[];
  actions: string[];
  frame?: { x: number; y: number; width: number; height: number };
  live?: "polite" | "assertive";
  /** a list or grid: how many rows it holds, built or not */
  rowCount?: number;
  /** a row of one: its place, 1-based */
  rowIndex?: number;
  level?: number;
  children: SemNode[];
}

type Any = Record<string, unknown>;

/** A view's id in the semantic tree: given the first time the tree sees it,
 *  kept for its life, so a host can key its own elements by it across settles. */
const IDS = new WeakMap<View, number>();
let nextId = 1;
export function semanticId(v: View): number {
  let id = IDS.get(v);
  if (id === undefined) IDS.set(v, (id = nextId++));
  return id;
}
const fn = (v: View, m: string): boolean => typeof (v as unknown as Any)[m] === "function";

/** The semantic tree of everything under `root`: a synthetic `application`
 *  node whose children are the program's top-level semantic nodes. Content
 *  behind an open modal is inert, as it is to focus: only the topmost modal's
 *  subtree is reported then. Read untracked — building it wakes nothing. */
export function semanticTree(root: View): SemNode {
  return untracked(() => {
    const top: SemNode = { id: semanticId(root), role: "application", name: String((root as unknown as Any).title ?? ""), states: [], actions: [], children: [] };
    const modal = topModal(root);
    ACTIVE.clear();
    walk(modal ?? root, top.children);
    // the items composites name as the one the keyboard is on, wherever they sit
    if (ACTIVE.size > 0) markActive(top);
    return top;
  });
}

/** The ids of the items a composite names in `accessibilityActiveItem`, this build. */
const ACTIVE = new Set<number>();
function markActive(n: SemNode): void {
  if (ACTIVE.has(n.id)) n.states.push("active");
  for (const c of n.children) markActive(c);
}

/** The last shown view with `focusScope = modal`, in tree order — the one in front. */
function topModal(root: View): View | null {
  let found: View | null = null;
  const visit = (v: View): void => {
    if (!v.visible) return;
    if (v !== root && v.focusScope === "modal") found = v;
    for (const c of v.children) if (c instanceof View) visit(c);
  };
  visit(root);
  return found;
}

/** The view's role as the tree reads it: what it declares, or what a runtime
 *  leaf is (a field, a picture). */
export function roleOf(v: View): string {
  const r = v.accessibilityRole;
  if (r !== "none") return r;
  const leaf = v.$leafRole?.();
  return leaf === "textField" || leaf === "image" ? leaf : "none";
}

// What the tree needs of the role contracts (a11y-roles.ts), which the
// compiler checks and a production build does not carry: whose name is its
// content, and which roles are pressed or stepped.
/** The roles a person reaches on their own — a container's name from content leaves them out. */
export const REACHED_APART = new Set(["button", "toggle", "checkbox", "switch", "radio", "link", "menuItem", "slider", "spinButton", "textField", "searchBox", "combobox"]);
const CELLS = new Set(["cell", "columnHeader"]);
export const NAMED_BY_CONTENT = new Set(["button", "toggle", "checkbox", "switch", "radio", "link", "heading", "listItem", "cell", "columnHeader", "tab", "menuItem", "option", "treeItem"]);
export const PRESSED = new Set(["button", "toggle", "checkbox", "switch", "radio", "tab", "menuItem", "option", "treeItem", "link", "row", "cell", "listItem"]);
export const STEPPED = new Set(["slider", "spinButton", "separator"]);
const POSITIONED = new Set(["listItem", "menuItem", "tab", "radio", "option", "treeItem", "row"]);
const PRESENTATIONAL = new Set(["button", "toggle", "checkbox", "switch", "radio", "tab", "slider", "spinButton", "progress", "separator", "option", "menuItem", "image"]);

function walk(v: View, out: SemNode[]): void {
  // what cannot be seen is not read: hidden, or faded to nothing; nor is what
  // is seen and marked hidden from a screen reader
  if (!v.visible || v.opacity === 0 || v.accessibilityHidden) return;

  if (isText(v)) {
    const t = textOfRun(v);
    if (t.trim() !== "") out.push({ id: semanticId(v), role: "text", name: t, states: [], actions: [], frame: frameOf(v), children: [] });
    return;
  }
  if (isDocument(v) && v.accessibilityRole === "none") {
    for (const b of documentOf(v)) blockNodes(b, out);
    // inline views the document placed in its lines read after it (a known
    // defect of reading order: text-selection.md)
    for (const c of v.children) if (c instanceof View && !isFlowView(v, c)) walk(c, out);
    return;
  }
  const role = roleOf(v);
  if (role === "none") {
    for (const c of v.children) if (c instanceof View) walk(c, out);
    return;
  }
  const node = nodeFor(v, role);
  // a picture with no name is decoration, and is left out
  if (role === "image" && node.name === "") return;
  const fromContent = NAMED_BY_CONTENT.has(role) && v.accessibilityLabel === "";
  if (fromContent) node.name = nameOfContent(v);
  // a tip that is not the name describes: "Archive" on a button that says "A"
  if (node.hint === undefined && v.tooltipLabel !== "" && v.tooltipLabel !== node.name) node.hint = v.tooltipLabel;
  for (const c of v.children) if (c instanceof View) walk(c, node.children);
  // the text a name was taken from, or that only repeats it or the value, is not read again;
  // nor is any text inside a role whose content is presentation (ARIA's "children
  // presentational": a button says its name, never the label inside it as well)
  if (fromContent || PRESENTATIONAL.has(role)) node.children = node.children.filter((n) => n.role !== "text");
  else {
    const said = [node.name, node.value?.text, node.value?.now == null ? undefined : String(node.value.now)]
      .filter((t): t is string => typeof t === "string" && t.trim() !== "").map((t) => t.trim());
    if (said.length > 0) node.children = node.children.filter((n) => n.role !== "text" || !said.includes(n.name.trim()));
  }
  out.push(node);
}

function nodeFor(v: View, role: string): SemNode {
  const a = v as unknown as Any;
  const node: SemNode = { id: semanticId(v), role, name: v.accessibilityLabel, states: [], actions: [], frame: frameOf(v), children: [] };
  if (role === "textField" || role === "searchBox") {
    if (node.name === "") node.name = String(a.placeholder ?? "");
    // a hidden field's text is not said, as a platform's secure field's is not
    node.value = { text: a.concealed === true ? "" : String(a.text ?? "") };
    if (a.concealed === true) node.states.push("concealed");
  }
  if (v.accessibilityHint !== "") node.hint = v.accessibilityHint;
  if (v.accessibilityError !== "") node.error = v.accessibilityError;
  // the value a slider or a progress bar reports
  const now = v.accessibilityValue, min = v.accessibilityMin, max = v.accessibilityMax, step = v.accessibilityStep;
  const text = v.accessibilityValueText;
  if (now !== null || min !== null || max !== null || text !== "") {
    node.value = { ...node.value, now };
    if (min !== null) node.value.min = min;
    if (max !== null) node.value.max = max;
    if (step !== null) node.value.step = step;
    if (text !== "") node.value.text = text;
  }
  // states
  const st = node.states;
  if (v.accessibilityChecked !== null) st.push(v.accessibilityChecked ? "checked" : "unchecked");
  if (v.accessibilityPressed !== null) st.push(v.accessibilityPressed ? "pressed" : "not pressed");
  if (v.accessibilitySelected === true) st.push("selected");
  if (v.accessibilitySort !== "none") st.push("sorted " + v.accessibilitySort);
  if (v.accessibilityMultiselectable) st.push("multiselectable");
  if (v.accessibilityExpanded !== null) st.push(v.accessibilityExpanded ? "expanded" : "collapsed");
  if (a.disabled === true) st.push("disabled");
  if (v.accessibilityRequired) st.push("required");
  if (v.accessibilityError !== "") st.push("invalid");
  if (v.focused) st.push("focused");
  if (v.accessibilityActiveItem !== null) ACTIVE.add(semanticId(v.accessibilityActiveItem));
  if (v.focusScope === "modal") st.push("modal");
  if (v.accessibilityLevel !== null) node.level = v.accessibilityLevel;
  // actions: what the role may have done to it, where the view has the
  // method — a base class's increment on a button is not an action of the
  // button's; a dialog or a menu may be escaped
  if (PRESSED.has(role) && fn(v, "press")) node.actions.push("press");
  if (STEPPED.has(role) && fn(v, "accessibilityIncrement")) node.actions.push("increment");
  if (STEPPED.has(role) && fn(v, "accessibilityDecrement")) node.actions.push("decrement");
  if ((role === "dialog" || role === "alertDialog" || role === "menu") && fn(v, "escape")) node.actions.push("escape");
  if (fn(v, "accessibilityShowMenu")) node.actions.push("showMenu");
  // live regions: a status line is polite by nature
  const live = v.accessibilityLive !== "off" ? v.accessibilityLive : role === "status" ? "polite" : "off";
  if (live !== "off") node.live = live as "polite" | "assertive";
  // a list's full count, and a row's place in it — read off the replication,
  // so "row 4,012 of 30,500" needs no 30,500 nodes
  if (role === "list" || role === "grid" || role === "menu" || role === "tabList" || role === "listbox" || role === "tree") {
    const n = rowsUnder(v);
    if (n !== null) node.rowCount = n;
  }
  // a place in it, for the roles that have one (as the DOM's aria-posinset)
  const index = !POSITIONED.has(role) ? -1 : v.accessibilityPosInSet !== null ? v.accessibilityPosInSet - 1 : readRowIndex(v);
  if (index >= 0) node.rowIndex = index + 1;
  if (POSITIONED.has(role) && v.accessibilitySetSize !== null) node.rowCount = v.accessibilitySetSize;
  return node;
}

/** How many records the replications under a list hold — its own, or those of
 *  the views with no role between it and its rows (a scroller, a body). Null
 *  when nothing under it replicates. */
export function rowsUnder(v: View): number | null {
  let n: number | null = null;
  const blocks = blocksOf(v);
  if (blocks.length > 0) n = blocks.reduce((k, b) => k + b.logicalCount(), 0);
  for (const c of v.children) {
    if (!(c instanceof View) || roleOf(c) !== "none" || isText(c)) continue;
    const m = rowsUnder(c);
    if (m !== null) n = (n ?? 0) + m;
  }
  return n;
}

/** The text a view holds, in reading order — what a name is taken from. */
export function textOf(v: View): string {
  const c = contentOf(v);
  return c.words !== "" ? c.words : c.marks;
}

/** The name a view whose role is named by its content takes: its words, else
 *  the tip it shows on hover, else the mark it shows. */
export function nameOfContent(v: View): string {
  const c = contentOf(v);
  return c.words !== "" ? c.words : v.tooltipLabel !== "" ? v.tooltipLabel : c.marks;
}

/** What a view holds, as a name: its WORDS — the text it shows, and what a
 *  labelled descendant is called — and its MARKS, the names of the role-less
 *  marks it shows (a close icon is "Close"). A mark names only a view with no
 *  words, so a button that says "Add" beside its plus is "Add", not "Add Add". */
export function contentOf(v: View): { words: string; marks: string } {
  const words: string[] = [];
  const marks: string[] = [];
  const visit = (x: View): void => {
    // what cannot be seen names nothing, as it is not read; nor does what is hidden from a screen reader
    if (!x.visible || x.opacity === 0 || x.accessibilityHidden) return;
    if (isText(x)) { const t = textOfRun(x).trim(); if (t !== "") words.push(t); return; }
    if (isDocument(x)) { for (const b of documentOf(x)) words.push(blockText(b)); return; }
    // a control inside a row or an item is a stop of its own, reached and read
    // there — the row's name is its own words, not its open editor's
    if (x !== v && REACHED_APART.has(roleOf(x) ?? "") && !CELLS.has(roleOf(v) ?? "")) return;
    // a field inside says what it holds, not what it is called (as a browser names a cell holding one)
    if (x !== v) { const r = roleOf(x); if (r === "textField" || r === "searchBox") { const t = (x as unknown as Any).concealed === true ? "" : String((x as unknown as Any).text ?? "").trim(); if (t !== "") words.push(t); return; } }
    if (x !== v && x.accessibilityLabel !== "") { (x.accessibilityRole === "none" && x.children.length === 0 ? marks : words).push(x.accessibilityLabel); return; }
    for (const c of x.children) if (c instanceof View) visit(c);
  };
  visit(v);
  return { words: words.filter((p) => p !== "").join(" "), marks: marks.join(" ") };
}

function frameOf(v: View): SemNode["frame"] {
  const b = rootFrameBox(v as unknown as InteractionView);
  return { x: round(b.x), y: round(b.y), width: round(b.width), height: round(b.height) };
}
const round = (n: number): number => Math.round(n * 10) / 10;

// ── a rich document, as nodes ────────────────────────────────────────────────

function inlineText(xs: readonly Inline[]): string {
  return xs.map((x) => {
    switch (x.t) {
      case "text": case "code": return x.value;
      case "strong": case "em": case "strike": case "link": return inlineText(x.inline);
      case "image": return x.alt;
      case "br": return " ";
      // any other run that holds inline content (a styled span) is its words
      default: return "inline" in x ? inlineText((x as { inline: readonly Inline[] }).inline) : "";
    }
  }).join("");
}
function blockText(b: Block): string {
  switch (b.t) {
    case "heading": case "paragraph": case "pre": return inlineText(b.inline);
    case "code": return b.text;
    case "blockquote": return b.blocks.map(blockText).join(" ");
    case "list": return b.items.map((i) => i.blocks.map(blockText).join(" ")).join(" ");
    case "table": return [b.header, ...b.rows].map((r) => r.map(inlineText).join(" ")).join(" ");
    default: return "";
  }
}
const leaf = (role: string, name: string, extra: Partial<SemNode> = {}): SemNode =>
  ({ id: -1, role, name, states: [], actions: [], children: [], ...extra });

/** The links and pictures inside a run of inline content, as nodes. */
function inlineNodes(xs: readonly Inline[], out: SemNode[]): void {
  for (const x of xs) {
    if (x.t === "link") out.push(leaf("link", inlineText(x.inline), { actions: ["press"] }));
    else if (x.t === "image") { if (x.alt !== "") out.push(leaf("image", x.alt)); }
    else if ("inline" in x) inlineNodes(x.inline, out);
  }
}
function blockNodes(b: Block, out: SemNode[]): void {
  switch (b.t) {
    case "heading": out.push(leaf("heading", inlineText(b.inline), { level: b.level })); return;
    case "paragraph": case "pre": {
      const text = inlineText(b.inline);
      const inner: SemNode[] = [];
      inlineNodes(b.inline, inner);
      if (text.trim() !== "") out.push(leaf("text", text, { children: inner }));
      return;
    }
    case "code": if (b.text.trim() !== "") out.push(leaf("text", b.text)); return;
    case "blockquote": for (const x of b.blocks) blockNodes(x, out); return;
    case "list": {
      const items = b.items.map((it, i) => {
        const kids: SemNode[] = [];
        for (const x of it.blocks) blockNodes(x, kids);
        return leaf("listItem", it.blocks.map(blockText).join(" "), { rowIndex: i + 1, children: kids.filter((k) => k.role !== "text"),
          states: it.task === null ? [] : [it.task ? "checked" : "unchecked"] });
      });
      out.push(leaf("list", "", { rowCount: items.length, children: items }));
      return;
    }
    case "table": {
      const row = (cells: readonly Inline[][], i: number): SemNode =>
        leaf("row", "", { rowIndex: i + 1, children: cells.map((c) => leaf("cell", inlineText(c))) });
      out.push(leaf("grid", "", { rowCount: b.rows.length + 1, children: [b.header, ...b.rows].map(row) }));
      return;
    }
    default: return;
  }
}

// ── as text ──────────────────────────────────────────────────────────────────

/** The tree as indented lines — what `declare-look --semantics` prints, and
 *  what a test compares: `slider "Volume" 40 (0–100) [focused] {increment, decrement}`. */
export function formatSemantics(n: SemNode, depth = 0): string {
  const parts: string[] = [n.role];
  if (n.name !== "") parts.push(JSON.stringify(n.name));
  if (n.level !== undefined) parts.push(`level ${n.level}`);
  if (n.value !== undefined) {
    const v = n.value;
    const range = v.min !== undefined || v.max !== undefined ? ` (${v.min ?? ""}–${v.max ?? ""})` : "";
    if (v.text !== undefined && v.text !== "") parts.push(`= ${JSON.stringify(v.text)}${v.now !== undefined && v.now !== null ? ` ${v.now}${range}` : range}`);
    else if (v.now !== undefined) parts.push(`= ${v.now === null ? "indeterminate" : v.now}${range}`);
  }
  if (n.error !== undefined) parts.push(`error ${JSON.stringify(n.error)}`);
  if (n.hint !== undefined) parts.push(`hint ${JSON.stringify(n.hint)}`);
  if (n.rowIndex !== undefined && n.rowCount !== undefined) parts.push(`${n.rowIndex} of ${n.rowCount}`);
  else if (n.rowIndex !== undefined) parts.push(`row ${n.rowIndex}`);
  else if (n.rowCount !== undefined) parts.push(`${n.rowCount} rows`);
  if (n.live !== undefined) parts.push(`live ${n.live}`);
  if (n.states.length > 0) parts.push(`[${n.states.join(", ")}]`);
  if (n.actions.length > 0) parts.push(`{${n.actions.join(", ")}}`);
  const line = "  ".repeat(depth) + parts.join(" ");
  return [line, ...n.children.map((c) => formatSemantics(c, depth + 1))].join("\n");
}
