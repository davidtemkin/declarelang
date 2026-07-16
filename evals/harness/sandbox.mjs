// sandbox — build a hermetic session directory for one eval attempt
// (design/verify-and-evals.md §3.2). The sandbox contains ONLY what the brief
// claims a model needs: the language reference, the task brief + fixtures, and
// a tool contract. No repo access, no guide, no spec — v1 measures the brief
// ALONE (the artifact we claim suffices). Everything the model produces and
// everything it's scored against stays outside its view of the world.
//
// CORPUS mode (the docs-accessibility arm): instead of one brief file, the
// sandbox carries the category-B documentation tree under docs/ — the README
// router, links.json, the core doc, guide/, operational/ — and the solver
// READS its way in (agentic, read-only tools). Excluded on purpose:
// system-design/ (category A — if a solver can only succeed by reading the
// internal record, that is a category-B gap finding) and declare-for-llms.md
// (the incumbent brief this arm is measured AGAINST). Corpus sandboxes are
// created OUTSIDE the repo (os tmpdir): an agentic solver with read tools in
// a repo-interior directory could walk ../.. into compiler source or the
// task's reference solution.

import { cpSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const RUN_MD = `# How to work

You are writing a program in **Declare**, a UI language that is **not in your
training data**. \`declare.md\` in this folder is the complete, authoritative
reference — the ONLY source of truth. Where Declare resembles React/CSS/HTML, do
not assume the resemblance holds; consult the reference instead of extrapolating.

1. Read \`brief.md\` — the task, written as intent and behavior, no technology named.
2. Write your program to \`app.declare\`.
3. Check it: \`node verify app.declare\`. It climbs a ladder — structure →
   resolution → analysis → boot → behavior → visual — and stops at the first
   failure, printing diagnostics that **name the fix**. Apply the named fix and
   re-run. (In the one-shot track there is no verify step: write your best
   single program.)

Write nothing but the program to \`app.declare\`.
`;

const RUN_MD_CORPUS = `# How to work

You are writing a program in **Declare**, a UI language that is **not in your
training data**. The documentation is the folder \`docs/\` — start at
\`docs/README.md\` (the router: layout, reading order) and read what you need.
It is the ONLY source of truth; where Declare resembles React/CSS/HTML, do not
assume the resemblance holds.

1. Read \`brief.md\` — the task, written as intent and behavior, no technology named.
2. Read the documentation you need under \`docs/\`.
3. Write your program to \`app.declare\`. Write nothing but the program there.
`;

// the category-B corpus, path by path (relative to ROOT/docs) — an explicit
// list so an accidental new file in docs/ never silently joins the experiment
const CORPUS = ["README.md", "declare-model.json", "declare.md", "guide", "operational"];

/** Deterministic sandbox directory name for a task × track × model × rep cell. */
export function sandboxName({ task, track, model, rep }) {
  const base = `${task.id}__${track}__${model.replace(/[^\w.-]/g, "_")}`;
  return rep && rep > 1 ? `${base}__r${rep}` : base;
}

/**
 * Create a fresh sandbox for one attempt.
 * @param {object} a  { runDir, runName, task, track, model, rep, briefDocPath, corpus }
 * @returns { dir } absolute path to the sandbox
 */
export function makeSandbox({ runDir, runName, task, track, model, rep, briefDocPath = "docs/declare-for-llms.md", corpus = false }) {
  // corpus cells sandbox OUTSIDE the repo (see header); brief cells stay under
  // the run dir as before (their solver has no tools — nothing to contain)
  const dir = corpus
    ? join(tmpdir(), "declare-evals", runName ?? "run", sandboxName({ task, track, model, rep }))
    : join(runDir, sandboxName({ task, track, model, rep }));
  mkdirSync(dir, { recursive: true });

  if (corpus) {
    // the walkable documentation tree, in place of the single-file reference
    for (const p of CORPUS) {
      const src = join(ROOT, "docs", p);
      if (existsSync(src)) cpSync(src, join(dir, "docs", p), { recursive: true });
    }
    writeFileSync(join(dir, "run.md"), RUN_MD_CORPUS);
  } else {
    // the language reference — always landed in the sandbox as `declare.md` (the
    // name run.md refers to) regardless of which brief file sources it, so a
    // head-to-head just varies --brief-doc (docs-ia §9 step 1)
    cpSync(join(ROOT, briefDocPath), join(dir, "declare.md"));
    writeFileSync(join(dir, "run.md"), RUN_MD);
  }

  // the task brief (models generate from intent, never from incumbent code)
  cpSync(join(task.dir, "brief.md"), join(dir, "brief.md"));

  // fixtures the app consumes, mapped where the brief says the data lives
  if (task.hasFixtures) cpSync(join(task.dir, "fixtures"), join(dir, "fixtures"), { recursive: true });

  return { dir };
}
