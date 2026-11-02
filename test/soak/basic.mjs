// basic — the harness's own control: rows rebuilt (should be flat, fixed earlier),
// and a small program built and discarded (the per-program case).
import { build, run, soak, R } from "./lib.mjs";

const SRC = `App [ width = 400, height = 400, seq: number = 0,
  model: Dataset [ contents = { ({ rows: Array.from({ length: 12 }, (_, i) => ({ k: "r" + i + "." + app.seq })) }) } ],
  list: View [ width = 400, datapath = { app.model.value }, layout: SimpleLayout [ axis = y ],
    View [ datapath = :rows[], height = 20, width = 100%, Text [ text = :k ] ] ] ]`;

const r = await build(SRC);
const app = run(r);
await soak("control: 12 keyless rows rebuilt", () => { app.seq++; }, { warm: 30, n: 200 });
app.discard(); R.settle();
await soak("control: small program built + discarded", () => { const a = run(r); R.settle(); a.discard(); }, { warm: 10, n: 60 });
process.exit(0);
