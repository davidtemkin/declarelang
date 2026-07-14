// solvers — the generation seam. A solver takes a context (brief, reference doc,
// and on iterations the prior source + verify report) and returns a Declare
// program. The HARNESS owns the verify loop (§3.4 iterated track): the solver is
// pure "generate a program given this context", re-invoked each iteration with
// the failure report appended. This keeps token accounting clean, the loop
// deterministic, and every solver — reference or model — model-agnostic.
//
//   reference : returns the task's own reference.declare. Zero budget. The
//               shakedown + CI solver: it proves the harness mechanics and the
//               task's acceptance without spending a model call. On iteration 1
//               it's already green, so the loop exits immediately.
//   claude    : invokes `claude -p` headless with the brief-only context. Reports
//               token usage for free (§3.2). This is the real eval solver.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Pull the Declare program out of a model's reply: prefer a ```declare fence,
 *  then any fence, then the whole trimmed body. */
export function extractProgram(text) {
  const declare = /```declare\b[^\n]*\n([\s\S]*?)```/i.exec(text);
  if (declare) return declare[1].trim() + "\n";
  const any = /```[^\n]*\n([\s\S]*?)```/.exec(text);
  if (any) return any[1].trim() + "\n";
  return text.trim() + "\n";
}

// ── reference solver ─────────────────────────────────────────────────────────
export function referenceSolver() {
  return {
    id: "reference",
    async solve({ task }) {
      const src = readFileSync(join(task.dir, "reference.declare"), "utf8");
      return { source: src, tokens: 0, raw: src };
    },
  };
}

// ── claude solver ────────────────────────────────────────────────────────────
const SYSTEM = `You are writing a program in Declare, a UI language that is NOT in your training data. The reference below is the ONLY source of truth — where Declare resembles React, CSS, or HTML, do not assume the resemblance holds. Output ONLY the finished program inside a single \`\`\`declare code fence. No prose, no explanation.`;

function buildPrompt({ referenceDoc, brief, prior, report }) {
  const parts = [SYSTEM, "\n\n# Declare reference\n\n" + referenceDoc, "\n\n# Task brief\n\n" + brief];
  if (prior != null) {
    parts.push(
      "\n\n# Your previous attempt\n\n```declare\n" + prior + "\n```",
      "\n\n# The checker's report on it\n\n```\n" + report + "\n```",
      "\n\nFix the problems the report names — it states the rule and the fix for each. Output the corrected complete program in one ```declare fence.",
    );
  }
  return parts.join("");
}

function runClaude(prompt, model) {
  return new Promise((res, rej) => {
    const args = ["-p", "--output-format", "json"];
    if (model) args.push("--model", model);
    const p = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => rej(e));
    p.on("close", (code) => {
      if (code !== 0 && !out) return rej(new Error(`claude exited ${code}: ${err.slice(-400)}`));
      let text = out, tokens = null;
      try {
        const j = JSON.parse(out);
        text = j.result ?? j.text ?? out;
        const u = j.usage ?? {};
        const inTok = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        const outTok = u.output_tokens ?? 0;
        tokens = inTok + outTok || null;
      } catch { /* plain-text output format — leave text as-is */ }
      res({ text, tokens });
    });
    p.stdin.write(prompt);
    p.stdin.end();
  });
}

export function claudeSolver() {
  return {
    id: "claude",
    async solve({ referenceDoc, brief, prior, report, model }) {
      const prompt = buildPrompt({ referenceDoc, brief, prior, report });
      const { text, tokens } = await runClaude(prompt, model);
      return { source: extractProgram(text), tokens, raw: text };
    },
  };
}

export function makeSolver(id) {
  if (id === "reference") return referenceSolver();
  if (id === "claude") return claudeSolver();
  throw new Error(`unknown solver '${id}' (use: reference | claude)`);
}
