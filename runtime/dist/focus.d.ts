import { View } from "./view.js";
import type { KeysService } from "./keys.js";
export declare class FocusService {
    private current;
    private rootView;
    /** Subscribers to focus CHANGES (`onFocusChange(v) <- Focus`, language §8) —
     *  called with the newly focused view (or null on blur) after the change
     *  settles. What the traveling focus indicator rides. */
    private readonly changeHandlers;
    /** Reentrancy lock: a focus change fires onFocus/onBlur handlers that may
     *  call focus() again; remember the latest target and apply it after the
     *  current change settles (LZX's discipline). */
    private changing;
    private queued;
    private queuedTarget;
    /** The tree root, for traversal when nothing is focused (set at attach). */
    setRoot(view: View | null): void;
    getFocus(): View | null;
    /** Test/lifecycle reset. */
    reset(): void;
    /** Focus a view (null = blur). A non-focusable or invisible view is ignored
     *  (never becomes the focus). Fires onBlur on the old, onFocus on the new. */
    focus(view: View | null): void;
    /** Subscribe to focus changes. Returns the unsubscribe thunk — the `<-`
     *  wiring's contract (sources.ts). */
    onFocusChange(fn: (v: View | null) => void): () => void;
    blur(): void;
    next(): void;
    prev(): void;
    /** The ordered focus stops in a view's group — its focustrap ancestor, else
     *  the root. Exposed for tooling/tests. */
    sequenceFor(view: View | null): View[];
    private move;
    /** The focused view's subtree is being discarded (or hidden) — move focus to
     *  a live stop OUTSIDE it before it goes, so focus never dangles. Called from
     *  View.discard() via the seam in view.ts. */
    noteDiscarded(view: View): void;
    /** The nearest focustrap ancestor of `view` (the group it belongs to), or the
     *  tree root when there is none. */
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
