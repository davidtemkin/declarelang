// docs — the no-drift invariant, mechanized (docs/system-design/verify-and-evals.md §2.9;
// docs/system-design/designing-a-language-for-llms.md §5). A model believes the
// documents it is given, so documentation that drifts from the compiler is a
// correctness bug in the system, not a docs chore. This test compiles every
// COMPLETE program in the LLM-facing docs on every test run:
//
//   - ```declare fences are complete programs and MUST compile clean;
//   - ```declare-fragment fences are member/expression excerpts and are skipped.
//
// Covered files: evals/declare-for-llms.md (the eval control-arm brief — it
// lives under evals/ because that is its only remaining role; its fences must
// stay compiling for as long as it is the yardstick). The guide's runnable fences are validated separately by
// tools/internal/prebuild.mjs (they become apps/docs/demos/seg_*.declare); folding
// that path into `npm test` is tracked in docs/system-design/verify-and-evals.md.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compile } from "../compiler/dist/compile-node.js";
import { parseProgram } from "../runtime/dist/parser.js";
import { test, summarize } from "./harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const COVERED = [
  "docs/declare.md",
  "evals/declare-for-llms.md",
];

for (const rel of COVERED) {
  const md = readFileSync(resolve(HERE, "..", rel), "utf8");
  const programs = [...md.matchAll(/```declare\n([\s\S]*?)```/g)].map((m) => m[1]);

  await test(`${rel}: has complete programs to check`, () => {
    if (programs.length < 1) throw new Error("no ```declare fences found — extraction regex or doc structure changed");
  });

  for (const [i, src] of programs.entries()) {
    const head = src.trim().split("\n")[0].slice(0, 56);
    await test(`${rel} program ${i + 1}: ${head}`, () => {
      const out = compile(src, {});
      if (out.errors.length) {
        throw new Error(out.errors.map((e) => e.message).join("\n      "));
      }
    });
  }

  // ```declare-fragment fences are member excerpts — they can't COMPILE (they
  // reference surrounding context), but they must PARSE: a fragment is exactly
  // what a model copies, and unparseable documented syntax is the worst class
  // of doc/compiler drift (it shipped once: a "canonical typed method form"
  // the tokenizer rejects). Wrap each in an App body and demand a clean parse.
  const fragments = [...md.matchAll(/```declare-fragment\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (const [i, frag] of fragments.entries()) {
    const head = frag.trim().split("\n")[0].slice(0, 56);
    await test(`${rel} fragment ${i + 1} parses: ${head}`, () => {
      const body = frag.trimEnd().endsWith(",") ? frag : frag.trimEnd() + ",";
      parseProgram(`App [\n${body}\n]`);
    });
  }
}

// The dangling-link gate (docs/system-design/documentation.md §5): every
// `declare-docs:` symbolic link in the category-B corpus must resolve against
// the generated ID registry (tools/internal/doc/links.mjs) — a wrong target fails here,
// it never rots silently.
await test("declare-docs: links — every symbolic link resolves (links.mjs --check)", () => {
  const r = spawnSync(process.execPath, [resolve(HERE, "..", "tools/internal/doc/links.mjs"), "--check"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error((r.stdout + r.stderr).trim());
});

// The spine gate (docs/system-design/verification.md §5.2): the three assembled projections
// — declare-model.json, the marker-injected doc tables, the skill inventory —
// must match a fresh in-memory assembly of the live registries.
await test("spine: assembled projections are fresh (assemble.mjs --check)", () => {
  const r = spawnSync(process.execPath, [resolve(HERE, "..", "tools/internal/doc/assemble.mjs"), "--check"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error((r.stdout + r.stderr).trim());
});

summarize("docs");
