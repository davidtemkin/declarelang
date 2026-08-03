import { Node } from "./node.js";
import { type Ticker } from "./animate.js";
export declare class Heartbeat extends Node implements Ticker {
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
    /** Called once per frame by the shared clock. Returns whether to keep
     *  ticking (the clock's protocol). */
    tick(now: number): boolean;
    /** Construction-complete (instantiate.ts fires this on animators; Heartbeat
     *  joins the same lifecycle) — start if `running` was left true. */
    autoStart(): void;
}
