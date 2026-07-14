// sandbox — build a hermetic session directory for one eval attempt
// (design/verify-and-evals.md §3.2). The sandbox contains ONLY what the brief
// claims a model needs: the language reference, the task brief + fixtures, and
// a tool contract. No repo access, no guide, no spec — v1 measures the brief
// ALONE (the artifact we claim suffices). Everything the model produces and
// everything it's scored against stays outside its view of the world.

import { cpSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const RUN_MD = `# How to work

You are writing a program in **Declare**, a UI language that is **not in your
training data**. \`declare-for-llms.md\` in this folder is the complete, authoritative
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

/**
 * Create a fresh sandbox for one attempt.
 * @param {object} a  { runDir, task, track, model }
 * @returns { dir } absolute path to the sandbox
 */
export function makeSandbox({ runDir, task, track, model }) {
  const dir = join(runDir, `${task.id}__${track}__${model.replace(/[^\w.-]/g, "_")}`);
  mkdirSync(dir, { recursive: true });

  // the language reference — the brief we claim suffices
  cpSync(join(ROOT, "docs/declare-for-llms.md"), join(dir, "declare-for-llms.md"));

  // the task brief (models generate from intent, never from incumbent code)
  cpSync(join(task.dir, "brief.md"), join(dir, "brief.md"));

  // fixtures the app consumes, mapped where the brief says the data lives
  if (task.hasFixtures) cpSync(join(task.dir, "fixtures"), join(dir, "fixtures"), { recursive: true });

  writeFileSync(join(dir, "run.md"), RUN_MD);
  return { dir };
}
