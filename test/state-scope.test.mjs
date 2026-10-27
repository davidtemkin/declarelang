// What a name means inside a State (docs/declare.md §10; compile.ts
// resolveElement, typecheck.ts walkElement). The runtime runs a State's
// override values on the VIEW — `this` the view, `parent` the view's parent —
// and mounts its children onto the view; `applied`, the State's own
// declarations and its handlers are the State's, `this` the State. The
// compiler resolves and types each the way it runs: a bare name in an override
// is the view's (it once skipped the view and read its parent's, silently).
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer } from "../runtime/dist/index.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";

provideMeasurer(approximateMeasurer());

const compile = (src) => compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
const A = (inner, extra = "") => `App [ width = 400, height = 300, on: boolean = true, ${extra}
    box: View [ width = 100, height = 10, mark: number = 5, ${inner} ] ]`;
async function boot(src) {
  const r = await compile(src);
  assert.deepEqual(r.errors.map((e) => e.message), []);
  const app = instantiate(r.program);
  settle();
  return app;
}
const codes = async (src) => (await compile(src)).errors.map((e) => e.code);

await test("an override value is the view's: this, a bare name, the view's own member — even where the App has one of the same name", async () => {
  assert.equal((await boot(A(`State [ applied = { app.on }, height = { this.width } ]`))).box.height, 100);
  assert.equal((await boot(A(`State [ applied = { app.on }, height = { width + 1 } ]`))).box.height, 101);
  assert.equal((await boot(A(`State [ applied = { app.on }, height = { mark } ]`))).box.height, 5);
  assert.equal((await boot(A(`State [ applied = { app.on }, height = { mark } ]`, "mark: number = 50,"))).box.height, 5, "not the App's mark");
});

await test("in an override, parent is the view's parent; in applied, it is the view", async () => {
  assert.equal((await boot(A(`State [ applied = { app.on }, height = { parent.width } ]`))).box.height, 400);
  assert.equal((await boot(A(`State [ applied = { parent.mark > 0 }, height = 33 ]`))).box.height, 33);
});

await test("a State's children read the view as their own place, an exists'd child too", async () => {
  assert.equal((await boot(A(`State [ applied = { app.on }, c: View [ width = { mark * 2 }, height = 4 ] ]`))).box.c.width, 10);
  assert.equal((await boot(A(`c: View [ exists = { app.on }, width = { mark * 3 }, height = 4 ]`))).box.c.width, 15);
});

await test("the State's own: applied, its declarations and its handlers keep the State as this", async () => {
  const app = await boot(A(`State [ applied = { app.on }, onApply() { app.seen = this.applied ? "on" : "off" } ]`, 'seen: string = "",'));
  assert.equal(app.seen, "on");
  const w = await boot(`class Wide extends State [ threshold: number = 100, applied = { parent.width > threshold } ]
App [ width = 400, height = 300, box: View [ width = 150, height = 10, Wide [ height = 77 ] ] ]`);
  assert.equal(w.box.height, 77, "a State class's own threshold, read in its applied");
});

await test("a State's own member read bare in an override is DECLARE4028; a method the State does not have is DECLARE4029", async () => {
  assert.deepEqual(await codes(A(`State [ applied = { app.on }, k: number = 7, height = { k } ]`)), ["DECLARE4028"]);
  assert.deepEqual(await codes(A(`State [ applied = { app.on }, height = { applied ? 1 : 2 } ]`)), ["DECLARE4028"]);
  assert.deepEqual(await codes(A(`State [ applied = { app.on }, f() -> number { return 1 } ]`)), ["DECLARE4029"]);
  assert.deepEqual(await codes(A(`State [ applied = { app.on }, onApply() { }, onRemove() { } ]`)), [], "its handlers are its own");
});

await test("a State in a class body reaches the class's members, as before", async () => {
  const app = await boot(`class C extends View [ width = 100, height = 10, z: number = 9, State [ applied = { true }, height = { z * 2 } ] ]
App [ width = 400, height = 300, box: C [ ] ]`);
  assert.equal(app.box.height, 18);
});

summarize("state-scope");
