// menu-cells — a Menu opened and closed, its row then discarded: the kernel
// cell high-water mark climbs. Tracks which allocations are never freed.
//   node --expose-gc test/soak/menu-cells.mjs [--keep-rows] [--no-open]
import { build, run, R, RT, sleep, trackCells, gc } from "./lib.mjs";
const GC = process.argv.includes("--gc");   // collect every cycle: the data proxy cells go by finalization
const KEEP = process.argv.includes("--keep-rows"), NOOPEN = process.argv.includes("--no-open");
const r = await build(`App [ width = 600, height = 600, seq: number = 0,
  model: Dataset [ contents = { ({ rows: [0, 1, 2, 3].map((i) => ({ k: "r" + i + "." + app.seq })) }) } ],
  list: View [ width = 400, datapath = { app.model.value }, layout: SimpleLayout [ axis = y ],
    Row [ datapath = :rows[] ] ] ]
class Row extends View [ height = 30, width = 100%, Text [ text = :k ],
  pop: Menu [ items = { [{ id: "a", label: "A" }, { id: "b", label: "B" }] } ] ]`);
const app = run(r);
const rows = () => app.list.children.filter((c) => c instanceof RT.View);
const cycle = async () => {
  if (!NOOPEN) { for (const x of rows()) x.pop.openFor(x); R.settle(); for (const x of rows()) x.pop.close(); R.settle(); }
  await sleep(60);
  if (GC) await gc();
  if (!KEEP) { app.seq++; R.settle(); }
};
for (let i = 0; i < 10; i++) await cycle();
const t = trackCells(); const c0 = R.kernel().cells();
for (let i = 0; i < 20; i++) await cycle();
console.log(`cells high-water per cycle: ${(R.kernel().cells() - c0) / 20}`);
console.log(JSON.stringify(t.report(), null, 1));
process.exit(0);
