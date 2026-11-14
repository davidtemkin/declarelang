// compile-cache — the checking tools' memory of their last compiles.
//
// An agent runs declare-verify and declare-look over and over, and most calls
// follow no edit at all: the same program checked with another script, at
// another size, after a screenshot. Each call is its own process, so each one
// compiled the program from nothing (1–2 s on a program of a few thousand
// lines, most of it TypeScript's checker). This keeps the result on disk, per
// machine, beside the dev server's build cache, and hands it back while it is
// still true.
//
// A stored compile is used only when everything it was made from is unchanged:
// the program's own source text (a class-only file is wrapped before compiling,
// so the text is keyed, not the file), the options that change what the compile
// says (lint, devices), the toolchain itself (compiler and runtime dist, by file
// names and mtimes, the probe the dev server uses), and every file the compile
// read — the closure the compiler records: each include, each library class,
// each script — re-checked on disk before the hit is taken. Anything else is a
// miss, and the tool compiles as it always did. A cache that cannot be read or
// written is no cache, never an error.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "declare", "verify");
const OFF = process.env.DECLARE_COMPILE_CACHE === "0";
const VERSION = 1;
const KEEP = 300;          // entries kept: an edit makes a new one, so the oldest go

function toolchain() {
  let acc = "";
  for (const d of ["compiler/dist", "runtime/dist"]) {
    const dist = join(ROOT, d);
    if (!existsSync(dist)) continue;
    for (const f of readdirSync(dist)) if (f.endsWith(".js")) acc += f + statSync(join(dist, f)).mtimeMs + ";";
  }
  return acc;
}

/** The key for one compile: the main path, its source text, the options that
 *  change the result, the toolchain. */
export function compileKey(mainId, source, options) {
  return createHash("sha256")
    .update([`v=${VERSION}`, `main=${mainId}`, `opts=${JSON.stringify(options)}`, `tc=${toolchain()}`, source].join("\n"))
    .digest("hex").slice(0, 24);
}

/** The stored compile for `key`, if every file it read is unchanged; else null.
 *  `isUpToDate` and `diskProbe` are the compiler's own (compile-node.js). */
export function cachedCompile(key, { isUpToDate, diskProbe }) {
  if (OFF) return null;
  try {
    const file = join(DIR, key + ".json");
    if (!existsSync(file)) return null;
    const e = JSON.parse(readFileSync(file, "utf8"));
    if (e.v !== VERSION || e.closure == null || e.out == null) return null;
    if (!isUpToDate(e.closure, e.closure.props, diskProbe)) return null;
    return { out: { ...e.out, closure: e.closure }, program: e.program ?? null };
  } catch {
    return null;
  }
}

/** Store a compile (and, once built, its program). Written whole, then renamed
 *  into place, so a reader never sees half an entry. */
export function storeCompile(key, out, program = null) {
  if (OFF || out?.closure == null) return;
  try {
    mkdirSync(DIR, { recursive: true });
    const { closure, ...rest } = out;
    const file = join(DIR, key + ".json"), tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ v: VERSION, closure, out: rest, program }));
    renameSync(tmp, file);
    const all = readdirSync(DIR).filter((f) => f.endsWith(".json"));
    if (all.length > KEEP + 50) {
      const byAge = all.map((f) => [f, statSync(join(DIR, f)).mtimeMs]).sort((a, b) => a[1] - b[1]);
      for (const [f] of byAge.slice(0, all.length - KEEP)) rmSync(join(DIR, f), { force: true });
    }
  } catch { /* no cache */ }
}
