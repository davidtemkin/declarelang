// ops — the operations registry, EXECUTED (docs/system-design/verification.md gap #5):
// every `test: true` entry in tools/internal/ops.mjs runs with its declared expectation.
// The same entries the docs render (assemble.mjs marker-injections) are the
// entries performed here — procedure prose and procedure reality cannot
// diverge, because both are projections of one record.
import { spawn, execSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { OPS, testableOps } from "../tools/internal/ops.mjs";
import { test, summarize } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "my-apps/__ops_smoke.declare");

// the fixture the authoring entries run against — written canon so --check passes
mkdirSync(join(ROOT, "my-apps"), { recursive: true });
writeFileSync(FIXTURE, `App [ width = 200, height = 100, fill = white,
    Text [ x = 20, y = 20, text = "ops smoke" ]
    ]
`);

for (const op of testableOps()) {
  const cmd = op.testCmd ?? op.cmd;
  if (op.longRunning) {
    await test(`ops: ${op.id} — \`${op.cmd}\` comes up (${JSON.stringify(op.expect)})`, () => new Promise((res, rej) => {
      const [bin, ...args] = ["sh", "-c", cmd];
      const p = spawn(bin, args, { cwd: ROOT, env: { ...process.env } });
      let out = "", done = false;
      const finish = (err) => { if (done) return; done = true; p.kill(); err ? rej(err) : res(); };
      p.stdout.on("data", (d) => { out += d; if (op.expect.stdoutIncludes && out.includes(op.expect.stdoutIncludes)) finish(); });
      p.stderr.on("data", (d) => { out += d; });
      p.on("exit", () => finish(done ? undefined : new Error(`exited before expected output; got: ${out.slice(0, 300)}`)));
      setTimeout(() => finish(new Error(`timeout waiting for "${op.expect.stdoutIncludes}"; got: ${out.slice(0, 300)}`)), 15000);
    }));
  } else {
    await test(`ops: ${op.id} — \`${cmd}\` (${JSON.stringify(op.expect)})`, () => {
      let out = "", code = 0;
      try { out = execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
      catch (e) { code = e.status ?? 1; out = (e.stdout ?? "") + (e.stderr ?? ""); }
      if (op.expect.exitCode !== undefined && code !== op.expect.exitCode) throw new Error(`exit ${code}, expected ${op.expect.exitCode}: ${out.slice(0, 300)}`);
      if (op.expect.stdoutIncludes && !out.includes(op.expect.stdoutIncludes)) throw new Error(`stdout missing "${op.expect.stdoutIncludes}": ${out.slice(0, 300)}`);
    });
  }
}

rmSync(FIXTURE, { force: true });

// ── the SKILL gate — the agent's front door cannot drift silently ────────────
// SKILL.md is the map an agent reads before any file, and it rots in three
// mechanical ways this gate closes (each one was found rotted, by hand, on
// 2026-08-07): a path pointing at a chapter that was renamed out from under
// it; a chapter added to the guide that the task table never learned about;
// and the two shipped copies (skill/ and .claude/skills/declare/) drifting
// apart. What no gate can check is whether a row still DESCRIBES its chapter
// — that residue belongs to the periodic prose-consistency audit.

await test("ops: skill-gate — the two SKILL.md copies are byte-identical", () => {
  const a = readFileSync(join(ROOT, "skill/SKILL.md"), "utf8");
  const b = readFileSync(join(ROOT, ".claude/skills/declare/SKILL.md"), "utf8");
  if (a !== b) throw new Error("skill/SKILL.md and .claude/skills/declare/SKILL.md differ — edit both, or copy one over the other");
});

await test("ops: skill-gate — every repo path SKILL.md names exists", () => {
  const s = readFileSync(join(ROOT, "skill/SKILL.md"), "utf8");
  const paths = [...s.matchAll(/`((?:docs|tools|library|apps)\/[A-Za-z0-9._/-]+)`/g)].map((m) => m[1]);
  const dead = [...new Set(paths)].filter((p) => !existsSync(join(ROOT, p)));
  if (dead.length) throw new Error("SKILL.md names paths that do not exist: " + dead.join(", "));
});

await test("ops: skill-gate — every guide chapter is on the skill's map", () => {
  // The intro chapter is deliberately absent: the skill routes TASKS, and
  // chapter 1 is the pitch. Everything else must appear — in the table or
  // the parenthetical — so a new chapter cannot ship invisible to agents.
  const EXEMPT = new Set(["01-thinking-in-declare.md"]);
  const s = readFileSync(join(ROOT, "skill/SKILL.md"), "utf8");
  const chapters = readdirSync(join(ROOT, "docs/guide")).filter((f) => /^\d+-.+\.md$/.test(f));
  const missing = chapters.filter((f) => !EXEMPT.has(f) && !s.includes(f));
  if (missing.length) throw new Error("guide chapters missing from SKILL.md: " + missing.join(", ") + " — add a task row (or an exemption with its reason)");
});

summarize("ops");
