import { Node } from "./node.js";
/** One subscribable channel: the handler member's name, and the service call
 *  that registers a listener and hands back its unsubscribe thunk. The payload
 *  is `unknown` at this seam by necessity — the handler on the other side is a
 *  compiled Declare body, typed by the checker, not by TypeScript here. */
type Handler = (arg: unknown) => void;
type Channel = readonly [member: string, subscribe: (fn: Handler) => () => void];
/** The shared half of every source component: at init, wire each channel whose
 *  handler this instance actually declares; at discard, drop them all. Nothing
 *  subscribes for a handler nobody wrote — pay-per-use, like every other member
 *  in the language. */
declare abstract class Source extends Node {
    /** The channels this source offers. */
    protected abstract channels(): readonly Channel[];
    private wired;
    /** Construction-complete (instantiate.ts's initTree — the same lifecycle hook
     *  an animator's autoStart uses): the compiled handler members are installed
     *  by now, which is the first moment we can tell which channels to wire. */
    autoStart(): void;
}
/** The keyboard, as a member: `Keys [ onKeyDown(e) { … }, onKeyUp(e) { … } ]`.
 *  The RAW stream — it fires even while a text field has focus, so gate
 *  app-level shortcuts on app state where that matters. (A focused view's own
 *  `onKeyDown`/`onKeyUp` are the other half: keys belonging to one widget.) */
export declare class KeysSource extends Source {
    protected channels(): readonly Channel[];
}
/** The focus service, as a member: `onFocusChange(v)` when focus moves, and
 *  `onGeometry(g)` for the focused control's live silhouette — what a focus
 *  ring follows. */
export declare class FocusSource extends Source {
    protected channels(): readonly Channel[];
}
/** The tip service, as a member: `onTip(e)` when a tip-carrying view asks for
 *  its tooltip to show (`null` to hide). */
export declare class TipSource extends Source {
    protected channels(): readonly Channel[];
}
export {};
