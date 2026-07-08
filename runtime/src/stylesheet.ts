// The stylesheet — the styling rung's EXTERNAL channel: a class-keyed,
// swappable skin (style without source edits), plus the theme record it
// travels with. Ruled shape (design-docs/style.md): entries are a dictionary
// lookup on a typed class name — no selectors, no structural matching, no
// specificity — resolved by a class-chain walk with FIELD-WISE merge (a
// subclass entry's fields win, the rest fall through per field, mirroring
// declaration-default chaining); every entry is schema-validated at check
// time, so a stale skin fails loudly where CSS rots silently.
//
// How it lands on the one spine: each view under an effective stylesheet
// carries one APPLIER — a standing Constraint that reads the prevailing
// `stylesheet` slot (a tracked follow, so a swap anywhere above wakes
// exactly the subtree it governs), computes the merged entry for the view's
// class, evaluates its fields (a `{ }` field runs with `this` = the styled
// view — the bundle rule, which is what makes skins theme-aware), and
// installs them as rank-2 OFFERS through stylesheetWrite/stylesheetClear
// (attributes.ts): below every author provision — a $set or owning binding
// outranks and the field never touches the slot — above the prevailing
// follow and the declaration default. The stylesheet's THEME record offers on the
// PROVIDER view only (where `stylesheet` is locally provided), so it flows
// down by the ordinary follow and a mid-tree `theme = …` still re-roots
// beneath it.
//
// Pay-per-use: a program with no stylesheet allocates nothing here (no
// applier exists); appliers install where an effective stylesheet is in force —
// at instantiate for the initial tree, and by the `stylesheet` slot's pusher
// walking the subtree when a stylesheet arrives later. A swap re-runs existing
// appliers through ordinary tracking: one settle, one frame.
//
// This module is runtime-graph and View-free on purpose (it types hosts
// structurally), so view.ts can import it for the slot pusher without a
// cycle; the checker's half lives in check.ts.

import { Constraint } from "./reactive.js";
import { NeoError } from "./errors.js";
import { isSet, ownerOf, stylesheetClear, stylesheetMarks, stylesheetWrite } from "./attributes.js";
import type { Theme } from "./value.js";

/** One entry field: a coerced literal value, or a compiled `{ }` binding
 *  (evaluated per styled view, per applier run). */
export interface StylesheetField {
  readonly name: string;
  readonly value?: unknown;
  readonly fn?: (this: unknown, parent: unknown, classroot: unknown) => unknown;
}

/** A stylesheet as a runtime value — one interned object per declaration per
 *  program, so a swap is one equality-gated write. */
export interface Stylesheet {
  readonly name: string;
  readonly theme: Theme | null;
  /** Class name → that entry's fields. */
  readonly entries: ReadonlyMap<string, readonly StylesheetField[]>;
  /** Per-class-chain merge cache (chain key → field map). */
  readonly merged: Map<string, Readonly<Record<string, StylesheetField>>>;
}

export function buildStylesheet(
  name: string,
  theme: Theme | null,
  entries: ReadonlyMap<string, readonly StylesheetField[]>
): Stylesheet {
  return { name, theme, entries, merged: new Map() };
}

/** The minimal structural view a stylesheet needs (View satisfies it). */
interface Styled {
  parent: Styled | null;
  children?: readonly unknown[];
  stylesheet: Stylesheet | null;
  constructor: { name: string };
}

/** The field-wise chain merge (ruled): consult the entry for each class on
 *  the instance's chain, nearest class first — a nearer entry's fields win,
 *  unmentioned fields fall through per field. */
function mergedFor(stylesheet: Stylesheet, chain: readonly string[]): Readonly<Record<string, StylesheetField>> {
  const key = chain.join(",");
  let m = stylesheet.merged.get(key);
  if (m === undefined) {
    const out: Record<string, StylesheetField> = Object.create(null);
    for (let i = chain.length - 1; i >= 0; i--) {
      const entry = stylesheet.entries.get(chain[i]);
      if (entry !== undefined) {
        for (const f of entry) out[f.name] = f; // nearer classes overwrite
      }
    }
    stylesheet.merged.set(key, (m = out));
  }
  return m;
}

