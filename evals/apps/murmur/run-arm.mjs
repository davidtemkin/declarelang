#!/usr/bin/env node
// run-arm — drive one arm of the murmur task and record what it cost.
//
//   node evals/apps/murmur/run-arm.mjs --sandbox <dir> --model opus \
//        --arm declare-1 [--service 8330] [--dev 8340]
//
// The tracker comparison (evals/comparisons/react-tracker-idiomatic-2026-08-02)
// measured LOC, dependencies, wire weight and ms/frame — and NOT what it cost
// to write, because that arm was driven by hand and nothing was captured.
// `claude -p --output-format json` reports usage, so this wrapper exists to
// make build cost a first-class number: tokens, wall, and the turn count, per
// arm, recorded the same way for every arm that follows.
//
// The contract below is adapted from the harness's SYSTEM_DISTRO
// (evals/harness/solvers.mjs): the repo is the only source of truth, start at
// the README, iterate with the repo's own checker, touch nothing outside
// my-apps/. Three deliberate differences, each recorded here so a later arm is
// run the same way:
//
//   1. The brief lives at task/brief.md rather than inline — it is long, it has
//      an API contract beside it, and a real onboarding hands you a document.
//   2. The agent is TOLD to read skill/SKILL.md. That is the real-world path —
//      an agent in a repo with .claude/skills/ finds it — and leaving it to
//      chance measures skill auto-discovery rather than the language.
//   3. The agent is GIVEN puppeteer and headless Chrome, explicitly. This app
//      is judged on how it looks, and an agent that never sees its own screen
//      is being asked to design blind: a weak result would be unattributable
//      between the language, the agent, and the missing feedback loop. (The
//      ladder's rung 6 — `verify --states … --bless` — can also produce
//      images; it is left undiscovered on purpose, so whether the agent finds
//      it stays a finding.)

