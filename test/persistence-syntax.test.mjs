import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { build, Persistence } from "../runtime/dist/index.js";
import { bindPersistence } from "../runtime/dist/persistence/node.js";

const source = (attrs = 'key = "note"', body = "", schema = "") => `${schema}
App [ got: number = 0,
  db: Dataset [ ${schema ? "schema = Note," : ""} disk: Persistence [ ${attrs} ${body} ] ] { { "n": 0 } }
]`;
const errors = async text => (await compile(text)).errors.map(e => e.message).join("\n");

await test("P01 legal typed and untyped policies construct one named nonvisual child", async () => {
  for (const schema of ["", "schema Note [ n: number ]"]) {
    const r = await compile(source('key = "note"', "", schema));
    assert.deepEqual(r.errors, []); const app = build(r.source);
    assert.ok(app.db.disk instanceof Persistence); assert.equal(app.db.disk.parent, app.db);
    assert.equal(app.db.children.length, 1); assert.equal(app.db.disk.classroot, app);
    assert.equal(app.db.disk.key, "note"); assert.equal(app.db.disk.saved, false);
    assert.throws(() => app.db.disk.commit(), /not bound/, "shell cannot pretend to save");
  }
});
await test("ordinary Dataset and schema checks remain unchanged", async () => {
  assert.equal(await errors('App [ db: Dataset { null } ]'), "");
  assert.equal(await errors('App [ db: Dataset [ contents = { ({ n: 1 }) } ] ]'), "");
  const invalid = await compile('schema Note [ n: number ] App [ db: Dataset [ schema = Note, disk: Persistence [key="a"] ] { {"n":"bad"} } ]');
  assert.throws(() => build(invalid.source), /does not match the schema/);
});
await test("misplaced, duplicate, unnamed and competing-source policies fail", async () => {
  const cases = [
    'App [ disk: Persistence [ key="a" ] ]',
    'App [ db: Dataset [ Persistence [ key="a" ] ] { null } ]',
    'App [ db: Dataset [ a: Persistence [key="a"], b: Persistence [key="b"] ] { null } ]',
    'App [ db: DataSource [ disk: Persistence [key="a"] ] ]',
    'App [ db: Dataset [ contents={null}, disk: Persistence [key="a"] ] ]',
    'App [ db: Dataset [ disk: Persistence [key="a"] ] ]',
    'App [ db: Dataset [ child: Node [] ] {null} ]',
    'App [ db: Dataset [ run() {}, disk: Persistence [key="a"] ] {null} ]',
    source('key="a"', ', x: number = 1'),
    source('key="a"', ', child: Node []'),
  ];
  for (const text of cases) assert.notEqual(await errors(text), "", text);
});
await test("invalid static keys, enum members and delays have source diagnostics", async () => {
  for (const attrs of ["", 'key=""', `key="${"é".repeat(513)}"`, 'key="a",save="sometimes"',
    'key="a",conflict="merge"', 'key="a",delay=-1', 'key="a",delay=1001', 'key="a",maxDelay=-1']) {
    const r = await compile(source(attrs)); assert.ok(r.errors.length, attrs);
    assert.ok(r.errors.every(e => e.pos), "diagnostics identify source locations");
  }
  assert.equal(await errors(source('key="a",delay={5},maxDelay=10')), "");
});
await test("facts, candidate fields, command types and result records are checked", async () => {
  const schema = "schema Note [ n: number ]";
  const bad = [
    ', onInit() { this.saved = true }',
    ', onInit() { if (this.candidate) this.candidate.n = 1 }',
    ', onInit() { const s: string = this.commit() }',
    ', onResult(r: string) { app.got = 1 }',
    ', onResult(r: PersistenceResult) { r.ok = true }',
    ', onResult(r: PersistenceResult) { app.got = r.missing }',
  ];
  for (const body of bad) assert.notEqual(await errors(source('key="a"', body, schema)), "", body);
  assert.equal(await errors(source('key="a"', ', onResult(r: PersistenceResult) { if (r.ok && this.candidate) app.got = this.candidate.n + (parent.value ? parent.value.n : 0) }', schema)), "");
});
await test("handler scope and numeric commands use the injected engine seam", async () => {
  const r = await compile(source('key="a"', ', onResult(r: PersistenceResult) { app.got = r.requestId + (parent.value ? parent.value.n : 0) }'));
  assert.deepEqual(r.errors, []); const app = build(r.source);
  bindPersistence(app.db.disk, { commit: () => 17 });
  assert.equal(app.db.disk.commit(), 17);
  app.db.disk.onResult({ requestId: 3 }); assert.equal(app.got, 3);
  assert.throws(() => { app.db.disk.saved = true; }, /read.?only/i);
});
summarize("persistence-syntax");
