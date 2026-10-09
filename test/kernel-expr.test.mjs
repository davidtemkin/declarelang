// kernel-expr — every `{ }` body the kernel evaluates (bind.ts bindKernelExpr,
// compiler/src/expr-emit.ts) must land exactly what the JS body lands. Each
// corpus app boots twice — kernel EXPR on, then forced off — and every view's
// numeric slots are compared after the boot settle and after perturbations
// (host size, a few author writes). Bit-identical: the same IEEE arithmetic
// in the same order.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { settleHeadless } from "../compiler/dist/headless.js";
import { settle } from "../runtime/dist/index.js";
import { exprStats } from "../runtime/dist/bind.js";
import { ownValues } from "../runtime/dist/attributes.js";
import { View } from "../runtime/dist/view.js";

const ROOT = new URL("..", import.meta.url).pathname;
function snapshot(app) {
  const out = [];
  const walk = (n, path) => {
    if (n instanceof View) { const v = ownValues(n); for (const k of Object.keys(v).sort()) if (typeof v[k] === "number" || typeof v[k] === "boolean") out.push(`${path}.${k}=${v[k]}`); }
    let i = 0; for (const c of n.children) walk(c, `${path}/${c.constructor.name}${i++}`);
  };
  walk(app, "app");
  return out;
}
function drive(app, step) {
  if (step === 0) { app.hostWidth = 700; app.hostHeight = 500; }
  if (step === 1) { app.hostWidth = 1400; app.hostHeight = 900; }
  if (step === 2) { app.dark = !app.dark; }
  settle();
}
for (const name of ["weather", "desktop", "calendar", "homepage", "lzx-dashboard", "marketmap"]) {
  await test(`${name}: kernel EXPR ≡ JS bodies, boot + 3 perturbations`, async () => {
    const src = readFileSync(`${ROOT}apps/${name}/${name}.declare`, "utf8");
    const r = await compile(src, { originDir: `${ROOT}apps/${name}` });
    assert.ok(r.errors.length === 0, r.errors[0]?.message);
    const runs = [];
    for (const on of [true, false]) {
      exprStats.disabled = !on; exprStats.kernel = 0;
      const app = settleHeadless(r.program);
      const snaps = [snapshot(app)];
      for (let s = 0; s < 3; s++) { drive(app, s); snaps.push(snapshot(app)); }
      runs.push({ snaps, kernel: exprStats.kernel });
      app.discard();
    }
    exprStats.disabled = false;
    assert.ok(runs[0].kernel > 0, "no body bound in the kernel — the comparison would be vacuous");
    assert.equal(runs[1].kernel, 0);
    for (let s = 0; s < runs[0].snaps.length; s++) {
      const a = runs[0].snaps[s], b = runs[1].snaps[s];
      assert.equal(a.length, b.length, `step ${s}: slot count differs`);
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) assert.fail(`step ${s}: ${a[i]} (kernel) vs ${b[i]} (js)`);
    }
    console.log(`     ${name}: ${runs[0].kernel} bodies in the kernel, ${runs[0].snaps[0].length} slots compared × ${runs[0].snaps.length} steps`);
  });
}
// A NULLABLE number or boolean (`number | null`) is a kernel slot: null rides
// the cell's flag, `??` and `== null` run as kernel expressions, and a reader
// sees exactly what the JavaScript semantics give.
await test("a `number | null` slot is a kernel slot: null written, read, coalesced and compared in the kernel", async () => {
  const src = `App [ width = 400, height = 300,
    d: Dataset { { "n": null } },
    v: number | null = null,
    b: boolean? = null,
    w: number = { this.v ?? 7 },
    isNull: boolean = { this.v == null },
    flag: boolean = { this.b ?? true },
    box: View [ datapath = { app.d.value }, m: number | null = { :n } ] ]`;
  const r = await compile(src, { originDir: process.cwd() });
  assert.deepEqual(r.errors.map((e) => e.message), []);
  const app = settleHeadless(r.program); settle();
  const native = (n) => { const o = (app.$owners ?? {})[n]; return o !== undefined && o.isNative === true; };
  assert.ok(native("w") && native("isNull") && native("flag"), "`??` and `== null` are kernel expressions");
  assert.equal(app.v, null, "a null default");
  assert.equal(app.w, 7); assert.equal(app.isNull, true); assert.equal(app.b, null); assert.equal(app.flag, true);
  app.v = 0; settle();
  assert.equal(app.v, 0, "0 is a number, not null");
  assert.equal(app.w, 0, "0 ?? 7 is 0"); assert.equal(app.isNull, false);
  app.v = null; settle();
  assert.equal(app.w, 7, "back to null"); assert.equal(app.isNull, true);
  app.b = false; settle();
  assert.equal(app.flag, false, "false ?? true is false");
  assert.equal(app.box.m, null, "data's null arrives as null");
  app.d.set(["n"], 3); settle();
  assert.equal(app.box.m, 3);
  app.discard();
});

summarize("kernel-expr");

process.exit(process.exitCode ?? 0);   // the runtime keeps timers alive; the suite is done
