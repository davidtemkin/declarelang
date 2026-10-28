#!/usr/bin/env node
// declare-check — hand a check to a checker: an agent in a context of its own, which
// follows docs/operational/checking.md, writes and runs the scripts, and reports.
//
//   npx declare-check "<what to find out>" --program my-apps/shop/shop.declare
//        [--url http://127.0.0.1:8200/my-apps/shop/shop.declare] [--service http://127.0.0.1:8350]
//        [--scripts <dir>] [--agent claude|codex|gemini] [--model <id>]
//            starts a checker and waits for its report (up to 100 s); one still
//            working prints its id
//   npx declare-check --wait <id>        waits for that checker's report again
//   npx declare-check --start "<…>" …    starts one and returns at once, to run several side by side
//   npx declare-check --print-prompt …   what the checker would be asked, and nothing started
//
// The checker's scripts, their output and its retries stay in its context, not the
// builder's. It never changes the program; its scripts go in --scripts (default: `checks/`
// beside the program), where the builder can run them again with declare-verify --assert.
// Which agent: --agent, else $DECLARE_AGENT, else the first of claude, codex, gemini on the
// PATH. Each check's time, turns, tokens and cost are added to a ledger
// ($DECLARE_CHECK_LEDGER, else declare-check/ledger.jsonl in the system's temp folder).
// The claude path is the one tested; codex and gemini run with their usual headless flags.

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, openSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const HOME = join(tmpdir(), "declare-check");
const LEDGER = process.env.DECLARE_CHECK_LEDGER ?? join(HOME, "ledger.jsonl");
const WAIT_MS = Number(process.env.DECLARE_CHECK_WAIT ?? 100_000);   // under the 2 minutes an agent's shell command gets
const LIMIT_MS = 15 * 60_000;                                          // a checker still going after this is stopped
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };
const jobDir = (id) => join(HOME, id);

if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
  console.log(readFileSync(SELF, "utf8").split("\n").slice(1, 21).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(argv.length === 0 ? 2 : 0);
}

// ── the checker itself, started detached: run the agent, keep its report ─────────
if (flag("run") !== null) {
  const dir = jobDir(flag("run"));
  const job = JSON.parse(readFileSync(join(dir, "job.json"), "utf8"));
  const began = Date.now();
  const r = spawnSync(job.cmd, job.args, {
    cwd: ROOT, input: job.stdin ? job.prompt : undefined, encoding: "utf8", maxBuffer: 64 << 20, timeout: LIMIT_MS,
    env: { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" },
  });
  const done = { id: job.id, question: job.question, program: job.program, agent: job.agent, seconds: Math.round((Date.now() - began) / 1000) };
  let report = (r.stdout ?? "").trim();
  if (job.agent === "claude") {
    // --output-format json: the report is `result`; the rest is what it cost
    try {
      const j = JSON.parse(report);
      report = String(j.result ?? "").trim();
      Object.assign(done, {
        turns: j.num_turns, cost: j.total_cost_usd,
        input: (j.usage?.input_tokens ?? 0) + (j.usage?.cache_creation_input_tokens ?? 0),
        cached: j.usage?.cache_read_input_tokens ?? 0, output: j.usage?.output_tokens ?? 0,
      });
    } catch { /* not JSON: keep the text as it came */ }
  }
  if (r.error || r.status !== 0) {
    const why = r.error?.code === "ETIMEDOUT" ? `stopped after ${LIMIT_MS / 60_000} minutes` : r.error?.message ?? `exited with ${r.status}`;
    report = `VERDICT   unanswered — the checker ${why}\n${(r.stderr ?? "").trim().split("\n").slice(-5).join("\n")}\n${report}`.trim();
    done.failed = why;
  }
  const verdict = /^VERDICT\s+(\S+)/m.exec(report)?.[1] ?? null;
  done.verdict = verdict;
  writeFileSync(join(dir, "report.txt"), report + "\n");
  writeFileSync(join(dir, "done.json"), JSON.stringify(done));
  try { mkdirSync(dirname(LEDGER), { recursive: true }); appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), ...done }) + "\n"); } catch { /* the ledger is a record, never the check */ }
  process.exit(0);
}

