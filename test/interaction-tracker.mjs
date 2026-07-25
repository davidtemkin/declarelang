// A PLUGIN (not core): interaction-state tracking built entirely on the Pointer
// + Focus seams — proof that a plugin can implement CSS :hover/:active/:focus
// with zero core change. The real CSS engine (Increment 3) does this internally.
import { Cell, isTracking } from "../runtime/dist/reactive.js";

/** Pure: the ancestor chain view -> root (inclusive), following `.parent`. */
export function ancestorChain(view) {
  const out = [];
  for (let v = view; v != null; v = v.parent) out.push(v);
  return out;
}

/** Pure: given previous and next chains, the views to clear and to set. */
export function chainDiff(prev, next) {
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  return {
    clear: prev.filter((v) => !nextSet.has(v)),
    set: next.filter((v) => !prevSet.has(v)),
  };
}

/** The tracker (a plugin): subscribes to Pointer + Focus and maintains per-view
 *  reactive cells for hover/press/focus, answering isHovered/isPressed/isFocused
 *  reactively. Chain propagation for hover/press; leaf-only for focus. */
export function makeInteractionTracker(Pointer, Focus) {
  const cells = new WeakMap();  // View -> { hover?: Cell, press?: Cell, focus?: Cell }
  const state = new WeakMap();  // View -> { hover?, press?, focus?: boolean }

  const cellOf = (view, kind) => {
    let c = cells.get(view);
    if (c === undefined) { c = {}; cells.set(view, c); }
    return (c[kind] ??= new Cell());
  };
  const read = (view, kind) => {
    if (isTracking()) cellOf(view, kind).track();  // pay-per-use: cell only under tracking
    return state.get(view)?.[kind] ?? false;
  };
  const write = (view, kind, on) => {
    let s = state.get(view);
    if (s === undefined) { s = {}; state.set(view, s); }
    if ((s[kind] ?? false) === on) return;
    s[kind] = on;
    cells.get(view)?.[kind]?.changed();  // notify only if a cell exists (was read)
  };

  const chainRef = { hover: [], press: [] };
  const applyChain = (view, kind) => {
    const next = view != null ? ancestorChain(view) : [];
    const { clear, set } = chainDiff(chainRef[kind], next);
    for (const v of clear) write(v, kind, false);
    for (const v of set) write(v, kind, true);
    chainRef[kind] = next;
  };

  let focusLeaf = null;
  const offHover = Pointer.onHover((v) => applyChain(v, "hover"));
  const offPress = Pointer.onPress((v) => applyChain(v, "press"));
  const offFocus = Focus.onFocusChange((v) => {
    if (v === focusLeaf) return;
    if (focusLeaf != null) write(focusLeaf, "focus", false);
    focusLeaf = v;
    if (v != null) write(v, "focus", true);
  });

  return {
    isHovered: (v) => read(v, "hover"),
    isPressed: (v) => read(v, "press"),
    isFocused: (v) => read(v, "focus"),
    dispose: () => { offHover(); offPress(); offFocus(); },
  };
}
