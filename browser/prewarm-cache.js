// browser/prewarm-cache.js — the COMMITTED pre-warm cache tier (docs/system-design/hosting.md).
//
// An optional, additive fast path for the static deploy: a small CURATED set of
// programs (the homepage, the flagship apps) ship PRECOMPILED in the tree —
// tools/internal/prewarm.mjs writes bundles/cache/<key>.json in the derive chain.
// A page that HAS a build loads it and renders: no compiler download, no
// recompile, and no validation round trips either.
//
// TWO REQUESTS, NOT ONE ALGORITHM. Loading a build and resolving a source are
// different questions, and the caller knows which it is asking BEFORE it asks:
//
//   • LOAD A BUILD — this module. Unconditional. browser/prewarm-manifest.js says
//     whether a build exists for this program, so the answer costs no request; if
//     it does, fetch it and render it.
//   • RESOLVE A SOURCE — boot-uniform's compile path. Closure-checked against the
//     last compile, recompiled when anything moved, cached. That is the dev loop,
//     and the cold static case for everything not on the list.
//
// Until 2026-08-12 this was one speculative chain instead: boot computed a key,
// fetched it to discover whether an artifact existed (a 404 on every load of every
// program not on the curated list), and then — because a speculative tier cannot
// be trusted to short-circuit — re-fetched EVERY entry of the stored closure in
// full and re-hashed it before daring to use what it already held. Measured on
// apps/tracker: 1 request for the artifact, then 18 more totalling 230 KB, of
// which 15 were library sources shared with every other app, all discarded after
// hashing. The client held a renderable program after request one and spent the
// rest asking permission.
//
// WHERE THE GUARANTEE LIVES NOW. Trust is the deployment's assertion, established
// once at build time rather than re-established by every reader on every load:
//   • PLATFORM — the committed files live under bundles/, which stamp-version
//     hashes into the BUILD_ID; a runtime/compiler/library change rebumps it and
//     the service worker drops the old cache bucket.
//   • APP SOURCE — derive regenerates every artifact from current sources, and
//     pre-push REFUSES a push whose derived artifacts are stale on disk or fresh
//     but uncommitted. A deploy therefore cannot carry an artifact that disagrees
//     with the source shipped beside it. (`--no-verify` owns its consequence; CI
//     is the net under it.)
//
// This module is the SINGLE ORACLE for HOW an artifact key is computed:
// tools/internal/prewarm.mjs (the writer) and the readers derive it HERE, so a key
// can never be computed two ways. WHICH keys exist is the manifest's oracle, next
// door. Browser-safe (imports only the pure closure core) so the Node build tool
// can import prewarmKey unchanged.

import { fnv1a } from "../compiler/dist/closure.js";

/** The committed-artifact key: a stable filename under bundles/cache/ derived from
 *  the program's DEPLOY-RELATIVE main path, the artifact kind (`run` — the only one), and
 *  the compiler properties (render backend). Origin-independent by construction —
 *  the build hook cannot know the deploy origin, so nothing origin-specific enters
 *  the key. BUILD_ID is deliberately absent: the file lives under bundles/ (already
 *  BUILD_ID-gated by the service worker bucket) and its content is validated by the
 *  closure, so salting the name would only defeat the SW's own revalidation. */
export function prewarmKey(relMain, kind, props = {}) {
  const parts = [`prewarm=1`, `main=${relMain}`, `kind=${kind}`];
  for (const k of Object.keys(props).sort()) parts.push(`${k}=${props[k]}`);
  return fnv1a(parts.join("\n"));
}

/** A program's deploy-relative main path (e.g. "apps/calendar/calendar.declare")
 *  from its absolute URL and the distro ROOT URL — the key's origin-independent
 *  identity. Both are absolute and ROOT ends in "/", so the main is under it; a URL
 *  that somehow isn't returns unchanged (→ a key nothing was committed under → miss). */
export function relativize(mainUrl, root) {
  const u = typeof mainUrl === "string" ? mainUrl : mainUrl.href;
  const r = typeof root === "string" ? root : root.href;
  return u.startsWith(r) ? u.slice(r.length) : u;
}

/**
 * Load the committed build for a program. UNCONDITIONAL — the caller has already
 * established, from the manifest and with no request, that a build exists; this
 * fetches it and hands it back. The only rejection is a malformed or foreign
 * artifact (a cheap identity guard against an fnv1a key collision), never a
 * freshness opinion: see the header for where that guarantee lives.
 *
 * Returns null on anything unexpected, so a caller can still fall through to its
 * compile path rather than fail the page.
 *
 * @param cfg {{
 *   root: URL|string,            // the distro ROOT (…/ ending in a slash)
 *   relMain: string,             // deploy-relative main path (relativize())
 *   kind: "run"|"segments",
 *   props?: Record<string,string>,
 *   fetchImpl?: typeof fetch,    // injectable for tests
 * }}
 * @returns the artifact object, or null.
 */
export async function loadBuild(cfg) {
  const { root, relMain, kind, props = {}, fetchImpl = fetch } = cfg;
  try {
    const key = prewarmKey(relMain, kind, props);
    const res = await fetchImpl(new URL("bundles/cache/" + key + ".json", root), { cache: "no-cache" });
    if (!res.ok) return null;
    const entry = await res.json();
    // Identity guard only — a malformed or foreign artifact is ignored, never rendered.
    return entry && entry.kind === kind && entry.main === relMain ? entry : null;
  } catch {
    return null;
  }
}
