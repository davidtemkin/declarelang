// verify-examples — CI truth-maintenance for the whole corpus (design/
// verify-and-evals.md §2.10). Every runnable example must climb the fast rungs
// (1–4: compile, resolve, typecheck, headless boot) on every commit, and every
// component-library source must do the same under the probe wrapper (--wrap).
// This is the mechanized version of "the examples still work" — a compiler or
// runtime change that breaks a real program fails here, in seconds, no browser.
//
// The slow rungs (5–6: real input, pixels) stay in the perceptual suite and in
// per-app assert/state scripts, run pre-release — not on every commit.
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;

function verify(file, extra = []) {
  const r = spawnSync("node", [join(ROOT, "tools/verify.mjs"), file, "--json", "--rung", "4", ...extra], { cwd: ROOT, encoding: "utf8" });
  try { return JSON.parse(r.stdout); } catch { return { ok: false, _crash: (r.stderr || r.stdout || "").slice(-300) }; }
}

function test(name, fn) {
  try { fn(); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}

function assertClean(rep, label) {
  if (!rep.ok) {
    const why = rep._crash ?? (rep.diagnostics ?? []).filter((d) => d.severity === "error").map((d) => `${d.code} ${d.message}`).join("; ") ?? `failed at R${rep.rungFailed}`;
    throw new Error(`${label}: did not climb to R4 — ${why}`);
  }
  if (rep.rungClimbed < 4) throw new Error(`${label}: only climbed to R${rep.rungClimbed}`);
}

// ── every runnable example ───────────────────────────────────────────────────
const examples = readdirSync(join(ROOT, "examples"))
  .map((n) => join("examples", n, `${n}.declare`))
  .filter((f) => existsSync(join(ROOT, f)) && statSync(join(ROOT, f)).isFile());

for (const f of examples) {
  test(`example ${f} — clean through R4 (compile, typecheck, boot)`, () => assertClean(verify(f), f));
}

// ── every component-library source, under the probe wrapper ──────────────────
const libDir = join(ROOT, "library/src");
const libFiles = existsSync(libDir)
  ? readdirSync(libDir).filter((n) => n.endsWith(".declare")).map((n) => join("library/src", n))
  : [];

for (const f of libFiles) {
  test(`component ${f} — clean through R4 under --wrap probe`, () => assertClean(verify(f, ["--wrap"]), f));
}

console.log(`\nverify-examples: ${pass} passed, ${fail} failed (${examples.length} examples, ${libFiles.length} components)`);
process.exit(fail === 0 ? 0 : 1);
