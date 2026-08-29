// Heartbeat — the frame heartbeat as a component. A non-visual member that calls
// `onFrame(dt)` once per animation frame while it is running:
//
//     physics: Heartbeat [ onFrame(dt) { classroot.step(dt) } ],
//
// WHY IT EXISTS. Springs and Animators cover declarative motion — say where a
// thing belongs and the runtime finds the path. An app running its OWN
// integrator (a custom scroll/gesture physics engine, a simulation, a game
// loop) needs the raw heartbeat instead: a call per frame with the real elapsed
// time. That is the whole surface here.
//
// WHY A COMPONENT, not a `<-` subscription. An event is a function-typed member
// that gets called when the thing happens (the language's own ruling), and
// Declare already has the category for a member that is not a view: Dataset,
// Animator, State, and Spring are all non-visual node members. A source
// spelled as a component needs no new operator, no new grammar, and no
// subscribable-source table — and it tree-shakes out of a production build like
// any other component nobody instantiated.
//
// It rides the ONE shared clock (animate.ts), so a Heartbeat member costs exactly
// what an animator costs: nothing at all until it runs, and no second rAF loop.
// `dt` is seconds since the previous frame, clamped — a backgrounded tab
// resumes with a plausible step instead of one enormous jump that would launch
// any integrator into the weeds.

import { Node, onDiscard, authoredName } from "./node.js";
import { sharedClock, type Ticker } from "./animate.js";
import { defineAttributes } from "./attributes.js";

/** The largest step handed to `onFrame`, in seconds. A tab that was hidden for
 *  a minute comes back with dt = 60, and any physics integrated against that
 *  explodes; ~4 frames at 60Hz is the standard clamp. */
const MAX_DT = 1 / 15;

export class Heartbeat extends Node implements Ticker {
  /** Life by KIND (Ticker.perpetual): a Heartbeat integrates while `running`
   *  and never "arrives" — it must not hold settleMotion open. */
  readonly perpetual = true;

  /** Running? `false` pauses the heartbeat without discarding the member —
   *  a live slot, so `running = { app.simulating }` is the idiom. */
  declare running: boolean;

  /** The previous frame's timestamp, or null before the first tick. */
  private last: number | null = null;
  private registered = false;

  constructor() {
    super();
    // Lifetime is the node's: a discarded Heartbeat leaves the clock, so a
    // torn-down subtree cannot keep a loop alive (the leak that a hand-written
    // rAF always risks).
    onDiscard(this, () => this.leave());
  }

  /** Sync clock membership with `running` — called at init and on every
   *  write to the slot (the attribute's pusher). */
  private sync(): void {
    if (this.running) this.join();
    else this.leave();
  }

  private join(): void {
    if (this.registered) return;
    this.registered = true;
    this.last = null; // the first frame after a resume yields no step
    sharedClock.add(this);
  }

  private leave(): void {
    if (!this.registered) return;
    this.registered = false;
    sharedClock.remove(this);
    this.last = null;
  }

  /** Shift the anchor across a scheduler handover (Ticker.rebase) — the
   *  resume-yields-no-step rule at `join()` is about ENROLLMENT; a live
   *  heartbeat crossing a clock handover has no reason to skip a beat. */
  rebase(delta: number): void {
    if (this.last !== null) this.last += delta;
  }

  /** Called once per frame by the shared clock. Returns whether to keep
   *  ticking (the clock's protocol). */
  tick(now: number): boolean {
    if (!this.running) return false;
    const prev = this.last;
    this.last = now;
    // The first frame establishes the baseline; nothing has elapsed yet.
    if (prev === null) return true;
    // BOTH ends: the top so a backgrounded tab cannot resume with one enormous
    // step, the bottom so a clock handover (manual clock near zero after
    // performance.now baselines) cannot deliver a NEGATIVE dt — measured at
    // −0.72s, which ran an integrated fling backwards under rung 5.
    const dt = Math.min(Math.max((now - prev) / 1000, 0), MAX_DT);
    const fn = (this as unknown as Record<string, unknown>).onFrame;
    if (typeof fn === "function") {
      // A per-frame exception must not wedge the tab: one that keeps throwing
      // ran for nine minutes at 60Hz with a minified stack naming nothing
      // (field report 2026-08-21). Each throw is logged with the node named;
      // three CONSECUTIVE throws stop the heartbeat — the author restarts it
      // with `running = true` after fixing the handler.
      try {
        (fn as (dt: number) => void).call(this, dt);
        this.throws = 0;
      } catch (e) {
        this.throws++;
        const name = authoredName(this);
        console.error(`[Declare] onFrame on Heartbeat${name !== null ? ` '${name}'` : ""} threw: ${(e as Error)?.message ?? e}`, e);
        if (this.throws >= 3) {
          console.error(`[Declare] Heartbeat${name !== null ? ` '${name}'` : ""} stopped — onFrame threw ${this.throws} frames in a row; set running = true to restart it`);
          this.throws = 0;
          (this as unknown as { running: boolean }).running = false;
          return false;
        }
      }
    }
    return this.running;
  }

  /** Consecutive onFrame throws — the stop-the-wedge counter. */
  private throws = 0;

  /** Construction-complete (instantiate.ts fires this on animators; Heartbeat
   *  joins the same lifecycle) — start if `running` was left true. */
  autoStart(): void {
    this.sync();
  }
}

defineAttributes(Heartbeat as never, {
  running: {
    def: true,
    push: (f: Heartbeat) => (f as unknown as { sync(): void }).sync(),
  },
} as never);
