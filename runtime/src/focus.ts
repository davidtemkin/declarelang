// Focus — the keyboard-focus service (docs/system-design/input.md, Layer 2). One
// focused view at a time; Tab moves through the view tree in preorder, each
// view's own `tabOrder()` deciding the order it is descended into (default =
// visible children in source order — so an all-default tree is pure preorder,
// no numeric tabindex, LZX over DOM). `focusTrap` bounds a self-contained group
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
import { Cell, Constraint } from "./reactive.js";
import { rootFrameOrigin, type InteractionView } from "./interaction.js";

/** The focused control's live silhouette, root-space — what the follower
 *  (below) computes and onGeometry subscribers receive. `root` lets a ring
 *  stand down when another app on the page owns the target. */
export interface FocusGeometry {
  x: number; y: number; w: number; h: number; rad: number;
  view: View; root: View;
  /** The focused view's nearest scrolling ancestor (the root when none) —
   *  the container an indicator TRAVELS WITH (View.travelWith) so the
   *  platform carries it through scrolls with zero lag. */
  scroller: View;
  /** The view's origin in the scroller's CONTENT coordinates — where a
   *  traveled indicator positions itself (deliberately independent of the
   *  scroller's own scroll offset, so scrolling does not re-derive it: the
   *  platform moves both together). Equal to x/y when the scroller IS the
   *  root. focusShape offsets are folded in, like x/y. */
  homeX: number; homeY: number;
}

export class FocusService {
  private current: View | null = null;
  private rootView: View | null = null;
  /** Whether the LAST focus change was keyboard-driven (Tab traversal). The
   *  focus-visible modality: a ring/indicator shows only for keyboard focus —
   *  a pointer press focuses silently (the click itself is the feedback).
   *  A REACTIVE fact: `byKeyboard()` is a tracked read, so a component's
   *  styling constraint (a Tab header's focus edge) re-derives when the
   *  modality flips — same slot, event handlers and constraints alike. */
  private keyboard = false;
  private readonly keyboardCell = new Cell();

  private setKeyboard(v: boolean): void {
    if (this.keyboard === v) return;
    this.keyboard = v;
    this.keyboardCell.changed();
  }
  /** Subscribers to focus CHANGES (`Focus [ onFocusChange(v) { … } ]`) —
   *  called with the newly focused view (or null on blur) after the change
   *  settles. What the traveling focus indicator rides. */
  private readonly changeHandlers = new Set<(v: View | null) => void>();
  /** Subscribers to the focused control's LIVE GEOMETRY
   *  (`Focus [ onGeometry(g) { … } ]`). A standing runtime constraint follows
   *  the target: tracked reads
   *  of the parent chain's x/y and the control's focusShape() mean an
   *  arrow-keyed slider thumb, a reflowing layout, or a resized ancestor
   *  moves the resting ring WITH its control — no re-focus needed. */
  private readonly geometryHandlers = new Set<(g: FocusGeometry) => void>();
  private follower: Constraint | null = null;
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

  /** True when the current focus arrived by KEYBOARD (Tab/Shift-Tab) — the
   *  focus-visible modality gate an indicator reads: show for keyboard focus,
   *  stay hidden for pointer/programmatic focus. */
  byKeyboard(): boolean {
    this.keyboardCell.track();
    return this.keyboard;
  }

  /** Test/lifecycle reset. */
  reset(): void {
    this.current = null;
    this.rootView = null;
    this.changing = false;
    this.queued = false;
    this.follower?.dispose();
    this.follower = null;
  }

  /** Focus a view (null = blur). A non-focusable or invisible view is ignored
   *  (never becomes the focus). Fires onBlur on the old, onFocus on the new.
   *  This public entry is the POINTER/PROGRAMMATIC path — it clears the
   *  keyboard modality; Tab traversal (move) sets it. */
  focus(view: View | null): void {
    this.setKeyboard(false);
    this.apply(view);
  }

  private apply(view: View | null): void {
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
    this.retargetFollower();
    for (const h of [...this.changeHandlers]) h(this.current);
    if (this.queued) {
      this.queued = false;
      this.apply(this.queuedTarget); // re-entry keeps the initiating modality
    }
  }

  /** Subscribe to focus changes. Returns the unsubscribe thunk — the `<-`
   *  wiring's contract (sources.ts). */
  onFocusChange(fn: (v: View | null) => void): () => void {
    this.changeHandlers.add(fn);
    return () => this.changeHandlers.delete(fn);
  }

  onGeometry(fn: (g: FocusGeometry) => void): () => void {
    this.geometryHandlers.add(fn);
    return () => this.geometryHandlers.delete(fn);
  }

