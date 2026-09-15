#!/usr/bin/env node
// measure — what a run COST, from its own event stream.
//
//   node evals/harness/measure.mjs <run-dir> [--json] [--calls]
//
// A run is a directory holding `logs/agent.stream.jsonl` (the `claude -p
// --output-format stream-json --verbose` transcript). Everything below is read
// from that file; nothing is estimated and nothing is asked of the operator.
//
// THE THREE METRICS THAT MATTER, in this order:
//
//   1. TOKENS, split by class, per model. Input divides into three prices, not
//      one — uncached input, input written to the cache, and input read back
//      from it — and the third dominates an agent run by two orders of
//      magnitude, so a single "input" number hides where the money went.
//      Thinking tokens are a subset of output, reported separately because they
//      are invisible in the transcript and easy to forget.
//   2. COST. Derived from the token classes and a per-model rate table
//      (pricing.json, dated and hand-maintained). The CLI also reports its own
//      figure; both are printed, and a disagreement over 2% is called out
//      rather than silently preferred — a stale rate table is exactly the kind
//      of error that reads as a finding about the model.
//   3. TIME, split by ACTIVITY. Wall clock divides first into model time (the
//      API) and everything else, and "everything else" is then attributed to
//      the tool that spent it. This is the one place tokens and time come
//      apart: a browser render and an eight-minute suite cost real minutes and
//      almost no tokens.
//
// Turns, tool invocations and failed checks are counted too, at the bottom,
// under the heading they deserve: they describe the SHAPE of a run and are not
// what a run is judged by.
//
// The activity taxonomy is deliberately visible. A Bash call is classified by
// what its command does, which is a heuristic; `--calls` prints every call with
// the bucket it landed in, so the classification can be audited rather than
// trusted. Anything unrecognised lands in `shell: other`, never in a flattering
// bucket.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const SHOW_CALLS = args.includes("--calls");
const runDir = args.find((a) => !a.startsWith("--"));
if (runDir === undefined) {
  console.error("usage: node evals/harness/measure.mjs <run-dir> [--json] [--calls]");
  process.exit(2);
}

const streamPath = path.join(runDir, "logs", "agent.stream.jsonl");
if (!existsSync(streamPath)) {
  console.error(`no event stream at ${streamPath} — a measured run is one launched with --output-format stream-json --verbose`);
  process.exit(2);
}

