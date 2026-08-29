import { Node } from "./node.js";
import { type Ticker } from "./animate.js";
export declare class Heartbeat extends Node implements Ticker {
    /** Life by KIND (Ticker.perpetual): a Heartbeat integrates while `running`
     *  and never "arrives" — it must not hold settleMotion open. */
    readonly perpetual = true;
    /** Running? `false` pauses the heartbeat without discarding the member —
     *  a live slot, so `running = { app.simulating }` is the idiom. */
    running: boolean;
    /** The previous frame's timestamp, or null before the first tick. */
    private last;
    private registered;
    constructor();
    /** Sync clock membership with `running` — called at init and on every
     *  write to the slot (the attribute's pusher). */
    private sync;
    private join;
    private leave;
    /** Shift the anchor across a scheduler handover (Ticker.rebase) — the
     *  resume-yields-no-step rule at `join()` is about ENROLLMENT; a live
     *  heartbeat crossing a clock handover has no reason to skip a beat. */
    rebase(delta: number): void;
    /** Called once per frame by the shared clock. Returns whether to keep
     *  ticking (the clock's protocol). */
    tick(now: number): boolean;
    /** Consecutive onFrame throws — the stop-the-wedge counter. */
    private throws;
    /** Construction-complete (instantiate.ts fires this on animators; Heartbeat
     *  joins the same lifecycle) — start if `running` was left true. */
    autoStart(): void;
}
