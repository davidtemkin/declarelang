// scroll-anchor — a scrolling list whose rows are rebuilt (keyless) while it is
// scrolled part way: the anchor keeps a row that is then discarded, and its
// content rule reads the dead row's geometry. Watches the kernel cell mark and
// who allocates cells that are never freed.
//   node --expose-gc test/soak/scroll-anchor.mjs [--top]   (--top: left at scrollY 0)
import { build, run, soak, R, RT, sleep, trackCells } from "./lib.mjs";

const r = await build(`App [ width = 400, height = 400, seq: number = 0,
  model: Dataset [ contents = { ({ rows: Array.from({ length: 40 }, (_, i) => ({ k: "r" + i + "." + app.seq })) }) } ],
  list: View [ width = 400, height = 300, scrolls = y, datapath = { app.model.value },
    layout: SimpleLayout [ axis = y ],
    View [ datapath = :rows[], height = 30, width = 100%, View [ x = 10, Text [ text = :k ] ] ] ] ]`);
const app = run(r);
if (!process.argv.includes("--top")) { app.list.scrollY = 200; R.settle(); }
await sleep(30);
let t = null;
await soak("scrolled list, keyless rows rebuilt", async (i) => {
  app.seq++; R.settle();
  if (!process.argv.includes("--top")) { app.list.scrollY = 200 + (i % 3); R.settle(); }
  await sleep(10);
  if (i === 19) t = trackCells();
}, { warm: 20, n: 100 });
const rep = t.report(4);
console.log("cells held since warm-up:", rep.cellsHeld);
for (const [s, n] of rep.bySite) console.log("  ", n, s.replace(/Cell\.(ensure|track) \(runtime\/dist\/reactive\.js:\d+:\d+\) < /g, "").slice(0, 300));
process.exit(0);