// ── the activity taxonomy ───────────────────────────────────────────────────
// Ordered: the first pattern that matches a command wins, so the specific
// (a browser driver) is tested before the general (any node script).
// Matched against the command's HEAD — everything before the first heredoc or
// newline. A heredoc body is a payload, not an intent: matching the whole
// command put a python script that happened to contain the word "scroll" in
// `render`, and a browser driver whose arguments lacked the word "shot" in
// `shell: other`. The head is what the call is; the body is what it carries.
const ACTIVITIES = [
  ["render",  /puppeteer|playwright|screenshot|chrome|chromium|--headless|page\.goto|\bshot\b|viewport|\bclick\b|\bscroll\b|drive\.mjs/i],
  ["check",   /\bnpm (run )?test|verify\.mjs|declarec|\btsc\b|format\.mjs|--check\b|run-tests/i],
  ["service", /npm start|server\.mjs|\bcurl\b|\blsof\b|dev\.mjs/i],
  ["read",    /^\s*(cat|sed -n|head|tail|grep|rg|ls|find|wc|jq)\b/i],
  ["edit",    /\bsed -i\b|\btee\b|>\s*\S+\.(declare|mjs|js|json|md)\b|\bmkdir\b|\bcp\b|\bmv\b/],
];
// A heredoc with no telling head (`python3 - <<'PY'`) is classified by whether
// its body WRITES: that is the one thing that distinguishes an edit from an
// analysis, and it is a fact about the body rather than a guess about the verb.
const WRITES = /open\([^)]*['"]w['"]|writeFileSync|\.write\(/;
const bucketFor = (name, input) => {
  if (name === "Read" || name === "Glob" || name === "Grep") return "read";
  if (name === "Write" || name === "Edit" || name === "NotebookEdit") return "edit";
  if (name !== "Bash") return `tool: ${name}`;
  const cmd = String(input.command ?? "");
  const head = cmd.split("<<")[0].split("\n")[0];
  for (const [bucket, re] of ACTIVITIES) if (re.test(head)) return bucket;
  if (/<</.test(cmd)) return WRITES.test(cmd) ? "edit" : "shell: other";
  return "shell: other";
};

// A tool result that reports failure — the count of corrections a run made
// visible to itself. Deliberately narrow: an exit code the harness surfaced, or
// a checker's own verdict. Never inferred from prose.
const FAILED = /\bexit(ed with)? code [1-9]|\bFAIL\b|✗|\berror(s)?:|did not pass|refused/i;

// ── the friction signals ────────────────────────────────────────────────────
// Not metrics. These do not say whether a run went well; they say WHERE it got
// stuck, which is where a change to the code, the docs, or the packaging would
// pay. Each one answers a question we would otherwise guess at: which
// diagnostics does the language actually produce in the field, what does an
// author ask the help tool for, what did they hunt for and fail to find, which
// documents did they read and re-read, and what did the harness itself cost
// them in friction that has nothing to do with the language.
const CODE = /DECLARE(\d{4})|\[Declare E(\d{3,4})\]/g;
const HELP = /declare-help(?:\.mjs)?\s+([A-Za-z][\w.]*)/g;
const SEARCH = /\b(?:grep|rg)\b[^|\n]*?["']([^"']{3,60})["']/g;
const READ = /(?:sed -n[^|\n]*?|cat\s+|head\s[^|\n]*?|tail\s[^|\n]*?)(\S+\.(?:md|declare|json|ts|mjs))/g;
const TRUNCATED = /Output too large|persisted-output|<truncated/;

const ts = (s) => (s ? Date.parse(s) : NaN);
const events = readFileSync(streamPath, "utf8").split("\n").filter(Boolean).map((l) => {
  try { return JSON.parse(l); } catch { return null; }
}).filter(Boolean);

const pending = new Map();
const timeBy = new Map();      // activity → ms
const callsBy = new Map();     // activity → count
const calls = [];
let turns = 0, failures = 0, result = null;

// Keyed by the MESSAGE, not the code. A code is a bucket: DECLARE6001 wraps
// every typecheck failure, from a misused TypeScript generic to a Declare rule
// about datapaths, and DECLARE2000 wraps every coercion. Grouping by code
// answers "how often did the checker refuse", which nobody needs; grouping by
// message answers "what did authors get wrong", which is the whole point.
const codes = new Map();       // message signature → { code, count, occasions, positions, said }
const helpFor = new Map();     // help topic → times asked
const searched = [];           // { pattern, found }
const readCount = new Map();   // file → times read
let truncated = 0, eyesCycles = 0, lastWasRender = false;

for (const e of events) {
  if (e.type === "result") result = e;
  const msg = e.message ?? {};
  if (msg.role === "assistant") turns++;
  const at = ts(e.timestamp);
  const content = Array.isArray(msg.content) ? msg.content : [];
  for (const b of content) {
    if (b?.type === "tool_use") {
      const bucket = bucketFor(b.name, b.input ?? {});
      pending.set(b.id, { at, bucket, name: b.name, input: b.input ?? {} });
      const cmd = String((b.input ?? {}).command ?? "");
      const file = String((b.input ?? {}).file_path ?? "");
      // what the author asked the help tool for (a shell loop's `$n` is the
      // loop, not a topic — only real names count)
      for (const m of cmd.matchAll(HELP)) helpFor.set(m[1], (helpFor.get(m[1]) ?? 0) + 1);
      for (const m of cmd.matchAll(SEARCH)) searched.push({ pattern: m[1], id: b.id });
      for (const m of cmd.matchAll(READ)) {
        const f = m[1].split("/").pop();
        // a tool RUN is not a read: `node tools/declare-help.mjs Media | head`
        // names a program being executed, and counting it as a document the
        // author kept returning to would be a lie about where the time went
        if (/^(declare-help|drive|verify|declarec|format|measure)\.mjs$/.test(f)) continue;
        readCount.set(f, (readCount.get(f) ?? 0) + 1);
      }
      if (file) { const f = file.split("/").pop(); readCount.set(f, (readCount.get(f) ?? 0) + 1); }
      // A correction that needed EYES: a render, then an edit, with no check in
      // between. The expensive class — it costs a round trip AND the tokens to
      // read what came back.
      if (bucket === "edit" && lastWasRender) eyesCycles++;
      if (bucket === "render") lastWasRender = true;
      else if (bucket === "check" || bucket === "edit") lastWasRender = false;
    } else if (b?.type === "tool_result") {
      const started = pending.get(b.tool_use_id);
      pending.delete(b.tool_use_id);
      const text = typeof b.content === "string" ? b.content
        : Array.isArray(b.content) ? b.content.map((x) => x?.text ?? "").join("") : "";
      if (b.is_error === true || FAILED.test(text.slice(0, 400))) failures++;
      if (TRUNCATED.test(text)) truncated++;
      // every diagnostic the language produced, with the first sentence it said
      const codesHere = new Set();
      for (const m of text.matchAll(CODE)) {
        const code = m[1] ?? m[2];
        const lineStart0 = text.lastIndexOf("\n", m.index) + 1;
        const raw = text.slice(lineStart0, m.index).replace(/\s+/g, " ").trim();
        // the signature: the sentence with its specifics blanked, so the same
        // mistake at ten sites is one row and not ten
        const key = (raw || `DECLARE${code}`).replace(/'[^']*'/g, "'X'").slice(0, 120);
        const seen = codes.get(key);
        // WHERE and HOW OFTEN are different questions, and the raw count answers
        // neither. One mistake in a class reaches every use site, so a single
        // failing compile can print one cause ten times; and a run that re-runs
        // the checker prints it again. Occasions (separate tool results) and
        // distinct positions are what tell a cause from an echo.
        // two spellings: `(file.declare:12:4)` for a multi-file program, and
        // `(line 12, col 4)` for a single-file one
        const posAt = text.slice(m.index, m.index + 160).match(/\(([^)]*?:\d+:\d+)\)|\((line \d+, col \d+)\)/);
        const pos = posAt ? (posAt[1] ?? posAt[2]) : null;
        if (seen === undefined) {
          // the sentence, not a window: a diagnostic prints its message and
          // THEN its code, so the line up to the code is what was actually said
          codes.set(key, { code, count: 1, occasions: 1, positions: new Set(pos ? [pos] : []),
                           said: raw || text.slice(m.index, m.index + 140).replace(/\s+/g, " ").trim() });
        } else {
          seen.count++;
          if (pos) seen.positions.add(pos);
          if (!codesHere.has(key)) seen.occasions++;
        }
        codesHere.add(key);
      }
      // a search that came back with nothing is the strongest naming signal
      // there is: the author expected something to exist under that word
      const s = searched.find((x) => x.id === b.tool_use_id && x.found === undefined);
      if (s !== undefined) s.found = text.trim().length > 0;
      if (started === undefined || !Number.isFinite(at) || !Number.isFinite(started.at)) continue;
      const ms = at - started.at;
      timeBy.set(started.bucket, (timeBy.get(started.bucket) ?? 0) + ms);
      callsBy.set(started.bucket, (callsBy.get(started.bucket) ?? 0) + 1);
      calls.push({ bucket: started.bucket, ms, name: started.name,
                   cmd: String(started.input.command ?? started.input.file_path ?? "").replace(/\s+/g, " ").slice(0, 90) });
    }
  }
}

