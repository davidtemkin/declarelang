// docs — the no-drift invariant, mechanized (docs/system-design/verify-and-evals.md §2.9;
// docs/system-design/designing-a-language-for-llms.md §5). A model believes the
// documents it is given, so documentation that drifts from the compiler is a
// correctness bug in the system, not a docs chore. This test compiles every
// COMPLETE program in the LLM-facing docs on every test run:
//
//   - ```declare fences are complete programs and MUST compile clean;
//   - ```declare-fragment fences are member/expression excerpts and are skipped.
//
// NOT covered, deliberately: evals/baselines/declare-for-llms-2026-07.md. It is a
// FROZEN eval baseline, and compiling its fences here was a trap — as the language
// moves the test goes red, and the repair is to edit the baseline, which silently
// invalidates every measurement ever taken against it. A frozen artifact must be
// allowed to rot; that is what makes it a control.
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compile } from "../compiler/dist/compile-node.js";
import { parseProgram } from "../runtime/dist/parser.js";
import { test, summarize } from "./harness.mjs";
import { SURFACES, everySpineSectionHasASurface } from "../tools/internal/doc/surfaces.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// COVERED delivers the corpus-wide promise (AREPO-7, docs/README.md, CONTRIBUTING):
// every ```declare fence in the teaching prose is a complete program the compiler
// accepts — the guide, the operational pages, the tenets, and the front doors,
// enumerated by directory so a NEW chapter is covered the day it lands.
const HERE_ROOT = resolve(HERE, "..");
const COVERED = [
  "docs/declare.md",
  "apps/homepage/getstarted.md",
  "README.md",
  "CONTRIBUTING.md",
  ...readdirSync(resolve(HERE_ROOT, "docs/guide")).filter((f) => f.endsWith(".md")).map((f) => `docs/guide/${f}`),
  ...readdirSync(resolve(HERE_ROOT, "docs/operational")).filter((f) => f.endsWith(".md")).map((f) => `docs/operational/${f}`),
  ...readdirSync(resolve(HERE_ROOT, "docs/tenets")).filter((f) => f.endsWith(".md")).map((f) => `docs/tenets/${f}`),
];

for (const rel of COVERED) {
  const md = readFileSync(resolve(HERE, "..", rel), "utf8");
  const programs = [...md.matchAll(/```declare\n([\s\S]*?)```/g)].map((m) => m[1]);

  // the two seed files must contain programs (regression against extraction rot);
  // a swept file may legitimately hold none
  if (rel === "docs/declare.md" || rel === "apps/homepage/getstarted.md") {
    await test(`${rel}: has complete programs to check`, () => {
      if (programs.length < 1) throw new Error("no ```declare fences found — extraction regex or doc structure changed");
    });
  }

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
    // an ellipsis marks a DELIBERATE elision — the fragment illustrates shape,
    // not parseable source, and the elided middle is the point
    if (frag.includes("\u2026")) continue;
    const head = frag.trim().split("\n")[0].slice(0, 56);
    await test(`${rel} fragment ${i + 1} parses: ${head}`, () => {
      // a fragment is one of three excerpts: a whole top-level program, a set
      // of top-level DECLARATIONS (class/style/font/…) with no root, or a
      // MEMBER list. Try each in turn — and note that a declaration excerpt
      // must get a ROOT appended, never an App body wrapped around it: wrapping
      // read `class Foo extends View [ … ]` as a run of members named `class`,
      // `Foo`, `extends`, which only "parsed" while the comma was optional.
      try { parseProgram(frag); return; } catch { /* not a whole program */ }
      if (/^\s*(class|style|stylesheet|font|include|script|use)\b/.test(frag)) {
        parseProgram(`${frag.trimEnd()}\n\nApp [ width = 1, height = 1 ]\n`);
        return;
      }
      parseProgram(`App [\n${frag.trimEnd()}\n]`);
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

// ── COMPLETENESS: is every public surface reachable in the documentation? ────
// One question, one answer. These used to be five tests here plus two in
// schema-completeness, each organized around whichever registry it happened to
// read — so "is every public interface exposed?" had no single place to look, and
// twice in one week a surface nobody had listed went ungated and green.
//
// The enumeration now lives in tools/internal/doc/surfaces.mjs and this iterates
// it. Each surface keeps its own check, because "documented" genuinely differs by
// kind and a shared predicate would blunt the failure messages; what is unified is
// the LIST, which is the part that kept going missing.
for (const s of SURFACES.filter((s) => s.gated)) {
  await test(`completeness: ${s.label}`, async () => {
    const model = JSON.parse(readFileSync(resolve(HERE, "..", "docs/declare-model.json"), "utf8"));
    const holes = await s.check(model);
    if (holes.length) {
      throw new Error(
        `${holes.length} hole(s) — source: ${s.source}; docs live in ${s.docsLive}\n      ` +
        holes.join("\n      ") +
        `\n      Then re-run: node tools/internal/derive.mjs`);
    }
  });
}

// An ungated surface must SAY why. Without this the registry becomes the new place
// to hide an omission — the same failure the EXEMPT and UNTAUGHT lists are shaped
// to prevent (documentation.md §4a).
await test("completeness: every ungated surface states its reason", () => {
  const mute = SURFACES.filter((s) => !s.gated && !(s.why ?? "").trim()).map((s) => s.id);
  if (mute.length) throw new Error(`ungated with no reason given: ${mute.join(", ")}`);
});

// And the registry must cover the spine. A new public registry that reaches the
// spine without a surfaces.mjs row means nobody decided whether it needs
// documenting — which is precisely how the callable surface and `declare const`
// were missed. Form-agnostic, one level up.
await test("completeness: every spine section is claimed by a surface", () => {
  const model = JSON.parse(readFileSync(resolve(HERE, "..", "docs/declare-model.json"), "utf8"));
  const holes = everySpineSectionHasASurface(model);
  if (holes.length) {
    throw new Error(
      holes.join("\n      ") +
      `\n      Add a row to tools/internal/doc/surfaces.mjs — gated with a check, or ungated with a reason.`);
  }
});

summarize("docs");
