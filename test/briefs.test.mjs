// test/briefs.test.mjs — the task briefs (docs/briefs) are what an agent reads when
// it reaches the part of a program one covers, so everything in one must be true
// of the tree it ships in:
// its snippet compiles and boots, every name it sends the agent to look up
// answers in declare-help, every example it cites exists and holds the symbol
// it names, and every guide section it points to is a real heading. A brief also
// stays short: past the ceiling it has become a chapter.

import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize } from "./harness.mjs";
import { settleHeadless } from "../compiler/dist/compile-node.js";
import { compileProgram } from "../compiler/dist/declarec.js";
import { readBriefs } from "../tools/internal/doc/briefs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CEILING = 3600;                       // bytes: a brief, not a chapter
const briefs = readBriefs(ROOT);

// the guide's chapters by the name the docs rail shows (the `nav:` line)
const CHAPTERS = {};
for (const f of readdirSync(join(ROOT, "docs/guide")).filter((f) => f.endsWith(".md"))) {
  const src = readFileSync(join(ROOT, "docs/guide", f), "utf8");
  const nav = src.match(/^<!-- nav: (.+?) -->/)?.[1];
  if (nav) CHAPTERS[nav] = [...src.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1].replace(/`/g, "").trim());
}

const para = (text, label) => (text.match(new RegExp(`\\*\\*${label}\\*\\*([\\s\\S]*?)(?:\\n\\n|$)`)) ?? [, ""])[1].replace(/\s+/g, " ").trim();

const help = (name) => new Promise((res) => execFile(process.execPath, [join(ROOT, "tools/declare-help.mjs"), name, "--json"],
  { cwd: ROOT }, (err) => res(err ? (err.code ?? 1) : 0)));

await test("every brief has its parts, and stays a brief", () => {
  assert.ok(briefs.length >= 20, `found ${briefs.length} briefs`);
  for (const b of briefs) {
    assert.ok(b.index !== "", `${b.name}: no <!-- index: … --> line`);
    assert.ok(b.useWhen !== "", `${b.name}: no **Use when**`);
    for (const label of ["Rules", "Look up", "Examples", "Guide"]) {
      assert.ok(b.text.includes(`**${label}**`), `${b.name}: no **${label}**`);
    }
    assert.ok(Buffer.byteLength(b.text) <= CEILING, `${b.name}: ${Buffer.byteLength(b.text)} bytes, past the ${CEILING}-byte ceiling`);
  }
});

await test("every brief's snippet compiles and boots", async () => {
  for (const b of briefs) {
    for (const m of b.text.matchAll(/```declare\n([\s\S]*?)```/g)) {
      const r = await compileProgram(m[1], { originDir: ROOT });
      assert.deepEqual((r.errors ?? []).map((e) => e.message), [], `${b.name}: the snippet does not compile`);
      const app = settleHeadless(r.program);
      app.discard();
    }
  }
});

await test("every name a brief sends the agent to look up answers in declare-help", async () => {
  const names = new Map();
  for (const b of briefs) {
    for (const m of para(b.text, "Look up").matchAll(/`([A-Za-z][A-Za-z0-9.]*)`/g)) names.set(m[1], b.name);
  }
  const misses = [];
  const queue = [...names.keys()];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) { const n = queue.shift(); if (await help(n) !== 0) misses.push(`${names.get(n)}: ${n}`); }
  }));
  assert.deepEqual(misses, [], "names with no answer");
});

await test("every example a brief cites exists and holds the symbol it names", () => {
  for (const b of briefs) {
    for (const part of para(b.text, "Examples").split(" · ")) {
      const path = part.match(/`((?:apps|library)\/[^`]+)`/)?.[1];
      if (!path) continue;
      assert.ok(existsSync(join(ROOT, path)), `${b.name}: ${path} does not exist`);
      if (path.endsWith("/")) continue;
      const src = readFileSync(join(ROOT, path), "utf8");
      for (const m of part.slice(part.indexOf(path) + path.length).matchAll(/`([A-Za-z][A-Za-z0-9_]*)`/g)) {
        assert.ok(new RegExp(`\\b${m[1]}\\b`).test(src), `${b.name}: ${path} has no '${m[1]}'`);
      }
    }
  }
});

await test("every guide section a brief points to is a real heading", () => {
  for (const b of briefs) {
    let chapter = null;
    for (const raw of para(b.text, "Guide").replace(/\.$/, "").split(" · ")) {
      const part = raw.replace(/\s*\([^)]*\)/g, "").trim();
      const [ch, sec] = part.startsWith("§") ? [chapter, part.slice(1).trim()] : part.split(" § ").map((s) => s.trim());
      chapter = ch;
      assert.ok(CHAPTERS[ch] !== undefined, `${b.name}: no guide chapter '${ch}'`);
      if (sec) assert.ok(CHAPTERS[ch].includes(sec.replace(/`/g, "")), `${b.name}: '${ch}' has no section '${sec}'`);
    }
  }
});

summarize("briefs");
