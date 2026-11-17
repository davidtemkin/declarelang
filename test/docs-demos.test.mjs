// docs-demos — every example the docs app runs beside a reference page compiles. They are
// programs a reader runs and an agent copies, so one left behind by a language change is a
// broken page. A file another demo includes (a class with no root) is checked as part of the
// demo that includes it, not on its own.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/docs/demos");
const files = readdirSync(DIR).filter((f) => f.endsWith(".declare"));
const included = new Set(files.flatMap((f) => [...readFileSync(resolve(DIR, f), "utf8").matchAll(/include\s*\[\s*"([^"]+\.declare)"/g)].map((m) => m[1])));

await test(`every docs demo compiles (${files.length - included.size} programs)`, async () => {
  const failed = [];
  for (const f of files) {
    if (included.has(f)) continue;
    const out = await compile(readFileSync(resolve(DIR, f), "utf8"), { originDir: DIR });
    const errors = out.errors.filter((e) => !/^(hint|warning)/.test(e.message));
    if (errors.length) failed.push(`${f}: ${errors[0].message.slice(0, 160)}`);
  }
  assert.deepEqual(failed, [], "a demo the docs app runs no longer compiles");
});

summarize("docs-demos");
