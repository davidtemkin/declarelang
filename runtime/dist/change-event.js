// THE CHANGE EVENT — `trackChanges` names the values a node reports, `onChange`
// hears them. The settle (reactive.ts) calls in at its close; a node arms when it
// goes live and disarms when it retires (view.ts, node.ts). Its own file so a
// production build carries it only for a program that names `trackChanges`
// (the `change-event` capability, compiler/src/capabilities.ts): without that list `onChange` never fires.
//
// A node that names values in `trackChanges` gets one CONSTRAINT per name, read
// like any other dependency, so the node wakes only when one of those values
// actually moves — nothing is polled and a node that tracks nothing costs
// nothing. The wake records what moved; delivery waits for the CLOSE of the
// round, when every constraint has re-run and every afterSettle step is spent,
// so the handler sees a tree that is wholly up to date and never a half-applied
// one. One call per ROUND of the settle carries every value that moved — from
// what the handler was last told to where it ended — so a handler whose two
// subjects change together acts once. Boot is silent: the first run of each
// constraint only seeds. A handler's assignments queue more work and the same
// loop runs it as the next round of the same settle, and every change that
// round makes is delivered too. A settle whose handlers never come to rest
// meets the loop's limit (reactive.ts, AFTER_LIMIT), and its error names the
// handlers that ran, by how often (`chainRunners`).
import { Constraint, addressFor } from "./reactive.js";
import { DeclareError } from "./errors.js";
import { declareName } from "./declare-name.js";
/** A node as a person finds it: its path, else its class's name. */
function whereOf(node) { return addressFor(node) ?? declareName(node); }
let dispatchChange = null;
/** view.ts installs the dispatcher (this module cannot import it). */
export function setChangeDispatcher(fn) { dispatchChange = fn; }
const tracked = new Map();
const moved = new Set();
/** How many times each handler ran in this settle, for the limit's message. */
const runsInChain = new Map();
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
            throw new DeclareError(`trackChanges: '${name}' is not a value of ${declareName(node)} — name an attribute this node declares or a fact it carries`);
        }
        const t = { name, last: undefined, current: undefined, seeded: false };
        t.c = new Constraint(`${declareName(node)}.trackChanges(${name})`, () => node[name], (v) => {
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
            changed.push({ name: t.name, previousValue: t.last, currentValue: t.current });
            t.last = t.current;
        }
        if (changed.length === 0)
            continue;
        runsInChain.set(node, (runsInChain.get(node) ?? 0) + 1);
        dispatchChange(node, changed);
        fired = true;
    }
    return fired;
}
/** The handlers that ran in the settle just ended, most first: "app.w's
 *  onChange (100 times)". Read by the limit's message, which the kernel reports
 *  after the settle has ended (kernel.c kernel_settle: CALL_END, then CALL_ERROR). */
let lastRuns = new Map();
export function chainRunners() {
    return [...lastRuns].sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([n, k]) => `${whereOf(n)}'s onChange (${k} time${k === 1 ? "" : "s"})`).join(", ");
}
/** The settle is over (reactive.ts, in its cleanup): the counts start again. */
export function endChangeChain() {
    if (runsInChain.size === 0) {
        if (lastRuns.size > 0)
            lastRuns = new Map();
        return;
    }
    lastRuns = new Map(runsInChain);
    runsInChain.clear();
}
//# sourceMappingURL=change-event.js.map