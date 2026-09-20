import type { Kernel, KernelHost } from "./kernel-loader.js";
/** One crossing. `[op, …args]` for a call in; `["<", op, …]` for a callback out.
 *  Arrays, not objects: a long trace is mostly punctuation otherwise. */
export type TraceStep = (string | number | number[])[];
export interface Trace {
    steps: TraceStep[];
    /** Cheap, order-sensitive fingerprints of the table, taken at each settle's
     *  end — enough to locate a divergence without storing the whole table. */
    marks: Array<{
        at: number;
        runs: number;
        cells: number;
        rules: number;
        sum: number;
    }>;
}
/** Wrap a kernel and a host so that every crossing is recorded. The returned
 *  kernel behaves exactly as the one given — recording changes nothing but
 *  speed, and it is off unless asked for. */
export declare function traceKernel(k: Kernel, host: KernelHost): {
    kernel: Kernel;
    host: KernelHost;
    trace: Trace;
};
/** Is tracing asked for, and where should it go? */
export declare function traceTarget(): string | null;
