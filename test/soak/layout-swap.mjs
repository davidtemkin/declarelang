// layout-swap — a view's layout replaced at run time, over and over (the path
// `View.layout`'s push takes: uninstall the old, attach the new). Three ways:
//   fresh   — a new JS layout object each swap (TweenLayout subclass: it owns an Animator)
//   two     — the same two layout objects, alternated
//   rows    — rows rebuilt under a view whose layout is swapped
import { build, run, soak, R, RT, ROOT, sleep } from "./lib.mjs";
const { TweenLayout } = await import(ROOT + "/runtime/dist/tween-layout.js");
const { Layout } = await import(ROOT + "/runtime/dist/layout.js");

class Row extends TweenLayout { place() { return this.laid().map((c, i) => ({ x: i * 30, y: 0, w: 25, h: 20, vis: true })); } }
class Col extends TweenLayout { place() { return this.laid().map((c, i) => ({ x: 0, y: i * 30, w: 25, h: 20, vis: true })); } }

const r = await build(`App [ width = 600, height = 600, seq: number = 0,
  model: Dataset [ contents = { ({ rows: [0, 1, 2, 3, 4].map((i) => ({ k: "r" + i + "." + app.seq })) }) } ],
  list: View [ width = 400, height = 400, datapath = { app.model.value },
    View [ datapath = :rows[], Text [ text = :k ] ] ] ]`);

{
  const app = run(r);
  await soak("fresh TweenLayout each swap (animated retarget)", async (i) => { app.list.layout = i % 2 ? new Row() : new Col(); R.settle(); await sleep(5); }, { warm: 20, n: 100 });
  app.discard(); R.settle();
}
{
  const app = run(r);
  const a = new Row(), b = new Col();
  await soak("two TweenLayouts alternated", async (i) => { app.list.layout = i % 2 ? a : b; R.settle(); await sleep(5); }, { warm: 20, n: 100 });
  app.discard(); R.settle();
}
{
  const app = run(r);
  const a = new Row(), b = new Col();
  await soak("two TweenLayouts alternated, rows rebuilt", async (i) => { app.list.layout = i % 2 ? a : b; app.seq++; R.settle(); await sleep(5); }, { warm: 20, n: 100 });
  app.discard(); R.settle();
}
process.exit(0);
