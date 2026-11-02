// virtual-cells — a virtualized list (virtualize = true) scrolled, inside a row
// that is rebuilt every cycle: which allocations stay held.
import { build, run, soak, R, RT, sleep, trackCells } from "./lib.mjs";
const SCROLL = !process.argv.includes("--no-scroll");
const r = await build(`App [ width = 800, height = 600, seq: number = 0,
  big: Dataset [ contents = { ({ rows: Array.from({ length: 200 }, (_, i) => ({ k: "r" + i + "." + app.seq })) }) } ],
  model: Dataset [ contents = { ({ rows: [0, 1].map((i) => ({ k: "r" + i + "." + app.seq })) }) } ],
  list: View [ width = 700, datapath = { app.model.value }, layout: SimpleLayout [ axis = y ],
    Victim [ datapath = :rows[] ] ] ]
class Victim extends View [ height = 100, width = 300, scrolls = y, datapath = { app.big.value }, layout: SimpleLayout [ axis = y ],
  View [ datapath = :rows[], virtualize = true, height = 20, width = 100%, Text [ text = :k ] ] ]`);
const app = run(r);
let t;
await soak(`virtualized list in rebuilt rows${SCROLL ? ", scrolled" : ""}`, async (i) => {
  if (SCROLL) for (const v of app.list.children) if (v instanceof RT.View) v.scrollY = 300;
  R.settle(); await sleep(20);
  app.seq++; R.settle(); await sleep(5);
  if (i === 19) t = trackCells();
}, { warm: 20, n: 60 });
const rep = t.report(6);
console.log("cells held since warm-up:", rep.cellsHeld, "new blocks:", rep.newBlocks);
for (const [s, n] of rep.bySite) console.log("  ", n, s.replace(/Cell\.(ensure|track|cellId) \(runtime\/dist\/reactive\.js:\d+:\d+\) < /g, "").slice(0, 400));
for (const [s, n] of rep.blockSites) console.log("  block", n, s.slice(0, 300));
process.exit(0);
