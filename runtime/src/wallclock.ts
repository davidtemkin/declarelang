// The wall clock and the alarm — one seam for everything in the runtime that
// waits on real time: Time's tiers and periods (time.ts) and a node's
// `afterDelay(ms, fn)` (node.ts). Swappable for tests (setTimeHost), so a test or a
// driver advances time by hand and both see the same clock. A leaf module: it
// imports nothing, so node.ts can reach it from the bottom of the graph.

/** `now` is epoch milliseconds (Date.now), never the frame scheduler's
 *  timeline. `frame` runs `fn` once the frame now being built has been shown;
 *  a host without frames (a test, a hidden page) runs it on the next turn. */
export interface TimeHost {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  frame?(fn: () => void): unknown;
  cancelFrame?(handle: unknown): void;
}

const g = globalThis as unknown as {
  requestAnimationFrame?: (fn: () => void) => number;
  cancelAnimationFrame?: (h: number) => void;
  document?: { hidden?: boolean };
};

const REAL_HOST: TimeHost = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  // A hidden page paints nothing, so waiting for a frame would wait for the
  // page to come back; the next turn stands in for it.
  frame: (fn) => typeof g.requestAnimationFrame === "function" && g.document?.hidden !== true
    ? { raf: g.requestAnimationFrame(fn) }
    : { timer: setTimeout(fn, 0) },
  cancelFrame: (h) => {
    const x = h as { raf?: number; timer?: ReturnType<typeof setTimeout> };
    if (x.raf !== undefined) g.cancelAnimationFrame?.(x.raf);
    if (x.timer !== undefined) clearTimeout(x.timer);
  },
};

let host: TimeHost = REAL_HOST;
export function timeHost(): TimeHost { return host; }
export function setTimeHost(h: TimeHost | null): void { host = h ?? REAL_HOST; }
