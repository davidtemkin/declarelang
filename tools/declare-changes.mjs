#!/usr/bin/env node
// declare-changes — what to change in a program written for an earlier release of
// Declare (docs/system-design/migration.md §2.3). It reads the "Breaking changes" of
// every release after the one the program was written for, runs each change's
// `Find:` over the program's own files, and lists what applies, where, with the
// before and after, the docs to read, and what changes without an error. It
// changes nothing.
//
//   npx declare-changes app.declare                # what applies to this program
//   npx declare-changes app.declare --since 0.5.3  # only changes after 0.5.3
//   npx declare-changes --since 0.5.3              # every change since, with no program
//   npx declare-changes --done app.declare         # after a clean migration: write its declareVersion line
//   …and --json for the same, as data.

import { readFileSync, writeFileSync, readdirSync, existsSync, realpathSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readChanges, findLines } from "./internal/changes.mjs";
import { parseProgram, parseLibrary } from "../runtime/dist/parser.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

const parts = (v) => { const [a = 0, b = 0, c = 0, d = 0] = v.split(".").map(Number); return [a, b, c, d]; };
const cmp = (a, b) => { const x = parts(a), y = parts(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3] - y[3]; };

/** Every release's notes, oldest first: [{ version, entries }]. */
export function releases(root = ROOT) {
  const dir = join(root, "releases");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((f) => /^v(\d+\.\d+\.\d+(?:\.\d+)?)\.md$/.exec(f))
    .filter((m) => m !== null)
    .map((m) => ({ version: m[1], entries: readChanges(readFileSync(join(dir, m[0]), "utf8")) }))
    .sort((a, b) => cmp(a.version, b.version));
}

/** The release a file says it was written for, or null. */
export function writtenFor(text) {
  return /^\s*declareVersion\s*\[\s*"([^"]+)"\s*\]/m.exec(text)?.[1] ?? null;
}

/** The program's own files: the main file and what it includes, followed — not the
 *  library's, which arrive with the release. */
function programFiles(main) {
  const out = [], seen = new Set();
  const visit = (file) => {
    const abs = resolve(file);
    if (seen.has(abs) || !existsSync(abs)) return;
    seen.add(abs);
    out.push(abs);
    if (!abs.endsWith(".declare")) return;
    const text = readFileSync(abs, "utf8");
    let refs = [];
    try { refs = parseProgram(text).includes; } catch { try { refs = parseLibrary(text).includes; } catch { /* unreadable: its own text is still searched */ } }
    for (const r of refs) if (!r.path.startsWith("library/") && !r.path.includes("/library/")) visit(join(dirname(abs), r.path));
  };
  visit(main);
  return out;
}

/** A Docs link as something a reader can open: a guide chapter's file in this
 *  distribution, or the reference page by its declare-help name. */
function resolveDoc(href) {
  const g = /^declare-docs:guide:([\w-]+)(?:@([\w-]+))?$/.exec(href);
  if (g !== null) {
    const dir = join(ROOT, "docs", "guide");
    const file = existsSync(dir) ? readdirSync(dir).find((f) => f.replace(/^\d+-/, "").replace(/\.md$/, "") === g[1]) : undefined;
    const path = file === undefined ? `docs/guide (${g[1]})` : relative(process.cwd(), join(dir, file));
    return g[2] === undefined ? path : `${path} § ${g[2]}`;
  }
  const r = /^declare-docs:([A-Z]\w*)(?:\.(?:method\.|event\.)?(\w+))?$/.exec(href);
  if (r !== null) return `npx declare-help ${r[1]}${r[2] === undefined ? "" : "." + r[2]}`;
  return href;
}

/** `{Class}` in a Find: the class and every class extending it, the library's (from
 *  the reference) and those declared in `files` — so the program's own subclass of
 *  a changed class is found where the class is. */
export function families(files, root = ROOT) {
  const parent = new Map();
  const model = join(root, "docs", "declare-model.json");
  if (existsSync(model)) {
    for (const [id, e] of Object.entries(JSON.parse(readFileSync(model, "utf8")).reference ?? {})) if (!id.includes(".") && typeof e.extends === "string") parent.set(id, e.extends);
  }
  for (const f of files) for (const m of f.text.matchAll(/\bclass\s+([A-Za-z_]\w*)\s+extends\s+([A-Za-z_]\w*)/g)) parent.set(m[1], m[2]);
  const extendsFrom = (c, base) => { for (let k = 0; c !== undefined && k < 64; c = parent.get(c), k++) if (c === base) return true; return false; };
  return (base) => [base, ...[...parent.keys()].filter((c) => c !== base && extendsFrom(c, base))];
}

