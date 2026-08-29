// Time — the clock as a component (docs/system-design/open-items.md L-25,
// RULED 2026-08-29). A non-visual member that brings the current time into
// the tree as reactive FACTS and, through a handler, as a TICK:
//
//     clock: Time [ tick = minute ],
//     label: Text [ text = { pad(app.clock.hour) + ":" + pad(app.clock.minute) } ],
//
//     physics: Time [ tick = frame, onTick(dt) { classroot.step(dt) } ],
//
// WHY IT EXISTS. A `{ }` that reads `new Date()` is a stopped clock: nothing
// it read has a cell behind it, so it evaluates once and never again. The
// world outside the program comes in as a member — Keys, DataSource, a
// Stream — and so does the clock. Two doors, keyed to the SHAPE of the
// dependence: a value that is a pure function of the current time derives
// from a fact (`now`, `minute`, …); one whose next value depends on its
// previous — an integrator — takes the handler with the elapsed step.
// Motion toward a destination is neither: that is a Spring or an Animator.
//
// `tick` names the resolution. `frame` rides the ONE shared clock
// (animate.ts) — no second rAF loop, and a member costs nothing until it
// runs. The calendar tiers are ALIGNED alarms: `minute` fires when the minute
// turns, not sixty seconds after boot, so a clock built on it is right at the
// flip, drift-free and sleep-safe (each firing re-aims at the next boundary
// from the real clock; a page asleep for an hour gets ONE tick on return).
//
// Facts are NUMBERS, never strings — formatting and localization are the
// app's, as a subclass attribute and Intl. `now` is the instant, epoch ms;
// `year month day hour minute second weekday` are the local-zone components:
// Temporal's Instant/PlainDateTime split, with Temporal's conventions
// (month 1–12; weekday 1–7, Monday = 1). Two read paths, one contract: a
// TRACKED read (a `{ }`) sees the facts as of the last tick — the resolution
// the declaration chose, the cell bumping whenever a value changes — and an
// untracked read (a handler, a method) samples the real clock at that
// moment, so a handler is never handed a stale second.
//
// Idle-zero: nothing ticks until a fact is tracked or an onTick exists; a
// hidden PAGE (app.pageVisible) pauses it — frames and alarms both — and on
// return the facts refresh and `dt` clamps. A merely hidden VIEW does not:
// visibility gates layout and input, never derivation, and an author who
// wants that pause writes it — `running = { this.visible }`.
//
// A Node component on the GENERIC construction path (registry.ts TAGS, like
// Node itself), not the source path: that is what lets it carry declarations
// and be subclassed — `class DesktopClock extends Time [ tick = minute,
// text: string = { … this.now … } ]` is the intended way to make it yours.
//
// Heartbeat (2026-08-06 → 2026-08-29) folded in here: it was exactly
// `Time [ tick = frame ]` through the handler door — `running`, the dt clamp
// and the three-throws stop are its, verbatim.
import { Node, onDiscard, authoredName } from "./node.js";
import { sharedClock } from "./animate.js";
import { defineAttributes, setBound } from "./attributes.js";
import { observe } from "./reactive.js";
export const TICKS = ["frame", "second", "minute", "hour", "day"];
const REAL_HOST = {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h),
};
let host = REAL_HOST;
export function setTimeHost(h) { host = h ?? REAL_HOST; }
/** The largest step handed to a per-frame onTick, in seconds — ~4 frames at
 *  60Hz, the standard clamp. A tab hidden for a minute must not resume with
 *  dt = 60 and launch an integrator into the weeds. */
const MAX_FRAME_DT = 1 / 15;
/** A calendar tick's clamp: one period. Sleep, a throttled background tab —
 *  the elapsed time is reported as one tick's worth, never the whole gap. */
