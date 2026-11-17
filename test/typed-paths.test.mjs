// typed-paths — a `:path` read inside `{ }` has the type its schema gives the field, as a
// bare `:path` and the typed `.value` chain already did. The type reaches the body through
// `this` in the check block's header, so the body's text — and every position in it — is
// left as written. Data of no declared shape stays untyped.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { parseProgram } from "../runtime/dist/parser.js";
import { instantiate, settle } from "../runtime/dist/index.js";
import { applyDeps } from "../runtime/dist/deps.js";

async function errorsOf(src) {
  return (await compile(src, {})).errors.map((e) => e.message);
}
async function boot(src) {
  const r = await compile(src, {});
  assert.equal(r.errors.length, 0, "compiles: " + r.errors.map((e) => e.message).join("; "));
  const program = parseProgram(r.source);
  applyDeps(program, r.deps);
  const app = instantiate(program);
  settle();
  return app;
}

// one record under a datapath, with each kind of field
const withTask = (inner, extra = "") => `schema Task [ id: string, title: string, done: boolean, tone: string, note?: string, tags[]: string ]
App [ width = 300, height = 200,${extra}
    tasks: Dataset [ schema = [ items[]: Task ] ] { { "items": [ { "id": "a", "title": "Post", "done": false, "tone": "#123456", "tags": ["x"] } ] } },
    col: View [ datapath = { app.tasks.value },
        row: View [ datapath = :items[0], width = 100, height = 20,
            ${inner} ] ] ]`;

await test("a braced :path read has its field's type: a boolean in arithmetic and a string headed for a color are refused", async () => {
  const errs = await errorsOf(withTask(`Text [ text = { String(:done * 2) } ], View [ width = 5, height = 5, fill = { :tone } ]`));
  assert.ok(errs.some((m) => /left operand of this arithmetic is not a number/.test(m)), errs.join("\n"));
  assert.ok(errs.some((m) => /'fill' computes a string.*read it as one with Color\.from/.test(m)), errs.join("\n"));
});

await test("an optional field reads as possibly null; reading it with a fallback is clean", async () => {
  const bad = await errorsOf(withTask(`Text [ text = { :note.toUpperCase() } ]`));
  assert.ok(bad.some((m) => /null|undefined/.test(m)), bad.join("\n"));
  assert.deepEqual((await errorsOf(withTask(`Text [ text = { (:note ?? "").toUpperCase() + :tags.join(",") } ]`))).filter((m) => !/^hint/.test(m)), []);
});

await test("a declared default's :path read is checked, by name and by type", async () => {
  const misspelled = await errorsOf(withTask(`Text [ t: string = { :titel }, text = { this.t } ]`));
  assert.ok(misspelled.some((m) => /'titel' is not in the schema here/.test(m)), misspelled.join("\n"));
  const wrongType = await errorsOf(withTask(`Text [ n: number = { :title }, text = "x" ]`));
  assert.ok(wrongType.length > 0, "a string read into a number declaration is refused");
});

await test("data of no declared shape stays untyped", async () => {
  const errs = await errorsOf(`App [ width = 200, height = 100,
    d: Dataset { { "items": [ { "n": 2 } ] } },
    col: View [ datapath = { app.d.value }, row: View [ datapath = :items[0], Text [ text = { String(:n * 2 + :anything) } ] ] ] ]`);
  assert.deepEqual(errs.filter((m) => !/^hint/.test(m)), []);
});

// The type reaches the body through its header, never by editing the body: a color literal
// in the same body as a typed read still becomes its number where it stands.
await test("a typed read beside a color literal leaves the body intact, and the program runs", async () => {
  const app = await boot(withTask(`v: View [ width = 5, height = 5, fill = { :done ? "#FF0000" : "#00FF00" } ],
            Text [ text = { :title + " · " + (:note ?? "no note") } ]`));
  assert.equal(app.col.row.v.fill, 0x00FF00);
  assert.equal(app.col.row.children.find((c) => c !== app.col.row.v).text, "Post · no note");
});

await test("a lookup that leaves out a kind its key can take says so, not 'declare it'", async () => {
  const errs = await errorsOf(`schema Foe [ kind: "a" | "b" ]
class A extends View [ ]
class B extends View [ ]
App [ width = 100, height = 100,
    d: Dataset [ schema = [ foes[]: Foe ] ] { { "foes": [ { "kind": "a" } ] } },
    col: View [ datapath = { app.d.value }, View [ datapath = :foes[], classFor = { ({ a: A })[:kind] ?? B } ] ] ]`);
  const m = errs.find((x) => /'b' is not a member of/.test(x)) ?? "";
  assert.match(m, /add that entry, or type the lookup Record<string, …>/, errs.join("\n"));
  assert.doesNotMatch(m, /declare it/);
});

summarize("typed-paths");
