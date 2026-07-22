// PR A — the block seam. Tests the plugin module + parser/check/instantiate
// dispatch. Runs against built dist/ (npm run build first). Matches
// test/unit.test.mjs's harness usage.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { assembleBlocks, posOf, dispatchBlockChecks } from "../runtime/dist/plugin.js";

// A trivial code-bodied fixture plugin used across the suite: `note Name { text }`.
const notePlugin = {
  name: "note",
  blocks: [{
    keyword: "note",
    bodyKind: "code",
    parse(p) {
      p.expect("ident", "'note'");
      const name = p.expect("ident", "the note's name");
      const body = p.expect("code", "a { … } note body");
      return { kind: "note", keyword: "note", name: name.text, text: body.str ?? "", bodyOffset: body.pos.offset + 1, pos: name.pos };
    },
    check(node, ctx) {
      // Demonstrates the namespace facet + interior positions.
      if (ctx.nameTaken(node.name)) {
        return [{ message: `note '${node.name}' collides with an existing declaration`, pos: node.pos }];
      }
      if (node.text.includes("BAD")) {
        const rel = node.text.indexOf("BAD");
        return [{ message: "note body contains BAD", pos: ctx.posAt(node.bodyOffset + rel) }];
      }
      return [];
    },
    instantiate() {},
  }],
};

await test("assembleBlocks maps keyword → BlockPlugin", () => {
  const map = assembleBlocks([notePlugin]);
  assert.equal(map.get("note").keyword, "note");
  assert.equal(map.size, 1);
});

await test("assembleBlocks rejects a duplicate keyword across plugins", () => {
  const other = { name: "note2", blocks: [{ keyword: "note", bodyKind: "code", parse() {}, check() { return []; }, instantiate() {} }] };
  assert.throws(() => assembleBlocks([notePlugin, other]), /note/);
});

await test("assembleBlocks rejects a keyword shadowing a built-in", () => {
  const bad = { name: "x", blocks: [{ keyword: "stylesheet", bodyKind: "code", parse() {}, check() { return []; }, instantiate() {} }] };
  assert.throws(() => assembleBlocks([bad]), /stylesheet/);
});

await test("posOf maps an offset to 1-based line/col", () => {
  const src = "ab\ncd";
  assert.deepEqual(posOf(src, 0), { line: 1, col: 1, offset: 0 });
  assert.deepEqual(posOf(src, 3), { line: 2, col: 1, offset: 3 });
  assert.deepEqual(posOf(src, 4), { line: 2, col: 2, offset: 4 });
});

await test("posOf clamps the scan but keeps the raw offset when past end", () => {
  assert.deepEqual(posOf("ab\ncd", 100), { line: 2, col: 3, offset: 100 });
});

await test("dispatchBlockChecks positions an interior error and detects collisions (pure)", () => {
  const map = assembleBlocks([notePlugin]);
  // Interior BAD in a single block, no collisions.
  const src = "note N { xx BAD yy }";
  const node = { kind: "note", keyword: "note", name: "N", pos: { line: 1, col: 1, offset: 0 }, text: " xx BAD yy ", bodyOffset: 8 };
  const errs = dispatchBlockChecks([node], map, src, {}, new Set());
  assert.equal(errs.length, 1);
  assert.deepEqual(errs[0].pos, { line: 1, col: 13, offset: 12 });

  // Block name already taken (e.g. by a class/stylesheet) → collision.
  const n2 = { kind: "note", keyword: "note", name: "Dupe", pos: { line: 1, col: 1, offset: 0 }, text: " ok ", bodyOffset: 8 };
  const coll = dispatchBlockChecks([n2], map, "note Dupe { ok }", {}, new Set(["Dupe"]));
  assert.ok(coll.some((e) => /collides/.test(e.message)));

  // Two blocks of one name → the second collides (seen-set).
  const a = { kind: "note", keyword: "note", name: "Same", pos: { line: 1, col: 1, offset: 0 }, text: " a ", bodyOffset: 8 };
  const b = { kind: "note", keyword: "note", name: "Same", pos: { line: 2, col: 1, offset: 20 }, text: " b ", bodyOffset: 28 };
  const dup = dispatchBlockChecks([a, b], map, "x", {}, new Set());
  assert.equal(dup.filter((e) => /collides/.test(e.message)).length, 1);
});

export { notePlugin };
summarize("plugin");
