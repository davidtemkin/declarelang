// a11y-check — what the compiler can say about accessibility before anything
// runs (docs/system-design/accessibility.md §3.7).
//
// A role is a CONTRACT (runtime/src/a11y-roles.ts): the element that declares
// `accessibilityRole = slider`, together with the class chain above it, must set
// what the role reads and have the methods its actions call. That is checked by
// name and type for every class alike — the library's Slider and an author's
// Waveform by the same rule — and a gap is an error. A role is a word, fixed
// for the view's life, so a `{ }` role is an error too.
//
// The rest are warnings, about what a person using a screen reader would miss:
// a Control with no role, a role that needs a name with none, a drawn view that
// takes the focus and says nothing, a control inside a control, and content
// clipped out of sight that is still read. Warnings stay out of the merged library
// source (the author cannot edit it — the library's own test holds it clean)
// and out of a program that leaves the layer out (`accessibility = false`).

import type { Program, Element, ClassDecl, Literal } from "../../runtime/dist/parser.js";
import { descendsFrom, type ClassSchema } from "../../runtime/dist/schema.js";
import { Diag } from "../../runtime/dist/diagnostics.js";
import type { DeclareError } from "../../runtime/dist/errors.js";
import { ROLE_CONTRACTS, contractGaps, contractMessage } from "../../runtime/dist/a11y-roles.js";

export interface A11yFindings { errors: DeclareError[]; warnings: DeclareError[] }

/** Roles whose name never comes from the text inside them. */
const NAME_NOT_FROM_CONTENT = (role: string): boolean => ROLE_CONTRACTS[role]?.nameFromContent !== true;

/** The roles a person presses or steps — a control. Nothing of these may hold
 *  another: their content is read as their name, never entered. */
const CONTROL_ROLES = new Set(["button", "toggle", "checkbox", "switch", "radio", "tab", "menuItem", "option", "link", "slider", "spinButton"]);

/** The names an author gives the boolean that says this one is the one chosen. */
const CHOSEN_FLAG = /^(on|selected|chosen|active|current|picked|checked|isOn|isSelected|isActive)$/;

/** The top-level parts of a `{ }` body: the arms of a choice (`c ? a : b`), else
 *  the terms of an `||`; null when it is neither. Strings and brackets are skipped. */
function topLevelParts(src: string): { arms: [string, string] } | { terms: string[] } | null {
  let depth = 0, q = -1, nested = 0, colon = -1;
  const ors: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (depth > 0) continue;
    else if (ch === "?" && src[i + 1] !== "?" && src[i + 1] !== "." && src[i - 1] !== "?") { if (q < 0) q = i; else nested++; }
    // (a `:` against a name is a datapath, `:title`, not a choice's)
    else if (ch === ":" && q >= 0 && colon < 0 && !/[\w$]/.test(src[i + 1] ?? "")) { if (nested > 0) nested--; else colon = i; }
    else if (ch === "|" && src[i + 1] === "|" && q < 0) { ors.push(i); i++; }
  }
  if (q >= 0 && colon > q) return { arms: [src.slice(q + 1, colon), src.slice(colon + 1)] };
  if (ors.length === 0) return null;
  const terms: string[] = [];
  let from = 0;
  for (const at of ors) { terms.push(src.slice(from, at)); from = at + 2; }
  terms.push(src.slice(from));
  return { terms };
}
/** Is the whole body one parenthesized expression — `( … )`, the two brackets a pair? */
function wrapped(t: string): boolean {
  if (!t.startsWith("(") || !t.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") depth++;
    else if (t[i] === ")" && --depth === 0) return i === t.length - 1;
  }
  return false;
}

