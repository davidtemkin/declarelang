// ladder — the SLOW rungs, for every app that declares them.
//
// verify-apps.test.mjs climbs rungs 1–4 for the whole corpus on every `npm test`,
// deliberately stopping short of the browser (its header states the rule). That
// leaves rungs 5–6 — real input, real pixels — reachable only by remembering to
// type `--assert` / `--states` with the right paths, which is exactly the kind of
// step that silently stops happening. This runs them by DISCOVERY instead: any
// app that ships a `tests/` folder (tests/assert.mjs, tests/states.mjs,
// tests/baselines/) is climbed to the top of the ladder, and a new one is
// picked up by existing. The folder is the convention (operational/verify.md):
// it scopes the scripts to their app, and it is the packaging boundary — a
// deploy or package sweeps the app dir, and `tests/` is the one subtree that
// never ships.
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

/** Every app dir under apps/ that ships a `tests/` folder — the folder pairs
 *  with the .declare named after its dir (apps/controls/tests/ ↔
 *  apps/controls/controls.declare), so an app with sibling includes
 *  (viewer/tour.declare) still has exactly one ladder subject. */
function discover() {
  const found = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (!statSync(p).isDirectory()) continue;
      if (e === "node_modules" || e === "dist" || e === "baselines") continue;
      if (e !== "tests") { walk(p); continue; }
      const assert = join(p, "assert.mjs");
      const states = join(p, "states.mjs");
      if (!existsSync(assert) && !existsSync(states)) continue;
      const file = join(dir, basename(dir) + ".declare");
      if (!existsSync(file)) throw new Error(`ladder: ${p} has no ${basename(dir)}.declare beside it — tests/ pairs with the .declare named after its app dir`);
      found.push({ file, assert: existsSync(assert) ? assert : null, states: existsSync(states) ? states : null });
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
