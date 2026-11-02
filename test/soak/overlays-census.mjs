// overlays-census — which classes stay alive when a row holding an opened
// overlay is discarded (heap census per cycle), and a retaining path for one.
//   node --expose-gc test/soak/overlays-census.mjs [--kind=Popover|Menu|…] [--close]
import { build, run, R, RT, OUT, gc, sleep } from "./lib.mjs";
import { census, censusDiff, retainingPaths } from "./retainers.mjs";

const KINDS = {
  Popover: [`pop: Popover [ anchorTo = { classroot }, Text [ text = "hi" ] ]`, (r) => r.pop.show()],
  Menu: [`pop: Menu [ items = { [{ id: "a", label: "A" }, { id: "b", label: "B" }] } ]`, (r) => r.pop.openFor(r)],
  Dialog: [`pop: Dialog [ title = "T", message = "M" ]`, (r) => r.pop.show()],
};
const kind = process.argv.find((a) => a.startsWith("--kind="))?.slice(7) ?? "Popover";
const [decl, openOne] = KINDS[kind];
const r = await build(`App [ width = 600, height = 600, seq: number = 0,
  model: Dataset [ contents = { ({ rows: [0, 1, 2, 3].map((i) => ({ k: "r" + i + "." + app.seq })) }) } ],
  list: View [ width = 400, datapath = { app.model.value }, layout: SimpleLayout [ axis = y ],
    Row [ datapath = :rows[] ] ] ]
class Row extends View [ height = 30, width = 100%, Text [ text = :k ], ${decl} ]`);
const app = run(r);
const rows = () => app.list.children.filter((c) => c instanceof RT.View);
const CLOSE = process.argv.includes("--close");   // open, then close before the row goes
const openAll = () => { for (const x of rows()) openOne(x); R.settle(); if (CLOSE) { for (const x of rows()) x.pop.close(); R.settle(); } };
const cycle = async () => { openAll(); app.seq++; R.settle(); OUT.pressOutside(app, -50, -50); RT.Keys._claimant(); await sleep(40); };
for (let i = 0; i < 10; i++) await cycle();
await gc(); const a = census(); const c0 = R.kernel().cells();
for (let i = 0; i < 20; i++) await cycle();
await gc(); const b = census();
console.log(`${kind}${CLOSE ? " (closed first)" : ""} per cycle:`, JSON.stringify(censusDiff(a, b, 30, 20)), " cells/cycle", (R.kernel().cells() - c0) / 20);
const victims = rows();
openAll();
for (const x of victims) { x.__soakDead = {}; x.pop.__soakDead = {}; }
victims.length = 0;
app.seq++; R.settle();
for (let i = 0; i < 3; i++) await cycle();
await gc();
const { targets, paths, mode } = retainingPaths({ mark: "__soakDead", max: 1 });
console.log("tagged alive:", targets, mode ?? ""); for (const p of paths) console.log(p, "\n");
process.exit(0);
