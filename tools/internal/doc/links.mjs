// tools/internal/doc/links.mjs — the `declare-docs:` LINK REGISTRY + the dangling-link gate.
//
// The linking model (docs/system-design/documentation.md §5): prose authors write
// symbolic IDs — `[Reach](declare-docs:guide:reach)` — never file paths or heading
// text; each packaging resolves the same ID its own way (docs app → in-app
// navigation; on-disk/LLM → this registry's path). IDs are GENERATED, never
// hand-created, so there is no ID-creation mistake to make:
//
//   • guide docs        docs/guide/NN-name.md      →  guide:name
//   • operational docs  docs/operational/name.md   →  operational:name
//   • the core doc      docs/declare.md            →  spec:core        (pinned root)
//   • the reference     docs-model.json            →  reference:index  (pinned root)
//                       …and every model node key  →  View.width, Slider.value, …
//   • the Why essay     homepage, route "why"      →  essay:why-declare (pinned root)
//
// The numeric filename prefix is ordering, not identity — chapters renumber freely
// under a stable ID. The gate covers category-B docs only (docs/, minus
// system-design/ — the internal record may cite IDs illustratively).
//
//   node tools/internal/doc/links.mjs           # report: registry, resolution, dangling links
//   node tools/internal/doc/links.mjs --check   # the gate: exit 1 if any link dangles
//
// The registry + outgoing graph travel inside docs/declare-model.json — the
// assembler (assemble.mjs) imports buildRegistry/scan from here, and its
// staleness gate covers the embedded copy. This file is the scanner and the
// dangling-link gate; it emits no artifact of its own.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MODEL = path.join(ROOT, "docs/declare-model.json");

// ── the registry ─────────────────────────────────────────────────────────────

/** First `# ` heading of a markdown file — the doc's title. */
function titleOf(file) {
  const m = readFileSync(file, "utf8").match(/^# (.+)$/m);
  return m ? m[1].trim() : path.basename(file, ".md");
}

/** id → { path (repo-relative), title, kind }. */
export function buildRegistry() {
  const ids = {};
  const add = (id, file, kind, title) => {
    ids[id] = { path: path.relative(ROOT, file), title: title ?? titleOf(file), kind };
  };

  // guide: strip the ordering prefix — `20-tree.md` → guide:tree.
  for (const f of readdirSync(path.join(ROOT, "docs/guide")).sort()) {
    if (!f.endsWith(".md")) continue;
    const slug = f.replace(/^\d+-/, "").replace(/\.md$/, "");
    add(`guide:${slug}`, path.join(ROOT, "docs/guide", f), "guide");
  }
  // operational: the filename IS the id.
  for (const f of readdirSync(path.join(ROOT, "docs/operational")).sort()) {
    if (!f.endsWith(".md")) continue;
    add(`operational:${f.replace(/\.md$/, "")}`, path.join(ROOT, "docs/operational", f), "operational");
  }
  // The three pinned roots — registry-defined (not per-author invented), documented above.
  add("spec:core", path.join(ROOT, "docs/declare.md"), "spec");
  ids["reference:index"] = { path: "docs/declare-model.json", title: "Reference", kind: "reference" };
  ids["essay:why-declare"] = { path: "apps/homepage/homepage.declare", title: "Why Declare", kind: "essay" };

  // Reference symbols: the model's node keys are already the IDs (`View.width`).
  if (existsSync(MODEL)) {
    const model = JSON.parse(readFileSync(MODEL, "utf8"));
    for (const key of Object.keys(model.reference ?? {})) {
      ids[key] = { path: "docs/declare-model.json", title: key, kind: "reference" };
    }
  }
  return ids;
}

// ── the scan ─────────────────────────────────────────────────────────────────

/** Category-B markdown files: docs/**, excluding system-design/ (category A). */
function corpusFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "system-design") walk(p); }
      else if (e.name.endsWith(".md")) out.push(p);
    }
  };
  walk(path.join(ROOT, "docs"));
  return out.sort();
}

const REF = /declare-docs:([A-Za-z0-9_.:-]+)/g;

export function scan(registry) {
  const dangling = [];   // { file, line, id }
  const outgoing = {};   // repo-relative path → sorted unique ids
  for (const file of corpusFiles()) {
    const rel = path.relative(ROOT, file);
    const found = new Set();
    readFileSync(file, "utf8").split("\n").forEach((text, i) => {
      for (const m of text.matchAll(REF)) {
        found.add(m[1]);
        if (!Object.hasOwn(registry, m[1])) dangling.push({ file: rel, line: i + 1, id: m[1] });
      }
    });
    if (found.size) outgoing[rel] = [...found].sort();
  }
  return { dangling, outgoing };
}

// ── run (guarded: importing this module as a library executes nothing) ───────

if (process.argv[1] && process.argv[1].endsWith("links.mjs")) {
  const CHECK = process.argv.includes("--check");
  const registry = buildRegistry();
  const { dangling, outgoing } = scan(registry);
  const linkCount = Object.values(outgoing).reduce((n, ids) => n + ids.length, 0);
  console.log(`links: ${Object.keys(registry).length} ids in the registry · ${linkCount} distinct links in ${Object.keys(outgoing).length} docs`);
  for (const d of dangling) console.log(`  DANGLING ${d.file}:${d.line} — declare-docs:${d.id}`);
  if (dangling.length === 0) console.log("  all links resolve");
  if (CHECK && dangling.length > 0) process.exit(1);
}
