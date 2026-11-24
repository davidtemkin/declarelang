// A bundled page could not read how full the kernel's cell table was: kernelStats
// is internal to the runtime and the bundle exported only boot and observe, so an
// app that watched its own health had nothing to watch the next leak with (#35).
// kernelOccupancy is that number pair. page-api.test holds the bundle's export
// list to browser/declare-boot.d.ts, which is where a page learns it exists.
import assert from "node:assert/strict";
import { kernelOccupancy, kernelReady } from "../runtime/dist/reactive.js";
import { test, summarize } from "./harness.mjs";

await kernelReady();

await test("occupancy reads the cell table before and after a program takes cells", async () => {
  const empty = kernelOccupancy();
  assert.equal(empty.cells, 0);
  assert.ok(empty.capacity > 0, "capacity is the table itself, not a count of what is used");

  const { compile } = await import("../compiler/dist/compile-node.js");
  const { settleHeadless } = await import("../compiler/dist/headless.js");
  const r = await compile(`App [ width = 100, height = 100, total: number = 1,
    Text [ text = { "" + app.total } ]]`);
  assert.deepEqual((r.errors ?? []).map((e) => e.message), []);
  await settleHeadless(r.program);

  const used = kernelOccupancy();
  assert.ok(used.cells > 0, "a settled program holds cells");
  assert.ok(used.cells <= used.capacity, "a program cannot take more cells than the table holds");
  assert.equal(used.capacity, empty.capacity, "taking cells does not grow the table");
});

summarize();
