// A language method's declared reads (compiler/src/effects.ts) wire on the
// receiver the call names: `{ parent.bounds().width }`, `{ parent.footprint() }`
// and `{ parent.contentBox("width") }` follow the parent as it changes. The
// table's paths are written relative to `this`; they once reached the receiver
// unrebased, so the reads were never wired and each of these froze at its first
// value.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer } from "../runtime/dist/index.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";

provideMeasurer(approximateMeasurer());

for (const [name, expr] of [["bounds()", `parent.bounds().width - 56`], ["footprint()", `parent.footprint().width - 56`], ["contentBox()", `parent.contentBox("width")`]]) {
  await test(`a constraint through ${name} on the parent follows the parent`, async () => {
    const r = await compileProgram(`App [ width = 1000, height = 300, w: number = 800,
      main: View [ width = { app.w }, padding = [0, 28, 0, 28], col: View [ width = { ${expr} }, height = 10 ] ] ]`, { originDir: process.cwd() + "/library" });
    assert.deepEqual(r.errors.map((e) => e.message), []);
    const app = instantiate(r.program); settle();
    assert.equal(app.main.col.width, 744);
    app.w = 600; settle();
    assert.equal(app.main.col.width, 544, "it moved with the parent");
  });
}

summarize("effects-live");
