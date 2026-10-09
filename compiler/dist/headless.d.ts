import { App } from "../../runtime/dist/index.js";
import type { Program } from "../../runtime/dist/parser.js";
/** The explicit environment vector (capabilities.md §3). The defaults are ONE
 *  canonical constant on every host — a nominal desktop viewport, light scheme
 *  — so a headless artifact never varies by who extracted it. Explicit because
 *  geometry leaks into CONTENT through responsive constraints (a compact tab
 *  renders "D" for "Day" at narrow widths): the viewport selects what the
 *  snapshot contains, so it is a visible parameter, not an accident. */
export interface Environment {
    hostWidth?: number;
    hostHeight?: number;
    dark?: boolean;
    /** Text metrics for a DOM-less host: a real 2D context for exact typography
     *  (verify §2.8 — a tools-only canvas dependency), else the deterministic
     *  approximation below is injected. In a browser, omit — the real measurer
     *  measures. */
    measurer?: CanvasRenderingContext2D;
}
export declare const DEFAULT_ENV: {
    readonly hostWidth: 1200;
    readonly hostHeight: 800;
    readonly dark: false;
};
/** A deterministic stand-in for canvas text metrics on hosts with no DOM —
 *  per-character class widths, one constant table. Enough to SETTLE any tree
 *  (auto-extents, wraps, flows all compute); geometry is approximate, and only
 *  geometry-derived content could shift vs a browser. Same inputs, same
 *  numbers, every host — determinism is the contract here, fidelity is the
 *  injectable upgrade (Environment.measurer). */
export declare function approximateMeasurer(): CanvasRenderingContext2D;
export interface HeadlessOptions {
    env?: Environment;
    /** The values a host provides the app from its first evaluation. */
    provides?: Readonly<Record<string, unknown>>;
}
/** Build and settle a compiled program headlessly; returns the settled App.
 *  Instantiating leaves the program untouched, so one program settles any
 *  number of times. Callers walk the tree, then `app.discard()`. */
export declare function settleHeadless(program: Program, opts?: HeadlessOptions): App;
