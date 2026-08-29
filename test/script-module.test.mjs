// script-module — `script [ "file.ts" ]` and ES `import` inside `script { }`
// (composition.md §2, ratified 2026-08-24). The contract under test:
//   • a script FILE splices in as a synthesized block — the resolver, checker,
//     transpile and runtime never know the difference; `export` on declarations
//     is the module idiom, stripped at the splice;
//   • the dependency CLOSURE records the file (dev-loop freshness for free);
//   • `import` is real wherever the compile host can bundle (Node); a host
//     without a bundler refuses with the reason, never silently drops;
//   • the bundled module evaluates once and its bindings reach every body.
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { compile, compileTracked } from "../compiler/dist/compile-node.js";
import { compile as compileCore } from "../compiler/dist/compile.js";
import { parseProgram } from "../runtime/dist/parser.js";
import { instantiate, settle } from "../runtime/dist/index.js";
import { test, summarize } from "./harness.mjs";

const DIR = mkdtempSync(join(os.tmpdir(), "declare-script-"));
const F = (name, content) => { writeFileSync(join(DIR, name), content); return name; };

async function run(src) {
  const r = await compile(src, { originDir: DIR });
  assert.ok(r.source, "compile: " + r.errors.map((e) => e.message).join("; "));
  const app = instantiate(parseProgram(r.source));
  settle();
  return app;
}

F("helpers.ts", `export function double(n: number) { return n * 2 }
export const RATE = 3
`);

await test("script [ \"file.ts\" ]: the file's declarations reach every body, through the real runtime", async () => {
  const app = await run(`script [ "helpers.ts" ]
App [ v: number = 10, t: Text [ text = { "d=" + double(app.v) + " r=" + RATE } ] ]`);
  assert.equal(app.t.text, "d=20 r=3");
});

await test("a library include may carry its own script [ ] — resolved against the LIBRARY's dir", async () => {
  writeFileSync(join(DIR, "roomlib.ts"), `export function tag(s: string) { return "[" + s + "]" }\n`);
  writeFileSync(join(DIR, "room.declare"), `script [ "roomlib.ts" ]\nclass Room extends View [ lbl: Text [ text = { tag("r") } ] ]\n`);
  const app = await run(`include [ "room.declare" ]\nApp [ r: Room [ ] ]`);
  assert.equal(app.r.lbl.text, "[r]");
});

await test("the dependency closure records the script file — the dev loop's freshness covers it", async () => {
  const main = join(DIR, "m.declare");
  writeFileSync(main, `script [ "helpers.ts" ]\nApp [ t: Text [ text = { "" + RATE } ] ]`);
  const r = await compileTracked(`script [ "helpers.ts" ]\nApp [ t: Text [ text = { "" + RATE } ] ]`, { originDir: DIR, mainId: main });
  assert.ok(r.source);
  const files = r.closure.entries.filter((e) => e.kind === "file").map((e) => e.id);
  assert.ok(files.some((f) => f.endsWith("/helpers.ts")), JSON.stringify(files));
});

await test("a missing script file is a positioned error, like a missing include", async () => {
  const r = await compile(`script [ "nope.ts" ]\nApp [ ]`, { originDir: DIR });
  assert.equal(r.source, null);
  assert.match(r.errors[0].message, /cannot find include "nope\.ts"/);
});

await test("import: an inline block and a script file import the same relative module; the bundle serves both", async () => {
  F("geo.ts", `export function tri(n: number) { return (n * (n + 1)) / 2 }\n`);
  F("labels.ts", `import { tri } from "./geo.ts"
export function triLabel(n: number) { return "tri=" + tri(n) }
`);
  const app = await run(`script [ "labels.ts" ]
script {
  import { tri } from "./geo.ts"
  function twice(n: number) { return tri(n) * 2 }
}
App [ v: number = 4, t: Text [ text = { triLabel(app.v) + " twice=" + twice(app.v) } ] ]`);
  assert.equal(app.t.text, "tri=10 twice=20");
});

await test("a host with no bundler REFUSES an import with the reason — never a silent drop", async () => {
  // the CORE compile with an in-memory host (a browser-shaped compile): the
  // include resolves, the import cannot.
  const host = {
    resolve(fromDir, p) {
      if (p !== "labels.ts") return null;
      return { canonical: "/labels.ts", dir: "/", source: `import { tri } from "./geo.ts"\nexport function triLabel(n: number) { return "" + tri(n) }\n` };
    },
  };
  const r = await compileCore(`script [ "labels.ts" ]\nApp [ t: Text [ text = { triLabel(3) } ] ]`, { host, originDir: "/" });
  assert.equal(r.source, null);
  assert.ok(r.errors.some((e) => /import needs a compile host with a bundler/.test(e.message)), r.errors.map((e) => e.message).join("; "));
});

await test("the bundled module evaluates ONCE — module state is shared across bodies", async () => {
  F("counter.ts", `let n = 0
export function next() { n = n + 1; return n }
`);
  const app = await run(`script [ "counter.ts" ]
App [ t: Text [ text = "x", onClick() { this.text = "" + next() + next() } ] ]`);
  app.t.onClick(); settle();
  assert.equal(app.t.text, "12", "one module instance, advancing");
});

rmSync(DIR, { recursive: true, force: true });
summarize("script-module");
