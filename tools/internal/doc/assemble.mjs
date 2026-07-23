#!/usr/bin/env node
// assemble — the SPINE assembler (docs/system-design/verification.md §5.2): one pipeline,
// three projections. Reads the live registries (the same modules the running
// system executes) plus the already-generated doc artifacts, and emits:
//
//   1. docs/declare-model.json — the comprehensive machine-readable structure:
//      meta + SPINE (schemas, api, enum vocabularies, flags, requests,
//      diagnostics, library, commands) + links + reference + guide. For
//      PROGRAMS (the docs app's model stays its own artifact; this one is the
//      superset for tooling/agents/tests).
//   2. Marker-injected GENERATED blocks inside the human docs — the flags
//      table (operational/flags.md) and the setup commands
//      (operational/getting-started.md) — so the pages' tables are literally
//      projections, not prose kept honest by review.
//   3. A byte-copy of the authored skill/SKILL.md to .claude/skills/declare/
//      SKILL.md — the gated Claude Code discovery copy (cannot drift; divergence
//      fails docs.test).
//
// Markers: <!-- generated:<name> --> … <!-- /generated:<name> -->. Everything
// between is owned by this tool; docs.test gates staleness by re-running the
// assembly in-memory and comparing bytes.
//
//   node tools/internal/doc/assemble.mjs           # write all three projections
//   node tools/internal/doc/assemble.mjs --check   # exit 1 if any projection is stale
//
// Chain position: after extract (it reads its output and scans the corpus), before
// prewarm (nothing downstream reads it yet).

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FLAG_SPECS, DEFAULT_FLAGS } from "../../../compiler/dist/flags.js";
import { REQ } from "../../../compiler/dist/reqtypes.js";
import { LANGUAGE_API } from "../../../compiler/dist/scaffold.js";
import { SCHEMAS, RichTextSchema } from "../../../runtime/dist/schema.js";
import { CODE_PREFIX } from "../../../runtime/dist/diagnostics.js";
import { MOTION_TOKENS } from "../../../runtime/dist/animate.js";
import { OPS } from "../ops.mjs";
import { buildRegistry, scan } from "./links.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CHECK = process.argv.includes("--check");

// ── spine sections, each from its live source ───────────────────────────────

function schemaSpine() {
  const all = { ...SCHEMAS, RichText: RichTextSchema };
  const out = {};
  for (const [name, s] of Object.entries(all)) {
    out[name] = {
      base: s.base?.name ?? null,
      attrs: Object.fromEntries(Object.entries(s.attrs).map(([k, t]) => [k, t.kind === "enum" ? `enum(${t.tokens.join("|")})` : t.kind === "component" ? `component(${t.of})` : t.kind === "record" ? `record(${t.name})` : t.kind])),
      prevailing: s.prevailing ?? [],
      readOnly: s.readOnly ?? [],
      events: s.events ?? [],
    };
  }
  return out;
}

function enumVocabularies() {
  const vocab = {};
  const all = { ...SCHEMAS, RichText: RichTextSchema };
  for (const s of Object.values(all)) {
    for (const [attr, t] of Object.entries(s.attrs)) {
      if (t.kind === "enum" && !(t.name in vocab)) vocab[t.name] = [...t.tokens];
    }
  }
  vocab.Motion = [...MOTION_TOKENS];
  delete vocab.Unsupported; // internal (strip-mode enum) — not author surface
  return vocab;
}

/** Diagnostic codes scanned from the catalog SOURCE — the factories construct
 *  lazily, so introspection can't enumerate them; the source scan is still
 *  source-derived (same file the compiler executes). */
function diagnosticSpine() {
  const src = readFileSync(join(ROOT, "runtime/src/diagnostics.ts"), "utf8");
  // The factories tag each diagnostic `code4(NNNN)` (code4 = the `DECLARE####`
  // formatter) — enumerate those, not string literals, which was the old miss.
  const codes = [...new Set([...src.matchAll(/code4\((\d{4})\)/g)].map((m) => CODE_PREFIX + m[1]))].sort();
  return { prefix: CODE_PREFIX, codes };
}

