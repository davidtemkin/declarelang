// dead — what a program can still do to a view after it is discarded, by
// holding a reference (a stale handler, an attribute holding a view, a
// closure): read it from a live constraint, write it, call its methods, ask it
// to show an overlay, focus it, start its animators, give it new children.
// Each must neither throw from the runtime's own code nor allocate what is
// never given back.
//   node --expose-gc test/soak/dead.mjs
import { build, run, soak, R, RT, sleep, ERRORS, trackCells } from "./lib.mjs";

const r = await build(`App [ width = 800, height = 600, seq: number = 0, held: View? = null,
  sum: number = { app.held != null ? app.held.width + app.held.height + app.held.x + app.held.y : 0 },
  d: Dataset [ contents = { ({ rows: [0, 1, 2].map((i) => ({ k: "r" + i + "." + app.seq, done: false })) }) } ],
  list: View [ datapath = { app.d.value }, layout: SimpleLayout [ axis = y ], Row [ datapath = :rows[] ] ] ]
class Row extends View [ width = 100, height = { 20 + app.seq % 3 }, w: number = 0,
  Text [ text = :k ],
  pop: Popover [ anchorTo = { classroot }, Text [ text = "p" ] ],
  an: Animator [ attribute = w, to = 100, duration = 300 ],
  sp: Spring [ attribute = w, to = { classroot.goal }, stiffness = 100, damping = 10 ], goal: number = 0,
  mark() { :done = true },
  later() { afterDelay(10, () => { this.w = 5 }) },
  grab() { Focus.focus(this) },
  add() { this.createView("View", { width: 3, height: 3 }) } ]`);

const app = run(r);
const rows = () => app.list.children.filter((c) => c instanceof RT.View);
const OPS = {
  "live constraint reads a dead view's geometry": (dead) => { app.held = dead; },
  "write attributes on a dead view": (dead) => { dead.width = 33; dead.w = 4; dead.fill = 0xff0000; },
  "a dead row writes its record (:done = true)": (dead) => dead.mark(),
  "afterDelay asked of a dead view": (dead) => dead.later(),
  "show() a dead view's Popover": (dead) => dead.pop.show(),
  "start() a dead view's Animator": (dead) => dead.an.start(),
  "retarget a dead view's Spring": (dead) => { dead.goal = 300; },
  "Focus.focus(dead view)": (dead) => dead.grab(),
  "createView into a dead view": (dead) => dead.add(),
  "discard() a dead view again": (dead) => dead.discard(),
};
for (const [name, op] of Object.entries(OPS)) {
  const e0 = ERRORS.length;
  let thrown = 0, firstThrow = "";
  let t = null;
  const res = await soak(name, async (i) => {
    const dead = rows()[0];
    app.seq++; R.settle();                     // the row is discarded here
    try { op(dead); R.settle(); } catch (e) { thrown++; firstThrow ||= e.message.split("\n")[0].slice(0, 200); }
    await sleep(15);
    if (i === 19) t = trackCells();
  }, { warm: 20, n: 80 });
  if (thrown) console.log(`       threw ${thrown}× to the caller: ${firstThrow}`);
  if (res.per.cells > 0 && t) {
    for (const [s, n] of t.report(2).bySite) console.log("       cells held at:", n, s.replace(/Cell\.(ensure|track|cellId) \(runtime\/dist\/reactive\.js:\d+:\d+\) < /g, "").slice(0, 300));
  }
  t?.stop();
  app.held = null; R.settle();
}
process.exit(0);