// ── waiting: the report, or the id to wait on again ─────────────────────────────
async function collect(id) {
  const dir = jobDir(id);
  if (!existsSync(join(dir, "job.json"))) { console.error(`declare-check: no checker ${id}`); process.exit(2); }
  const started = JSON.parse(readFileSync(join(dir, "job.json"), "utf8")).started;
  const until = Date.now() + WAIT_MS;
  while (!existsSync(join(dir, "done.json")) && Date.now() < until) await new Promise((r) => setTimeout(r, 500));
  if (!existsSync(join(dir, "done.json"))) {
    console.log(`declare-check: checker ${id} is still checking (${Math.round((Date.now() - started) / 1000)} s so far) — collect its report with: npx declare-check --wait ${id}`);
    process.exit(3);
  }
  const done = JSON.parse(readFileSync(join(dir, "done.json"), "utf8"));
  process.stdout.write(readFileSync(join(dir, "report.txt"), "utf8"));
  const cost = [`${done.seconds} s`, done.turns != null ? `${done.turns} turns` : null, done.cost != null ? `$${done.cost.toFixed(2)}` : null].filter(Boolean).join(", ");
  console.log(`\n(checker ${id}: ${cost})`);
  process.exit(done.failed ? 1 : 0);
}
if (flag("wait") !== null) await collect(flag("wait"));

// ── a new check ─────────────────────────────────────────────────────────────────
const valued = new Set(["program", "url", "service", "scripts", "agent", "model"]);
const question = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--") && valued.has(argv[i - 1].slice(2)))).join(" ").trim();
if (question === "") { console.error("declare-check: say what to find out — npx declare-check \"<what to find out>\" --program <file>"); process.exit(2); }
const program = flag("program") ? resolve(flag("program")) : null;
if (program === null) { console.error("declare-check: name the program — --program <file>"); process.exit(2); }
const scripts = resolve(flag("scripts") ?? join(dirname(program), "checks"));
const prompt = [
  `Read ${join(ROOT, "docs/operational/checking.md")} — the section "For the checker" — then answer this question and report in its form.`,
  "",
  `Question: ${question}`,
  `Program: ${program}`,
  flag("url") ? `Served at: ${flag("url")} (verify and look take --url)` : null,
  flag("service") ? `Service: ${flag("service")} — a live service: earlier runs' writes are still there` : null,
  `Scripts: write yours in ${scripts} (reuse what is there); never change the program's files.`,
  `Run the Declare commands (npx declare-verify, npx declare-look, npx declare-help) from ${ROOT}.`,
  "Your last message is the report, in the form, and nothing else.",
].filter((l) => l !== null).join("\n");
if (argv.includes("--print-prompt")) { console.log(prompt); process.exit(0); }

const onPath = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" }).status === 0;
const agent = flag("agent") || process.env.DECLARE_AGENT || ["claude", "codex", "gemini"].find(onPath);
if (!agent) {
  console.error("declare-check: no agent command found (claude, codex or gemini) — no checker can start here, so check it yourself, following docs/operational/checking.md § For the checker");
  process.exit(4);
}
const model = flag("model") || process.env.DECLARE_CHECK_MODEL || null;
// each agent's headless form. Claude's prompt goes on stdin: --tools takes a list, so a
// prompt written after it would be read as one more tool.
const TOOLS = "Read,Glob,Grep,Bash,Write,Edit";
const RUN = {
  claude: { cmd: "claude", args: ["-p", "--output-format", "json", "--tools", TOOLS, "--allowedTools", TOOLS, "--disallowedTools", "Edit(**/*.declare)", "Write(**/*.declare)", ...(model ? ["--model", model] : [])], stdin: true },
  codex: { cmd: "codex", args: ["exec", "--full-auto", ...(model ? ["--model", model] : []), prompt], stdin: false },
  gemini: { cmd: "gemini", args: ["--yolo", ...(model ? ["--model", model] : []), "-p", prompt], stdin: false },
};
const run = RUN[agent];
if (!run) { console.error(`declare-check: unknown agent '${agent}' — claude, codex or gemini`); process.exit(2); }
if (!onPath(run.cmd)) {
  console.error(`declare-check: '${run.cmd}' is not on the PATH — no checker can start here, so check it yourself, following docs/operational/checking.md § For the checker`);
  process.exit(4);
}

const id = randomBytes(3).toString("hex");
mkdirSync(jobDir(id), { recursive: true });
mkdirSync(scripts, { recursive: true });
writeFileSync(join(jobDir(id), "job.json"), JSON.stringify({ id, question, program, agent, prompt, ...run, started: Date.now() }));
const log = openSync(join(jobDir(id), "runner.log"), "a");
spawn(process.execPath, [SELF, "--run", id], { detached: true, stdio: ["ignore", log, log] }).unref();
if (argv.includes("--start")) {
  console.log(`declare-check: checker ${id} started — collect its report with: npx declare-check --wait ${id}`);
  process.exit(0);
}
await collect(id);
