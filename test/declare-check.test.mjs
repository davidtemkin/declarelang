// declare-check (tools/declare-check.mjs): the checker is asked what checking.md says; a
// check waits for its report, or hands back an id to wait on; each check lands in the
// ledger; and with no agent to start, it says to check by checking.md. A stand-in `claude`
// on the PATH answers, so no real agent runs.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-check-");
const BIN = join(DIR, "bin");
mkdirSync(BIN, { recursive: true });
writeFileSync(join(BIN, "claude"), `#!/bin/sh
cat > "${DIR}/asked.txt"
echo "$@" > "${DIR}/args.txt"
sleep \${FAKE_SLEEP:-0}
printf '%s' '{"result":"QUESTION  q\\nVERDICT   fail — the order was never sent","num_turns":4,"total_cost_usd":0.25,"usage":{"input_tokens":3,"cache_creation_input_tokens":900,"cache_read_input_tokens":12000,"output_tokens":400}}'
`);
chmodSync(join(BIN, "claude"), 0o755);
const LEDGER = join(DIR, "ledger.jsonl");
const check = (env, ...a) => spawnSync(process.execPath, [join(ROOT, "tools/declare-check.mjs"), ...a], {
  cwd: ROOT, encoding: "utf8",
  env: { ...process.env, DECLARE_AGENT: "", DECLARE_CHECK_LEDGER: LEDGER, PATH: `${BIN}:${process.env.PATH}`, ...env },
});
const program = ["--program", "apps/todo/todo.declare", "--scripts", join(DIR, "checks")];

await test("the checker is asked what checking.md says, with the question and the program", () => {
  const r = check({}, "does adding a task work on a phone?", ...program, "--print-prompt");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /docs\/operational\/checking\.md — the section "For the checker"/);
  assert.match(r.stdout, /Question: does adding a task work on a phone\?/);
  assert.match(r.stdout, /Program: .*apps\/todo\/todo\.declare/);
  assert.match(r.stdout, /never change the program's files/);
  assert.ok(readFileSync(join(ROOT, "docs/operational/checking.md"), "utf8").includes("## For the checker"));
});

await test("a check prints the checker's report and what it cost, and lands in the ledger", () => {
  const r = check({}, "does adding a task work?", ...program);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /VERDICT {3}fail — the order was never sent/);
  assert.match(r.stdout, /\(checker [0-9a-f]{6}: \d+ s, 4 turns, \$0\.25\)/);
  assert.match(readFileSync(join(DIR, "asked.txt"), "utf8"), /Question: does adding a task work\?/);
  // the checker may write its scripts but never the program
  assert.match(readFileSync(join(DIR, "args.txt"), "utf8"), /--disallowedTools Edit\(\*\*\/\*\.declare\) Write\(\*\*\/\*\.declare\)/);
  const last = readFileSync(LEDGER, "utf8").trim().split("\n").map((l) => JSON.parse(l)).pop();
  assert.equal(last.question, "does adding a task work?");
  assert.equal(last.verdict, "fail");
  assert.equal(last.turns, 4);
  assert.equal(last.cached, 12000);
});

await test("a checker still working hands back an id, and --wait collects its report", () => {
  const r = check({ FAKE_SLEEP: "3", DECLARE_CHECK_WAIT: "500" }, "is it slow?", ...program);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  const id = /--wait ([0-9a-f]{6})/.exec(r.stdout)?.[1];
  assert.ok(id, r.stdout);
  const w = check({}, "--wait", id);
  assert.equal(w.status, 0, w.stderr);
  assert.match(w.stdout, /VERDICT {3}fail/);
});

await test("with no agent to start, it says to check by checking.md", () => {
  const r = check({ PATH: dirname(process.execPath) }, "anything?", ...program);
  assert.equal(r.status, 4);
  assert.match(r.stderr, /no checker can start here, so check it yourself, following docs\/operational\/checking\.md § For the checker/);
});

summarize("declare-check");
