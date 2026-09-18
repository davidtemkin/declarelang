// THE CHANGE EVENT — `trackChanges` names the values a node reports, `onChange`
// hears them. The settle (reactive.ts) calls in at its close; a node arms when it
// goes live and disarms when it retires (view.ts, node.ts). Its own file so a
// production build carries it only for a program that names `trackChanges`
// (declarec's slim-change-event): without that list `onChange` never fires.
//
// A node that names values in `trackChanges` gets one CONSTRAINT per name, read
// like any other dependency, so the node wakes only when one of those values
// actually moves — nothing is polled and a node that tracks nothing costs
// nothing. The wake records what moved; delivery waits for the CLOSE of the
// settle, when every constraint has re-run and every afterSettle step is spent,
// so the handler sees a tree that is wholly up to date and never a half-applied
// one. One call per settle carries every value that moved, so a handler whose
// two subjects change together acts once. Boot is silent: the first run of each
// constraint only seeds. A handler's own writes queue more work and the same
// loop runs it as the next pass, which is the "next settle" the guide
// describes; a ring — A's handler moves B, B's moves A — ends on its own,
// because a value is delivered at most ONCE per settle chain.
import { Constraint } from "./reactive.js";
import { DeclareError } from "./errors.js";
let dispatchChange = null;
/** view.ts installs the dispatcher (this module cannot import it). */
export function setChangeDispatcher(fn) { dispatchChange = fn; }
const tracked = new Map();
const moved = new Set();
const firedInChain = new WeakMap();
let chainNodes = [];
/** Arm (or re-arm) `node` on exactly `names`. Called when the node goes live
 *  (view.ts, on `init`) and again whenever its `trackChanges` list is rebound,
 *  so a name added later starts silent rather than firing on arrival. A name
 *  the node does not have is refused HERE as well as by the checker: a computed
 *  list is not visible at compile time, and the alternative is a value that
 *  quietly never reports. */
export function trackNode(node, names) {
    untrackNode(node);
    if (names === null || names.length === 0)
        return;
    const list = [];
    for (const name of names) {
        if (!(name in node)) {
            throw new DeclareError(`trackChanges: '${name}' is not a value of ${node.constructor.name} — name an attribute this node declares or a fact it carries`);
        }
        const t = { name, last: undefined, current: undefined, seeded: false };
        t.c = new Constraint(`${node.constructor.name}.trackChanges(${name})`, () => node[name], (v) => {
            if (!t.seeded) {
                t.seeded = true;
                t.last = v;
                t.current = v;
                return;
            }
            t.current = v;
            if (!Object.is(t.last, t.current))
                moved.add(node);
        });
        t.c.run();
        list.push(t);
    }
    tracked.set(node, list);
}
/** A retiring node leaves (node.ts runRetire), and its constraints with it. */
export function untrackNode(node) {
    const list = tracked.get(node);
    if (list === undefined)
        return;
    for (const t of list)
        t.c.dispose();
    tracked.delete(node);
    moved.delete(node);
}
/** The settle's close: deliver one event per node that moved, in the order the
 *  names were written. Returns whether anything fired, so the loop knows to run
 *  another pass for whatever the handlers wrote. */
export function fireChanges() {
    if (moved.size === 0 || dispatchChange === null)
        return false;
    const batch = [...moved];
    moved.clear();
    let fired = false;
    for (const node of batch) {
        const list = tracked.get(node);
        if (list === undefined)
            continue;
        const changed = [];
        for (const t of list) {
            if (Object.is(t.last, t.current))
                continue; // moved and moved back inside one settle
            let f = firedInChain.get(node);
            if (f === undefined) {
                firedInChain.set(node, (f = new Set()));
                chainNodes.push(node);
            }
            if (f.has(t.name)) {
                console.warn(`[Declare] onChange: '${t.name}' changed again in the same settle chain — a ring of change handlers; the second change is not delivered`);
                t.last = t.current;
                continue;
            }
            f.add(t.name);
            changed.push({ name: t.name, previousValue: t.last, currentValue: t.current });
            t.last = t.current;
        }
        if (changed.length === 0)
            continue;
        dispatchChange(node, changed);
        fired = true;
    }
    return fired;
}
/** The settle chain is over (reactive.ts, in its cleanup): a value may be
 *  delivered again in the next chain. */
export function endChangeChain() {
    for (const n of chainNodes)
        firedInChain.delete(n);
    chainNodes = [];
}
//# sourceMappingURL=change-event.js.map