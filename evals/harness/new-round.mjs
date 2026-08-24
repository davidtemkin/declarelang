#!/usr/bin/env node
// new-round — stand up a pinned eval round OUTSIDE this tree (evals/ROUNDS.md).
//
//   node evals/harness/new-round.mjs                # next round number, pushed main
//   node evals/harness/new-round.mjs --sha <sha>    # pin a specific commit
//   node evals/harness/new-round.mjs --round 7      # explicit round number
//
// A round lives in ~/Code/Declare-eval-<NNN>/ — untracked, disposable except
// results/. The SUBJECT is downloaded from GitHub as a tarball (no .git, no
// local state): exactly what a visitor who clicked "Download ZIP" gets, and
// reproducible forever from the SHA in round.json. This script only builds the
// directory; it never runs a cell — runs are launched deliberately, one at a
// time, with the command it prints at the end.

import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = "davidtemkin/declarelang";

const argv = process.argv.slice(2);
const val = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };

// next round number: one past the highest existing ~/Code/Declare-eval-<NNN>
const CODE = join(homedir(), "Code");
const existing = readdirSync(CODE)
  .map((d) => /^Declare-eval-(\d+)/.exec(d)?.[1])
  .filter(Boolean).map(Number);
const round = Number(val("round") ?? (existing.length ? Math.max(...existing) + 1 : 1));
const name = String(round).padStart(3, "0");
const R = join(CODE, `Declare-eval-${name}`);
if (existsSync(R)) { console.error(`${R} already exists — pass --round to pick another`); process.exit(1); }

// pin the subject: an explicit SHA, or the pushed head of main (never the local tree)
const sha = val("sha") ?? execSync(`git ls-remote https://github.com/${REPO}.git refs/heads/main`)
  .toString().split("\t")[0].trim();
if (!/^[0-9a-f]{40}$/.test(sha)) { console.error(`could not resolve a SHA (got '${sha}')`); process.exit(1); }

console.log(`round ${name} — subject ${REPO} @ ${sha.slice(0, 8)}`);
for (const d of ["subject", "results", "sandboxes"]) mkdirSync(join(R, d), { recursive: true });

console.log("  downloading tarball …");
execSync(`curl -sL https://github.com/${REPO}/archive/${sha}.tar.gz | tar -xz -C "${join(R, "subject")}" --strip-components=1`);

console.log("  npm ci (the scorer's toolchain) …");
execFileSync("npm", ["ci", "--silent"], { cwd: join(R, "subject"), stdio: "inherit" });

let version = null;
try { version = JSON.parse(execSync(`cat "${join(R, "subject", "package.json")}"`).toString()).version ?? null; } catch { /* none */ }

writeFileSync(join(R, "round.json"), JSON.stringify({
  round, subjectRepo: REPO, subjectSha: sha, subjectVersion: version,
  created: new Date().toISOString(),
  regime: "distro arm, one deliberate cell at a time; see evals/ROUNDS.md",
  runs: [],
}, null, 2) + "\n");

// sanity: the subject's own ladder works before any tokens are spent
execFileSync("node", [join(R, "subject", "tools/verify.mjs"), join(R, "subject", "apps/calendar/calendar.declare")], { stdio: "inherit" });

console.log(`\nround ready at ${R}\nlaunch ONE cell (per-task, ask first) with:\n`);
console.log(`  node ${ROOT}/evals/harness/run.mjs --distro --solver claude-distro \\`);
console.log(`    --tasks <task> --models opus --reps 1 \\`);
console.log(`    --runs ${R}/results --sandboxes ${R}/sandboxes \\`);
console.log(`    --subject ${R}/subject --sha ${sha} --run round-${name}`);