const PERIOD_S = { frame: MAX_FRAME_DT, second: 1, minute: 60, hour: 3600, day: 86_400 };
const FACTS = ["now", "year", "month", "day", "hour", "minute", "second", "weekday"];
/** One fact of the instant `t`, local zone, Temporal's conventions. */
export function factOf(f, t) {
    if (f === "now")
        return t;
    const d = new Date(t);
    switch (f) {
        case "year": return d.getFullYear();
        case "month": return d.getMonth() + 1;
        case "day": return d.getDate();
        case "hour": return d.getHours();
        case "minute": return d.getMinutes();
        case "second": return d.getSeconds();
        default: {
            const w = d.getDay();
            return w === 0 ? 7 : w;
        }
    }
}
/** The tier's boundary at or before `t` (local zone). */
export function floorTick(t, tick) {
    if (tick === "frame")
        return t;
    if (tick === "second")
        return Math.floor(t / 1000) * 1000;
    const d = new Date(t);
    if (tick === "minute")
        d.setSeconds(0, 0);
    else if (tick === "hour")
        d.setMinutes(0, 0, 0);
    else
        d.setHours(0, 0, 0, 0);
    return d.getTime();
}
/** The first boundary strictly after `t`. Hour and day step through Date so a
 *  zone's DST shift lands on the real local boundary, not 3600s later. */
