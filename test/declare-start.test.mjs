// declare-start (tools/declare-start.mjs) and declare-check (tools/declare-check.mjs):
// the skill's table is the menu --pick takes, every section a row cites exists, a pick
// writes what its rows point at once each, and the checker is asked what checking.md says.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tool = (name, ...a) => spawnSync(process.execPath, [join(ROOT, "tools", name), ...a], { cwd: ROOT, encoding: "utf8" });
const SKILL = readFileSync(join(ROOT, "skill/SKILL.md"), "utf8");
const rows = SKILL.slice(SKILL.indexOf("| Pick |")).split("\n").slice(2).filter((l) => l.startsWith("| "));

await test("every row of the skill's table has a Pick name, and the names are distinct", () => {
  const ids = rows.map((l) => /^\| `([a-z-]+)` \|/.exec(l)?.[1]);
  assert.ok(ids.every(Boolean), "a row without a name");
  assert.equal(new Set(ids).size, ids.length, "a name used twice");
  const r = tool("declare-start.mjs", "--list");
  assert.equal(r.status, 0, r.stderr);
  for (const id of ids) assert.match(r.stdout, new RegExp(`\\b${id}\\b`));
});

await test("every guide section a row cites is a heading in that chapter", () => {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const l of rows) {
    const guide = l.split(" | ")[2] ?? "";
    for (const part of guide.split(";")) {
      const file = /`(\d\d-[a-z0-9-]+\.md)`/.exec(part)?.[1];
      if (!file) continue;
      const text = readFileSync(join(ROOT, "docs/guide", file), "utf8");
      const heads = text.split("\n").filter((x) => /^#{2,4} /.test(x)).map((x) => norm(x.replace(/^#+ /, "")));
      for (const m of part.matchAll(/§ ([^§;()]+?)(?=\s*(?:,\s*§|\(|\)|;|$))/g)) {
        assert.ok(heads.includes(norm(m[1].trim().replace(/[,.]$/, ""))), `${file} has no section "${m[1].trim()}" (cited in the skill's table)`);
      }
    }
  }
});

await test("a pick writes its rows' sections, names and program outline — a section inside another once", () => {
  const out = tempDir("declare-start-");
  const r = tool("declare-start.mjs", "--pick", "form,touch", "--program", "calendar", "--out", out);
  assert.equal(r.status, 0, r.stderr);
  const guide = readFileSync(join(out, "guide.md"), "utf8");
  assert.match(guide, /Pan and zoom about the fingers/);
  assert.match(guide, /\(Editing text, and forms\)/);
  assert.doesNotMatch(guide, /lines \d+–\d+ \(A form\)/, "a section inside a chosen one is not added again");
  assert.match(readFileSync(join(out, "reference.md"), "utf8"), /`declare-help Form`/);
  assert.match(readFileSync(join(out, "program.md"), "utf8"), /apps\/calendar\/calendar\.declare/);
  assert.match(r.stdout, /guide\.md[\s\S]*reference\.md[\s\S]*program\.md/);
});

await test("a name the table does not have is refused, with the names it does", () => {
  const r = tool("declare-start.mjs", "--pick", "nope");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no need called nope — --pick takes: layout,/);
});

await test("declare-check asks the checker what checking.md says, with the question and the program", () => {
  const r = tool("declare-check.mjs", "does adding a task work on a phone?", "--program", "apps/todo/todo.declare", "--print-prompt");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /docs\/operational\/checking\.md — the section "For the checker"/);
  assert.match(r.stdout, /Question: does adding a task work on a phone\?/);
  assert.match(r.stdout, /Program: .*apps\/todo\/todo\.declare/);
  assert.match(r.stdout, /never change the program's files/);
  assert.ok(existsSync(join(ROOT, "docs/operational/checking.md")));
});

summarize("declare-start");
