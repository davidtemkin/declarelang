// ops — the operations registry, EXECUTED (docs/system-design/verification.md gap #5):
// every `test: true` entry in tools/internal/ops.mjs runs with its declared expectation.
// The same entries the docs render (assemble.mjs marker-injections) are the
// entries performed here — procedure prose and procedure reality cannot
// diverge, because both are projections of one record.
import { spawn, execSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { OPS, testableOps } from "../tools/internal/ops.mjs";
import { test, summarize } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "my-apps/__ops_smoke.declare");

// the fixture the authoring entries run against — written canon so --check passes
mkdirSync(join(ROOT, "my-apps"), { recursive: true });
writeFileSync(FIXTURE, `App [ width = 200, height = 100, fill = white,
    Text [ x = 20, y = 20, text = "ops smoke" ],
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
summarize("ops");
