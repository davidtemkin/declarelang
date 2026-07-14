// tools/bundle-freshness.mjs — the ONE freshness rule for the platform bundles.
//
// bundles/ carries two committed build artifacts — declare-boot.js (the
// boot-path graph: web client + runtime run-path) and declare-compiler.js (the
// in-browser compiler) — each a pure function of tree inputs that are fixed at
// platform build time. Correctness therefore must not depend on anyone
// REMEMBERING to rebuild them (the recorded footgun: edit the runtime, forget
// the rebundle, debug a stale page). This module makes staleness detectable
// and repairable in one call, and BOTH enforcement points ride it:
//
//   • the pre-commit hook (tools/hooks/pre-commit → stamp-version.mjs) rebuilds
//     any stale bundle BEFORE hashing the BUILD_ID, then stages it — a commit
//     cannot ship a stale bundle, by construction;
//   • the dev server rebuilds a stale bundle ON DEMAND when the artifact is
//     requested — the edit-refresh loop never sees staleness.
//
// The rule is mtime-based, the same currency as the /prod cache's disk
// validators: any input file newer than the artifact → rebuild. Inputs include
// each bundle's own build script (a config change rebuilds too).
// `bundles/version.json` is excluded — it is a stamp OUTPUT written after every
// platform change and would otherwise mark the boot bundle stale forever.

import { execFileSync } from "node:child_process";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Each committed bundle: the artifact, the script that builds it, and the
 *  input roots whose newest mtime gates it. runtime/dist feeds BOTH (the
 *  compiler bundle inlines the parser/check/schema; the boot bundle inlines
 *  the run path) — so a runtime change rebuilds both, which is exactly the
 *  staleness that used to ship. */
export const BUNDLES = [
  {
    out: "bundles/declare-boot.js",
    build: "tools/build-boot.mjs",
    inputs: ["browser", "runtime/dist", "compiler/dist/closure.js", "tools/build-boot.mjs"],
  },
  {
    out: "bundles/declare-compiler.js",
    build: "tools/build-compiler.mjs",
    inputs: ["compiler/dist", "runtime/dist", "tools/build-compiler.mjs"],
  },
];

function newestMtime(root, p) {
  const full = join(root, p);
  if (!existsSync(full)) return 0;
  const st = statSync(full);
  if (!st.isDirectory()) return st.mtimeMs;
  let newest = 0;
  for (const e of readdirSync(full).sort()) {
    if (e === "version.json") continue; // stamp OUTPUT, not an input (see header)
    newest = Math.max(newest, newestMtime(root, join(p, e)));
  }
  return newest;
}

/** Is this bundle's artifact older than any of its inputs (or missing)? */
export function isStale(root, bundle) {
  const out = join(root, bundle.out);
  if (!existsSync(out)) return true;
  const built = statSync(out).mtimeMs;
  return bundle.inputs.some((p) => newestMtime(root, p) > built);
}

/** Rebuild every stale bundle (or only those whose artifact path is in `only`).
 *  Synchronous — callers are a commit hook and an on-demand dev-server request,
 *  both of which WANT to wait for the fresh artifact. Returns what was rebuilt. */
export function rebuildStale(root, { only = null, log = console.error } = {}) {
  const rebuilt = [];
  for (const b of BUNDLES) {
    if (only !== null && !only.includes(b.out)) continue;
    if (!isStale(root, b)) continue;
    log(`bundle-freshness: ${b.out} is stale → node ${b.build}`);
    execFileSync(process.execPath, [join(root, b.build)], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
    rebuilt.push(b.out);
  }
  return rebuilt;
}
