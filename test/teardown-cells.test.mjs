// A torn-down view gives back every kernel cell it held. View.$teardown copies
// Node.$teardown's body around the view's own retirement, and the copy had lost
// its last line — the structure cell's free — so a view that ever sized itself
// kept one cell after it was gone (#34). A list whose rows are rebuilt (keyless,
// or keyed by records that change) then grew by one cell per row per rebuild,
// about 49 per page turn in a 50-row list, until the table filled and every
// ensure() threw E57F1C9. The case below is the issue's own: eight keyless rows
// rebuilt on every change; the cell count must return to its warm level.
import assert from "node:assert/strict";
import { compile } from "../compiler/dist/compile-node.js";
import { settleHeadless } from "../compiler/dist/headless.js";
import { kernelReady, kernelStats, settle } from "../runtime/dist/reactive.js";
import { test, summarize } from "./harness.mjs";

const SRC = `script {
    function rowsFor(seq: number, changing: boolean) {
        const rows = []
        for (let i = 0; i < 8; i++) rows.push({ k: "field " + i, v: changing ? "value " + seq + "." + i : "value " + i })
        return { seq: seq, rows: rows }
    }
}
App [ width = 400, height = 400,
    seq: number = 0,
    changing: boolean = false,
    model: Dataset [ contents = { rowsFor(app.seq, app.changing) } ],
    list: View [ width = 400, datapath = { app.model.value },
        layout: SimpleLayout [ axis = y ],
        Row [ datapath = :rows[] ] ]
]
class Row extends View [ height = 20, width = 100%,
    Text [ text = { "" + :k } ],
    Text [ x = 200, text = { "" + :v } ]
]`;

await kernelReady();

for (const changing of [false, true]) {
  await test(`rows ${changing ? "rebuilt" : "rebound"} 300 times keep the kernel's cell count flat`, async () => {
    const r = await compile(SRC);
    assert.deepEqual((r.errors ?? []).map((e) => e.message), []);
    const app = settleHeadless(r.program, { deps: r.deps });
    app.changing = changing;
    const rebuild = (n) => { for (let i = 0; i < n; i++) { app.seq = app.seq + 1; settle(); } };
    rebuild(20);                                  // warm up
    const before = kernelStats(0).cells;
    rebuild(300);
    const gained = kernelStats(0).cells - before;
    app.discard();
    assert.ok(gained <= 8, `${gained} cells gained over 300 rebuilds of 8 rows — a torn-down view kept its cells`);
  });
}

summarize("teardown-cells");
