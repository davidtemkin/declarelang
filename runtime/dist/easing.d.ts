import type { Motion } from "./animate.js";
/** Map normalized progress `t` ∈ [0,1] through `motion` to an eased fraction.
 *  `delta` is the animator's travel (`runDelta`) — read ONLY by `laszlo`; every
 *  other curve ignores it. Endpoints are clamped so `t ≤ 0 → 0` and `t ≥ 1 → 1`
 *  exactly for every curve; the exact-landing ledger also snaps the end value,
 *  so a curve that overshoots mid-flight (`back`) or drifts by a float
 *  (`bezier`/`laszlo`) still lands precisely (§4.3). */
export declare function sample(motion: Motion, t: number, delta?: number): number;
/** Resolve a named motion token to its Motion, or null if unknown. `easeIn/
 *  Out/Both` are the quad family (LZX-compatible); `ease` is the CSS default
 *  Bézier; `laszlo*` carry OpenLaszlo's exact pole offsets. */
export declare function motionToken(name: string): Motion | null;
/** Every named motion token — the checker's "expected" set and the scaffold's
 *  `Motion` union, generated so the two never drift from `motionToken`. */
export declare const MOTION_TOKENS: readonly string[];
