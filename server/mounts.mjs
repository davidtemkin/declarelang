// server/mounts.mjs — the MOUNT TABLE: which directory answers which URL.
//
// A mount is one line: URLs beginning with this prefix are files under this
// directory. The server holds a short list, and every request is answered by
// exactly ONE line. The rule, complete:
//
//   A URL beginning with a declared prefix is served from that prefix's
//   directory. Everything else is served from the ROOT mount. Declared prefixes
//   may not nest, and the server refuses to start if they do.
//
// No precedence, no longest-match, no significant ordering — because prefixes
// cannot nest, at most one can ever match. A configuration that would have been
// ambiguous is a STARTUP ERROR, not a surprise at request time.
//
// Resolution is STRICT, never an overlay: a URL belongs to exactly one mount and
// never falls through to another when a file is missing. Falling through would
// make "which file am I serving" depend on what happens to exist on disk — the
// same class of defect as the basename `?build` collision, and harder to see.
//
// A mount is STRUCTURE-PRESERVING: it maps a URL subtree onto a disk subtree with
// no rewriting and no flattening. That is what keeps `data/x.json` resolving
// beside `app.declare` in all three compile hosts at once — the browser resolves
// it against the page URL, Node against originDir, declarec copies it as a
// sibling — and all three agree because the URL shape IS the disk shape.
// (docs/system-design/embeddable-server.md §3)

import path from "node:path";
import { existsSync, statSync } from "node:fs";

/** Thrown for a table that cannot be served. The server prints `.message` and
 *  exits rather than starting in a state whose behavior nobody can predict. */
export class MountError extends Error {}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

/** Normalize a declared prefix to the "/…/" form. The root is the bare "/". */
function normalizePrefix(raw) {
  let s = String(raw ?? "").trim();
  if (s === "" || s === "/") return "/";
  if (!s.startsWith("/")) s = "/" + s;
  if (!s.endsWith("/")) s += "/";
  return s;
}

/**
 * Build and VALIDATE the table. `specs` is [{ prefix, dir, name?, platform? }].
 * Exactly one spec must carry the root prefix "/".
 *
 * Every failure below is fatal by design (§3.3): the alternative is a server that
 * silently serves nothing, or serves the wrong tree, which is precisely the
 * failure mode this feature exists to remove.
 */
export function createMounts(specs) {
  if (!Array.isArray(specs) || specs.length === 0)
    throw new MountError("no mounts declared: at least a root mount (prefix \"/\") is required");

  const mounts = specs.map((s) => {
    const prefix = normalizePrefix(s.prefix);
    const dir = path.resolve(s.dir);
    return { prefix, dir, name: s.name ?? (prefix === "/" ? "root" : prefix.slice(1, -1)), platform: !!s.platform };
  });

  const roots = mounts.filter((m) => m.prefix === "/");
  if (roots.length === 0) throw new MountError("no root mount: exactly one mount must have prefix \"/\"");
  if (roots.length > 1) throw new MountError("more than one root mount: exactly one mount may have prefix \"/\"");
  const root = roots[0];
  const named = mounts.filter((m) => m.prefix !== "/");

  // every mount must point at a real directory
  for (const m of mounts)
    if (!isDir(m.dir))
      throw new MountError(`mount ${m.prefix} points at ${m.dir}, which is not a directory`);

  // duplicate prefixes
  const seen = new Map();
  for (const m of named) {
    if (seen.has(m.prefix)) throw new MountError(`mount prefix ${m.prefix} is declared twice`);
    seen.set(m.prefix, m);
  }

  // NESTING is illegal — this is what makes the one-line rule complete. With
  // nesting banned, at most one declared prefix can match a URL, so there is no
  // precedence to remember and config order cannot change behavior.
  for (const a of named)
    for (const b of named)
      if (a !== b && a.prefix.startsWith(b.prefix))
        throw new MountError(
          `mount prefixes may not nest: ${a.prefix} is inside ${b.prefix}\n` +
          `  give them disjoint prefixes, or serve the inner tree from the outer mount`);

  // SHADOWING — a declared prefix that hides a real directory in the root mount.
  // This is the deterministic version of what an "_"-prefixed reserved name only
  // made unlikely: say so, rather than let a URL quietly stop reaching a file.
  for (const m of named) {
    const shadowed = path.join(root.dir, m.prefix.slice(1, -1));
    if (isDir(shadowed) && shadowed !== m.dir)
      throw new MountError(
        `mount prefix ${m.prefix} shadows ${shadowed}\n` +
        `  that directory would become unreachable; rename it or declare a different prefix`);
  }

  const platform = mounts.find((m) => m.platform) ?? root;

  /** The URL prefix the platform is mounted at — what the run wrapper's
   *  bootUrl/iconBase are built from, and the ONLY thing in the system that
   *  needs to know the platform's mount name. */
  const platformPrefix = platform.prefix;

  /**
   * urlPath → { mount, rel, abs } or null when it escapes the mount's directory.
   * `urlPath` is a decoded, absolute pathname ("/apps/x/y.declare").
   */
  function resolve(urlPath) {
    const p = urlPath.startsWith("/") ? urlPath : "/" + urlPath;
    const mount = named.find((m) => p.startsWith(m.prefix)) ??
      // the exact prefix without its trailing slash still belongs to that mount
      // (so "/declare" reaches the platform mount's own directory, not the root)
      named.find((m) => p + "/" === m.prefix) ?? root;
    const rel = mount.prefix === "/"
      ? p.slice(1)
      : p.slice(Math.min(p.length, mount.prefix.length));
    const abs = path.join(mount.dir, rel);
    // the no-escape guard, per mount
    if (!(abs === mount.dir || abs.startsWith(mount.dir + path.sep))) return null;
    return { mount, rel, abs };
  }

  /** The reverse map: an absolute disk path → the canonical URL that serves it,
   *  or null if no mount covers it. When more than one mount covers the path
   *  (distro mode points root and platform at one directory), the MOST SPECIFIC
   *  directory wins, and on a tie the ROOT mount wins — so a distro file's
   *  canonical address is "/apps/x", not "/declare/apps/x". */
  function urlFor(absPath) {
    const abs = path.resolve(absPath);
    const covers = mounts
      .filter((m) => abs === m.dir || abs.startsWith(m.dir + path.sep))
      .sort((a, b) => b.dir.length - a.dir.length || (a.prefix === "/" ? -1 : b.prefix === "/" ? 1 : 0));
    const m = covers[0];
    if (!m) return null;
    const rel = path.relative(m.dir, abs).split(path.sep).join("/");
    return m.prefix === "/" ? "/" + rel : m.prefix + rel;
  }

  return { list: mounts, root, named, platform, platformPrefix, resolve, urlFor };
}

/** The banner's mount block — printed every start, because most of the
 *  "forgotten magic" failure mode is really "the server knew and did not say". */
export function describeMounts(mounts, cwd = process.cwd()) {
  const rel = (d) => {
    const r = path.relative(cwd, d);
    return r === "" ? "." : (r.startsWith("..") ? d : r);
  };
  const width = Math.max(...mounts.list.map((m) => m.prefix.length));
  return mounts.list
    .map((m) => `    ${m.prefix.padEnd(width)}  →  ${rel(m.dir)}${m.platform ? "     (platform)" : ""}`)
    .join("\n");
}
