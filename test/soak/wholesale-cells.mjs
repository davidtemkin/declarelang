// wholesale-cells — a Dataset whose whole value is replaced every step with
// d.set([], …) (a keyed list, records new each time): the kernel cell mark
// climbs. Tracks which cells are never freed, with a GC every cycle.
//   node --expose-gc test/soak/wholesale-cells.mjs [--no-gc] [--contents]
import { build, run, R, sleep, trackCells, gc } from "./lib.mjs";
const GC = !process.argv.includes("--no-gc");
const VIA_CONTENTS = process.argv.includes("--contents");   // the same data from a contents = { } constraint instead
const r = await build(VIA_CONTENTS ? `App [ width = 800, height = 600, i: number = 0,
    d: Dataset [ contents = { ({ rows: Array.from({ length: 10 }, (_, k) => ({ id: "k" + ((k + app.i) % 13), t: "t" + app.i, n: k })) }) } ],
    View [ datapath = { app.d.value }, layout: SimpleLayout [ axis = y ],
      View [ datapath = :rows[], height = 12, width = 100, Text [ text = :t ], Text [ x = 50, text = { "" + :n } ] ] ] ]`
  : `App [ width = 800, height = 600,
    d: Dataset { { "rows": [] } },
    View [ datapath = { app.d.value }, layout: SimpleLayout [ axis = y ],
      View [ datapath = :rows[], height = 12, width = 100, Text [ text = :t ], Text [ x = 50, text = { "" + :n } ] ] ] ]`);
const app = run(r);
const step = (i) => { if (VIA_CONTENTS) app.i = i; else app.d.set([], { rows: Array.from({ length: 10 }, (_, k) => ({ id: "k" + ((k + i) % 13), t: "t" + i, n: k })) }); R.settle(); };
for (let i = 0; i < 30; i++) step(i);
if (GC) await gc();
const c0 = R.kernel().cells(), t = trackCells();
for (let i = 30; i < 130; i++) { step(i); if (GC && i % 10 === 0) await gc(); }
if (GC) await gc();
await sleep(50);
console.log(`${VIA_CONTENTS ? "contents = { }" : "d.set([], …)"}${GC ? " with GC" : ""}: cells high-water +${(R.kernel().cells() - c0) / 100}/step`);
const rep = t.report(5);
console.log("held:", rep.cellsHeld);
for (const [s, n] of rep.bySite) console.log("  ", n, s.replace(/Cell\.(ensure|track|cellId) \(runtime\/dist\/reactive\.js:\d+:\d+\) < /g, "").slice(0, 350));
process.exit(0);
