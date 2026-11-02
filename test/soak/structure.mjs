// structure — churn of the tree's shape at the App level (headless):
// nested replication rebuilt, classFor flipping, data replaced wholesale,
// keyed vs keyless, long expressions in rebuilt rows, wide re-listed lists,
// very deep nesting built and discarded, theme switching while rebuilding,
// a record shared by two datasets, imperative createView/discard.
//   node --expose-gc test/soak/structure.mjs [--only=name]
import { build, run, soak, R, RT, sleep } from "./lib.mjs";

const LONG = Array.from({ length: 40 }, (_, i) => `:v * ${i + 2}`).join(" + ");
const deep = (n) => { let s = `View [ width = 4, height = 4, Text [ text = { "" + app.seq } ] ]`; for (let i = 0; i < n; i++) s = `View [ ${s} ]`; return s; };

const CASES = {
  nestedKeyless: [`App [ width = 800, height = 600, seq: number = 0,
    d: Dataset [ contents = { ({ a: [0, 1, 2].map((i) => ({ b: [0, 1, 2].map((j) => ({ c: [0, 1, 2].map((k) => ({ v: "" + i + j + k + "." + app.seq })) })) })) }) } ],
    View [ datapath = { app.d.value }, layout: SimpleLayout [ axis = y ],
      View [ datapath = :a[], layout: SimpleLayout [ axis = y ],
        View [ datapath = :b[], layout: SimpleLayout [ axis = x ],
          View [ datapath = :c[], width = 20, height = 10, Text [ text = :v ] ] ] ] ] ]`, (app, i) => { app.seq++; }],
  nestedKeyed: [`App [ width = 800, height = 600, seq: number = 0,
    d: Dataset [ contents = { ({ a: [0, 1, 2].map((i) => ({ id: "a" + i, b: [0, 1, 2].map((j) => ({ id: "b" + j, c: [0, 1, 2].map((k) => ({ id: "c" + ((k + app.seq) % 5), v: "" + i + j + k + "." + app.seq })) })) })) }) } ],
    View [ datapath = { app.d.value }, layout: SimpleLayout [ axis = y ],
      View [ datapath = :a[], layout: SimpleLayout [ axis = y ],
        View [ datapath = :b[], layout: SimpleLayout [ axis = x ],
          View [ datapath = :c[], width = 20, height = 10, Text [ text = :v ] ] ] ] ] ]`, (app, i) => { app.seq++; }],
  classForFlip: [`App [ width = 800, height = 600, seq: number = 0,
    d: Dataset [ contents = { ({ rows: [0, 1, 2, 3, 4, 5].map((i) => ({ id: "r" + i, kind: (i + app.seq) % 2 == 0 ? "a" : "b", t: "x" + app.seq })) }) } ],
    View [ datapath = { app.d.value }, layout: SimpleLayout [ axis = y ],
      View [ datapath = :rows[], classFor = { :kind == "a" ? KA : KB } ] ] ]
  class KA extends View [ height = 10, width = 50, fill = red, Text [ text = :t ] ]
  class KB extends View [ height = 20, width = 80, fill = blue, Text [ text = :t ], View [ width = 5, height = 5 ] ]`, (app) => { app.seq++; }],
  wholesaleSet: [`App [ width = 800, height = 600,
    d: Dataset { { "rows": [] } },
    View [ datapath = { app.d.value }, layout: SimpleLayout [ axis = y ],
      View [ datapath = :rows[], height = 12, width = 100, Text [ text = :t ], Text [ x = 50, text = { "" + :n } ] ] ] ]`,
    (app, i) => { app.d.set([], { rows: Array.from({ length: 10 }, (_, k) => ({ id: "k" + ((k + i) % 13), t: "t" + i, n: k })) }); }],
  wholesaleInsertRemove: [`App [ width = 800, height = 600,
    d: Dataset { { "rows": [ { "id": "a", "t": "a" } ] } },
    View [ datapath = { app.d.value }, layout: SimpleLayout [ axis = y ],
      View [ datapath = :rows[], height = 12, width = 100, Text [ text = :t ] ] ] ]`,
    (app, i) => { for (let k = 0; k < 5; k++) app.d.insert(["rows"], 0, { id: "n" + i + "." + k, t: "new" }); R.settle(); for (let k = 0; k < 5; k++) app.d.removeAt(["rows"], 0); }],
  longExprRows: [`App [ width = 800, height = 600, seq: number = 0,
    d: Dataset [ contents = { ({ rows: Array.from({ length: 20 }, (_, i) => ({ v: i + app.seq })) }) } ],
    View [ datapath = { app.d.value }, layout: SimpleLayout [ axis = y ],
      View [ datapath = :rows[], height = 4, width = { (${LONG}) % 300 } ] ] ]`, (app) => { app.seq++; }],
  wideRelist: [`App [ width = 800, height = 600, seq: number = 0,
    d: Dataset [ contents = { ({ rows: Array.from({ length: 33 + (app.seq % 5) }, (_, i) => ({ v: "" + i })) }) } ],
    View [ datapath = { app.d.value }, layout: SimpleLayout [ axis = x ],
      View [ datapath = :rows[], height = 4, width = 3 ] ] ]`, (app) => { app.seq++; }],
  wideRelist200: [`App [ width = 800, height = 600, seq: number = 0,
    d: Dataset [ contents = { ({ rows: Array.from({ length: 190 + (app.seq % 20) }, (_, i) => ({ v: "" + i })) }) } ],
    View [ datapath = { app.d.value }, layout: WrappingLayout [ spacing = 1 ],
      View [ datapath = :rows[], height = 4, width = 3 ] ] ]`, (app) => { app.seq++; }],
  deepNesting: [`App [ width = 800, height = 600, seq: number = 0, on: boolean = false,
    View [ exists = { app.on }, ${deep(150)} ] ]`, (app) => { app.on = !app.on; app.seq++; }],
  themeSwitchRebuild: [`App [ width = 800, height = 600, seq: number = 0, dark: boolean = false,
    theme = { app.dark ? SanFranciscoDark : SanFrancisco },
    d: Dataset [ contents = { ({ rows: [0, 1, 2, 3].map((i) => ({ t: "r" + i + app.seq })) }) } ],
    View [ datapath = { app.d.value }, layout: SimpleLayout [ axis = y ],
      View [ datapath = :rows[], height = 30, width = 300, fill = { provided("theme").surface },
        Button [ label = :t ], Checkbox [ x = 120, label = "c" ], Text [ x = 200, text = :t ] ] ] ]`, (app) => { app.seq++; app.dark = !app.dark; }],
  sharedRecord: [`App [ width = 800, height = 600, on: boolean = false, seq: number = 0,
    src: Dataset { { "rows": [ { "id": "a", "t": "a" }, { "id": "b", "t": "b" } ] } },
    View [ exists = { app.on },
      mirror: Dataset [ contents = { ({ rows: app.src.value.rows.filter((r) => r.id != "x") }) } ],
      View [ datapath = { parent.mirror.value }, layout: SimpleLayout [ axis = y ],
        View [ datapath = :rows[], height = 12, width = 100, Text [ text = :t ] ] ] ],
    View [ y = 200, datapath = { app.src.value }, layout: SimpleLayout [ axis = y ],
      View [ datapath = :rows[], height = 12, width = 100, Text [ text = :t ] ] ] ]`,
    (app, i) => { app.on = !app.on; R.settle(); app.src.set(["rows", 0, "t"], "t" + i); }],
  createViewDiscard: [`App [ width = 800, height = 600,
    box: View [ layout: SimpleLayout [ axis = y ] ],
    churn() { for (const c of [...this.box.childViews]) c.discard(); for (let i = 0; i < 6; i++) this.box.createView("Card", { width: 50, height: 10 }) } ]
  use [ Card ]`, (app) => app.churn()],
};

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7)?.split(",");
for (const [name, [src, step]] of Object.entries(CASES)) {
  if (only && !only.includes(name)) continue;
  let r;
  try { r = await build(src); } catch (e) { console.log(`SKIP   ${name}: ${e.message.split("\n").slice(0, 2).join(" ").slice(0, 300)}`); continue; }
  let app;
  try { app = run(r); } catch (e) { console.log(`THROW  ${name} at boot: ${e.message.slice(0, 300)}`); continue; }
  try { await soak(name, async (i) => { step(app, i); R.settle(); await sleep(2); }, { warm: 20, n: 100 }); }
  catch (e) { console.log(`THROW  ${name}: ${e.stack.slice(0, 500)}`); }
  try { app.discard(); R.settle(); } catch (e) { console.log(`THROW  ${name} at discard: ${e.message.slice(0, 200)}`); }
}
process.exit(0);
