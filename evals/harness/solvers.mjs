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
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

export function runClaude(prompt, model, opts = {}) {
  return new Promise((res, rej) => {
    const args = ["-p", "--output-format", "json"];
    if (model) args.push("--model", model);
    // agentic mode: read-only tools, cwd = the sandbox (created OUTSIDE the
    // repo — sandbox.mjs — so reads cannot reach source or reference answers)
    if (opts.tools) args.push("--allowedTools", opts.tools);
    const p = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"], cwd: opts.cwd });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => rej(e));
    p.on("close", (code) => {
      if (code !== 0 && !out) return rej(new Error(`claude exited ${code}: ${err.slice(-400)}`));
      let text = out, tokens = null, usage = null;
      try {
        const j = JSON.parse(out);
        text = j.result ?? j.text ?? out;
        const u = j.usage ?? {};
        const inTok = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        const outTok = u.output_tokens ?? 0;
        tokens = inTok + outTok || null;
        // raw accounting detail — the Run-2 anomaly (1-1.9M on final iterations)
        // needs the breakdown to be diagnosable; keep both shapes the CLI emits
        usage = { usage: j.usage ?? null, modelUsage: j.modelUsage ?? null };
      } catch { /* plain-text output format — leave text as-is */ }
      res({ text, tokens, usage });
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
      const { text, tokens, usage } = await runClaude(prompt, model);
      return { source: extractProgram(text), tokens, usage, raw: text };
    },
  };
}

// ── claude-docs solver — the corpus-accessibility arm ───────────────────────
// The docs tree is in the SANDBOX (cwd), not the prompt: the model reads its
// way in through the README router with read-only tools. This measures the
// documentation ACCESS METHOD (layout, router, reading order), not just the
// prose — the walkable corpus consumed by the audience it claims to serve.
const SYSTEM_DOCS = `You are writing a program in Declare, a UI language that is NOT in your training data. The documentation is in the ./docs folder of the current directory — start at docs/README.md (the router) and read what you need with your file tools. The docs are the ONLY source of truth: where Declare resembles React, CSS, or HTML, do not assume the resemblance holds. When you are done reading, output ONLY the finished program inside a single \`\`\`declare code fence. No prose, no explanation.`;

function buildDocsPrompt({ brief, prior, report }) {
  const parts = [SYSTEM_DOCS, "\n\n# Task brief\n\n" + brief];
  if (prior != null) {
    parts.push(
      "\n\n# Your previous attempt\n\n\`\`\`declare\n" + prior + "\n\`\`\`",
      "\n\n# The checker's report on it\n\n\`\`\`\n" + report + "\n\`\`\`",
      "\n\nFix the problems the report names — it states the rule and the fix for each. Consult the docs again if needed. Output the corrected complete program in one \`\`\`declare fence.",
    );
  }
  return parts.join("");
}

export function claudeDocsSolver() {
  return {
    id: "claude-docs",
    async solve({ brief, prior, report, model, cwd }) {
      const prompt = buildDocsPrompt({ brief, prior, report });
      const { text, tokens, usage } = await runClaude(prompt, model, { cwd, tools: "Read,Glob,Grep" });
      return { source: extractProgram(text), tokens, usage, raw: text };
    },
  };
}

// ── claude-skill solver — the kernel+retrieval arm ──────────────────────────
// The resident KERNEL (skill/SKILL.md — the skill-format
// packaging: rules-that-break-instincts + a routing table) rides the prompt;
// the corpus rides the sandbox and is read SELECTIVELY per the routing table.
// Hypothesis (three-arm re-baseline): corpus-grade failure depth at
// near-brief cost. Pair with --corpus (the docs-tree sandbox).
const SKILL_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../skill/SKILL.md");

function buildSkillPrompt({ brief, prior, report }) {
  const kernel = readFileSync(SKILL_PATH, "utf8");
  const parts = [
    kernel,
    "\n\n# Task brief\n\n" + brief,
    "\n\nFollow the routing table: read ONLY the docs the task needs (your file tools; docs/ is in the current directory). Output ONLY the finished program inside a single \`\`\`declare code fence.",
  ];
  if (prior != null) {
    parts.push(
      "\n\n# Your previous attempt\n\n\`\`\`declare\n" + prior + "\n\`\`\`",
      "\n\n# The checker's report on it\n\n\`\`\`\n" + report + "\n\`\`\`",
      "\n\nApply exactly the fixes the report names. Output the corrected complete program in one \`\`\`declare fence.",
    );
  }
  return parts.join("");
}

export function claudeSkillSolver() {
  return {
    id: "claude-skill",
    async solve({ brief, prior, report, model, cwd }) {
      const prompt = buildSkillPrompt({ brief, prior, report });
      const { text, tokens, usage } = await runClaude(prompt, model, { cwd, tools: "Read,Glob,Grep" });
      return { source: extractProgram(text), tokens, usage, raw: text };
    },
  };
}


// ── claude-distro solver — the bootstrap arm ─────────────────────────────────
// The agent is a NEW USER: a fresh clone (sandbox.mjs makeDistroSandbox), a
// request in plain language, and nothing staged — no reference doc in the
// prompt, no coaching about which files exist. The framing tells it only what
// a real onboarding email would: you downloaded Declare, the repo explains
// itself, put the app at my-apps/app.declare, use the repo's own checker until
// it passes. Everything else — setup, discovery, the verify loop — is the
// product under test. Tools include Bash + Write: the agent installs, runs
// verify, and iterates ITSELF (the track is "agentic": one solver call, the
// loop lives inside it).
const SYSTEM_DISTRO = `You have just downloaded the Declare distribution — the current directory is a fresh clone. Declare is a UI language that is NOT in your training data; this repository is the ONLY source of truth, and it documents itself — start at README.md. Where Declare resembles React, CSS, or HTML, do not assume the resemblance holds.

Your job: build the app described in the request below, as a single Declare program at my-apps/app.declare. If the request mentions data files, they are at my-apps/fixtures/. Follow the repository's own getting-started for any setup you need, and use the repository's own checking tool on your program, fixing what it reports, until it passes clean. Do not modify anything outside my-apps/. When the checker passes, reply with exactly: DONE.`;

export function claudeDistroSolver() {
  return {
    id: "claude-distro",
    async solve({ brief, model, cwd }) {
      const prompt = SYSTEM_DISTRO + "\n\n# The request\n\n" + brief;
      const { text, tokens, usage } = await runClaude(prompt, model, {
        cwd, tools: "Read,Glob,Grep,Bash,Write,Edit",
      });
      // the deliverable is the FILE, not the reply — read it from the clone
      const appFile = join(cwd, "my-apps", "app.declare");
      const source = existsSync(appFile) ? readFileSync(appFile, "utf8") : null;
      return { source, tokens, usage, raw: text };
    },
  };
}

export function makeSolver(id) {
  if (id === "reference") return referenceSolver();
  if (id === "claude") return claudeSolver();
  if (id === "claude-docs") return claudeDocsSolver();
  if (id === "claude-skill") return claudeSkillSolver();
  if (id === "claude-distro") return claudeDistroSolver();
  throw new Error(`unknown solver '${id}' (use: reference | claude | claude-docs | claude-skill)`);
}
