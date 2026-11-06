// Moving a program to a new release (docs/system-design/migration.md): the "Changes
// to make" a release's notes carry, read by tools/internal/changes.mjs and listed for
// a program by declare-changes; the corpus moved in the same change as the language
// (every Find comes up empty on it); and a program's declareVersion line, checked by
// the compiler.

import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { readChanges, findLines } from "../tools/internal/changes.mjs";
import { releases, plan, writtenFor } from "../tools/declare-changes.mjs";
import { compile } from "../compiler/dist/compile-node.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const all = releases(ROOT);

await test("the reader: an entry's heading, why, Find, before and after, docs and watch-for", () => {
  const [e] = readChanges([
    "# x", "", "## Changes to make", "", "### `a` → `b`", "Why it changed.", "", "Find: `/\\ba\\(/`", "",
    "```declare-fragment", "A [ a() { } ]", "```", "", "```declare-fragment", "A [ b() { } ]", "```", "",
    "Docs: [One](declare-docs:guide:controls@x) · [`A.b`](declare-docs:A.method.b)", "",
    "Watch for: something quiet.", "", "## After", "", "text",
  ].join("\n"));
  assert.deepEqual({ ...e, docs: e.docs.map((d) => d.href) }, {
    heading: "`a` → `b`", why: "Why it changed.", find: "/\\ba\\(/", before: "A [ a() { } ]", after: "A [ b() { } ]",
    docs: ["declare-docs:guide:controls@x", "declare-docs:A.method.b"], watch: "something quiet.",
  });
});

await test("a Find is a literal or a regular expression, and may span lines", () => {
  assert.deepEqual(findLines("x(", "a\nx(1)\nb x(2)"), [2, 3]);
  assert.deepEqual(findLines("/A\\s*\\[[^\\]]*\\binput\\(/", "A [\n  input(v) { }\n]"), [1]);
});

await test("every release's entries are complete: why, a before and an after, docs, and a Find that compiles", () => {
  for (const r of all) for (const e of r.entries) {
    const at = `${r.version} '${e.heading}'`;
    assert.ok(e.why !== "", `${at}: a sentence of why`);
    assert.ok(e.before !== null && e.after !== null, `${at}: the before and after fragments`);
    assert.ok(e.docs.length > 0, `${at}: a Docs: line`);
    if (e.find !== null && e.find.startsWith("/")) assert.doesNotThrow(() => findLines(e.find, ""), `${at}: its Find compiles`);
  }
});

await test("the corpus moved with the language: no release's Find matches the apps, the library or the docs", () => {
  const roots = ["apps", "library", "docs/guide", "docs/declare.md", "docs/operational", "docs/tenets", "skill"];
  const walk = (p) => statSync(p).isDirectory()
    ? readdirSync(p).flatMap((n) => (n === "dist" || n === "node_modules" ? [] : walk(join(p, n))))
    : /\.(declare|md)$/.test(p) ? [p] : [];
  const files = roots.flatMap((r) => walk(join(ROOT, r))).map((path) => ({ path, text: readFileSync(path, "utf8") }));
  const hits = plan({ since: null, files, all }).flatMap((e) => e.hits.map((h) => `${h.file.slice(ROOT.length + 1)}:${h.line} — ${e.heading}`));
  assert.deepEqual(hits, [], "the corpus still spells an old form");
});

await test("declare-changes on an old program: what applies, in its own files and its includes, its own subclasses too, and nothing from the library", () => {
  const main = join(ROOT, "test/fixtures/migration/old-app.declare");
  const out = execFileSync("node", ["tools/declare-changes.mjs", main, "--since", "0.5.3", "--json"], { cwd: ROOT, encoding: "utf8" });
  const r = JSON.parse(out);
  const applies = Object.fromEntries(r.entries.filter((e) => e.hits.length > 0).map((e) => [e.heading, e.hits.map((h) => `${h.file.split("/").pop()}:${h.line}`)]));
  assert.deepEqual(applies["`onInput` → `commit`"], ["old-app.declare:14"]);
  assert.deepEqual(applies["`input(v)` → `commit(v)` on a control with a value"], ["old-app.declare:10"]);
  assert.deepEqual(applies["`initial` → `value` with a `commit` that keeps the text"], ["old-parts.declare:3"]);
  assert.deepEqual(applies["`commitOn` → `\"each\"` or `\"end\"`"], ["old-parts.declare:3"]);
  // the program's own subclasses are found where the classes they extend are
  assert.deepEqual(applies["A field's `text` → `value`"], ["old-app.declare:13", "old-parts.declare:16"]);
  assert.deepEqual(applies["A control's value from your state → `<->`, or a `commit` beside it"], ["old-app.declare:10", "old-parts.declare:17"]);
  assert.deepEqual(applies["Names a value control now has, declared by your own class"], ["old-parts.declare:7"]);
  assert.equal(r.entries.some((e) => e.hits.some((h) => h.file.includes("/library/"))), false);
});

await test("--done writes the declareVersion line, once; a migrated program's list starts after it", () => {
  const dir = mkdtempSync(join(tmpdir(), "declare-changes-"));
  const f = join(dir, "app.declare");
  copyFileSync(join(ROOT, "test/fixtures/migration/old-app.declare"), f);
  execFileSync("node", [join(ROOT, "tools/declare-changes.mjs"), "--done", f], { encoding: "utf8" });
  execFileSync("node", [join(ROOT, "tools/declare-changes.mjs"), "--done", f], { encoding: "utf8" });
  const text = readFileSync(f, "utf8");
  assert.equal(writtenFor(text), VERSION);
  assert.equal(text.match(/declareVersion/g).length, 1);
  assert.equal(plan({ since: writtenFor(text), files: [{ path: f, text }], all }).length, 0);
});

const diags = async (src) => (await compile(src, { originDir: ROOT, mainId: "app.declare" })).diagnostics ?? [];
await test("declareVersion: a newer release is an error, an older one a note naming declare-changes, the same one nothing", async () => {
  const [maj, min] = VERSION.split(".").map(Number);
  const newer = await diags(`declareVersion [ "${maj}.${min + 1}" ]\nApp [ ]`);
  assert.ok(newer.some((d) => d.code === "DECLARE2008" && d.severity === "error"));
  const older = await diags(`declareVersion [ "0.1" ]\nApp [ ]`);
  assert.ok(older.some((d) => d.code === "DECLARE2009" && /declare-changes app\.declare/.test(d.message)));
  const same = await diags(`declareVersion [ "${maj}.${min}" ]\nApp [ ]`);
  assert.equal(same.some((d) => /DECLARE200[89]/.test(d.code)), false);
  const twice = await compile(`declareVersion [ "${VERSION}" ]\ndeclareVersion [ "${VERSION}" ]\nApp [ ]`, { originDir: ROOT });
  assert.ok((twice.errors ?? []).length > 0, "a second declareVersion is refused");
});

summarize("changes");
