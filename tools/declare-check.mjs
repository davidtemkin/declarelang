#!/usr/bin/env node
// declare-check — hand a check to a checker: an agent in a context of its own, which
// follows docs/operational/checking.md and prints a short report.
//
//   npx declare-check "<question>" --program my-apps/shop/shop.declare
//        [--url http://127.0.0.1:8200/my-apps/shop/shop.declare] [--service http://127.0.0.1:8350]
//        [--scripts checks/] [--agent claude|codex|gemini] [--model <id>]
//
// The builder keeps its context for building: the checker's scripts, their output and
// the pictures it looks at stay in the checker's. The checker never changes the
// program; it may write scripts in --scripts. Which agent runs it: --agent, else
// $DECLARE_AGENT, else the first of claude, codex, gemini found on the PATH. (An agent
// that can start a sub-agent of its own — Claude Code's Agent tool — does not need this
// command: see checking.md.) The claude path is the one tested; codex and gemini are
// run with their usual headless flags.

import { spawnSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
  console.log(readHead());
  process.exit(argv.length === 0 ? 2 : 0);
}
function readHead() {
  return (spawnSync("sed", ["-n", "2,16p", fileURLToPath(import.meta.url)], { encoding: "utf8" }).stdout ?? "").replace(/^\/\/ ?/gm, "");
}
const flag = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };
const valued = new Set(["program", "url", "service", "scripts", "agent", "model"]);
const question = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--") && valued.has(argv[i - 1].slice(2)))).join(" ").trim();
if (question === "") { console.error("declare-check: say what to find out — npx declare-check \"<question>\" --program <file>"); process.exit(2); }

const program = flag("program");
const lines = [
  `Read ${join(ROOT, "docs/operational/checking.md")} — the section "For the checker" — then answer this question and report in its form.`,
  "",
  `Question: ${question}`,
  program ? `Program: ${resolve(program)}` : null,
  flag("url") ? `Served at: ${flag("url")} (verify and look take --url)` : null,
  flag("service") ? `Service: ${flag("service")} — a live service: earlier runs' writes are still there` : null,
  `Scripts: write any in ${resolve(flag("scripts") ?? "checks")} (reuse what is there); never change the program's files.`,
  `Run the Declare commands (npx declare-verify, npx declare-look, npx declare-help) from ${ROOT}.`,
].filter((l) => l !== null);
const prompt = lines.join("\n");

// --print-prompt: what the checker would be asked, and nothing started
if (argv.includes("--print-prompt")) { console.log(prompt); process.exit(0); }

const onPath = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" }).status === 0;
const agent = flag("agent") ?? process.env.DECLARE_AGENT ?? ["claude", "codex", "gemini"].find(onPath);
if (!agent) { console.error("declare-check: no agent command found (claude, codex or gemini) — say which with --agent"); process.exit(2); }
const model = flag("model") ?? process.env.DECLARE_CHECK_MODEL ?? null;

// each agent's headless form: the prompt on stdin where the command takes it there
// (claude's --tools takes a list, so a prompt written after it would be read as a tool)
const RUN = {
  claude: { cmd: "claude", args: ["-p", "--output-format", "text", "--tools", "Read,Glob,Grep,Bash", "--allowedTools", "Read,Glob,Grep,Bash", ...(model ? ["--model", model] : [])], stdin: true },
  codex: { cmd: "codex", args: ["exec", "--full-auto", ...(model ? ["--model", model] : []), prompt], stdin: false },
  gemini: { cmd: "gemini", args: ["--yolo", ...(model ? ["--model", model] : []), "-p", prompt], stdin: false },
};
const run = RUN[agent];
if (!run) { console.error(`declare-check: unknown agent '${agent}' — claude, codex or gemini`); process.exit(2); }

const r = spawnSync(run.cmd, run.args, { cwd: ROOT, input: run.stdin ? prompt : undefined, encoding: "utf8", maxBuffer: 64 << 20 });
if (r.error) { console.error(`declare-check: could not start ${run.cmd}: ${r.error.message}`); process.exit(2); }
process.stdout.write(r.stdout ?? "");
if (r.status !== 0) { process.stderr.write(r.stderr ?? ""); process.exit(r.status ?? 1); }
