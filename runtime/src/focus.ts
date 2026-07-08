// Focus — the keyboard-focus service (design-docs/input.md, Layer 2). One
// focused view at a time; Tab moves through the view tree in preorder, each
// view's own `tabOrder()` deciding the order it is descended into (default =
// visible children in source order — so an all-default tree is pure preorder,
// no numeric tabindex, LZX over DOM). `focustrap` bounds a self-contained group
// (Tab cycles within, `onEscapeFocus` at the boundary). The sequence is
// recomputed LIVE per move over the current tree, and the service subscribes to
// the discard lifecycle so a moving tree can never strand focus.
//
// It is a small STATEFUL service (holds the current focus, the root, a
// reentrancy lock) rather than a pure per-Tab function — see input.md
// §mutation. Keyboard delivery to the focused view (Keys → onKeyDown/onKeyUp)
// is wired by the runtime entry, not here, keeping this layer independent.

import { View, fireEvent, setFocusDiscardHook } from "./view.js";
import type { KeysService } from "./keys.js";

export class FocusService {
  private current: View | null = null;
  private rootView: View | null = null;
  /** Reentrancy lock: a focus change fires onFocus/onBlur handlers that may
   *  call focus() again; remember the latest target and apply it after the
   *  current change settles (LZX's discipline). */
  private changing = false;
  private queued = false;
  private queuedTarget: View | null = null;

  /** The tree root, for traversal when nothing is focused (set at attach). */
  setRoot(view: View | null): void {
    this.rootView = view;
  }

  getFocus(): View | null {
    return this.current;
  }

  /** Test/lifecycle reset. */
  reset(): void {
    this.current = null;
    this.rootView = null;
    this.changing = false;
    this.queued = false;
  }

  /** Focus a view (null = blur). A non-focusable or invisible view is ignored
   *  (never becomes the focus). Fires onBlur on the old, onFocus on the new. */
  focus(view: View | null): void {
    if (view !== null && !(view.focusable && view.visible)) return;
    if (this.changing) {
      this.queued = true;
      this.queuedTarget = view;
      return;
    }
    if (view === this.current) return;
    this.changing = true;
    const old = this.current;
    this.current = view;
    if (old !== null) {
      old.focusChanged(false); // internal (native element) before the user event
      fireEvent(old, "blur");
    }
    if (view !== null) {
      view.focusChanged(true);
      fireEvent(view, "focus");
    }
    this.changing = false;
    if (this.queued) {
      this.queued = false;
      this.focus(this.queuedTarget);
    }
  }

  blur(): void {
    this.focus(null);
  }

  next(): void {
    this.move(1);
  }
  prev(): void {
    this.move(-1);
  }

  /** The ordered focus stops in a view's group — its focustrap ancestor, else
   *  the root. Exposed for tooling/tests. */
  sequenceFor(view: View | null): View[] {
    const group = view !== null ? this.groupRoot(view) : this.rootView;
    return group !== null ? sequence(group) : [];
  }

  private move(dir: 1 | -1): void {
    const group = this.current !== null ? this.groupRoot(this.current) : this.rootView;
    if (group === null) return;
    const seq = sequence(group);
    if (seq.length === 0) return;
    const idx = this.current !== null ? seq.indexOf(this.current) : dir === 1 ? -1 : 0;
    const atEdge = idx !== -1 && ((dir === 1 && idx === seq.length - 1) || (dir === -1 && idx === 0));
    if (group.focustrap && atEdge) fireEvent(group, "escapeFocus");
    const nidx = (((idx + dir) % seq.length) + seq.length) % seq.length; // cyclic
    this.focus(seq[nidx]);
  }

  /** The focused view's subtree is being discarded (or hidden) — move focus to
   *  a live stop OUTSIDE it before it goes, so focus never dangles. Called from
   *  View.discard() via the seam in view.ts. */
  noteDiscarded(view: View): void {
    if (this.current === null || !isInSubtree(this.current, view)) return;
    const group = this.rootView ?? rootOf(view);
    const survivors = sequence(group).filter((v) => !isInSubtree(v, view));
    this.current = null; // the old focus is dying; drop it without a blur into a dead view
    if (survivors.length > 0) this.focus(survivors[0]);
  }

  /** The nearest focustrap ancestor of `view` (the group it belongs to), or the
   *  tree root when there is none. */
  private groupRoot(view: View): View {
    for (let v: View | null = view.parent instanceof View ? view.parent : null; v !== null; v = v.parent instanceof View ? v.parent : null) {
      if (v.focustrap) return v;
    }
    return this.rootView ?? rootOf(view);
  }
}

/** The flat ordered focus stops within `root`'s group: preorder over each
 *  view's `tabOrder()`, emitting `focusable && visible` views, not descending
 *  into a NESTED focustrap (its own group). */
function sequence(root: View): View[] {
  const out: View[] = [];
  const walk = (v: View): void => {
    for (const m of tabOrderOf(v)) {
      if (!m.visible) continue;
      if (m.focusable) out.push(m);
      if (m.focustrap && m !== root) continue; // a nested trap is a separate group
      walk(m);
    }
  };
  walk(root);
  return out;
}

/** A view's ordered traversal members: its `tabOrder()` override if it defines
 *  one (an instance method, installed by the language), else `tabDefault()`.
 *  Non-View entries are dropped defensively. */
function tabOrderOf(v: View): View[] {
  const fn = (v as unknown as { tabOrder?: () => unknown }).tabOrder;
  const members = typeof fn === "function" ? fn.call(v) : v.tabDefault();
  return Array.isArray(members) ? members.filter((m): m is View => m instanceof View) : [];
}

function rootOf(view: View): View {
  let v = view;
  while (v.parent instanceof View) v = v.parent;
  return v;
}

function isInSubtree(node: View, ancestor: View): boolean {
  for (let v: View | null = node; v !== null; v = v.parent instanceof View ? v.parent : null) {
    if (v === ancestor) return true;
  }
  return false;
}

/** Wire a Keys service to a Focus service: `Tab` / `Shift-Tab` are consumed by
 *  focus traversal; every other key is delivered to the focused view as
 *  `onKeyDown` / `onKeyUp` (target-only, no bubbling — D-2). Returns an
 *  unsubscribe thunk. The runtime entry calls this; a test drives it with a
 *  fresh KeysService. (v1: Tab is always the traversal key; a field that wants
 *  a literal Tab is a later refinement.) */
export function deliverKeys(keys: KeysService, focus: FocusService): () => void {
  const offDown = keys.onKeyDown((e) => {
    if (e.code === "Tab") {
      if (e.shift) focus.prev();
      else focus.next();
      return;
    }
    const f = focus.getFocus();
    if (f !== null) fireEvent(f, "keyDown", e);
  });
  const offUp = keys.onKeyUp((e) => {
    if (e.code === "Tab") return;
    const f = focus.getFocus();
    if (f !== null) fireEvent(f, "keyUp", e);
  });
  return () => {
    offDown();
    offUp();
  };
}

/** The runtime's focus service (LZX's lz.Focus). */
export const Focus = new FocusService();

// Register the discard hook (input.md §mutation): keeps focus off a subtree
// that is being torn down. One-directional — focus.ts imports view.ts, not the
// reverse — so no import cycle.
setFocusDiscardHook((view) => Focus.noteDiscarded(view));