/** The instance's class-name chain, leaf first (a §5 anonymous one-off
 *  subclass shares its base's name, so it matches its base's entries). */
function chainOf(view: Styled): string[] {
  const names: string[] = [];
  for (let c: unknown = view.constructor; typeof c === "function" && c !== Function.prototype; c = Object.getPrototypeOf(c)) {
    const n = (c as { name: string }).name;
    if (n !== "" && names[names.length - 1] !== n) names.push(n);
  }
  return names;
}

// One applier per view, module-private (a view with no stylesheet carries none).
const APPLIERS = new WeakMap<object, Constraint>();

/** Is this view's `stylesheet` slot LOCALLY provided (it is the stylesheet's
 *  provider — where the theme record offers)? */
function providesStylesheet(view: Styled): boolean {
  return isSet(view, "stylesheet") || ownerOf(view, "stylesheet") !== null;
}

/** Install the view's applier if an effective stylesheet is in force (and it
 *  has none yet). Idempotent; called at instantiate for the initial tree and
 *  by stylesheetArrived's walk for later provisions. */
export function ensureApplier(view: object): void {
  const v = view as Styled;
  if (APPLIERS.has(view)) return;
  if (v.stylesheet === null) return; // plain (untracked) effective read
  const chain = chainOf(v);
  const applier = new Constraint(
    `${v.constructor.name}'s stylesheet`,
    // Compute under tracking: the effective stylesheet (a tracked follow — a swap
    // anywhere above wakes this), each applicable field's value (a { } field
    // tracks what it reads — theme tokens re-skin exactly their readers).
    () => {
      const stylesheet = v.stylesheet;
      const offers: Record<string, unknown> = Object.create(null);
      if (stylesheet !== null) {
        if (stylesheet.theme !== null && providesStylesheet(v)) offers.theme = stylesheet.theme;
        const fields = mergedFor(stylesheet, chain);
        for (const name in fields) {
          // An author provision outranks the entry: the offer never lands.
          // (A runtime derive also keeps its slot — the v1 line: a skin does
          // not displace intrinsic sizing.)
          if (isSet(view, name) || ownerOf(view, name) !== null) continue;
          const f = fields[name];
          offers[name] = f.fn !== undefined ? f.fn.call(view, v.parent, null) : f.value;
        }
      }
      return offers;
    },
    // Apply untracked: withdraw fields no longer offered, land the rest.
    (offers) => {
      const o = offers as Record<string, unknown>;
      const marks = stylesheetMarks(view);
      if (marks !== undefined) {
        for (const name of [...marks]) {
          if (!(name in o)) stylesheetClear(view, name);
        }
      }
      for (const name in o) stylesheetWrite(view, name, o[name]);
    }
  );
  APPLIERS.set(view, applier);
  applier.run();
}

/** The `stylesheet` slot's pusher: a stylesheet arrived at (or left) this view —
 *  make sure the subtree beneath has appliers (existing ones re-run through
 *  their own tracking; this walk only INSTALLS missing ones). */
export function stylesheetArrived(view: object): void {
  const walk = (n: Styled): void => {
    ensureApplier(n);
    for (const c of n.children ?? []) {
      if (typeof c === "object" && c !== null && "stylesheet" in c) walk(c as Styled);
    }
  };
  walk(view as Styled);
}

/** Retire the view's applier (View.discard). */
export function disposeApplier(view: object): void {
  const a = APPLIERS.get(view);
  if (a !== undefined) {
    APPLIERS.delete(view);
    a.dispose();
  }
}

// ── The program's stylesheet registry (what the declarative `stylesheet = Dark`
// and a body's `this.lookupStylesheet("Dark")` resolve against) — keyed by
// the tree root. ──────────────────────────────────────────────────────────

const REGISTRY = new WeakMap<object, ReadonlyMap<string, Stylesheet>>();

export function registerStylesheets(root: object, stylesheets: ReadonlyMap<string, Stylesheet>): void {
  REGISTRY.set(root, stylesheets);
}

export function stylesheetByName(root: object, name: string): Stylesheet {
  const stylesheet = REGISTRY.get(root)?.get(name);
  if (stylesheet === undefined) {
    throw new NeoError(`no stylesheet named '${name}' is declared in this program`);
  }
  return stylesheet;
}