export function nextTick(t, tick) {
    const at = floorTick(t, tick);
    if (tick === "frame")
        return at;
    if (tick === "second")
        return at + 1000;
    if (tick === "minute")
        return at + 60_000;
    const d = new Date(at);
    if (tick === "hour")
        d.setHours(d.getHours() + 1);
    else
        d.setDate(d.getDate() + 1);
    return d.getTime();
}
function rootOf(n) {
    let r = n;
    while (r.parent !== null)
        r = r.parent;
    return r;
}
// The attribute pushers and the facts' demand hook reach the private members
// through these — bound inside the class body (a static block), so nothing
// author-visible carries the runtime's own verbs, and a subclass method named
// `sync` or `refresh` collides with nothing.
let SYNC;
let RETICK;
let DEMAND;
export class Time extends Node {
    /** The shared clock's protocol lives on a delegate: `tick` is the attribute. */
    #ticker = {
        perpetual: true, // life, not transition: never holds settleMotion open
        tick: (now) => this.#frame(now),
        rebase: (delta) => { if (this.#lastFrame !== null)
            this.#lastFrame += delta; },
    };
    #onClock = false;
    #alarm = null;
    #lastFrame = null;
    #lastTick = 0;
    #started = false;
    #demanded = false;
    #pageVisible = true;
    #unwatch = null;
    #throws = 0;
    static {
        SYNC = (t) => t.#sync();
        RETICK = (t) => { t.#disarm(); t.#sync(); };
        DEMAND = (t) => { t.#demanded = true; t.#sync(); };
    }
    constructor() {
        super();
        // Lifetime is the node's: a discarded Time leaves the clock and drops its
        // alarm, so a torn-down subtree cannot keep a loop alive — the leak a
        // hand-written rAF or setInterval always risks.
        onDiscard(this, () => { this.#disarm(); this.#unwatch?.(); this.#unwatch = null; });
    }
    /** Construction-complete (instantiate.ts initTree fires this, as for every
     *  source and animator): the facts stand from the first settle, the page's
     *  visibility is watched, and the tick arms if anything wants it. */
    autoStart() {
        if (this.#started)
            return;
        this.#started = true;
        this.#refresh(host.now());
        const app = rootOf(this);
        if (app !== this && typeof app.pageVisible === "boolean") {
            this.#pageVisible = app.pageVisible;
            this.#unwatch = observe(() => app.pageVisible, (v) => {
                this.#pageVisible = v;
                if (v)
                    this.#refresh(host.now()); // back on screen: the facts catch up at once
                this.#sync();
            }, "Time.pageVisible");
        }
        this.#sync();
    }
    #wants() {
        return this.#started && this.running && this.#pageVisible
            && (this.#demanded || typeof this.onTick === "function");
    }
    #sync() {
        if (this.#wants())
            this.#arm();
        else
            this.#disarm();
    }
    #arm() {
        if (this.tick === "frame") {
            this.#clearAlarm();
            if (!this.#onClock) {
                this.#onClock = true;
                this.#lastFrame = null; // the first frame after a start is the baseline
                sharedClock.add(this.#ticker);
            }
        }
        else {
            this.#leaveClock();
            if (this.#alarm === null) {
                this.#lastTick = floorTick(host.now(), this.tick);
                this.#schedule();
            }
        }
    }
    #disarm() { this.#leaveClock(); this.#clearAlarm(); }
    #leaveClock() {
        if (!this.#onClock)
            return;
        this.#onClock = false;
        this.#lastFrame = null;
        sharedClock.remove(this.#ticker);
    }
    #clearAlarm() {
        if (this.#alarm === null)
            return;
        host.clearTimeout(this.#alarm);
        this.#alarm = null;
    }
    /** Aim at the next boundary from the real clock — never an interval. */
    #schedule() {
        const now = host.now();
        this.#alarm = host.setTimeout(() => { this.#alarm = null; this.#fire(); }, Math.max(0, nextTick(now, this.tick) - now));
    }
    #fire() {
        const now = host.now();
        // An early wake (a timer may fire a hair short) re-aims. A late one —
        // sleep, a throttled background tab — is ONE tick, its dt clamped to a period.
        if (now < nextTick(this.#lastTick, this.tick)) {
            this.#schedule();
            return;
        }
        this.#refresh(now);
        const dt = Math.min((now - this.#lastTick) / 1000, PERIOD_S[this.tick]);
        this.#lastTick = floorTick(now, this.tick);
        this.#deliver(dt);
        if (this.#alarm === null && this.#wants())
            this.#schedule();
    }
    /** The shared clock's call, once per frame (Ticker.tick, via the delegate).
     *  Returns whether to keep ticking — the clock's protocol. */
    #frame(clockNow) {
        if (!this.#onClock)
            return false;
        const prev = this.#lastFrame;
        this.#lastFrame = clockNow;
        this.#refresh(host.now());
        if (prev !== null) {
            // BOTH ends: the top so a backgrounded tab cannot resume with one
            // enormous step, the bottom so a clock handover (a manual clock near
            // zero after performance.now baselines) cannot deliver a NEGATIVE dt —
            // measured at −0.72s once; it ran an integrated fling backwards.
            this.#deliver(Math.min(Math.max((clockNow - prev) / 1000, 0), MAX_FRAME_DT));
        }
        return this.#onClock;
    }
    /** Land the instant's facts — equality-gated per slot by the write path, so
     *  at `frame` only `now` moves every frame and `minute` wakes its readers
     *  once a minute. */
    #refresh(t) {
        const d = new Date(t);
        setBound(this, "now", t);
        setBound(this, "year", d.getFullYear());
        setBound(this, "month", d.getMonth() + 1);
        setBound(this, "day", d.getDate());
        setBound(this, "hour", d.getHours());
        setBound(this, "minute", d.getMinutes());
        setBound(this, "second", d.getSeconds());
        const w = d.getDay();
        setBound(this, "weekday", w === 0 ? 7 : w);
    }
    #deliver(dt) {
        const fn = this.onTick;
        if (typeof fn !== "function")
            return;
        // A per-tick exception must not wedge the tab: one that kept throwing ran
        // for nine minutes at 60Hz with a minified stack naming nothing (field
        // report 2026-08-21). Each throw is logged with the node named; three
        // CONSECUTIVE throws stop the Time — the author restarts it with
        // `running = true` after fixing the handler.
        try {
            fn.call(this, dt);
            this.#throws = 0;
        }
        catch (e) {
            this.#throws++;
            const name = authoredName(this);
            const who = `Time${name !== null ? ` '${name}'` : ""}`;
            console.error(`[Declare] onTick on ${who} threw: ${e?.message ?? e}`, e);
            if (this.#throws >= 3) {
                console.error(`[Declare] ${who} stopped — onTick threw ${this.#throws} ticks in a row; set running = true to restart it`);
                this.#throws = 0;
                setBound(this, "running", false); // through the write path: a constraint-owned slot yields
            }
        }
    }
}
// The two read paths (header), as the slots' own declaration: a TRACKED read
// keeps the slot's contract — the value as of the last tick, the cell tracked
// and, once, demand registered (`onTrack`) — while an untracked read samples
// the real clock at that moment (`live`).
const fact = (f) => ({ def: 0, onTrack: (t) => DEMAND(t), live: () => factOf(f, host.now()) });
defineAttributes(Time, {
    tick: { def: "second", push: (t) => RETICK(t) },
    running: { def: true, push: (t) => SYNC(t) },
    now: fact("now"),
    year: fact("year"),
    month: fact("month"),
    day: fact("day"),
    hour: fact("hour"),
    minute: fact("minute"),
    second: fact("second"),
    weekday: fact("weekday"),
});
//# sourceMappingURL=time.js.map