export function accessibilityDiagnostics(
  program: Program,
  schemas: Record<string, ClassSchema>,
  opts: { inLibrary: (offset: number) => boolean; warnings: boolean },
): A11yFindings {
  const errors: DeclareError[] = [];
  const warnings: DeclareError[] = [];
  const classByBody = new Map<Element, ClassDecl>(program.classes.map((c) => [c.body, c]));
  const classByName = new Map<string, ClassDecl>(program.classes.map((c) => [c.name, c]));
  const inLibrary = (el: Element): boolean => opts.inLibrary(el.pos?.offset ?? 0);

  /** The class bodies above a tag, nearest first (empty for a built-in tag). */
  const chainOf = (tag: string): Element[] => {
    const out: Element[] = [];
    const seen = new Set<string>();
    for (let t: string = tag; !seen.has(t); ) {
      seen.add(t);
      const c = classByName.get(t);
      if (c === undefined) break;
      out.push(c.body);
      t = c.base;
    }
    return out;
  };
  const schemaOf = (tag: string): ClassSchema | undefined => schemas[tag];
  const isA = (tag: string, base: string): boolean => {
    const s = schemaOf(tag);
    return s !== undefined && descendsFrom(s, base);
  };
  /** What an element's levels set: its own attributes, its States' (a state
   *  sets its parent's attributes while applied), and its declarations. */
  const sets = (levels: readonly Element[], name: string): boolean => levels.some((b) =>
    b.attrs.some((a) => a.name === name) || b.decls.some((d) => d.name === name)
    || b.children.some((s) => isA(s.tag, "State") && s.attrs.some((a) => a.name === name)));
  const has = (levels: readonly Element[], method: string): boolean => levels.some((b) => b.methods.some((m) => m.name === method));
  /** The literal role the nearest level declares, or null (none written). */
  const roleOf = (levels: readonly Element[]): string | null => {
    for (const b of levels) {
      const a = b.attrs.find((x) => x.name === "accessibilityRole");
      if (a !== undefined) return a.value.kind === "ident" ? a.value.name : null;
    }
    return null;
  };
  /** What the nearest level writes for an attribute: its value, its declared
   *  default, "unset" when no level writes it, or "unknown" when a State does
   *  (or the levels' methods assign it) and so it is not one value. */
  const valueIn = (levels: readonly Element[], name: string): Literal | "unset" | "unknown" => {
    const assigns = new RegExp(`(?:^|[^\\w$.]|this\\.|classroot\\.)${name}\\s*(?:=(?!=)|\\+=)`);
    for (const b of levels) {
      if (b.methods.some((m) => assigns.test(m.body))
        || b.children.some((st) => isA(st.tag, "State") && st.attrs.some((a) => a.name === name))) return "unknown";
    }
    for (const b of levels) {
      const a = b.attrs.find((x) => x.name === name);
      if (a !== undefined) return a.bind === "two" ? "unknown" : a.value;
      const d = b.decls.find((x) => x.name === name);
      if (d !== undefined) return d.def ?? "unset";
    }
    return "unset";
  };
  /** Does an element above provide this value (a Field its fieldLabel)? */
  const provides = (above: readonly Element[], key: string): boolean => above.some((p) => sets([p, ...chainOf(p.tag)], key));
  /** Is a value certainly empty — a name that says nothing? `""`; a
   *  `provided(key, "")` nothing above provides; an attribute of `scope` that is
   *  itself certainly empty; a choice both of whose arms are, or an `||` all of
   *  whose terms are. Anything else may say something, and counts as words. */
  const PROVIDED = /^(?:this\.\$?)?provided\(\s*"(\w+)"\s*,\s*""\s*\)$/;
  const MEMBER = /^(?:(?:this|classroot)\.)?([A-Za-z_]\w*)$/;
  const emptyCode = (src: string, scope: readonly Element[], above: readonly Element[], depth: number): boolean => {
    let t = src.trim();
    while (wrapped(t)) t = t.slice(1, -1).trim();
    const parts = topLevelParts(t);
    if (parts !== null) return "arms" in parts ? parts.arms.every((a) => emptyCode(a, scope, above, depth)) : parts.terms.every((a) => emptyCode(a, scope, above, depth));
    if (t === '""' || t === "''" || t === "``") return true;
    const p = PROVIDED.exec(t);
    if (p !== null) return !provides(above, p[1]);
    const m = MEMBER.exec(t);
    if (m === null || depth > 4 || ["true", "false", "null"].includes(m[1])) return false;
    // a member no level declares is not this element's (a script constant, a parameter)
    if (!scope.some((b) => b.decls.some((d) => d.name === m[1]) || b.attrs.some((a) => a.name === m[1]))) return false;
    return emptyAttr(scope, m[1], above, depth + 1);
  };
  /** Is the attribute, as these levels leave it, certainly empty? Unset is empty. */
  const emptyAttr = (levels: readonly Element[], name: string, above: readonly Element[], depth = 0): boolean => {
    const v = valueIn(levels, name);
    if (v === "unset") return true;
    if (v === "unknown") return false;
    if (v.kind === "string") return v.value === "";
    return v.kind === "code" && emptyCode(v.src, levels, above, depth);
  };

  /** Is the element named — does its accessibilityLabel say anything? A name
   *  read from a provided value (`{ provided("fieldLabel", "") }`, a Switch
   *  inside a Field) counts only where an element above provides it, and one
   *  read from its own `label` only where that label is not empty. */
  const named = (levels: readonly Element[], above: readonly Element[]): boolean => !emptyAttr(levels, "accessibilityLabel", above);

  /** Does any element in these subtrees hold text a name can come from? A
   *  child's own class body counts (a Label that IS a Text, a Chip that holds
   *  one). Where the text is the element's own (`scope`, its levels), a text
   *  that is certainly empty is no words: a Checkbox's caption shows its
   *  `label`, which says nothing until one is given. */
  const holdsText = (els: readonly Element[], scope: readonly Element[] | null, above: readonly Element[], seen = new Set<Element>()): boolean => els.some((e) => {
    if (seen.has(e)) return false;
    seen.add(e);
    if (isA(e.tag, "Text") || isA(e.tag, "RichText")) {
      if (scope === null) return true;
      const v = valueIn([e, ...chainOf(e.tag)], "text");
      return typeof v === "string" || (v.kind === "string" ? v.value !== "" : v.kind !== "code" || !emptyCode(v.src, scope, above, 0));
    }
    return holdsText(e.children, scope, above, seen) || holdsText(chainOf(e.tag), null, above, seen);
  });

  /** Is this chain a named mark — a role-less view whose class gives it a
   *  label (CloseIcon is "Close")? */
  const isMark = (chain: readonly Element[]): boolean => roleOf(chain) === null && !emptyAttr(chain, "accessibilityLabel", []);
  /** Does any element in these subtrees show a named mark? */
  const holdsMark = (els: readonly Element[], seen = new Set<Element>()): boolean => els.some((e) => {
    if (seen.has(e)) return false;
    seen.add(e);
    return isMark([e, ...chainOf(e.tag)]) || holdsMark(e.children, seen);
  });
  /** A class named in a string the levels give (`iconLeft = "CloseIcon"`)
   *  that is a named mark — what the control shows, and so its name. */
  const namesMark = (levels: readonly Element[]): boolean => levels.some((b) => b.attrs.some((a) => {
    const names = a.value.kind === "string" ? [a.value.value] : a.value.kind === "code" ? [...a.value.src.matchAll(/["'](\w+)["']/g)].map((x) => x[1]) : [];
    return names.some((n) => classByName.has(n) && isMark(chainOf(n)));
  }));

  /** The control role an element plays — a pressed or stepped role it
   *  declares (a Control is a button), or a field — or null. */
  const controlRole = (levels: readonly Element[], tag: string): string | null => {
    const r = roleOf(levels);
    if (r !== null) return CONTROL_ROLES.has(r) ? r : null;
    return isA(tag, "TextInput") ? "textField" : null;
  };
  /** The first control inside these subtrees, its own class bodies included —
   *  what a plain view placed inside a control would bring into it. */
  const controlWithin = (els: readonly Element[], seen = new Set<Element>()): { tag: string; role: string } | null => {
    for (const e of els) {
      if (seen.has(e)) continue;
      seen.add(e);
      const chain = [e, ...chainOf(e.tag)];
      const r = controlRole(chain, e.tag);
      if (r !== null) return { tag: e.name ?? e.tag, role: r };
      const inner = controlWithin(chain.flatMap((b) => b.children), seen);
      if (inner !== null) return inner;
    }
    return null;
  };

  /** A size a view collapses to, to hide what it holds: a literal 0, or 0 as
   *  an arm of a choice (`{ open ? 120 : 0 }`). */
  const collapses = (levels: readonly Element[], axis: string): boolean => {
    const v = valueIn(levels, axis);
    if (typeof v === "string") return false;
    if (v.kind === "number") return v.value === 0;
    if (v.kind !== "code") return false;
    const parts = topLevelParts(v.src.trim());
    return parts !== null && "arms" in parts && parts.arms.some((a) => a.trim() === "0");
  };

  /** The classes that open a menu: any whose body, or a use of it or of a
   *  subclass, sets `menu`. Worked out once, on first need. */
  let menuClasses: Set<string> | null = null;
  const opensMenu = (): Set<string> => {
    if (menuClasses !== null) return menuClasses;
    const found = new Set<string>();
    const mark = (tag: string): void => { for (let c = classByName.get(tag), n = 0; c !== undefined && n < 50; c = classByName.get(c.base), n++) found.add(c.name); };
    const visit = (el: Element): void => {
      if (el.attrs.some((a) => a.name === "menu")) { const d = classByBody.get(el); mark(d !== undefined ? d.name : el.tag); }
      for (const c of el.children) visit(c);
    };
    for (const c of program.classes) visit(c.body);
    visit(program.root);
    return (menuClasses = found);
  };

  /** `outer`: the nearest control above, which nothing it holds may be. */
  type Outer = { owner: string; role: string } | null;
  const walk = (el: Element, above: readonly Element[] = [], outer: Outer = null): void => {
    const decl = classByBody.get(el);
    const owner = decl !== undefined ? decl.name : (el.name ?? el.tag);
    // the levels this element answers with: itself, then its class chain
    const levels = [el, ...chainOf(decl !== undefined ? decl.base : el.tag)];

    const own = el.attrs.find((a) => a.name === "accessibilityRole");
    if (own !== undefined && own.value.kind === "code") errors.push(Diag.accessibilityRoleComputed(own.value.pos));
    if (own !== undefined && own.value.kind === "ident") {
      const role = own.value.name;
      const gaps = contractGaps(role, (n) => sets(levels, n), (m) => has(levels, m));
      if (gaps.length > 0) errors.push(Diag.accessibilityContract(contractMessage(owner, role, gaps), own.value.pos));
    }

    if (opts.warnings && !inLibrary(el)) {
      const role = roleOf(levels);
      const tag = decl !== undefined ? decl.base : el.tag;
      // a role that needs a name — judged where the view is USED, since a class
      // may leave its name to each use site; a field is one (a TextInput is a
      // textField with no role written)
      const field = role === null && isA(tag, "TextInput");
      const needs = field ? "textField" : role;
      // (a field's placeholder names it, as it does to every screen reader, and
      // a field inside a Field is named by its caption)
      const placeholderNames = (needs === "textField" || needs === "searchBox" || needs === "combobox") && !emptyAttr(levels, "placeholder", above);
      const captioned = field && provides(above, "fieldLabel");
      // (a row whose class each record picks — classFor — is judged by those
      // classes, which the source names but the use site cannot know)
      const picked = el.attrs.some((a) => a.name === "classFor");
      if (decl === undefined && needs !== null && ROLE_CONTRACTS[needs]?.named === true && !named(levels, above) && !placeholderNames && !captioned && !picked) {
        // its words, the tip it shows, or a mark that has a name (a close icon);
        // its own text that is certainly empty (a label left "") is no words
        const content = levels.flatMap((b) => b.children);
        const fromContent = !NAME_NOT_FROM_CONTENT(needs) && (holdsText(content, levels, above)
          || !emptyAttr(levels, "tooltipLabel", above) || holdsMark(content) || namesMark(levels));
        const labelled = !NAME_NOT_FROM_CONTENT(needs) && levels.some((b) => b.decls.some((d) => d.name === "label"));
        if (!fromContent) warnings.push(Diag.accessibilityNoName(owner, needs, el.pos, labelled));
      }
      // a control inside a control: written here, or brought in by a plain
      // view whose class holds one
      if (outer !== null) {
        const mine = controlRole(levels, tag);
        const brought = mine === null ? controlWithin(chainOf(tag).flatMap((b) => b.children)) : null;
        if (mine !== null) warnings.push(Diag.accessibilityControlInControl(owner, mine, outer.owner, outer.role, el.pos));
        else if (brought !== null) warnings.push(Diag.accessibilityControlInControl(`${brought.tag} in ${owner}`, brought.role, outer.owner, outer.role, el.pos));
      }
      // content clipped out of sight by a size of 0 is still read — said where
      // the clip or the size is written (a use site inherits the class's), and
      // only of content that does not hide itself as well
      const clips = (b: Element): boolean => b.attrs.some((a) => a.name === "clip" && a.value.kind === "ident" && a.value.name === "true");
      const holds = levels.some((b) => b.children.some((c) => isA(c.tag, "View") && !sets([c, ...chainOf(c.tag)], "visible")));
      if (levels.some(clips) && holds && !sets(levels, "visible")) {
        for (const axis of ["height", "width"]) {
          if (collapses(levels, axis) && (decl !== undefined || clips(el) || el.attrs.some((a) => a.name === axis))) {
            warnings.push(Diag.accessibilityCollapsedRead(owner, axis, el.pos));
            break;
          }
        }
      }
      // toggles used as one of several: sibling controls of one class, each with
      // its chosen flag written `{ X == literal }` over the same X
      {
        const bySubject = new Map<string, { tag: string; flag: string; subject: string; pos: (typeof el)["pos"]; n: number }>();
        for (const c of el.children) {
          if (!isA(c.tag, "Control")) continue;
          for (const a of c.attrs) {
            if (!CHOSEN_FLAG.test(a.name) || a.value.kind !== "code") continue;
            const m = /^\s*(.+?)\s*===?\s*("[^"]*"|'[^']*'|-?\d+(?:\.\d+)?)\s*$/.exec(a.value.src);
            if (m === null) continue;
            const key = `${c.tag}|${a.name}|${m[1]}`;
            const g = bySubject.get(key);
            if (g === undefined) bySubject.set(key, { tag: c.tag, flag: a.name, subject: m[1], pos: c.pos, n: 1 });
            else g.n++;
          }
        }
        for (const g of bySubject.values()) if (g.n >= 2) warnings.push(Diag.accessibilityTogglesAsOneOf(g.n, g.tag, g.flag, g.subject, g.pos));
      }
      // a control hidden from a screen reader: said where the hiding is written
      if (el.attrs.some((a) => a.name === "accessibilityHidden")) {
        const v = valueIn(levels, "accessibilityHidden");
        const off = typeof v !== "string" && v.kind === "ident" && v.name === "false";
        const mine = controlRole(levels, tag);
        const inside = mine === null ? controlWithin(levels.flatMap((b) => b.children)) : null;
        if (!off && mine !== null) warnings.push(Diag.accessibilityHiddenControl(owner, owner, mine, el.pos));
        else if (!off && inside !== null) warnings.push(Diag.accessibilityHiddenControl(owner, inside.tag, inside.role, el.pos));
      }
      // a control that shows a choice and reports none: a class of its own with a
      // boolean saying it is the one chosen (`on`, `selected` …), and no state a
      // screen reader hears — each of a row of them reads as a plain button
      // (a control that opens a menu reports that it does; what its flag marks —
      // a filter set — its label says, and it is no option among others)
      if (decl !== undefined && isA(tag, "Control") && !opensMenu().has(decl.name)) {
        const flag = levels.flatMap((b) => b.decls).find((d) => CHOSEN_FLAG.test(d.name) && d.type === "boolean");
        if (flag !== undefined && !["accessibilitySelected", "accessibilityChecked", "accessibilityPressed"].some((n) => sets(levels, n)))
          warnings.push(Diag.accessibilityUnreportedChoice(owner, flag.name, el.pos));
      }
      // a drawn view that takes the focus and says nothing — said once, where
      // the drawing or the focus is written (a use site inherits the class's)
      const focusable = (b: Element): boolean => b.attrs.some((a) => a.name === "focusable" && a.value.kind === "ident" && (a.value.name === "true" || a.value.name === "quiet"));
      if (role === null && !isA(tag, "Control") && has(levels, "draw") && levels.some(focusable)
        && (el.methods.some((m) => m.name === "draw") || focusable(el))) {
        warnings.push(Diag.accessibilityDrawnFocusable(owner, el.pos));
      }
    }

    // what this element holds sits inside it, if it is a control
    const role = roleOf(levels);
    // an option is a list's row: one that opens into an editor holds its fields
    // and buttons, each reached on its own and left out of the row's name
    const inner: Outer = role !== null && CONTROL_ROLES.has(role) && role !== "option" ? { owner, role } : outer;
    for (const c of el.children) walk(c, [...above, el], inner);
  };
  for (const c of program.classes) walk(c.body);
  walk(program.root);
  return { errors, warnings };
}