if (result === null) {
  console.error("the stream has no result record — the run did not finish, or the log is truncated");
  process.exit(2);
}

// ── tokens, per model ───────────────────────────────────────────────────────
const usage = result.modelUsage ?? {};
const models = Object.entries(usage).map(([model, u]) => ({
  model,
  input: u.inputTokens ?? 0,
  cacheWrite: u.cacheCreationInputTokens ?? 0,
  cacheRead: u.cacheReadInputTokens ?? 0,
  output: u.outputTokens ?? 0,
  thinking: u.thinkingTokens ?? 0,
  reportedUSD: u.costUSD ?? null,
  basis: u.costBasis ?? null,
})).sort((a, b) => (b.output + b.cacheWrite) - (a.output + a.cacheWrite));

// ── cost ────────────────────────────────────────────────────────────────────
// Rates are per MILLION tokens and live in pricing.json beside this file. A
// model with no entry, or an entry with null rates, is costed from the CLI's
// own figure instead, and the report says so — an invented rate is worse than
// an absent one.
const pricingPath = path.join(HERE, "pricing.json");
const pricing = existsSync(pricingPath) ? JSON.parse(readFileSync(pricingPath, "utf8")) : { asOf: null, rates: {} };
const rateFor = (model) => pricing.rates?.[model] ?? pricing.rates?.[model.replace(/-\d{8}$/, "")] ?? null;
const priced = models.map((m) => {
  const r = rateFor(m.model);
  const ok = r !== null && ["input", "cacheWrite", "cacheRead", "output"].every((k) => typeof r[k] === "number");
  const computed = ok
    ? (m.input * r.input + m.cacheWrite * r.cacheWrite + m.cacheRead * r.cacheRead + m.output * r.output) / 1e6
    : null;
  return { ...m, computedUSD: computed };
});
const reportedTotal = result.total_cost_usd ?? null;
const computedTotal = priced.every((m) => m.computedUSD !== null)
  ? priced.reduce((a, m) => a + m.computedUSD, 0) : null;