function librarySpine() {
  const manifest = JSON.parse(readFileSync(join(ROOT, "library/autoincludes.json"), "utf8"));
  return Object.fromEntries(Object.entries(manifest).map(([tag, file]) => [tag, "library/" + file]));
}

function buildSpine() {
  return {
    schemas: schemaSpine(),
    api: LANGUAGE_API,
    enums: enumVocabularies(),
    flags: FLAG_SPECS.map((f) => ({ ...f, default: DEFAULT_FLAGS[f.name] })),
    requests: REQ,
    diagnostics: diagnosticSpine(),
    library: librarySpine(),
    commands: OPS,
  };
}

// ── the BROWSE tree: the single walkable IA over everything documented ────────
// One hierarchy, every leaf placed exactly once — ZERO curation. It is the
// structure the desktop column-browser walks and any agent reads, generated
// here in the SAME pass as the flat sections, so it can never drift from them.
// Categories are the designed IA; a leaf carries a `ref` into the flat
// reference/guide/tenets (or a `path` for a doc file) plus a short preview for
// the browser's detail pane. The flat sections remain the leaves' content store.
const proseFile = (rel) => { try { return readFileSync(join(ROOT, rel), "utf8"); } catch { return ""; } };
const preview = (text, n = 240) => {
  const t = text
    .replace(/^\s*\/\*[\s\S]*?\*\//, "").replace(/<!--[\s\S]*?-->/g, "")   // leading block comment / html comments
    .replace(/^#{1,6}\s.*$/m, "").replace(/[#*`_>|\[\]]/g, "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n).trimEnd() + "…" : t;   // an ellipsis marks a truncated excerpt
};
const titleOf = (rel) => (proseFile(rel).match(/^#\s+(.+)$/m)?.[1] ?? rel.split("/").pop()).trim();
const segText = (segs) => (segs ?? []).map((s) => s.md || "").join(" ");
const segMd = (segs) => (segs ?? []).map((s) => s.md || "").filter(Boolean).join("\n\n");
const fileLeaf = (name, rel, label = "Markdown file", subtitle = "") => ({ name, subtitle, kind: "doc", label, path: rel, preview: preview(proseFile(rel)) });
// A doc leaf splits its H1 for a two-line row: the TITLE (before an em-dash, with
// a redundant leading "Declare" dropped — you are already inside Declare's docs)
// over a SUBTITLE (the descriptor after it). Uniform across every doc leaf; an H1
// with no descriptor simply has an empty subtitle.
const clean = (s) => s.replace(/`/g, "").trim();   // rows are plain text — drop inline-code marks
const docLeaf = (rel, label = "Markdown file") => {
  const h1 = clean(titleOf(rel).replace(/^Declare\b\s*[—–-]?\s*/i, ""));
  const m = h1.match(/^(.+?)(?:\s+[—–]\s+|:\s+)(.+)$/);
  const title = (m ? m[1] : h1).trim().replace(/^./, (c) => c.toUpperCase());
  return fileLeaf(title, rel, label, m ? m[2].trim() : "");
};
// Names double as selPath keys, so a folder's leaf names must stay unique; a rare
// near-duplicate H1 folds its descriptor back on to keep the two distinct.
const listDocs = (dir, label) => {
  const seen = new Set();
  return readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(".md")).sort().map((f) => {
    const leaf = docLeaf(dir + "/" + f, label);
    while (seen.has(leaf.name)) { leaf.name = leaf.subtitle ? `${leaf.name} — ${leaf.subtitle}` : `${leaf.name} ·`; leaf.subtitle = ""; }
    seen.add(leaf.name);
    return leaf;
  });
};

// ── hydrators: a structured node → a finished Markdown reference page. Purely
// MECHANICAL (same input → same page), run HERE at build time so the model
// carries the finished DOCUMENT — the desktop just renders it, and an LLM reads
// the page rather than the raw JSON. This is where the docs consolidation lives.
function elementDoc(id, ref) {
  const c = ref[id];
  const kind = c.origin === "library" ? "Component" : "Built-in element";
  const L = [`# ${c.name}`, "", c.extends ? `*${kind} — extends \`${c.extends}\`*` : `*${kind}*`, ""];
  if (c.doc) L.push(c.doc.trim(), "");
  const pick = (ids) => ids.map((i) => ref[i]).filter((n) => n && n.api);
  const attrs = pick(c.attributes), events = pick(c.events), methods = pick(c.methods);
  if (attrs.length) {
    L.push("## Attributes", "", "| name | type | default | |", "|---|---|---|---|");
    for (const a of attrs) {
      const badge = [a.prevailing ? "prevailing" : "", a.readOnly ? "read-only" : ""].filter(Boolean).join(" · ");
      L.push(`| \`${a.name}\` | ${a.type ?? ""} | ${a.default != null ? "`" + a.default + "`" : ""} | ${badge} |`);
    }
    L.push("");
    for (const a of attrs) if (a.doc) L.push(`**\`${a.name}\`** — ${a.doc.trim()}`, "");
  }
  if (events.length) { L.push("## Events", ""); for (const e of events) L.push(`- \`${e.signature ?? e.name}\`${e.doc ? " — " + e.doc.trim() : ""}`); L.push(""); }
  if (methods.length) { L.push("## Methods", ""); for (const m of methods) L.push(`- \`${m.signature ?? m.name}\`${m.doc ? " — " + m.doc.trim() : ""}`); L.push(""); }
  return L.join("\n");
}
const enumsDoc = (spine) => ["# Enums", "", "*The language's fixed token sets — write the token itself, never a CSS-style value.*", "",
  ...Object.entries(spine.enums).map(([n, toks]) => `**${n}** — ${toks.map((t) => "`" + t + "`").join(" · ")}\n`)].join("\n");
const flagsDoc = (spine) => ["# Compile flags", "", "*Modifiers on a program URL (`?…`), the `declarec` CLI (`--…`), and the JS API — one set of names.*", "",
  "| flag | what it does | default |", "|---|---|---|", ...spine.flags.map((f) => `| \`${f.name}\` | ${f.description} | \`${f.default}\` |`)].join("\n");
const diagnosticsDoc = (spine) => ["# Diagnostic codes", "", `*Every compiler diagnostic carries a \`${spine.diagnostics.prefix}####\` code, and its message names the fix.*`, "",
  spine.diagnostics.codes.map((c) => "`" + c + "`").join(" · ")].join("\n");
const requestsDoc = (spine) => ["# Request types", "", "*The addressable request surface of a program URL.*", "",
  Object.keys(spine.requests).map((r) => "`" + r + "`").join(" · ")].join("\n");

// ── the BROWSE tree: the single walkable IA. Every leaf is a DOCUMENT — either
// an authored .md (a `path`) or a page hydrated from the structured model above
// (an inline `doc`). Folders drill; documents open. One family, no special case.
function buildBrowse(dm, spine) {
  const ref = dm.reference;
  const cat = (name, children, subtitle = "") => ({ name, subtitle, kind: "category", children });
  const builtins = dm.roots.filter((id) => ref[id]?.origin !== "library");
  const library = dm.roots.filter((id) => ref[id]?.origin === "library");
  const elementLeaf = (id) => ({ name: ref[id].name, subtitle: ref[id].extends ? "extends " + ref[id].extends : "", kind: "element",
    label: ref[id].origin === "library" ? "Component" : "Built-in element",
    doc: elementDoc(id, ref), preview: preview(ref[id].doc || "") });
  const hydrated = (name, md) => ({ name, subtitle: "", kind: "reference", label: "Reference", doc: md, preview: preview(md) });
  const tenetLeaf = (t) => ({ name: t.title, subtitle: "", kind: "tenet", label: "Tenet", doc: segMd(t.segs), preview: preview(segText(t.segs)) });
  return [
    cat("Language", [
      fileLeaf("The language", "docs/declare.md", "Markdown file", "declare.md — the whole language"),
      cat("Tenets", (dm.tenets ?? []).map(tenetLeaf)),
      fileLeaf("FAQ", "apps/homepage/declare-faq.md"),
      fileLeaf("Getting started", "apps/homepage/getstarted.md"),
    ]),
    cat("Guide", (dm.guideParts ?? []).map((p) => cat(p.part,
      p.chapters.map((ch) => fileLeaf(ch.num + ". " + (ch.short || ch.title), "docs/guide/" + ch.id + ".md", "Guide chapter"))))),
    cat("Reference", [
      cat("Built-ins", builtins.map(elementLeaf)),
      cat("Standard library", library.map(elementLeaf)),
    ]),
    cat("Vocabulary", [
      hydrated("Enums", enumsDoc(spine)),
      hydrated("Flags", flagsDoc(spine)),
      hydrated("Diagnostics", diagnosticsDoc(spine)),
      hydrated("Requests", requestsDoc(spine)),
    ]),
    cat("Operational", listDocs("docs/operational")),
    cat("Background", listDocs("docs/system-design"), "design notes · non-normative"),
  ];
}

// ── projection 1: the comprehensive JSON ─────────────────────────────────────

function comprehensiveModel(spine) {
  const docsModel = JSON.parse(readFileSync(join(ROOT, "docs/declare-model.json"), "utf8"));
  const registry = buildRegistry();
  const links = { ids: Object.fromEntries(Object.keys(registry).sort().map((k) => [k, registry[k]])), outgoing: scan(registry).outgoing };
  return JSON.stringify({
    meta: {
      version: 1, buildId: docsModel.buildId ?? docsModel.meta?.buildId,
      note: "THE single documentation model — one walkable data structure for every documented element. Read by the docs app, the desktop's embedded docs, the link registry, the eval harness, and any agent. extract.mjs writes the doc tree (reference/roots/tree/guide/tenets) here; this tool augments the SAME file in place with spine/links/meta. One file, no intermediate.",
      pipeline: {
        assembledFrom: ["runtime schemas (live code)", "compiler/dist/scaffold LANGUAGE_API", "compiler/dist/flags FLAG_SPECS", "compiler/dist/reqtypes REQ", "runtime diagnostics catalog (source-scanned codes)", "library/autoincludes.json", "tools/ops.mjs (the operations registry)", "apps/docs/docs-model.json (extract.mjs)", "the declare-docs: link registry (links.mjs, called as a library)"],
        chain: "tsc → build-compiler → build-boot → extract → ASSEMBLE → prewarm → bake",
        projections: ["docs/declare-model.json (this file — for programs)", "marker-injected blocks <!-- generated:NAME --> in docs/operational/flags.md + getting-started.md (for humans)", ".claude/skills/declare/SKILL.md (a gated byte-copy of the authored skill/SKILL.md for Claude Code auto-discovery)"],
        gates: ["docs.test: assemble --check (staleness)", "docs.test: links --check", "ops.test: executes spine.commands entries marked test:true"],
      },
    },
    spine,
    links,
    reference: docsModel.reference,
    roots: docsModel.roots,
    tree: docsModel.tree,
    guide: docsModel.guide,
    guideParts: docsModel.guideParts,
    tenets: docsModel.tenets,
    browse: buildBrowse(docsModel, spine),
  }, null, 1) + "\n";
}

// ── projections 2+3: marker-injected blocks ──────────────────────────────────

function injectStr(content, name, block) {
  const begin = `<!-- generated:${name} -->`, end = `<!-- /generated:${name} -->`;
  const i = content.indexOf(begin), j = content.indexOf(end);
  if (i < 0 || j < 0) throw new Error(`markers ${begin} … ${end} not found`);
  return content.slice(0, i + begin.length) + "\n" + block.trim() + "\n" + content.slice(j);
}

function inject(file, name, block) {
  const p = join(ROOT, file);
  const s = readFileSync(p, "utf8");
  const begin = `<!-- generated:${name} -->`, end = `<!-- /generated:${name} -->`;
  const i = s.indexOf(begin), j = s.indexOf(end);
  if (i < 0 || j < 0) throw new Error(`${file}: markers ${begin} … ${end} not found`);
  const next = s.slice(0, i + begin.length) + "\n" + block.trim() + "\n" + s.slice(j);
  return { p, current: s, next };
}

function flagsTable(spine) {
  const rows = spine.flags.map((f) => {
    const url = f.kind === "bool" ? `\`?${f.name}\`` : `\`?${f.name}=${f.default}\``;
    const cli = f.kind === "bool" ? `\`--${f.name}\`` : `\`--${f.name} ${f.default}\`` + (f.name === "render" ? " / `--canvas`" : "");
    return `| **${f.name}** | ${f.description} | ${cli} | ${url} | \`${f.default}\` |`;
  });
  return ["| modifier | what it does | CLI (`declarec`) | URL | default |", "|---|---|---|---|---|", ...rows].join("\n");
}

function setupBlock(spine) {
  return spine.commands.setup.steps
    .map((s) => (s.cmd ? "```bash\n" + s.cmd + "\n```\n" + s.description : s.description))
    .join("\n\n");
}

// ── main ─────────────────────────────────────────────────────────────────────

const spine = buildSpine();
// the core doc's first complete program — the flagship example every surface
// quotes (declare.md §1); projected, so a quote can never drift (the homepage's
// hand copy shipped the pre-editorial `classroot.count` for a day — the proof)
const flagshipExample = (() => {
  const md = readFileSync(join(ROOT, "docs/declare.md"), "utf8");
  const m = md.match(/```declare\n([\s\S]*?)```/);
  if (!m) throw new Error("declare.md: no ```declare fence for the flagship example");
  return "```declare\n" + m[1] + "```";
})();
// SKILL.md is now fully AUTHORED (no generated block) — assemble no longer
// writes it, only READS it to project the Claude Code discovery copy below.
const skillSource = readFileSync(join(ROOT, "skill/SKILL.md"), "utf8");
const targets = [
  { name: "declare-model", isFile: true, path: "docs/declare-model.json", next: comprehensiveModel(spine) },
  inject("docs/operational/flags.md", "flags-table", flagsTable(spine)),
  inject("docs/operational/getting-started.md", "setup-commands", setupBlock(spine)),
  inject("README.md", "setup-commands", setupBlock(spine)),
  // the Claude Code discovery copy — a BYTE-COPY of the authored skill/SKILL.md
  // (a symlink would silently break on Windows checkouts and zip downloads;
  // a gated generated copy cannot drift — divergence fails docs.test)
  { name: "skill-discovery-copy", isFile: true, path: ".claude/skills/declare/SKILL.md", next: skillSource },
  // the homepage's FAQ view: same authored-page discipline as Get Started —
  // the setup trio is a GENERATED block (the ops registry, compact form). The
  // DataSource reads the authored file ITSELF (format = "text"); the markers
  // are HTML comments, which Markdown drops — no JSON wrap beside it.
  (() => {
    const bare = "```\n" + spine.commands.setup.steps.filter((x) => x.cmd).map((x) => x.cmd).join("\n") + "\n```";
    const p = join(ROOT, "apps/homepage/declare-faq.md");
    const next = injectStr(readFileSync(p, "utf8"), "setup-commands-bare", bare);
    return { name: "faq-md", isFile: true, path: "apps/homepage/declare-faq.md", next };
  })(),
  // the homepage's Get Started view: an AUTHORED page (apps/homepage/
  // getstarted.md — the voice is the homepage's) whose commands and flagship
  // example are GENERATED blocks. The DataSource reads this file directly
  // (format = "text"); the in-app Language view reads docs/declare.md itself
  // the same way — the JSON-wrap projections retired with the text format.
  (() => {
    const p = join(ROOT, "apps/homepage/getstarted.md");
    let next = readFileSync(p, "utf8");
    next = injectStr(next, "setup-commands", setupBlock(spine));
    next = injectStr(next, "flagship-example", flagshipExample);
    return { name: "getstarted-md", isFile: true, path: "apps/homepage/getstarted.md", next };
  })(),
];

let stale = 0;
for (const t of targets) {
  const path = t.isFile ? join(ROOT, t.path) : t.p;
  const current = t.isFile ? (() => { try { return readFileSync(path, "utf8"); } catch { return null; } })() : t.current;
  if (current === t.next) continue;
  if (CHECK) { console.log(`  STALE ${t.isFile ? t.path : t.p.replace(ROOT + "/", "")} — run \`node tools/internal/doc/assemble.mjs\``); stale++; }
  else { writeFileSync(path, t.next); console.log(`assemble: wrote ${t.isFile ? t.path : t.p.replace(ROOT + "/", "")}`); }
}
if (CHECK && stale === 0) console.log("assemble: all projections fresh");
if (CHECK && stale > 0) process.exit(1);
if (!CHECK && targets.every((t) => true)) console.log("assemble: done");
