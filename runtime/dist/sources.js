// sources — the runtime's event SOURCES, as components. A source is a
// non-visual member you put in a tree whose handlers are called by something
// OUTSIDE the tree: the keyboard, the focus service, the tip service.
//
//     keys: Keys [ onKeyUp(e) { if (e.key == "Escape") classroot.close() } ],
//
// WHY COMPONENTS, not a `<-` operator. The language rules that an event is just
// a function-typed member that gets called when the thing happens — the `on`
// prefix is a naming convention, not syntax. A second, syntactically distinct
// way to receive an event contradicted that ruling: one category, two
// spellings. Non-visual members are a category the language already has
// (Dataset, Animator, Spring, State, Heartbeat), so a source needs no operator, no
// grammar production, and no subscribable-source table. The classes below are
// ordinary registry components, so the ones an app never mentions are dropped
// from its bundle like any other component. (Measured caveat, so nobody repeats
// an over-claim: that shakes out these thin WRAPPERS only. The SERVICES they
// wrap ship regardless — boot.ts wires Keys, index.ts injects Keys/Focus into
// body scope for `Keys.isDown(…)`, view.ts uses Tip, text-input.ts uses Focus.
// Gating those on program facts, the way slim-draw gates the paint vocabulary,
// is a separate and unclaimed win.)
//
// LIFETIME is the node's, exactly as the operator's was: handlers subscribe at
// init and unsubscribe when the node is discarded, so there is nothing for an
// author to clean up. FAN-OUT is by instance: a menu, a dialog, and a menubar
// each holding their own `Keys` member all hear the keyboard at once — which an
// App-level event could never express, and which is why these are members
// rather than one global handler.
import { Node, onDiscard } from "./node.js";
import { Keys } from "./keys.js";
import { Focus } from "./focus.js";
import { Tip } from "./tip.js";
/** The shared half of every source component: at init, wire each channel whose
 *  handler this instance actually declares; at discard, drop them all. Nothing
 *  subscribes for a handler nobody wrote — pay-per-use, like every other member
 *  in the language. */
class Source extends Node {
    wired = false;
    /** Construction-complete (instantiate.ts's initTree — the same lifecycle hook
     *  an animator's autoStart uses): the compiled handler members are installed
     *  by now, which is the first moment we can tell which channels to wire. */
    autoStart() {
        if (this.wired)
            return;
        this.wired = true;
        const self = this;
        const offs = [];
        for (const [member, subscribe] of this.channels()) {
            const fn = self[member];
            if (typeof fn !== "function")
                continue;
            const handler = (arg) => { fn.call(this, arg); };
            offs.push(subscribe(handler));
        }
        if (offs.length > 0)
            onDiscard(this, () => { for (const off of offs)
                off(); });
    }
}
/** The keyboard, as a member: `Keys [ onKeyDown(e) { … }, onKeyUp(e) { … } ]`.
 *  The RAW stream — it fires even while a text field has focus, so gate
 *  app-level shortcuts on app state where that matters. (A focused view's own
 *  `onKeyDown`/`onKeyUp` are the other half: keys belonging to one widget.) */
export class KeysSource extends Source {
    channels() {
        return CHANNELS_KEYS;
    }
}
const CHANNELS_KEYS = [
    ["onKeyDown", (fn) => Keys.onKeyDown(fn)],
    ["onKeyUp", (fn) => Keys.onKeyUp(fn)],
    ["onNavClaim", (fn) => Keys.onNavClaim(fn)],
];
/** The focus service, as a member: `onFocusChange(v)` when focus moves, and
 *  `onGeometry(g)` for the focused control's live silhouette — what a focus
 *  ring follows. */
export class FocusSource extends Source {
    channels() {
        return CHANNELS_FOCUS;
    }
}
const CHANNELS_FOCUS = [
    ["onFocusChange", (fn) => Focus.onFocusChange(fn)],
    ["onGeometry", (fn) => Focus.onGeometry(fn)],
];
/** The tip service, as a member: `onTip(e)` when a tip-carrying view asks for
 *  its tooltip to show (`null` to hide). */
export class TipSource extends Source {
    channels() {
        return CHANNELS_TIP;
    }
}
const CHANNELS_TIP = [
    ["onTip", (fn) => Tip.onTip(fn)],
];
//# sourceMappingURL=sources.js.map