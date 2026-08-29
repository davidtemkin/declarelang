import { Node } from "./node.js";
export type Tick = "frame" | "second" | "minute" | "hour" | "day";
export declare const TICKS: readonly Tick[];
/** The wall clock and the alarm Time reads — one seam, swappable for tests
 *  (setTimeHost), so the calendar tiers can be driven by hand. `now` is
 *  epoch milliseconds (Date.now), never the frame scheduler's timeline. */
export interface TimeHost {
    now(): number;
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
}
export declare function setTimeHost(h: TimeHost | null): void;
declare const FACTS: readonly ["now", "year", "month", "day", "hour", "minute", "second", "weekday"];
type Fact = (typeof FACTS)[number];
/** One fact of the instant `t`, local zone, Temporal's conventions. */
export declare function factOf(f: Fact, t: number): number;
/** The tier's boundary at or before `t` (local zone). */
export declare function floorTick(t: number, tick: Tick): number;
/** The first boundary strictly after `t`. Hour and day step through Date so a
 *  zone's DST shift lands on the real local boundary, not 3600s later. */
export declare function nextTick(t: number, tick: Tick): number;
export declare class Time extends Node {
    #private;
    /** The resolution: which boundary wakes the facts and the handler. */
    tick: Tick;
    /** Live gate — `running = { app.simulating }` is the idiom; default true. */
    running: boolean;
    /** The facts. Read-only to programs (schema.ts); the ticks write them. */
    now: number;
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    weekday: number;
    constructor();
    /** Construction-complete (instantiate.ts initTree fires this, as for every
     *  source and animator): the facts stand from the first settle, the page's
     *  visibility is watched, and the tick arms if anything wants it. */
    autoStart(): void;
}
export {};
