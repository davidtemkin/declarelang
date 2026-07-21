// ladder — the SLOW rungs, for every app that declares them.
//
// verify-apps.test.mjs climbs rungs 1–4 for the whole corpus on every commit,
// deliberately stopping short of the browser (its header states the rule). That
// leaves rungs 5–6 — real input, real pixels — reachable only by remembering to
// type `--assert` / `--states` with the right paths, which is exactly the kind of
// step that silently stops happening. This runs them by DISCOVERY instead: any
// app that ships a `<name>.assert.mjs` or `<name>.states.mjs` beside its program
// is climbed to the top of the ladder, and a new one is picked up by existing.
//
// Not part of `npm test` (that ruling stands — these need Chromium and take
// minutes). It is `npm run test:ladder`, and the pre-release step in the ops
// registry that names it.
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Every `*.declare` under apps/ that has an assert and/or states script named
 *  after it — the pairing convention (controls.declare ↔ controls.assert.mjs). */
function discover() {
  const found = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) { if (e !== "node_modules" && e !== "dist" && e !== "baselines") walk(p); continue; }
      if (!e.endsWith(".declare")) continue;
      const stem = p.slice(0, -".declare".length);
      const assert = stem + ".assert.mjs";
      const states = stem + ".states.mjs";
      if (existsSync(assert) || existsSync(states)) {
        found.push({ file: p, assert: existsSync(assert) ? assert : null, states: existsSync(states) ? states : null });
      }
    }
  };
  walk(join(ROOT, "apps"));
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

const apps = discover();
if (apps.length === 0) throw new Error("ladder: no app declares an assert or states script — discovery is broken");

// `--list` proves DISCOVERY without paying for a browser: this is what the ops
// smoke test executes, so the registry entry stays honest inside `npm test`
// while the rungs themselves stay pre-release.
if (process.argv.includes("--list")) {
  for (const a of apps) {
    console.log(`  ladder: ${a.file.slice(ROOT.length + 1)} — ${[a.assert && "R5", a.states && "R6"].filter(Boolean).join("+")}`);
  }
  console.log(`ladder: ${apps.length} app(s) discovered, not run (--list)`);
  process.exit(0);
}

for (const app of apps) {
  const rel = app.file.slice(ROOT.length + 1);
  const rungs = [app.assert && "R5", app.states && "R6"].filter(Boolean).join("+");
  await test(`ladder: ${rel} — ${rungs}`, () => {
    const args = [join(ROOT, "tools/verify.mjs"), app.file];
    if (app.assert) args.push("--assert", app.assert);
    if (app.states) args.push("--states", app.states);
    const r = spawnSync("node", args, { cwd: ROOT, encoding: "utf8" });
    if (r.status !== 0) {
      // verify's own diagnostics already name the failing rung and the fix —
      // surface them rather than restating.
      const out = ((r.stdout ?? "") + (r.stderr ?? "")).trimEnd();
      throw new Error(out.split("\n").slice(-6).join("\n      "));
    }
  });
}

console.log(`  (${apps.length} app${apps.length === 1 ? "" : "s"} with slow-rung scripts, discovered)`);
summarize("ladder");