const drift = computedTotal !== null && reportedTotal ? Math.abs(computedTotal - reportedTotal) / reportedTotal : null;

// ── time ────────────────────────────────────────────────────────────────────
const totalMs = result.duration_ms ?? 0;
const apiMs = result.duration_api_ms ?? 0;
const toolMs = [...timeBy.values()].reduce((a, b) => a + b, 0);
// Wall clock is not the sum of its parts: the API clock and a tool clock can
// overlap, and some wall time belongs to neither (the harness itself). The
// remainder is reported rather than distributed.
const otherMs = Math.max(0, totalMs - apiMs - toolMs);

const min = (ms) => ms / 60000;
const pct = (ms) => (totalMs ? (100 * ms) / totalMs : 0);
const fmtN = (n) => n.toLocaleString("en-US");

const report = {
  run: path.resolve(runDir),
  model: models[0]?.model ?? null,
  time: {
    totalMin: +min(totalMs).toFixed(1),
    modelMin: +min(apiMs).toFixed(1),
    byActivity: Object.fromEntries([...timeBy.entries()].sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, { min: +min(v).toFixed(1), calls: callsBy.get(k) ?? 0 }])),
    unattributedMin: +min(otherMs).toFixed(1),
  },
  tokens: Object.fromEntries(models.map((m) => [m.model,
    { input: m.input, cacheWrite: m.cacheWrite, cacheRead: m.cacheRead, output: m.output, thinking: m.thinking }])),
  cost: { reportedUSD: reportedTotal, computedUSD: computedTotal, pricingAsOf: pricing.asOf ?? null,
          agrees: drift === null ? null : drift <= 0.02 },
  // `turns` is the CLI's own count (a turn is a request/response round); the
  // assistant-message count is larger and is not the same unit, so it is not
  // reported as one.
  shape: { turns: result.num_turns ?? turns, toolCalls: calls.length, failedChecks: failures },
  friction: {
    diagnostics: [...codes.values()].sort((a, b) => b.occasions - a.occasions || b.count - a.count)
      .map((v) => ({ code: v.code, seen: v.count, compiles: v.occasions, sites: v.positions.size, said: v.said })),
    helpAsked: Object.fromEntries([...helpFor.entries()].sort((a, b) => b[1] - a[1])),
    searchesThatFoundNothing: searched.filter((s) => s.found === false).map((s) => s.pattern),
    reReadFiles: Object.fromEntries([...readCount.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 12)),
    truncatedOutputs: truncated,
    permissionDenials: (result.permission_denials ?? []).length,
    correctionsNeedingEyes: eyesCycles,
  },
};

