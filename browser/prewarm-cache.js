// browser/prewarm-cache.js — the COMMITTED pre-warm cache tier (docs/system-design/hosting.md).
//
// An optional, additive fast path for the static deploy: a small CURATED set of
// programs (the homepage, the flagship apps) ship PRECOMPILED in the tree —
// tools/internal/prewarm.mjs writes bundles/cache/<key>.json at commit time (the same
// hook that stamps the BUILD_ID). On load the boot path tries the committed
// artifact BEFORE the in-browser CacheStorage tier: if it is present AND still
// validates against the deployed SOURCE, the program renders with NO compiler
// download and NO recompile — the compiler-free run the flagship pages want.
//
// The one hard rule is NO DRIFT. A committed artifact is never TRUSTED, only
// VALIDATED: its stored dependency CLOSURE (closure.ts) is re-probed against the
// live deployed source exactly like the browser's own compiled-program cache.
// The two freshness gates are identical in spirit to boot-uniform's CacheStorage
// tier, so the committed tier can never disagree with a fresh in-browser compile:
//   • PLATFORM — the committed files live under bundles/, which the commit hook
//     hashes into the BUILD_ID; a runtime/compiler/library change rebumps it, the
//     service worker drops the old cache bucket, and the deploy carries freshly
//     regenerated artifacts (prewarm.mjs runs in the same hook).
//   • APP SOURCE — the stored closure. Every entry is a CONTENT HASH of a
//     deploy-relative dependency; loadPrewarm re-fetches each and re-hashes
//     (GET-and-hash, never a HEAD — a stored { hash } cannot match a HEAD's
//     ETag, so a headers-only probe would read fresh artifacts as stale). An edit
//     to a committed program that WASN'T re-prewarmed changes the source hash →
//     the artifact reads stale → boot falls through to compile the new source. No
//     re-stamp, no manual sync, no way to ship a stale precompiled program.
//
// This module is the SINGLE ORACLE the tier is built on: tools/internal/prewarm.mjs (the
// writer) and both boot paths (the readers) derive the artifact key HERE, so a
// key can never be computed two ways. Browser-safe (imports only the pure
// closure core) so the Node build hook can import prewarmKey unchanged.

import { fnv1a, isUpToDate } from "../compiler/dist/closure.js";

/** The committed-artifact key: a stable filename under bundles/cache/ derived from
 *  the program's DEPLOY-RELATIVE main path, the artifact kind ("run" | "crawler"), and
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

/** Re-probe one committed dependency: GET its deploy-relative id (resolved against
 *  ROOT) and re-hash the body. NOT a HEAD — the committed validators are content
 *  hashes, and validatorsEqual needs a shared field, so a HEAD's ETag/Last-Modified
 *  would never match and would read every fresh artifact as stale. A 404 → missing
 *  (matches a stored { missing } entry; busts a stored present entry). */
async function hashProbe(root, relId, fetchImpl) {
  try {
    const r = await fetchImpl(new URL(relId, root), { cache: "no-cache" });
    return r.ok ? { hash: fnv1a(await r.text()) } : { missing: true };
  } catch {
    return { missing: true };
  }
}

/**
 * Try the committed artifact for a program, returning it ONLY if it still
 * validates against the deployed source — else null (the caller falls through to
 * its compile path). Never throws.
 *
 * @param cfg {{
 *   root: URL|string,            // the distro ROOT (…/ ending in a slash)
 *   relMain: string,             // deploy-relative main path (relativize())
 *   kind: "run"|"crawler",
 *   props?: Record<string,string>,
 *   fetchImpl?: typeof fetch,    // injectable for tests
 * }}
 * @returns the validated artifact object, or null.
 */
export async function loadPrewarm(cfg) {
  const { root, relMain, kind, props = {}, fetchImpl = fetch } = cfg;
  let entry;
  try {
    const key = prewarmKey(relMain, kind, props);
    const res = await fetchImpl(new URL("bundles/cache/" + key + ".json", root), { cache: "no-cache" });
    if (!res.ok) return null;                                    // not precompiled → fall through
    entry = await res.json();
  } catch {
    return null;
  }
  // Identity guard (cheap defense against an fnv1a key collision) + a well-formed
  // closure. A malformed/foreign artifact is simply ignored, never rendered.
  if (!entry || entry.kind !== kind || entry.main !== relMain) return null;
  const closure = entry.closure;
  if (!closure || !Array.isArray(closure.entries)) return null;
  // Re-probe every dependency by content hash; fresh iff all still match.
  const current = {};
  try {
    await Promise.all(closure.entries.map(async (e) => { current[e.id] = await hashProbe(root, e.id, fetchImpl); }));
  } catch {
    return null;
  }
  const fresh = isUpToDate(closure, closure.props, (e) => current[e.id] ?? { missing: true });
  return fresh ? entry : null;
}
