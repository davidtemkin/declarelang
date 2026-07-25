// Interaction-state tracker for the CSS pseudo-classes, built on the public
// Pointer + Focus seams. Pure chain helpers + a stateful tracker of per-view
// reactive Cells so a matcher's pseudo() read is tracked and a transition
// re-runs the applier. Pseudo names are the CSS ones: hover / active / focus.
import { Cell, isTracking } from "../../../runtime/dist/reactive.js";
import type { View } from "../../../runtime/dist/view.js";
import type { PointerService } from "../../../runtime/dist/pointer.js";
import type { FocusService } from "../../../runtime/dist/focus.js";

/** PURE: view → root inclusive, via .parent. */
export function ancestorChain(view: View): View[] {
  const out: View[] = [];
  for (let v: View | null = view; v != null; v = v.parent as View | null) out.push(v);
  return out;
}

/** PURE: views to clear and to set on a chain transition. */
export function chainDiff(prev: View[], next: View[]): { clear: View[]; set: View[] } {
  const p = new Set(prev), n = new Set(next);
  return { clear: prev.filter((v) => !n.has(v)), set: next.filter((v) => !p.has(v)) };
}

export interface InteractionTracker {
  pseudo(view: View, name: string): boolean;
  dispose(): void;
}

/** Subscribe to Pointer/Focus and expose per-view reactive pseudo-state. */
export function makeInteractionTracker(Pointer: PointerService, Focus: FocusService): InteractionTracker {
  const cells = new WeakMap<View, Record<string, Cell>>();
  const state = new WeakMap<View, Record<string, boolean>>();

  const cellOf = (view: View, kind: string): Cell => {
    let c = cells.get(view);
    if (c === undefined) { c = {}; cells.set(view, c); }
    return (c[kind] ??= new Cell());
  };
  const read = (view: View, kind: string): boolean => {
    if (isTracking()) cellOf(view, kind).track();
    return state.get(view)?.[kind] ?? false;
  };
  const write = (view: View, kind: string, on: boolean): void => {
    let s = state.get(view);
    if (s === undefined) { s = {}; state.set(view, s); }
    if ((s[kind] ?? false) === on) return;
    s[kind] = on;
    cells.get(view)?.[kind]?.changed();
  };

  const chain: Record<string, View[]> = { hover: [], active: [] };
  const applyChain = (view: View | null, kind: string): void => {
    const next = view != null ? ancestorChain(view) : [];
    const { clear, set } = chainDiff(chain[kind], next);
    for (const v of clear) write(v, kind, false);
    for (const v of set) write(v, kind, true);
    chain[kind] = next;
  };

  let focusLeaf: View | null = null;
  const offHover = Pointer.onHover((v) => applyChain(v, "hover"));
  const offPress = Pointer.onPress((v) => applyChain(v, "active"));
  const offFocus = Focus.onFocusChange((v) => {
    if (v === focusLeaf) return;
    if (focusLeaf != null) write(focusLeaf, "focus", false);
    focusLeaf = v;
    if (v != null) write(v, "focus", true);
  });

  return {
    pseudo: (view, name) => read(view, name),
    dispose: () => { offHover(); offPress(); offFocus(); },
  };
}