if (JSON_OUT) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${path.basename(path.resolve(runDir))} — ${report.model ?? "unknown model"}\n`);

console.log("TOKENS");
for (const m of priced) {
  console.log(`  ${m.model}`);
  console.log(`    ${pad("uncached input", 22)} ${fmtN(m.input).padStart(12)}`);
  console.log(`    ${pad("input → cache", 22)} ${fmtN(m.cacheWrite).padStart(12)}`);
  console.log(`    ${pad("cache → input", 22)} ${fmtN(m.cacheRead).padStart(12)}`);
  console.log(`    ${pad("output", 22)} ${fmtN(m.output).padStart(12)}${m.thinking ? `   (thinking ${fmtN(m.thinking)})` : ""}`);
}

console.log("\nCOST");
if (computedTotal !== null) {
  console.log(`  from the rate table (${pricing.asOf ?? "undated"})   $${computedTotal.toFixed(2)}`);
  console.log(`  as the CLI reported it                  $${(reportedTotal ?? 0).toFixed(2)}`);
  if (drift !== null && drift > 0.02) {
    console.log(`  ⚠ they differ by ${(drift * 100).toFixed(1)}% — the rate table in evals/harness/pricing.json is probably stale`);
  }
} else {
  console.log(`  $${(reportedTotal ?? 0).toFixed(2)}  (as the CLI reported it — no rates for this model in evals/harness/pricing.json,`);
  console.log(`      so the per-class split is unpriced; fill the table in to compute it here)`);
}

console.log("\nTIME");
console.log(`  ${pad("model (the API)", 22)} ${min(apiMs).toFixed(1).padStart(6)} min   ${pct(apiMs).toFixed(0).padStart(3)}%`);
for (const [bucket, ms] of [...timeBy.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pad(bucket, 22)} ${min(ms).toFixed(1).padStart(6)} min   ${pct(ms).toFixed(0).padStart(3)}%   ${callsBy.get(bucket)} calls`);
}
console.log(`  ${pad("unattributed", 22)} ${min(otherMs).toFixed(1).padStart(6)} min   ${pct(otherMs).toFixed(0).padStart(3)}%`);
console.log(`  ${pad("TOTAL", 22)} ${min(totalMs).toFixed(1).padStart(6)} min`);

console.log("\nSHAPE (collected, not judged)");
console.log(`  turns ${report.shape.turns} · tool calls ${calls.length} · checks that reported failure ${failures}`);

console.log("\nFRICTION — where a change to the code, the docs, or the packaging would pay");
const fr = report.friction;
const diagList = fr.diagnostics;
if (diagList.length) {
  console.log("  what authors got wrong — by MESSAGE (seen × / on N compiles / at M sites)");
  for (const d of diagList.slice(0, 8)) {
    console.log(`    ${String(d.seen).padStart(3)}× / ${String(d.compiles).padStart(2)} / ${String(d.sites).padStart(2)}  [${d.code}] ${d.said.slice(0, 78)}`);
  }
  const repeats = diagList.filter((d) => d.compiles > 1).length;
  if (repeats) console.log(`    ⇒ ${repeats} message(s) met on MORE THAN ONE compile — the ones that did not teach the first time`);
}
const helps = Object.entries(fr.helpAsked);
if (helps.length) {
  console.log(`  declare-help asked ${helps.reduce((a, [, n]) => a + n, 0)}× about ${helps.length} topics`);
  console.log(`    ${helps.slice(0, 10).map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join(", ")}`);
}
if (fr.searchesThatFoundNothing.length) {
  console.log(`  hunted for and did not find (expected it to exist under that name)`);
  console.log(`    ${[...new Set(fr.searchesThatFoundNothing)].slice(0, 8).join(" · ")}`);
}
const rr = Object.entries(fr.reReadFiles);
if (rr.length) {
  console.log("  read more than once");
  console.log(`    ${rr.slice(0, 8).map(([f, n]) => `${f}×${n}`).join(", ")}`);
}
console.log(`  corrections that needed eyes (render → edit) ${fr.correctionsNeedingEyes} · truncated outputs ${fr.truncatedOutputs} · permission denials ${fr.permissionDenials}`);

if (SHOW_CALLS) {
  console.log("\nEVERY CALL, slowest first — audit the buckets here");
  for (const c of calls.sort((a, b) => b.ms - a.ms).slice(0, 40)) {
    console.log(`  ${(c.ms / 1000).toFixed(1).padStart(7)}s  ${pad(c.bucket, 14)} ${c.cmd}`);
  }
}
console.log();
