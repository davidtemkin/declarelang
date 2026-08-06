// filesets — the one file-set walker and content hasher behind both rule
// systems: derive.mjs (build rules) and run-gates.mjs (test suites as rules).
// One implementation, because the two answering "what does this depend on?"
// differently would be its own class of bug.
//
// Spec forms:
//   "path/to/file-or-dir"                            a file, or a dir walked recursively
//   "apps/*/index.html"                              the one glob shape in use
//   { dir, ext?, exclude?: [names], pre?, notPre? }  a filtered walk (basename prefixes)

import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const hashMemo = new Map();

/** Content hash of one file, memoized for the process lifetime. Call
 *  `forget(abs)` after writing a file this process already hashed. */
export function fileHash(abs) {
  let h = hashMemo.get(abs);
  if (h === undefined) {
    try { h = createHash("sha1").update(readFileSync(abs)).digest("hex"); } catch { h = "?"; }
    hashMemo.set(abs, h);
  }
  return h;
}
export function forget(abs) { hashMemo.delete(abs); }

function walkInto(out, root, rel, f = {}) {
  const abs = join(root, rel);
  if (!existsSync(abs)) return;
  let st; try { st = statSync(abs); } catch { return; }
  if (st.isDirectory()) {
    for (const e of readdirSync(abs).sort()) {
      if (f.exclude?.includes(e)) continue;
      walkInto(out, root, join(rel, e), f);
    }
    return;
  }
  if (f.ext !== undefined && !rel.endsWith(f.ext)) return;
  const base = rel.slice(rel.lastIndexOf("/") + 1);
  if (f.pre !== undefined && !base.startsWith(f.pre)) return;
  if (f.notPre !== undefined && base.startsWith(f.notPre)) return;
  out.add(rel);
}

/** Resolve a list of specs to the set of matching repo-relative file paths. */
export function fileSet(root, specs) {
  const out = new Set();
  for (const spec of specs ?? []) {
    if (typeof spec === "object") { walkInto(out, root, spec.dir, spec); continue; }
    if (spec.includes("*")) {
      const [head, tail] = spec.split("*");
      const base = join(root, head);
      if (!existsSync(base)) continue;
      for (const e of readdirSync(base).sort()) walkInto(out, root, join(head, e, tail).replace(/\/+/g, "/"));
      continue;
    }
    walkInto(out, root, spec);
  }
  return out;
}

/** One hash over a file set: paths + contents, order-independent. */
export function setHash(root, files) {
  const h = createHash("sha1");
  for (const f of [...files].sort()) { h.update(f); h.update(fileHash(join(root, f))); }
  return h.digest("hex");
}
