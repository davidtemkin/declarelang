// Dependency-closure tracking + cache-staleness logic — ported from the OL5
// compiler's closure.ts (itself a port of the Java cm/DependencyTracker +
// TrackingFileResolver model), generalized so the SAME algorithm runs on disk
// (server/CLI) and in the browser (composition.md §3, [[openlaszlo-compiler-packaging]]).
//
// The model: every file a compile reads (main source, includes, auto-included
// component libraries, the manifest) is recorded with a VALIDATOR — a cheap
// change signal — and a cached compile is fresh iff every recorded validator
// still matches AND the compiler properties are unchanged. The validator is
// whatever the environment cheaply supplies: mtime+size on disk, ETag /
// Last-Modified over HTTP, content-hash as a universal floor.
//
// This module is PURE + dependency-free (only BigInt + standard JS): it stays
// out of the Node-only surface so a browser cache can reuse it unchanged. The
// disk-side Tracker/Probe live in cache-node.ts; a fetch-side pair is the
// deferred browser counterpart.

/** A cheap change-detection signal for one dependency. Any field the environment
 *  can supply is used; comparison is field-by-field over the fields PRESENT in
 *  the stored validator (a probe that can no longer supply a field → changed).
 *  - disk:    `{ mtime, size }`            (fs.stat)
 *  - browser: `{ etag }` or `{ lastModified, size }`  (HTTP validators)
 *  - any:     `{ hash }`                   (content hash — universal fallback)
 *  `missing: true` records that the dependency did not exist at compile time (so
 *  its later CREATION also busts the cache). */
export interface Validator {
  mtime?: number;
  size?: number;
  etag?: string;
  lastModified?: string;
  hash?: string;
  missing?: boolean;
}

export interface ClosureEntry {
  /** Environment-local identity: an absolute path on disk, a URL in the browser. */
  id: string;
  kind: "file" | "dir";
  v: Validator;
}

/** The full dependency closure of one compile + the compiler properties that
 *  also gate staleness (backend, debug, …). */
export interface Closure {
  entries: ClosureEntry[];
  props: Record<string, string>;
}

/** Collects the dependencies touched during a compile. The environment supplies
 *  an implementation that captures the validator at record time (disk: statSync;
 *  browser: from fetch response headers). The compiler core never sees it — the
 *  host it is threaded through records each read. */
export interface Tracker {
  file(id: string): void;
  dir(id: string): void;
}

/** Two validators match iff every field present in BOTH agrees, and neither
 *  flips the `missing` flag. */
export function validatorsEqual(stored: Validator, current: Validator): boolean {
  if (!!stored.missing !== !!current.missing) return false;
  if (stored.missing && current.missing) return true;
  // A matching STRONG validator (HTTP ETag / Last-Modified) is authoritative: the
  // resource is unchanged, so we must NOT also require size/hash to match —
  // required for correctness over a compressing host (a HEAD's Content-Length is
  // the compressed size, has no body to re-hash).
  for (const k of ["etag", "lastModified"] as const) {
    if (stored[k] !== undefined && current[k] !== undefined) return stored[k] === current[k];
  }
  // No shared strong validator (disk's mtime+size, or a host that sends none) →
  // fall back to content-hash / mtime / size.
  let compared = 0;
  for (const k of ["hash", "mtime", "size"] as const) {
    if (stored[k] !== undefined && current[k] !== undefined) {
      if (stored[k] !== current[k]) return false;
      compared++;
    }
  }
  // No comparable field shared → cannot prove freshness → treat as stale.
  return compared > 0;
}

/** A probe re-reads the CURRENT validator for a dependency (disk: statSync;
 *  browser: HEAD / conditional GET). Returns `{missing:true}` if now gone. */
export type Probe = (entry: ClosureEntry) => Validator;

/** The cached compile is fresh iff the props are unchanged and every recorded
 *  dependency's current validator still matches. */
export function isUpToDate(closure: Closure, currentProps: Record<string, string>, probe: Probe): boolean {
  const a = closure.props, b = currentProps;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  for (const e of closure.entries) {
    if (!validatorsEqual(e.v, probe(e))) return false;
  }
  return true;
}

/** FNV-1a 64-bit (16 hex chars) — a small dependency-free content hash for cache
 *  keys / ETags. Not cryptographic; the validator re-check catches a stale hit. */
export function fnv1a(s: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ BigInt(s.charCodeAt(i))) & mask;
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, "0");
}

/** The cache LOOKUP key — computable BEFORE compiling (the closure is only known
 *  after). `main path + sorted props + compiler version`. The manifest stored
 *  under this key carries the closure; freshness is then isUpToDate(). */
export function lookupKey(mainId: string, props: Record<string, string>, compilerVersion: string): string {
  const parts = [`v=${compilerVersion}`, `main=${mainId}`];
  for (const k of Object.keys(props).sort()) parts.push(`${k}=${props[k]}`);
  return fnv1a(parts.join("\n"));
}

/** The content TAG (ETag) for a finished compile: a stable hash of the closure's
 *  identities + validators + version + props. Computed AFTER a compile and
 *  served as the HTTP ETag so conditional requests still 304. */
export function contentTag(mainId: string, closure: Closure, compilerVersion: string): string {
  const parts = [`v=${compilerVersion}`, `main=${mainId}`];
  for (const k of Object.keys(closure.props).sort()) parts.push(`${k}=${closure.props[k]}`);
  const sorted = [...closure.entries].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  for (const e of sorted) {
    const v = e.v;
    parts.push(`${e.kind}:${e.id}|${v.hash ?? ""}|${v.etag ?? ""}|${v.lastModified ?? ""}|${v.mtime ?? ""}|${v.size ?? ""}|${v.missing ? "X" : ""}`);
  }
  return fnv1a(parts.join("\n"));
}
