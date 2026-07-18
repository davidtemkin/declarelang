// The CSS applier: one Constraint per view (pay-per-use), the sibling of the
// stylesheet applier (stylesheet.ts). It reads (tracked) the prevailing
// cssRules, the view's and ancestors' styleclass/id and any tested [attr],
// computes the per-view cascade, coerces each mapped property, and installs the
// result as rank-2b offers (below the class-dict) via cssWrite / withdraws via
// cssClear. Dynamic re-matching rides the reactive settle: any tracked read
// that changes wakes it. Inheritance is NOT done here — a CSS offer on a
// prevailing slot flows down by the ordinary follow.

import { Constraint } from "./reactive.js";
import { cssMap, cssWrite, cssClear, cssMarks, isSet, ownerOf, stylesheetMarks } from "./attributes.js";
import { matched, type MatchView, type RuleSet } from "./css-match.js";

interface Styled {
  parent: Styled | null;
  children?: readonly unknown[];
  cssRules: RuleSet | null;
  styleclass: string;
  id: string;
  hovered: boolean;
  pressed: boolean;
  focused: boolean;
  setInteractionTracked(on: boolean): void;
  constructor: Function;
}

const APPLIERS = new WeakMap<object, Constraint>();

/** This class + its ancestors' names — subclass-aware tag matching. Immutable
 *  (a class never changes), so it needs no tracking and is memoized per class. */
const TAG_CHAINS = new WeakMap<Function, string[]>();
function classNames(ctor: Function): string[] {
  const cached = TAG_CHAINS.get(ctor);
  if (cached !== undefined) return cached;
  const names: string[] = [];
  let c: Function | null = ctor;
  while (c && c !== Function.prototype && c.name) {
    names.push(c.name);
    c = Object.getPrototypeOf(c) as Function | null;
  }
  TAG_CHAINS.set(ctor, names);
  return names;
}

/** Adapt a view to the matcher's structural interface, reading through the
 *  view's TRACKED accessors so a change to styleclass/id/[attr] on this view OR
 *  any ancestor wakes the applier. */
function asMatchView(v: Styled): MatchView {
  return {
    get tagChain() {
      return classNames(v.constructor);
    },
    get id() {
      return v.id;
    },
    get styleclass() {
      return v.styleclass;
    },
    attr: (name) => (v as unknown as Record<string, unknown>)[name],
    pseudo: (name) => (name === "hover" ? v.hovered : name === "active" ? v.pressed : v.focused),
    get parent() {
      return v.parent ? asMatchView(v.parent) : null;
    },
  };
}

/** Install the view's CSS applier if an effective cssRules is in force (and it
 *  has none yet). Idempotent; called at instantiate and by cssRulesArrived. */
export function ensureCssApplier(view: object): void {
  const v = view as Styled;
  if (APPLIERS.has(view)) return;
  if (v.cssRules === null) return; // plain (untracked) effective read
  const applier = new Constraint(
    `${v.constructor.name}'s css`,
    () => {
      const rules = v.cssRules; // tracked follow of the prevailing slot
      const offers: Record<string, unknown> = Object.create(null);
      if (rules !== null) {
        const map = cssMap(v.constructor);
        const decls = matched(asMatchView(v), rules);
        for (const [prop, raw] of decls) {
          const entry = map[prop];
          if (entry === undefined) continue; // unmapped property → ignore
          // TRACKED PROVISION PROBE: read the slot's effective value through the
          // getter so this applier subscribes to entry.attr's cell. Any
          // provision change on it — author $set, an owning binding, a class-dict
          // stylesheetWrite/Clear (all fire that cell's changed()) — then wakes
          // this applier to withdraw or re-offer.
          void (view as Record<string, unknown>)[entry.attr];
          // Author or class-dict outranks CSS: don't offer.
          if (isSet(view, entry.attr) || ownerOf(view, entry.attr) !== null) continue;
          if (stylesheetMarks(view)?.has(entry.attr)) continue;
          const value = entry.coerce(raw);
          if (value === undefined) continue; // malformed → skip
          offers[entry.attr] = value;
        }
      }
      return offers;
    },
    (offers) => {
      const o = offers as Record<string, unknown>;
      const marks = cssMarks(view);
      if (marks !== undefined) {
        for (const name of [...marks]) if (!(name in o)) cssClear(view, name);
      }
      for (const name in o) cssWrite(view, name, o[name]);
    }
  );
  APPLIERS.set(view, applier);
  applier.run();
}

/** The `cssRules` slot's pusher: rules arrived at (or left) this view — make
 *  sure the subtree beneath has appliers (existing ones re-run through their
 *  own tracking; this walk only INSTALLS missing ones). */
export function cssRulesArrived(view: object): void {
  const walk = (n: Styled): void => {
    ensureCssApplier(n);
    for (const c of n.children ?? []) {
      if (typeof c === "object" && c !== null && "cssRules" in c) walk(c as Styled);
    }
  };
  walk(view as Styled);
}

/** Re-cascade a moved subtree against its new ancestors (re-run every applier
 *  on the moved node and its descendants). */
export function cssReparent(view: object): void {
  const walk = (n: Styled): void => {
    APPLIERS.get(n)?.run();
    for (const c of n.children ?? []) {
      if (typeof c === "object" && c !== null && "cssRules" in c) walk(c as Styled);
    }
  };
  walk(view as Styled);
}

/** Retire the view's CSS applier (View.discard). */
export function disposeCssApplier(view: object): void {
  const a = APPLIERS.get(view);
  if (a !== undefined) {
    APPLIERS.delete(view);
    a.dispose();
  }
}
