// platform-time.ts — TIMERS THAT TIME THE PLATFORM, not the program.
//
// Most of the runtime's delays are the program's time (an afterDelay, a hold,
// a tooltip's wait), and a test harness that drives a virtual clock is right
// to own them. A few measure the PLATFORM's own process instead — "the user's
// scroll has gone quiet", "no `scrollend` came, so the fact may not stick" —
// which runs on the browser's real time beside its real events. Under a
// virtual clock those would wait for a step nobody takes, and the `scrolling`
// fact would stay true for good, holding every scroll request.
//
// So they go through here: a harness that virtualizes `setTimeout` leaves the
// real pair on `globalThis.__declarePlatformTimers`; everywhere else (every
// shipped page) these are plain setTimeout / clearTimeout.

type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (id: unknown) => void };
const seam = (): Timers | undefined => (globalThis as { __declarePlatformTimers?: Timers }).__declarePlatformTimers;

export type PlatformTimer = ReturnType<typeof setTimeout>;

export function platformTimeout(fn: () => void, ms: number): PlatformTimer {
  const s = seam();
  return (s !== undefined ? s.set(fn, ms) : setTimeout(fn, ms)) as PlatformTimer;
}

export function clearPlatformTimeout(id: PlatformTimer | undefined): void {
  if (id === undefined) return;
  const s = seam();
  if (s !== undefined) s.clear(id); else clearTimeout(id);
}
