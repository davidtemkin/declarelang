// test/dist-freshness.test.mjs — a COMMITTED production build must still describe
// the tree it was built from.
//
// `dist/` is intentionally committed (.gitignore §31: "so the whole tree hosts and
// runs as-is, no build step — the OpenLaszlo distribution model"). That makes a
// stale one a real defect: anyone deploying the directory ships an older app than
// the repo contains, and nothing says so. It happened — apps/homepage/dist sat five
// days and a redesign behind its source, with no shots/ at all, and was only noticed
// by accident.
//
// The check is the compiler's OWN freshness predicate, not a second mechanism.
// `declarec` writes the dependency closure it already computed into BUILD.json, and
// `isUpToDate(closure, props, probe)` answers the question — the same call the dev
// server makes (server/toolchain-worker.mjs:54). So an include or an auto-included
// library changing invalidates correctly, which a hand-maintained input list could
// never get right.
//
// Ids are stored repo-relative (a closure id is environment-local — absolute on
// disk — and absolute paths in a committed file are machine-specific), so the probe
// resolves them against the repo root before stat'ing.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { isUpToDate, diskProbe } from "../compiler/dist/compile-node.js";
import { test, summarize } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Every committed app dist: any apps/<name>/dist that carries a BUILD.json. */
function committedDists() {
  const appsDir = join(ROOT, "apps");
  if (!existsSync(appsDir)) return [];
  return readdirSync(appsDir)
    .map((a) => ({ app: a, dir: join(appsDir, a, "dist") }))
    .filter((d) => existsSync(join(d.dir, "BUILD.json")));
}

const dists = committedDists();

// A dist WITHOUT a BUILD.json is the older failure mode — it cannot be checked at
// all. Named separately so the gap is visible rather than silently skipped.
await test("every committed app dist carries a BUILD.json", async () => {
  const appsDir = join(ROOT, "apps");
  const unchecked = readdirSync(appsDir)
    .filter((a) => existsSync(join(appsDir, a, "dist")))
    .filter((a) => !existsSync(join(appsDir, a, "dist", "BUILD.json")));
  assert.deepEqual(unchecked, [],
    `dist without BUILD.json (rebuild with \`node tools/declarec.mjs apps/<app>/<app>.declare -o apps/<app>/dist\`): ${unchecked.join(", ")}`);
});

for (const { app, dir } of dists) {
  await test(`committed dist for ${app} validates against the tree`, async () => {
    const build = JSON.parse(readFileSync(join(dir, "BUILD.json"), "utf8"));
    const probe = (e) => diskProbe({ ...e, id: join(ROOT, e.id) });
    const fresh = isUpToDate(build.closure, build.closure.props, probe);
    assert.ok(fresh,
      `stale committed dist apps/${app}/dist — rebuild with ` +
      `\`node tools/declarec.mjs apps/${app}/${app}.declare -o apps/${app}/dist --crawler\``);
  });
}

summarize("dist-freshness");