import { execFileSync, spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const SANDBOX = resolve(arg("sandbox", "/Users/temkin/Code/OpenLaszlo/run-murmur-declare-1"));
const KIND = arg("kind", "declare");   // declare | open  (open = pick your own stack)
const MODEL = arg("model", "opus");
const ARM = arg("arm", "declare-1");
const SERVICE = Number(arg("service", 8330));
const DEV = Number(arg("dev", 8340));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const OUT = join(HERE, "runs", ARM);
mkdirSync(OUT, { recursive: true });

const CONTRACT_OPEN = `Build the application described in **task/brief.md**. Read it, and **task/api/API.md**, before you plan anything.

# Your stack is your choice

This directory is empty apart from the task. Choose whatever you would actually reach for to build a consumer application of this kind, and set it up yourself.

**Use the ecosystem.** Where the community has an answer, take it — for state, for routing if you want it, for lists, and in particular **for animation and layout: reach for the library you would really use** (Motion / framer-motion, react-spring, whatever you rate) rather than hand-rolling transitions on \`requestAnimationFrame\`. Hand-built infrastructure where a well-known package exists counts against you. If you deliberately go off the paved road, say so in DESIGN.md and say why nothing available would do.

**The code is a deliverable.** It will be read as a work sample: ordinary, idiomatic, review-clean work in whatever you choose — not the cleverest thing you can make run.

- Write your design statement to \`DESIGN.md\`, as the brief requires.
- Keep everything inside this directory.

# The service

The conversation service is **already running** at http://localhost:${SERVICE} — its history, its media, and its live feed. Do not start it, do not stop it, do not modify it. Its contract is task/api/API.md.

If you need a dev server of your own, run it on port ${DEV} and no other.

# Look at what you build

This is a visual, interactive application, and the brief judges how it looks and how it feels — not only that it works. **You are expected to look at your own screen and iterate on what you see.**

\`puppeteer-core\` can be installed, and headless Chrome is at:

    ${CHROME}

Drive your app with it, take screenshots, and read the images back. Judge your own work by looking at it, at **390×844** and at **1440×900** — both are first-class per the brief — and keep going until it meets the standard the brief sets, not merely until it runs.

When you are finished, reply with exactly: DONE`;

const CONTRACT_DECLARE = `You have just downloaded the Declare distribution — the current directory is a fresh clone. Declare is a UI language that is NOT in your training data; this repository is the ONLY source of truth and it documents itself. Start at README.md, and read skill/SKILL.md, which is written for an agent doing exactly this job. Where Declare resembles React, CSS, or HTML, do not assume the resemblance holds — consult the repository instead of extrapolating.

# Your job

Build the application described in **task/brief.md**. Read it, and **task/api/API.md**, before you plan anything.

- Write the program under \`my-apps/\` — start at \`my-apps/murmur.declare\`, and split it with \`include\` if it grows.
- Write your design statement to \`my-apps/DESIGN.md\`, as the brief requires.
- Do not modify anything outside \`my-apps/\`.

# The service

The conversation service is **already running** at http://localhost:${SERVICE} — its history, its media, and its live feed. Do not start it, do not stop it, do not modify it. Its contract is task/api/API.md.

If you need a dev server of your own, run it on port ${DEV} and no other.

# Look at what you build

This is a visual, interactive application, and the brief judges how it looks and how it feels — not only that it works. **You are expected to look at your own screen and iterate on what you see.**

\`puppeteer-core\` is installed, and headless Chrome is at:

    ${CHROME}

Drive your app with it, take screenshots, and read the images back. Judge your own work by looking at it, at **390×844** and at **1440×900** — both are first-class per the brief — and keep going until it meets the standard the brief sets, not merely until it runs.

Use the repository's own tooling to check correctness as you go, and fix what it reports.

When you are finished, reply with exactly: DONE`;

const CONTRACT = KIND === "open" ? CONTRACT_OPEN : CONTRACT_DECLARE;
writeFileSync(join(OUT, "contract.md"), CONTRACT);

// preflight — a run that dies twenty minutes in because the service was down
// is a wasted run, and the failure looks like the agent's fault
for (const [what, check] of [
  ["sandbox exists", () => existsSync(join(SANDBOX, "task/brief.md"))],
  ...(KIND === "declare" ? [["evals stripped", () => !existsSync(join(SANDBOX, "evals"))]] : []),
  ["service up", () => { execFileSync("curl", ["-sf", `http://localhost:${SERVICE}/threads.json`], { stdio: "pipe" }); return true; }],
  ["chrome present", () => existsSync(CHROME)],
]) {
  try { if (!check()) throw new Error("false"); } catch { console.error(`preflight FAILED: ${what}`); process.exit(2); }
}
console.log(`preflight ok — sandbox ${SANDBOX}, service ${SERVICE}, model ${MODEL}`);

const t0 = Date.now();
const child = spawn("claude", ["-p", CONTRACT, "--model", MODEL, "--output-format", "json",
  "--permission-mode", "bypassPermissions"],
  { cwd: SANDBOX, stdio: ["ignore", "pipe", "pipe"] });

let stdout = "", stderr = "";
child.stdout.on("data", (d) => { stdout += d; process.stdout.write("."); });
child.stderr.on("data", (d) => { stderr += d; });

child.on("close", (code) => {
  const wallMs = Date.now() - t0;
  writeFileSync(join(OUT, "reply.json"), stdout || stderr);
  let usage = null, text = null;
  try { const j = JSON.parse(stdout); usage = j.usage ?? j.modelUsage ?? null; text = j.result ?? null; } catch {}

  const appDir = KIND === "open" ? join(SANDBOX, "src") : join(SANDBOX, "my-apps");
  const files = existsSync(appDir)
    ? execFileSync("find", [appDir, "-type", "f", "-not", "-path", "*/node_modules/*"], { encoding: "utf8" }).trim().split("\n").filter(Boolean)
    : [];
  const declare = files.filter((f) => KIND === "open"
    ? /\.(tsx?|jsx?|css|scss)$/.test(f) && !f.includes("node_modules")
    : f.endsWith(".declare"));
  const lines = declare.reduce((a, f) => a + readFileSync(f, "utf8").split("\n").length, 0);

  const record = {
    arm: ARM, model: MODEL, exit: code, wallMs,
    wallMin: +(wallMs / 60000).toFixed(1),
    usage, sandbox: SANDBOX, service: SERVICE, dev: DEV,
    declareFiles: declare.map((f) => f.replace(SANDBOX + "/", "")),
    declareLines: lines,
    designStatement: [join(appDir, "DESIGN.md"), join(SANDBOX, "DESIGN.md")]
      .filter(existsSync).map((f) => statSync(f).size)[0] ?? null,
    producedFiles: files.map((f) => f.replace(SANDBOX + "/", "")).filter((f) => !f.includes("node_modules")).slice(0, 200),
    deps: (() => { try { const pj = JSON.parse(readFileSync(join(SANDBOX, "package.json"), "utf8"));
      return { dependencies: Object.keys(pj.dependencies ?? {}), devDependencies: Object.keys(pj.devDependencies ?? {}) };
    } catch { return null; } })(),
    replyTail: text ? text.slice(-400) : null,
  };
  writeFileSync(join(OUT, "record.json"), JSON.stringify(record, null, 1) + "\n");

  console.log(`\n\narm ${ARM} · exit ${code} · ${record.wallMin} min`);
  console.log(`  ${declare.length} .declare file(s), ${lines} lines · DESIGN.md ${record.designStatement ?? "MISSING"} bytes`);
  console.log(`  usage: ${JSON.stringify(usage)}`);
  console.log(`  → ${OUT}`);
});
