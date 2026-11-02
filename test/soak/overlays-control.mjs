// overlays-control — the same rows as overlays.mjs, with the controls that say
// where the leak is: (a) open then close before the rows go, (b) open/close with
// no rows discarded, (c) open + discard, then the retaining path of a dead overlay.
import { build, run, soak, R, RT } from "./lib.mjs";
import { tagTree, whyAlive } from "./why-alive.mjs";

const src = (decl) => `App [ width = 600, height = 600, seq: number = 0,
  model: Dataset [ contents = { ({ rows: [0, 1, 2, 3].map((i) => ({ k: "r" + i + "." + app.seq })) }) } ],
  list: View [ width = 400, datapath = { app.model.value }, layout: SimpleLayout [ axis = y ],
    Row [ datapath = :rows[] ] ] ]
class Row extends View [ height = 30, width = 100%, Text [ text = :k ], ${decl} ]`;
const r = await build(src(`pop: Popover [ anchorTo = { classroot }, Text [ text = "hi" ] ]`));
const rows = (app) => app.list.children.filter((c) => c instanceof RT.View);

{
  const app = run(r);
  await soak("Popover opened then closed (motion never lands headless), rows discarded", () => {
    for (const x of rows(app)) x.pop.show(); R.settle();
    for (const x of rows(app)) x.pop.close(); R.settle();
    app.seq++;
  }, { warm: 15, n: 60 });
  app.discard(); R.settle();
}
{
  const app = run(r);
  await soak("Popover open/close, rows kept", () => {
    for (const x of rows(app)) x.pop.show(); R.settle();
    for (const x of rows(app)) x.pop.close(); R.settle();
  }, { warm: 15, n: 60 });
  app.discard(); R.settle();
}
{
  const app = run(r);
  for (let i = 0; i < 3; i++) { for (const x of rows(app)) x.pop.show(); R.settle(); app.seq++; R.settle(); }
  const victims = rows(app);
  for (const x of victims) x.pop.show(); R.settle();
  for (const x of victims) tagTree(x);
  victims.length = 0;
  app.seq++; R.settle();
  await whyAlive("popover open when its row was discarded", 2);
  app.discard(); R.settle();
  await whyAlive("... and after the whole app is discarded", 2);
}
process.exit(0);
