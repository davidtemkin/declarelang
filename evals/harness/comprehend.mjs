#!/usr/bin/env node
// comprehend — the COMPREHENSION track (design/verify-and-evals.md §3.4): given a
// program, answer behavior/provenance questions. Isolates READ analyzability — no
// generation confound; the cheapest track, run most often.
//
// The house move: THE COMPILER IS THE ANSWER KEY. Every item is GENERATED, not
// hand-authored, from mechanical oracles:
//   - settled-value items: settleHeadless() at the canonical viewport → "what is
//     <named view>.width at t=0?" — the settled number IS the key;
//   - provenance items: the dep extractor's read-paths → "which attribute reads
//     does this { } constraint re-run on?" — the extracted deps ARE the key;
//   - replication items: instance counts in the settled tree.
// Regenerable forever, zero authoring drift: if the compiler changes, the keys
// change with it, by construction.
//
//   node evals/harness/comprehend.mjs [--programs a.declare,b.declare]
//     [--model sonnet] [--per-kind 4] [--run NAME]
//
// One model call per program (all items in one prompt, JSON answers back);
// scoring is exact/tolerance match — no judge. Metrics land like the other
// tracks': evals/runs/<run>/comprehension-metrics.jsonl.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "../../compiler/dist/compile-node.js";
import { settleHeadless } from "../../compiler/dist/headless.js";
import { parseProgram, forEachCodeValue } from "../../runtime/dist/index.js";
import { inspect } from "../../runtime/dist/inspect.js";
import { runClaude } from "./solvers.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const val = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const MODEL = val("model", "sonnet");
const PER_KIND = Number(val("per-kind", 4));
const RUN = val("run", "comprehend-" + new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-"));
const PROGRAMS = val("programs",
  "evals/tasks/collection/reference.declare,evals/tasks/compose/reference.declare,evals/tasks/modes/reference.declare"
).split(",").map((s) => s.trim());

// the resident kernel — comprehension needs the value-rule knowledge to READ
const KERNEL = readFileSync(join(ROOT, "evals/skill/declare/SKILL.md"), "utf8");

// ── item generation (the oracle side) ────────────────────────────────────────

/** Named views with their app-rooted paths, via the runtime's own inspect()
 *  (names live on the PARENT as properties, not on instances — inspect's
 *  nameOf already solves that). Numeric-indexed (unnamed/replicated) segments
 *  are excluded: a question must address a stable name. */
function namedViews(app) {
  const out = [];
  const walk = (n) => {
    for (const c of n.children ?? []) {
      if (!/\.\d+(\.|$)/.test(c.path) && c.path !== "app") out.push({ node: c, path: c.path });
      walk(c);
    }
  };
  walk(inspect(app));
  return out;
}

function generateItems(source) {
  const r = compile(source, {});
  if (r.errors.length) throw new Error("comprehension source must be green: " + r.errors[0].message);
  const app = settleHeadless(r.source, { deps: r.deps });
  const items = [];
  try {
    // 1. settled-value items — numeric geometry of named views at the canonical env
    const named = namedViews(app).filter((n) => Number.isFinite(n.node.width) && n.node.width > 0);
    for (const n of named.slice(0, PER_KIND)) {
      for (const attr of ["width", "x"]) {
        items.push({
          kind: "settled-value",
          q: `At t=0 in the canonical 1200×800 host, what is the value of \`${n.path}.${attr}\` (integer px)?`,
          key: Math.round(n.node[attr]),
          tolerance: 1,
        });
      }
    }
    // 2. provenance items — the dep extractor's read-paths, ZIPPED onto the
    // walk order (deps ride the compile() result's side-list, aligned with
    // forEachCodeValue by construction — deps.ts's own contract).
    const prog = parseProgram(r.source);
    const withDeps = [];
    let di = 0;
    forEachCodeValue(prog, (v) => {
      const deps = r.deps?.[di++] ?? [];
      if (deps.length > 0 && deps.length <= 4) withDeps.push({ src: v.src, deps });
    });
    for (const v of withDeps.slice(0, PER_KIND)) {
      items.push({
        kind: "provenance",
        q: `Which attribute read-paths does the constraint \`{ ${String(v.src).trim().slice(0, 80)} }\` re-run on? Answer as a comma-separated list of paths exactly as a dependency extractor would name them.`,
        key: [...v.deps].sort(),
      });
    }
    // 3. replication items — instance counts under the settled tree, USER-DECLARED
    // classes only (library components multiply internally — Text inside Button —
    // which made the count ambiguous to a source-reader; baseline misses were item
    // ambiguity, not model failure).
    const userClasses = new Set(prog.classes.map((c) => c.name));
    const counts = new Map();
    const count = (v) => { for (const c of v.children ?? []) { const t = c.constructor?.name ?? "?"; if (userClasses.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1); count(c); } };
    count(app);
    const repl = [...counts.entries()].filter(([, n]) => n >= 3).slice(0, Math.max(1, PER_KIND - 2));
    for (const [cls, n] of repl) {
      items.push({ kind: "replication", q: `How many instances of \`${cls}\` exist in the settled tree at t=0 (integer)?`, key: n, tolerance: 0 });
    }
  } finally {
    app.discard();
  }
  return items;
}

// ── ask + score ──────────────────────────────────────────────────────────────

function normPath(s) { return String(s).trim().replace(/^this\./, "").replace(/^app\./, "root."); }

function scoreItem(item, ans) {
  if (ans == null) return false;
  if (item.kind === "provenance") {
    const got = String(ans).split(",").map((x) => normPath(x)).filter(Boolean).sort();
    const want = item.key.map(normPath).sort();
    return got.length === want.length && got.every((g, i) => g === want[i]);
  }
  const n = Number(String(ans).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && Math.abs(n - item.key) <= (item.tolerance ?? 0);
}

async function runProgram(rel) {
  const source = readFileSync(join(ROOT, rel), "utf8");
  const items = generateItems(source);
  const qlist = items.map((it, i) => `Q${i + 1} (${it.kind}): ${it.q}`).join("\n");
  const prompt = `${KERNEL}

# Task: READ the Declare program below and answer the questions about its settled behavior. Do not run anything — derive the answers from the source.

\`\`\`declare
${source}
\`\`\`

# Questions

${qlist}

Answer with ONLY a JSON object: {"Q1": <answer>, "Q2": <answer>, …}. A provenance answer is a comma-separated string of read-paths. A numeric answer is a bare integer.`;
  const { text, tokens } = await runClaude(prompt, MODEL);
  let answers = {};
  try { answers = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { /* unparseable → all wrong */ }
  const results = items.map((it, i) => ({ kind: it.kind, ok: scoreItem(it, answers[`Q${i + 1}`]), key: it.key, got: answers[`Q${i + 1}`] ?? null }));
  return { program: rel, items: results, tokens, accuracy: results.filter((x) => x.ok).length / results.length };
}

// ── main ─────────────────────────────────────────────────────────────────────

const runDir = join(ROOT, "evals/runs", RUN);
mkdirSync(runDir, { recursive: true });
const metricsFile = join(runDir, "comprehension-metrics.jsonl");
let lines = "";
console.log(`comprehension run '${RUN}' — model=${MODEL} · ${PROGRAMS.length} program(s)\n`);
for (const rel of PROGRAMS) {
  process.stdout.write(`  ${rel} … `);
  try {
    const res = await runProgram(rel);
    const byKind = {};
    for (const it of res.items) { byKind[it.kind] = byKind[it.kind] ?? { ok: 0, n: 0 }; byKind[it.kind].n++; if (it.ok) byKind[it.kind].ok++; }
    console.log(`${Math.round(res.accuracy * 100)}% (${res.items.filter((x) => x.ok).length}/${res.items.length}) · ${Math.round((res.tokens ?? 0) / 1000)}K tok · ` +
      Object.entries(byKind).map(([k, v]) => `${k} ${v.ok}/${v.n}`).join(" · "));
    lines += JSON.stringify({ ts: new Date().toISOString(), run: RUN, model: MODEL, ...res }) + "\n";
  } catch (e) {
    console.log("ERROR: " + (e?.message ?? e));
    lines += JSON.stringify({ ts: new Date().toISOString(), run: RUN, model: MODEL, program: rel, error: String(e?.message ?? e) }) + "\n";
  }
}
writeFileSync(metricsFile, lines);
console.log(`\n  metrics → ${join("evals/runs", RUN, "comprehension-metrics.jsonl")}`);
