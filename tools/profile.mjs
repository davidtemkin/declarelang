#!/usr/bin/env node
// declare-profile — why a program is slow, or will not settle, in the terms it
// was written in (runtime/src/profile.ts; docs/operational/profile.md).
//
//   declare-profile <file.declare> [--scenario <script.mjs>] [--native]
//                   [--phone] [--size WxH] [--url <address>] [--fixtures <dir>] [--json] [--idle <ms>]
//   declare-profile <file.declare> --mac [--for <ms>] [--json]
//
// Profiles the program from its first settle: boot (what was built, by class;
// the first layout; the first data), then the scenario if one is given — a
// declare-verify behaviour script whose default export drives the program with
// real input — then `--idle` ms with nothing done (default 1000), which is when
// what will not settle shows. Prints the report: the costliest turns and the
// rules in each, fan-out (rules that ran often to little effect), rules by
// runs, what was built, and what is still moving.
//
// By default every rule runs in JavaScript (itemized), so the kernel's native
// arithmetic rules are named and counted too — the commonest fan-out is one of
// them. Their times are then slower than shipped: `--native` runs as shipped, for
// true times and frame times, and counts those rules only in total. There is
// no profile of a production build: production is development without the
// developer's checks, so a --native profile measures what ships. `--mac`
// profiles it in the Mac host instead, for `--for` ms (default 3000), with the
// host's own frames (tools/internal/profile-mac.mjs); a person may use the window.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const flag = (n) => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
const scenario = opt("--scenario"), url = opt("--url"), size = opt("--size"), idle = Number(opt("--idle") ?? 1000), fixtures = opt("--fixtures");
// itemized by default: every rule named and counted, the kernel's native arithmetic
// included — the counts are the point; --native runs as shipped, for true times
const mac = flag("--mac"), forMs = Number(opt("--for") ?? 3000);
const native = flag("--native"), itemize = !native && (flag("--itemize") || true), phone = flag("--phone"), json = flag("--json");
// which writes opened each turn: the wake trace copies the value table each settle, so
// it is left out of an as-shipped profile, which is for times
const why = !native && !flag("--no-why");
const file = argv[0];
if (!file) {
  console.error("usage: declare-profile <file.declare> [--scenario <script.mjs>] [--native] [--phone] [--size WxH] [--url <address>] [--fixtures <dir>] [--json] [--idle <ms>]");
  console.error("       declare-profile <file.declare> --mac [--for <ms>] [--json]");
  process.exit(2);
}
if (mac) {
  const { profileOnMac } = await import("./internal/profile-mac.mjs");
  try {
    const r = await profileOnMac({ file, forMs, why: !flag("--no-why") });
    console.log(json ? JSON.stringify({ ...r.report, host: r.host }, null, 2) : r.text);
    process.exit(0);
  } catch (e) { console.error(`declare-profile --mac: ${e.message}`); process.exit(1); }
}
const [w, h] = (size ?? (phone ? "390x844" : "1280x800")).split("x").map(Number);
const device = { width: w, height: h, touch: phone };

const dir = mkdtempSync(join(tmpdir(), "declare-profile-"));
const wrapper = join(dir, "profile.mjs");
writeFileSync(wrapper, `${scenario ? `import * as scenario from ${JSON.stringify(pathToFileURL(resolve(scenario)).href)};` : "const scenario = {};"}
export const device = scenario.device ?? ${JSON.stringify(device)};
export default async (ctx) => {
  const { drive } = ctx;
  await drive.profileFromBoot({ itemize: ${itemize}, why: ${why} });
  if (typeof scenario.default === "function") await scenario.default(ctx);
  // the idle: real time, and the program's own timers kept in step with it — the
  // harness holds a delayed timer until its clock is advanced, and a profile should
  // see an afterDelay fire when it would on a page
  for (let end = Date.now() + ${idle}, last = Date.now(); Date.now() < end;) {
    await new Promise((r) => setTimeout(r, 50));
    const now = Date.now();
    await drive.page.evaluate((ms) => globalThis.__declareTimers?.advance?.(ms), now - last);
    last = now;
  }
  const { report, text } = await drive.profileReport();
  console.log("<<<PROFILE");
  console.log(${json} ? JSON.stringify(report, null, 2) : text);
  console.log("PROFILE>>>");
};
`);
const args = [join(HERE, "verify.mjs"), resolve(file), "--assert", wrapper];
if (url) args.push("--url", url);
if (fixtures) args.push("--fixtures", resolve(fixtures));
const r = await run(args);
rmSync(dir, { recursive: true, force: true });
const out = r.stdout ?? "";
const m = out.match(/<<<PROFILE\n([\s\S]*?)\nPROFILE>>>/);
if (m) { console.log(m[1]); process.exit(0); }
// no report: say what declare-verify said, so the reason is visible
process.stdout.write(out);
process.stderr.write(r.stderr ?? "");
process.exit(r.status || 1);

/** A child node process, its output collected. */
function run(a) {
  return new Promise((res) => {
    const c = spawn("node", a, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    c.stdout.on("data", (d) => (stdout += d)); c.stderr.on("data", (d) => (stderr += d));
    c.on("close", (status) => res({ status, stdout, stderr }));
  });
}
