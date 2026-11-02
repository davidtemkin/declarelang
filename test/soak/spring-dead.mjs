// spring-dead — a Spring (and an Animator) still moving when its view is
// discarded: does it leave the animation clock, and when? Discards one victim
// mid-flight, then watches the clock's tickers for a few seconds.
import { build, run, R, RT, ANIM, sleep } from "./lib.mjs";

const CASES = {
  "Spring on width": `width = 10, target: number = 10, sp: Spring [ attribute = width, to = { classroot.target }, stiffness = 30, damping = 3 ]`,
  "Spring on declared w": `w: number = 0, target: number = 0, sp: Spring [ attribute = w, to = { classroot.target }, stiffness = 30, damping = 3 ]`,
  "Spring, to reads app": `w: number = 0, sp: Spring [ attribute = w, to = { app.goal }, stiffness = 30, damping = 3 ]`,
  "Spring, undamped (damping = 0)": `w: number = 0, target: number = 0, sp: Spring [ attribute = w, to = { classroot.target }, stiffness = 30, damping = 0 ]`,
  "Animator 5 s": `w: number = 0, sp: Animator [ attribute = w, to = 300, duration = 5000 ]`,
};
for (const [name, members] of Object.entries(CASES)) {
  const r = await build(`App [ width = 800, height = 600, on: boolean = true, goal: number = 0, hits: number = 0,
    box: View [ Victim [ exists = { app.on } ] ] ]
  class Victim extends View [ ${members} ]`);
  const app = run(r);
  const v = app.box.children.find((c) => c instanceof RT.View);
  let ticks = 0;
  const orig = v.sp.$tick.bind(v.sp);
  v.sp.$tick = (now, ...a) => { ticks++; return orig(now, ...a); };
  if ("target" in v) v.target = 400; else if (name.includes("app")) app.goal = 400; else v.sp.start();
  R.settle();
  await sleep(50);
  const t0 = ticks;
  app.on = false; R.settle();
  const out = [];
  for (const ms of [100, 500, 2000, 4000]) { await sleep(ms - (out.length ? [100, 500, 2000, 4000][out.length - 1] : 0)); out.push(`${ms}ms: tickers=${ANIM.sharedClock.tickersNow().length} ticks since discard=${ticks - t0}`); }
  if (name.includes("app")) { app.goal = 0; R.settle(); await sleep(100); out.push(`after app.goal changes: tickers=${ANIM.sharedClock.tickersNow().length}, ticks=${ticks - t0}`); }
  console.log(`${name}: running=${v.sp.running} ${out.join(" | ")}  w/width now ${v.w ?? v.width}`);
  app.discard(); R.settle(); await sleep(50);
  console.log(`   after app.discard: tickers=${ANIM.sharedClock.tickersNow().length}`);
}
process.exit(0);
