import { View } from "./view.js";
import type { KeysService } from "./keys.js";
/** The focused control's live silhouette, root-space — what the follower
 *  (below) computes and onGeometry subscribers receive. `root` lets a ring
 *  stand down when another app on the page owns the target. */
export interface FocusGeometry {
    x: number;
    y: number;
    w: number;
    h: number;
    rad: number;
    view: View;
    root: View;
}
export declare class FocusService {
    private current;
    private rootView;
    /** Whether the LAST focus change was keyboard-driven (Tab traversal). The
     *  focus-visible modality: a ring/indicator shows only for keyboard focus —
     *  a pointer press focuses silently (the click itself is the feedback). */
    private keyboard;
    /** Subscribers to focus CHANGES (`onFocusChange(v) <- Focus`, language §8) —
     *  called with the newly focused view (or null on blur) after the change
     *  settles. What the traveling focus indicator rides. */
    private readonly changeHandlers;
    /** Subscribers to the focused control's LIVE GEOMETRY (`onGeometry(g) <-
     *  Focus`). A standing runtime constraint follows the target: tracked reads
     *  of the parent chain's x/y and the control's focusShape() mean an
     *  arrow-keyed slider thumb, a reflowing layout, or a resized ancestor
     *  moves the resting ring WITH its control — no re-focus needed. */
    private readonly geometryHandlers;
    private follower;
    /** Reentrancy lock: a focus change fires onFocus/onBlur handlers that may
     *  call focus() again; remember the latest target and apply it after the
     *  current change settles (LZX's discipline). */
    private changing;
    private queued;
    private queuedTarget;
    /** The tree root, for traversal when nothing is focused (set at attach). */
    setRoot(view: View | null): void;
    getFocus(): View | null;
    /** True when the current focus arrived by KEYBOARD (Tab/Shift-Tab) — the
     *  focus-visible modality gate an indicator reads: show for keyboard focus,
     *  stay hidden for pointer/programmatic focus. */
    byKeyboard(): boolean;
    /** Test/lifecycle reset. */
    reset(): void;
    /** Focus a view (null = blur). A non-focusable or invisible view is ignored
     *  (never becomes the focus). Fires onBlur on the old, onFocus on the new.
     *  This public entry is the POINTER/PROGRAMMATIC path — it clears the
     *  keyboard modality; Tab traversal (move) sets it. */
    focus(view: View | null): void;
    private apply;
    /** Subscribe to focus changes. Returns the unsubscribe thunk — the `<-`
     *  wiring's contract (sources.ts). */
    onFocusChange(fn: (v: View | null) => void): () => void;
    onGeometry(fn: (g: FocusGeometry) => void): () => void;
    /** (Re)install the follower for the current focus. The constraint's body
     *  reads TRACKED slots (ancestor x/y, the focusShape's inputs), so any
     *  change re-fires it; its push notifies the geometry subscribers. */
    private retargetFollower;
    blur(): void;
    next(): void;
    prev(): void;
    /** The ordered focus stops in a view's group — its focustrap ancestor, else
     *  the root. Exposed for tooling/tests. */
    sequenceFor(view: View | null): View[];
    private move;
    /** The focused view's subtree is being discarded (or hidden) — move focus to
     *  a live stop OUTSIDE it before it goes, so focus never dangles. Survivors
     *  come from the dying view's OWN tree: when an embedded app is torn down
     *  (a live-edit re-render), focus is dropped, never re-anchored into the
     *  host app's controls. Called from View.discard() via the seam in view.ts. */
    noteDiscarded(view: View): void;
    /** The nearest focustrap ancestor of `view` (the group it belongs to), or the
     *  view's OWN tree root when there is none. The tree anchor matters when more
     *  than one app shares the page (an embedded preview inside a host app): the
     *  focused view's group is ITS app's tree, so Tab cycles within the app the
     *  user is interacting with and never leaks into the host's controls. */
    private groupRoot;
}
/** Wire a Keys service to a Focus service: `Tab` / `Shift-Tab` are consumed by
 *  focus traversal; every other key is delivered to the focused view as
 *  `onKeyDown` / `onKeyUp` (target-only, no bubbling — D-2). Returns an
 *  unsubscribe thunk. The runtime entry calls this; a test drives it with a
 *  fresh KeysService. (v1: Tab is always the traversal key; a field that wants
 *  a literal Tab is a later refinement.) */
export declare function deliverKeys(keys: KeysService, focus: FocusService): () => void;
/** The runtime's focus service (LZX's lz.Focus). */
export declare const Focus: FocusService;
