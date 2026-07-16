#!/usr/bin/env node
// tools/internal/stamp-version.mjs — stamp a content-hash BUILD_ID into service-worker.js (and write
// bundles/version.json).
// Host-agnostic cache-busting, run once before every deploy:
//
//   node tools/internal/stamp-version.mjs
//
// then deploy the tree however you deploy (commit + push for GitHub Pages; upload for S3 /
// nginx / Cloudflare Pages / any static host — no build pipeline required).
//
// The hash covers the PLATFORM — the runtime, the in-browser compiler bundle, the web client,
// this static shell, and the worker. When any of those change, the hash changes, which changes
// service-worker.js's bytes; the browser then installs the new worker, whose `activate` drops the old cache
// bucket and reloads open clients onto the fresh build. App SOURCE changes do NOT need a
// re-stamp — the SW revalidates every asset (no-cache) and boot-static's closure check already
// re-verifies each program's sources by content hash.
//
// Idempotent: only rewrites files when the id actually changed, so a pre-deploy/pre-commit hook
// produces no churn when nothing platform-relevant moved.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { rebuildStale } from "./bundle-freshness.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

// FIRST: the committed platform bundles (bundles/) are pure functions of
// tree inputs — rebuild any that are stale BEFORE hashing, so the BUILD_ID
// always describes FRESH artifacts and a commit cannot ship a stale bundle
// (tools/internal/bundle-freshness.mjs; the pre-commit hook stages bundles/ after
// this runs). One path, correctness by construction — never by remembering.
rebuildStale(ROOT, { log: console.log });
const SW = join(ROOT, "service-worker.js");
const VERSION_JSON = join(ROOT, "bundles", "version.json");   // the build record (lives beside the built bundles)
const BUILD_RE = /const BUILD_ID = "[^"]*";/;

// Platform inputs whose change should bust all caches + force a worker update. NOT bare "." —
// the runtime's own dist and the compiler bundle carry all the compiled behavior, `browser/` the
// client + the boot modules the worker's host page loads. `bundles/version.json` is skipped in the
// walk below (it lives inside a hashed input, so hashing it would be self-referential).
const INPUTS = [
  "index.html",
  "service-worker.js",
  "browser",                             // register-sw.js, boot-static.js, host-client.js, compiler-client.js
  "bundles",                             // the platform bundles: compiler, boot (declare-boot.js), compile worker
  "compiler/dist/closure.js",            // the freshness core boot-static imports
  "runtime/dist",                        // the runtime
  "library",                             // auto-include manifest + sources (browse-to-run compiles against these)
];

function* walk(p) {
  if (!existsSync(p)) return;
  const st = statSync(p);
  if (st.isDirectory()) for (const e of readdirSync(p).sort()) yield* walk(join(p, e));
  else if (!p.endsWith("version.json")) yield p;   // never hash the generated build record (self-referential)
}

const swText = readFileSync(SW, "utf8");
if (!BUILD_RE.test(swText)) {
  console.error('stamp-version: could not find `const BUILD_ID = "...";` in service-worker.js');
  process.exit(1);
}

const h = createHash("sha256");
// Hash the worker with its BUILD_ID line NORMALIZED, so stamping isn't self-referential.
h.update(swText.replace(BUILD_RE, 'const BUILD_ID = "";'));
for (const input of INPUTS) {
  if (input === "service-worker.js") continue;   // already hashed (normalized) above
  for (const f of walk(join(ROOT, input))) {
    h.update(relative(ROOT, f));     // path (so renames/moves count)
    h.update(readFileSync(f));       // content
  }
}
const build = h.digest("hex").slice(0, 12);

const current = (swText.match(/const BUILD_ID = "([^"]*)";/) || [])[1];
if (current === build) {
  console.log("stamp-version: unchanged (BUILD_ID =", build + ")");
  process.exit(0);
}
writeFileSync(SW, swText.replace(BUILD_RE, `const BUILD_ID = "${build}";`));
writeFileSync(VERSION_JSON, JSON.stringify({ build }, null, 2) + "\n");
console.log("stamp-version: BUILD_ID", current || "(none)", "->", build);