  /** (Re)install the follower for the current focus. The constraint's body
   *  reads TRACKED slots (ancestor x/y AND every scroll offset on the chain —
   *  the shared walk's reads; the focusShape's inputs), so any change,
   *  scrolling included, re-fires it; its push notifies the geometry
   *  subscribers. Geometry is the root's CONTENT space — the FocusRing is a
   *  child of the App and scrolls with the page like the control it rings, so
   *  the root's own scroll is added back onto the frame-space origin;
   *  an intermediate pane's scroll (which moves the control on screen while
   *  the ring's coordinate space stands still) stays subtracted. Hand-rolled
   *  x/y accumulation here was the scroll-blind focus ring (found 2026-07-31,
   *  the same missing term as the pointer walk's — ONE WALK, everywhere). */
  private retargetFollower(): void {
    this.follower?.dispose();
    this.follower = null;
    const v = this.current;
    if (v === null || this.geometryHandlers.size === 0) return;
    const k = new Constraint(
      "Focus.follower",
      (): FocusGeometry | null => {
        const o = rootFrameOrigin(v as unknown as InteractionView);
        const root = rootOf(v);
        const x = o.x + root.scrollX;
        const y = o.y + root.scrollY;
        // the nearest scrolling ancestor (exclusive) — the travel home; and
        // the view's origin in ITS content space (plain accumulation up to
        // the scroller: nearest means no scrolled pane sits between, and the
        // scroller's OWN offset is deliberately not a read — a traveled
        // indicator must NOT re-derive per scroll tick, that's the point)
        let scroller: View = root;
        for (let n = v.parent; n instanceof View; n = n.parent) {
          if (n.scrolls !== "none") { scroller = n; break; }
        }
        let homeX = 0, homeY = 0;
        for (let n: View = v; n !== scroller; ) {
          homeX += n.x; homeY += n.y;
          if (!(n.parent instanceof View)) break;
          n = n.parent;
        }
        if (scroller === root) { homeX = x; homeY = y; }
        const fsFn = (v as unknown as { focusShape?: () => { x: number; y: number; w: number; h: number; rad: number } | null }).focusShape;
        const fs = typeof fsFn === "function" ? fsFn.call(v) : null;
        return {
          x: x + (fs ? fs.x : 0), y: y + (fs ? fs.y : 0),
          w: fs ? fs.w : v.width, h: fs ? fs.h : v.height,
          rad: fs ? fs.rad : (v.cornerRadius > 0 ? v.cornerRadius : 4),
          view: v, root, scroller,
          homeX: homeX + (fs ? fs.x : 0), homeY: homeY + (fs ? fs.y : 0),
        };
      },
      (g) => { if (g != null) for (const fn of [...this.geometryHandlers]) fn(g as FocusGeometry); }
    );
    k.run();
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

  /** The ordered focus stops in a view's group — its focusTrap ancestor, else
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
    if (group.focusTrap && atEdge) fireEvent(group, "escapeFocus");
    const nidx = (((idx + dir) % seq.length) + seq.length) % seq.length; // cyclic
    this.setKeyboard(true); // Tab traversal — the focus-visible modality
    this.apply(seq[nidx]);
    // The web's focus-reveal contract: a keyboard-focused control is scrolled
    // into view (minimum distance — "nearest"), through app scrollers and the
    // document alike. Without it, Tab after a page scroll lands the ring
    // offscreen and the traversal looks dead.
    if (this.current === seq[nidx]) seq[nidx].scrollIntoView("nearest");
  }

  /** The focused view's subtree is being discarded (or hidden) — move focus to
   *  a live stop OUTSIDE it before it goes, so focus never dangles. Survivors
   *  come from the dying view's OWN tree: when an embedded app is torn down
   *  (a live-edit re-render), focus is dropped, never re-anchored into the
   *  host app's controls. Called from View.discard() via the seam in view.ts. */
  noteDiscarded(view: View): void {
    if (this.current === null || !isInSubtree(this.current, view)) return;
    const survivors = sequence(rootOf(view)).filter((v) => !isInSubtree(v, view));
    this.current = null; // the old focus is dying; drop it without a blur into a dead view
    if (survivors.length > 0) this.focus(survivors[0]);
  }

  /** The nearest focusTrap ancestor of `view` (the group it belongs to), or the
   *  view's OWN tree root when there is none. The tree anchor matters when more
   *  than one app shares the page (an embedded preview inside a host app): the
   *  focused view's group is ITS app's tree, so Tab cycles within the app the
   *  user is interacting with and never leaks into the host's controls. */
  private groupRoot(view: View): View {
    for (let v: View | null = view.parent instanceof View ? view.parent : null; v !== null; v = v.parent instanceof View ? v.parent : null) {
      if (v.focusTrap) return v;
    }
    return rootOf(view);
  }
}

/** The flat ordered focus stops within `root`'s group: preorder over each
 *  view's `tabOrder()`, emitting `focusable && visible` views, not descending
 *  into a NESTED focusTrap (its own group). */
function sequence(root: View): View[] {
  const out: View[] = [];
  const walk = (v: View): void => {
    for (const m of tabOrderOf(v)) {
      if (!m.visible) continue;
      if (m.focusable) out.push(m);
      if (m.focusTrap && m !== root) continue; // a nested trap is a separate group
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
/** Pairs already delivering → their off(). The browser calls deliverKeys once
 *  per document; a long-lived host calls it per MOUNT (boot.ts wireInput), and
 *  each un-guarded call stacked another pair of handlers that nothing ever
 *  removed — the other half of the native host's N² Tab advances (keys.ts
 *  `listen` has the full account). A repeat call on the same pair now returns
 *  the existing off. Weak on the keys service; tests constructing fresh
 *  services are untouched. */
const DELIVERING = new WeakMap<KeysService, WeakMap<FocusService, () => void>>();

export function deliverKeys(keys: KeysService, focus: FocusService): () => void {
  const perFocus = DELIVERING.get(keys) ?? new WeakMap<FocusService, () => void>();
  DELIVERING.set(keys, perFocus);
  const existing = perFocus.get(focus);
  if (existing !== undefined) return existing;
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
  const off = (): void => {
    perFocus.delete(focus);
    offDown();
    offUp();
  };
  perFocus.set(focus, off);
  return off;
}

/** The runtime's focus service (LZX's lz.Focus). */
export const Focus = new FocusService();

// Register the discard hook (input.md §mutation): keeps focus off a subtree
// that is being torn down. One-directional — focus.ts imports view.ts, not the
// reverse — so no import cycle.
setFocusDiscardHook((view) => Focus.noteDiscarded(view));
