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
    /** The focused view's nearest scrolling ancestor (the root when none) —
     *  the container an indicator TRAVELS WITH (View.travelWith) so the
     *  platform carries it through scrolls with zero lag. A scroller does not
     *  carry what its pinned chrome holds: a control in a pane's ignoreScroll
     *  header rides the next scroller out. */
    scroller: View;
    /** The view's origin in the scroller's CONTENT coordinates — where a
     *  traveled indicator positions itself (deliberately independent of the
     *  scroller's own scroll offset, so scrolling does not re-derive it: the
     *  platform moves both together). Equal to x/y when the scroller IS the
     *  root. focusShape offsets are folded in, like x/y. */
    homeX: number;
    homeY: number;
    /** The box and radius in the scroller's CONTENT space — a traveled
     *  indicator draws THESE (the platform applies any ancestor transform
     *  above the scroller to its surface, so drawing the frame-space w/h there
     *  would double-apply it). Equal to w/h/rad when the scroller is the root
     *  or nothing between is transformed. */
    homeW: number;
    homeH: number;
    homeRad: number;
    /** The view's turn in the scroller's content space, in degrees (0 when
     *  nothing between turns it). When it is not 0, homeX/homeY are the box's
     *  turned origin corner and homeW/homeH its own scaled size, so an
     *  indicator turned by homeRot about its origin lies on the view. */
    homeRot: number;
}
export declare class FocusService {
    private current;
    private rootView;
    /** Whether the LAST focus change was keyboard-driven (Tab traversal). The
     *  focus-visible modality: a ring/indicator shows only for keyboard focus —
     *  a pointer press focuses silently (the click itself is the feedback).
     *  A REACTIVE fact: `byKeyboard()` is a tracked read, so a class's
     *  styling constraint (a Tab header's focus edge) re-derives when the
     *  modality flips — same slot, event handlers and constraints alike. */
    private keyboard;
    private readonly keyboardCell;
    private setKeyboard;
    /** Subscribers to focus CHANGES (`Focus [ onFocusChange(v) { … } ]`) —
     *  called with the newly focused view (or null on blur) after the change
     *  settles. What the traveling focus indicator rides. */
    private readonly changeHandlers;
    /** Subscribers to the focused control's LIVE GEOMETRY
     *  (`Focus [ onGeometry(g) { … } ]`). A standing runtime constraint follows
     *  the target: tracked reads
     *  of the parent chain's x/y and the control's focusShape() mean an
     *  arrow-keyed slider thumb, a reflowing layout, or a resized ancestor
     *  moves the resting ring WITH its control — no re-focus needed. */
    private readonly geometryHandlers;
    private follower;
    /** Watches that the focused view stays reachable (rewatch). */
    private watch;
    /** Reentrancy lock: a focus change fires onFocus/onBlur handlers that may
     *  call focus() again; remember the latest target and apply it after the
     *  current change settles (LZX's discipline). */
    private changing;
    private queued;
    private queuedTarget;
    /** The tree root, for traversal when nothing is focused (set at attach). */
    setRoot(view: View | null): void;
    /** The focused view — a tracked read: a constraint that reads it re-runs
     *  when focus moves. */
    getFocus(): View | null;
    private readonly currentCell;
    /** The top-level program's root — the program that has the keyboard while
     *  nothing is focused (null before one is mounted). */
    getRoot(): View | null;
    /** The program the keyboard goes to (keyboard-follows-focus.md, Rule 1):
     *  focus on an island hands it to the island's tenant; focus anywhere else,
     *  to the program whose tree holds the focused view; no focus, to the
     *  top-level program. */
    keyboardProgram(): View | null;
    /** True when the current focus arrived by KEYBOARD (Tab/Shift-Tab) — the
     *  focus-visible modality gate an indicator reads: show for keyboard focus,
     *  stay hidden for pointer/programmatic focus. */
    byKeyboard(): boolean;
    /** Test/lifecycle reset. */
    reset(): void;
    /** Focus a view (null = blur). A non-focusable or invisible view is ignored
     *  (never becomes the focus). Fires onBlur on the old, onFocus on the new.
     *  This public entry is the POINTER/PROGRAMMATIC path — it clears the
     *  keyboard modality; Tab traversal (move) sets it. Called from a key's
     *  handler (arrows roving a Segmented's segments, a shortcut focusing a
     *  field), it is keyboard focus: the web's :focus-visible rule for script
     *  focus during keyboard use. */
    focus(view: View | null): void;
    /** Was the person's last input a key (true) or a press (false)? Set as each
     *  arrives (deliverKeys, pressAt). */
    lastInputKeyboard: boolean;
    /** The key service delivering to this one (deliverKeys) — asked whether a
     *  focus call comes from a key's handler. */
    keys: KeysService | null;
    private apply;
    /** Subscribe to focus changes. Returns the unsubscribe thunk — the `<-`
     *  wiring's contract (sources.ts). */
    onFocusChange(fn: (v: View | null) => void): () => void;
    onGeometry(fn: (g: FocusGeometry) => void): () => void;
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
    private retargetFollower;
    blur(): void;
    /** Focus does not stay on what the person can no longer reach. A standing
     *  constraint over the focused view's reachability — it or an ancestor
     *  hidden, it made unfocusable or disabled, or an ancestor's `tabOrder()` no
     *  longer naming it (a pane that closed) — clears focus once the change has
     *  settled, and the next Tab starts from where it was, as the web does when
     *  a focused element stops being rendered. (A view torn down is
     *  noteDiscarded's, before it goes.) */
    private rewatch;
    /** Where the next Tab starts when nothing has focus: the spot a press on
     *  content that takes no focus left (the web's sequential focus navigation
     *  starting point). Cleared as soon as anything is focused. */
    private startPoint;
    /** A press landed on `leaf` (the view under it, across islands). The web's
     *  rule: when nothing on its chain can take focus, focus is cleared — the
     *  keyboard goes back to the program the press was in — and the next Tab
     *  starts from the pressed spot. A press on something focusable, or inside
     *  it, leaves focus to that view (a control focuses itself on press). */
    pressAt(leaf: View | null): void;
    next(): void;
    prev(): void;
    /** The ordered focus stops of the cycle a view's Tab moves in (planes.md
     *  §13.7) — the views Tab lands on, a scope's entry standing for the scope.
     *  Exposed for tooling/tests. */
    sequenceFor(view: View | null): View[];
    private move;
    /** Keyboard-focus `v` and show it: the focus-visible modality, and the web's
     *  focus-reveal contract (a keyboard-focused control is scrolled into view,
     *  minimum distance, through app scrollers and the document alike). */
    land(v: View): void;
    /** Enter the focused region (Enter on a window focused as one stop): focus
     *  what last had focus inside it, else its first stop. True when it entered. */
    enter(): boolean;
    /** Focus into `view`: what last had focus inside it, else its first stop —
     *  how an overlay that takes focus takes it on opening. False when it holds
     *  nothing to focus. */
    focusIn(view: View): boolean;
    /** Close the member scope focus has entered inside a `stop` (Esc in a cell's
     *  editor, in a list row's controls): focus goes back to the stop. True when
     *  it did. Esc never leaves a region (planes.md §13.3). */
    leaveMember(): boolean;
    /** The region keys (F6 / Shift-F6): move among the regions and stops of the
     *  context around the region focus is in, entering a region it moves to. */
    /** Is focus in `v` — on it, or inside it, a program hosted in an island
     *  inside it included? A window asks it to know whether it has the keyboard
     *  when what holds focus is a control of the program it hosts. */
    /** Is focus inside the overlay that holds the keys? Then the keys the
     *  overlay owns are still the focused view's. */
    focusInClaimant(keys: KeysService): boolean;
    holds(v: View): boolean;
    /** Is focus inside a region (a window, a pane)? */
    inRegion(): boolean;
    nextRegion(dir: 1 | -1): void;
    /** The focused view's subtree is being discarded: focus is cleared before it
     *  goes, and the next Tab starts from where it was — the web's rule for a
     *  focused element taken out of the page, and the one `rewatch` keeps for a
     *  view hidden or disabled. It does not jump to some other stop: a search
     *  field closed with Esc once sent focus, and its ring, to the first tile
     *  of a sidebar across the window (2026-10-25). The spot is the dying
     *  view's parent, which stays; a program torn down whole (an embedded app
     *  re-rendered) leaves no spot, and focus is simply dropped. Called from
     *  View.discard() via the seam in view.ts. */
    noteDiscarded(view: View): void;
}
/** A scroller with nothing inside it that takes focus — a pane of text, a strip
 *  of pictures — is a Tab stop of its own, as Firefox and Chrome make it, so a
 *  keyboard can scroll it (WCAG 2.1.1): focused, the arrows, Page Up/Down, Space,
 *  Home and End scroll it. A scroller that holds anything focusable is not: Tab
 *  reaches into it, and what it focuses is revealed. */
export declare function bareScroller(v: View): boolean;
export declare function deliverKeys(keys: KeysService, focus: FocusService): () => void;
/** The runtime's focus service (LZX's lz.Focus). */
export declare const Focus: FocusService;