/** What applies: every entry from releases after `since` (all, when null), with
 *  where its `Find:` matches in `files` ({ path, text }). */
export function plan({ since, files, all = releases() }) {
  const family = families(files);
  const out = [];
  for (const rel of all) {
    if (since !== null && cmp(rel.version, since) <= 0) continue;
    if (cmp(rel.version, VERSION) > 0) continue;
    for (const e of rel.entries) {
      const hits = e.find === null ? [] : files.flatMap((f) => findLines(e.find, f.text, family).map((line) => ({ file: f.path, line })));
      out.push({ release: rel.version, ...e, hits });
    }
  }
  return out;
}

function printEntry(e, withHits) {
  console.log(`\n## ${e.heading}   (${e.release})`);
  if (e.why) console.log(e.why);
  if (withHits) for (const h of e.hits) console.log(`  ${relative(process.cwd(), h.file)}:${h.line}`);
  if (e.before !== null) console.log(`\n  before:\n${e.before.replace(/^/gm, "    ")}`);
  if (e.after !== null) console.log(`  after:\n${e.after.replace(/^/gm, "    ")}`);
  if (e.docs.length > 0) console.log(`  read: ${e.docs.map((d) => resolveDoc(d.href)).join("  ·  ")}`);
  if (e.watch) console.log(`  watch for: ${e.watch}`);
}

function done(file) {
  const text = readFileSync(file, "utf8");
  const line = `declareVersion [ "${VERSION}" ]`;
  const next = writtenFor(text) !== null
    ? text.replace(/^(\s*)declareVersion\s*\[\s*"[^"]+"\s*\]/m, `$1${line}`)
    : `${line}\n\n${text}`;
  writeFileSync(file, next);
  console.log(`declare-changes: ${relative(process.cwd(), file)} is written for Declare ${VERSION}`);
}

// through npm's .bin symlink argv[1] is the link, so both sides are compared resolved
const isMain = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const json = args.includes("--json");
  const sinceArg = opt("--since");
  const program = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--since");
  if (args.includes("--done")) {
    if (program === undefined) { console.error("declare-changes --done <file.declare>: which program is migrated?"); process.exit(1); }
    done(program);
    process.exit(0);
  }
  if (program === undefined && sinceArg === undefined) {
    console.error("declare-changes <file.declare> [--since <release>] | --since <release> | --done <file.declare> [--json]");
    process.exit(1);
  }
  const files = program === undefined ? [] : programFiles(program).map((path) => ({ path, text: readFileSync(path, "utf8") }));
  const since = sinceArg ?? (program === undefined ? null : writtenFor(files[0]?.text ?? ""));
  const entries = plan({ since, files });
  if (json) { console.log(JSON.stringify({ version: VERSION, since, program: program ?? null, entries }, null, 2)); process.exit(0); }

  const from = since === null ? "any earlier release" : since;
  if (entries.length === 0) { console.log(`declare-changes: nothing to change between ${from} and ${VERSION}.`); process.exit(0); }
  if (program === undefined) {
    console.log(`# Changes from ${from} to ${VERSION}`);
    for (const e of entries) printEntry(e, false);
    process.exit(0);
  }
  const apply = entries.filter((e) => e.hits.length > 0);
  const check = entries.filter((e) => e.hits.length === 0 && (e.watch || e.find === null));
  console.log(`# ${relative(process.cwd(), program)}: changes from ${from} to ${VERSION}`);
  if (apply.length === 0) console.log("\nNo change's Find matched this program's files.");
  for (const e of apply) printEntry(e, true);
  if (check.length > 0) {
    console.log("\n# Check these too — a change that may not leave a findable spelling");
    for (const e of check) console.log(`\n- ${e.heading} (${e.release}): ${e.watch ?? e.why}${e.docs.length > 0 ? `\n  read: ${e.docs.map((d) => resolveDoc(d.href)).join("  ·  ")}` : ""}`);
  }
  console.log(`\nNext: make these changes, reading the docs named, then npx declare-verify ${relative(process.cwd(), program)};`);
  console.log(`when it is clean, npx declare-changes --done ${relative(process.cwd(), program)}.`);
}
