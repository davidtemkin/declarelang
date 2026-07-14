// docs — the no-drift invariant, mechanized (design/verify-and-evals.md §2.9;
// design-docs/designing-a-language-for-llms.md §5). A model believes the
// documents it is given, so documentation that drifts from the compiler is a
// correctness bug in the system, not a docs chore. This test compiles every
// COMPLETE program in the LLM-facing docs on every test run:
//
//   - ```declare fences are complete programs and MUST compile clean;
//   - ```declare-fragment fences are member/expression excerpts and are skipped.
//
// Covered files: docs/declare-for-llms.md (the brief — its authority depends
// on this test). The guide's runnable fences are validated separately by
// tools/prebuild.mjs (they become examples/docs/demos/seg_*.declare); folding
// that path into `npm test` is tracked in design/verify-and-evals.md.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compile } from "../compiler/dist/compile-node.js";
import { test, summarize } from "./harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const COVERED = [
  "docs/declare-for-llms.md",
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
}

summarize("docs");
