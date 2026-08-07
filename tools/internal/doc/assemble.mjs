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

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FLAG_SPECS, DEFAULT_FLAGS } from "../../../compiler/dist/flags.js";
import { REQ } from "../../../compiler/dist/reqtypes.js";
import { LANGUAGE_API } from "../../../compiler/dist/scaffold.js";
import { SCHEMAS, RichTextSchema, EVENT_PAYLOAD, PAYLOAD_TYPE_NAMES } from "../../../runtime/dist/schema.js";
import { DECLARED_TYPE_NAMES } from "../../../runtime/dist/value.js";
import { RESERVED, programSchemas } from "../../../runtime/dist/program-schema.js";
import { parseLibrary } from "../../../runtime/dist/parser.js";
import { CODE_PREFIX } from "../../../runtime/dist/diagnostics.js";
import { MOTION_TOKENS } from "../../../runtime/dist/animate.js";
import { OPS } from "../ops.mjs";
import { buildRegistry, scan } from "./links.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CHECK = process.argv.includes("--check");

// ── spine sections, each from its live source ───────────────────────────────

/** One attribute type as a published tag. Shared by both schema tiers so the
 *  kernel and the library can never encode the same type two ways. */
const attrTypeTag = (t) =>
  t.kind === "enum" ? `enum(${t.tokens.join("|")})`
  : t.kind === "component" ? `component(${t.of})`
  : t.kind === "record" ? `record(${t.name})`
  : t.kind;

function schemaSpine() {
  const all = { ...SCHEMAS, RichText: RichTextSchema };
  const out = {};
  for (const [name, s] of Object.entries(all)) {
    out[name] = {
      base: s.base?.name ?? null,
      attrs: Object.fromEntries(Object.entries(s.attrs).map(([k, t]) => [k, attrTypeTag(t)])),
      prevailing: s.prevailing ?? [],
      readOnly: s.readOnly ?? [],
      events: s.events ?? [],
    };
  }
  return out;
}

/** The LIBRARY tier's schemas, in the same shape as `schemas` — synthesized by
 *  the checker's own `programSchemas()` over the parsed `library/*.declare`
 *  sources, so a component's published attribute surface is the one the checker
 *  enforces, not a hand-listed copy. `library` (tag → file) stays as it is; this
 *  is the surface a tool needs to KNOW that `Button` takes a `label`.
 *
 *  Kept SEPARATE from `schemas` (ruled 2026-07-29) because the tiers differ in
 *  kind: `schemas` is the kernel, read from live code and load-bearing;
 *  library components are Declare source and explicitly scaffolding
 *  (composition.md §1a). A consumer that wants either can merge the two; one
 *  that must not confuse them is not forced to.
 *
 *  Bases must precede subclasses for the chain walk, so classes are emitted in
 *  dependency order — `Pane extends Control` needs Control's schema built. A
 *  class whose base is neither a built-in nor a library class (impossible today)
 *  is skipped rather than failing the assembly. */
function librarySchemaSpine() {
  const dir = join(ROOT, "library");
  const decls = new Map(); // name → ClassDecl, across every library file
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".declare")).sort()) {
    for (const c of parseLibrary(readFileSync(join(dir, f), "utf8")).classes) decls.set(c.name, c);
  }
  // Dependency order: emit a class only once its base is available.
  const ordered = [];
  const placed = new Set();
  let progress = true;
  while (progress) {
    progress = false;
    for (const [name, c] of decls) {
      if (placed.has(name)) continue;
      if (Object.hasOwn(SCHEMAS, c.base) || placed.has(c.base)) {
        ordered.push(c); placed.add(name); progress = true;
      }
    }
  }
  const { schemas } = programSchemas(ordered);
  const out = {};
  for (const c of ordered) {
    const s = schemas[c.name];
    if (s === undefined) continue;             // a declaration the checker rejected
    out[c.name] = {
      base: s.base?.name ?? null,
      attrs: Object.fromEntries(Object.entries(s.attrs).map(([k, t]) => [k, attrTypeTag(t)])),
      prevailing: s.prevailing ?? [],
      readOnly: s.readOnly ?? [],
      events: s.events ?? [],
    };
  }
  return out;
}

/** The EVENT half of a signature's truth: which payload each event carries, and
 *  the legal payload type names. A handler's first parameter must be written
 *  with EXACTLY this type (check.ts refuses both the omission and a wrong one,
 *  ruled 2026-07-28), so a program — or an agent, an editor, a source-to-source
 *  tool — cannot write a legal handler without this table. It was private to
 *  runtime/src; the spine is the machine contract, so it belongs here. */
function eventSpine() {
  return {
    payload: { ...EVENT_PAYLOAD },
    payloadTypes: [...PAYLOAD_TYPE_NAMES].sort(),
    handlerPrefix: "on",
  };
}

/** The TYPE vocabulary a written signature or declaration may name: the
 *  built-in declarable types, plus the reserved value-constructor names a
 *  generated attribute or class name must avoid. (A component class in the
 *  program is also legal — that part is per-program, not projectable.) */
function typeSpine() {
  return { declarable: [...DECLARED_TYPE_NAMES].sort(), reserved: [...RESERVED].sort(), shared: sharedTypes() };
}

/** The SHARED VOCABULARY a `{ }` body may name — every type and global function
 *  the scaffold's PRELUDE declares into each program's check block: `Draw` and
 *  its gradient, the event payloads a handler receives (`PointerEvent`,
 *  `KeyEvent`, …), the value types (`Color`, `Length`, `Fill`, `Stroke`,
 *  `Shadow`, `Gradient`, `Theme`, `Cursor`), and the constructors (`stroke()`,
 *  `shadow()`, `gradient()`, the motion curves, the timers).
 *
 *  These are typechecked for every program and were in the reference NOWHERE —
 *  the same defect the callable surface had (library-charter §2a), one layer
 *  down and larger: `draw(d: Draw)` is a first-class member kind, and the only
 *  statement of what `d` offers was four examples and an ellipsis in declare.md.
 *  A handler's payload was worse — the reference documented `onKeyDown(e: KeyEvent)`
 *  while nothing said what is ON `e`.
 *
 *  Parsed from the PRELUDE text rather than re-declared here, so the reference
 *  cannot drift from what the compiler actually emits. */
function sharedTypes() {
  const src = readFileSync(join(ROOT, "compiler/src/scaffold.ts"), "utf8");
  // The template literal closes with a backtick-semicolon at the END of its last
  // line, not on a line of its own — splitting on "\n`;" therefore ran to EOF and
  // scanned the whole of scaffold.ts. The three forms parsed here happen not to
  // appear after the prelude, so it produced correct output by luck; the
  // form-agnostic gate is what exposed it.
  const prelude = src.split("const PRELUDE = `")[1]?.split(/`;\s*$/m)[0] ?? "";
  const out = { interfaces: [], aliases: [], functions: [], namespaces: [] };
  // Line-based, because the PRELUDE mixes forms: block interfaces, one-liners
  // (`interface Touch { id: number; x: number }`), and `extends` (`interface
  // WheelEvent extends PointerEvent { … }`). A block regex swallowed every
  // one-liner into the next `^}` it could find, which made `Touch` report the
  // remainder of the file as its members.
  const lines = prelude.split("\n");
  const splitMembers = (s) => s.split(";").map((x) => x.trim()).filter((x) => x && !x.startsWith("//"));
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^interface\s+([A-Za-z]\w*)(?:\s+extends\s+([A-Za-z]\w*))?\s*\{(.*)$/);
    if (!head) continue;
    const [, name, base, rest] = head;
    let members = [];
    if (rest.includes("}")) members = splitMembers(rest.slice(0, rest.lastIndexOf("}")));
    else {
      members = splitMembers(rest);
      for (i++; i < lines.length && !/^\}/.test(lines[i]); i++) {
        const l = lines[i].trim();
        if (!l || l.startsWith("//") || l.startsWith("*") || l.startsWith("/*")) continue;
        members.push(...splitMembers(l));
      }
    }
    out.interfaces.push({ name, extends: base ?? null, members });
  }
  // `declare const NAME: { … }` — the namespaced objects (`Themes.sanFrancisco(dark)`,
  // `Inspect.…`). A fourth declaration form the first pass skipped silently, which is
  // how `Themes` stayed absent from the reference while the theme page told readers to
  // call it. Same one-liner-or-block shape as the interfaces above.
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^declare const\s+([A-Za-z]\w*)\s*:\s*\{(.*)$/);
    if (!head) continue;
    const [, name, rest] = head;
    let members = [];
    if (rest.includes("}")) members = splitMembers(rest.slice(0, rest.lastIndexOf("}")));
    else {
      members = splitMembers(rest);
      for (i++; i < lines.length && !/^\}/.test(lines[i]); i++) {
        const l = lines[i].trim();
        if (!l || l.startsWith("//") || l.startsWith("*") || l.startsWith("/*")) continue;
        members.push(...splitMembers(l.replace(/^\{|\}$/g, "")));
      }
    }
    out.namespaces.push({ name, members: members.filter(Boolean) });
  }
  for (const m of prelude.matchAll(/^type\s+([A-Za-z]\w*)\s*=\s*([^\n]+?);?$/gm)) {
    out.aliases.push({ name: m[1], type: m[2].trim().replace(/;$/, "") });
  }
  for (const m of prelude.matchAll(/^declare function\s+([A-Za-z]\w*)([^\n]*?);?$/gm)) {
    out.functions.push({ name: m[1], signature: (m[1] + m[2]).replace(/;$/, "").trim() });
  }
  return out;
}

/** The THEME TOKEN vocabulary, measured rather than asserted. Library components
 *  read `theme.<token>`; a token read BARE is required (miss it and the component
 *  breaks), a token always behind a `typeof`/null guard has a built-in fallback
 *  and is tuning. The preset states the required set; the guarded ones are the
 *  extension surface a city theme reaches for.
 *
 *  Derived from the library sources and the SanFrancisco preset — the authored
 *  truth (gen-themes.mjs projects the same presets into the runtime) — so the
 *  documented vocabulary cannot drift from what the components actually consult. */
function themeTokenSpine() {
  const files = [...readdirSync(join(ROOT, "library")).filter((f) => f.endsWith(".declare")).map((f) => "library/" + f),
                 ...readdirSync(join(ROOT, "library/icons")).filter((f) => f.endsWith(".declare")).map((f) => "library/icons/" + f)];
  const bare = new Set(), guarded = new Set(), readers = {};
  for (const f of files) {
    // comments carry `theme.x` in prose — strip them, or documentation counts as usage
    const code = readFileSync(join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const who = f.replace(/^library\//, "").replace(/\.declare$/, "");
    for (const line of code.split("\n")) {
      for (const mm of line.matchAll(/theme\.([a-zA-Z][A-Za-z0-9]*)/g)) {
        const t = mm[1];
        (readers[t] ??= new Set()).add(who);
        const g = new RegExp(`typeof\\s+theme\\.${t}\\b|theme\\.${t}\\s*!=\\s*null|theme\\.${t}\\s*==`).test(line);
        (g ? guarded : bare).add(t);
      }
    }
  }
  for (const t of bare) guarded.delete(t);            // read bare anywhere ⇒ required
  const presetSrc = readFileSync(join(ROOT, "library/themes/sanfrancisco.declare"), "utf8");
  const body = presetSrc.split("stylesheet SanFrancisco [")[1]?.split("]")[0] ?? "";
  const stated = [...body.matchAll(/([a-zA-Z][\w]*)\s*=/g)].map((m) => m[1]);
  const row = (t) => ({ name: t, required: bare.has(t), read: [...(readers[t] ?? [])].sort(), stated: stated.includes(t) });
  return {
    required: [...bare].sort().map(row),
    optional: [...guarded].sort().map(row),
    presets: readdirSync(join(ROOT, "library/themes")).filter((f) => f.endsWith(".declare")).map((f) => f.replace(/\.declare$/, "")).sort(),
  };
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
  // Tag -> file only. `$`-prefixed keys are manifest DIRECTIVES, not components
  // ($provide is an array of provision rules), and concatenating one onto a path
  // shipped `"library/[object Object],[object Object]"` in the published model.
  return Object.fromEntries(Object.entries(manifest)
    .filter(([tag, file]) => !tag.startsWith("$") && typeof file === "string")
    .map(([tag, file]) => [tag, "library/" + file]));
}

function buildSpine() {
  return {
    schemas: schemaSpine(),
    librarySchemas: librarySchemaSpine(),
    api: LANGUAGE_API,
    events: eventSpine(),
    types: typeSpine(),
    themeTokens: themeTokenSpine(),
    enums: enumVocabularies(),
    flags: FLAG_SPECS.map((f) => ({ ...f, default: DEFAULT_FLAGS[f.name] })),
    requests: REQ,
    diagnostics: diagnosticSpine(),
    library: librarySpine(),
    commands: OPS,
    concepts: conceptSpine(),
  };
}

// ── guide `teaches` stamps: which classes each chapter mentions ──────────────
// The same mention-scan the guide-coverage gate (surfaces.mjs) runs over the
// joined corpus, run per-chapter and stamped onto the model's guide entries —
// so declare-help can end a class answer with the chapters that teach it, and
// the pointers regenerate from the actual files (a guide rewrite cannot
// orphan them). Derived, zero curation.
function stampTeaches(guide, spine) {
  const classes = [...new Set([...Object.keys(spine.schemas), ...Object.keys(spine.librarySchemas)])];
  return (guide ?? []).map((g) => {
    let text = "";
    try { text = readFileSync(join(ROOT, "docs/guide", `${g.id}.md`), "utf8"); } catch { /* a chapter listed but not on disk keeps an empty stamp */ }
    // name → mention count, so a reader tool can rank "the chapter that teaches
    // this" above "a chapter that name-drops it" (sorted for stable bytes)
    const teaches = {};
    for (const n of classes.sort()) {
      const hits = text.match(new RegExp(`(^|[^A-Za-z0-9_])${n}([^A-Za-z0-9_]|$)`, "g"))?.length ?? 0;
      if (hits > 0) teaches[n] = hits;
    }
    return { ...g, teaches };
  });
}

// ── the concept table: declare-help's synonym → entry map + negative knowledge ─
// Curated in concepts.json BESIDE this tool (declare-help.md §4) and folded into the
// spine here so the staleness gate covers it; declare-help.test.mjs asserts every
// synonym target resolves and every negative entry answers its triggers.
function conceptSpine() {
  const raw = JSON.parse(readFileSync(join(ROOT, "tools/internal/doc/concepts.json"), "utf8"));
  return { synonyms: raw.synonyms, negative: raw.negative };
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
  const kind = c.origin === "library" ? "Component" : c.abstract ? "Abstract element" : "Built-in element";
  const link = (n) => (ref[n] ? `[${n}](declare-docs:${n})` : `\`${n}\``);
  const chain = c.chain ?? [c.name];
  const L = [`# ${c.name}`, ""];
  // the ANCESTRY line: the whole chain, each link live — a reader can walk up
  // from any page, which was impossible while `extends` was prose
  L.push(chain.length > 1 ? `*${kind} — ${chain.slice(1).map(link).join(" → ")}*` : `*${kind}*`, "");
  if (c.abstract) L.push("Extend it; it is not a tag you write.", "");
  if (c.doc) L.push(c.doc.trim(), "");

  const pick = (ids) => (ids ?? []).map((i) => ref[i]).filter((n) => n && n.api);
  // A getter is a read-only MEMBER, not a call — it reads like an attribute, so
  // it is listed with them rather than under Methods.
  const split = (ms) => [ms.filter((m) => m.getter), ms.filter((m) => !m.getter)];

  const section = (nodes, heading, level) => {
    const [attrs, meths, evts] = nodes;
    if (!attrs.length && !meths.length && !evts.length) return;
    if (heading) L.push(heading, "");
    if (attrs.length) {
      L.push(`${level} Attributes`, "", "| name | type | default | |", "|---|---|---|---|");
      for (const a of attrs) {
        const badge = [a.prevailing ? "prevailing" : "", a.readOnly ? "read-only" : ""].filter(Boolean).join(" · ");
        L.push(`| \`${a.name}\` | ${a.type ?? (a.returns ?? "")} | ${a.default != null ? "\`" + a.default + "\`" : ""} | ${badge} |`);
      }
      L.push("");
      for (const a of attrs) if (a.doc) L.push(`**\`${a.name}\`** — ${a.doc.trim()}`, "");
    }
    if (evts.length) { L.push(`${level} Events`, ""); for (const e of evts) L.push(`- \`${e.signature ?? e.name}\`${e.doc ? " — " + e.doc.trim() : ""}`); L.push(""); }
    if (meths.length) { L.push(`${level} Methods`, ""); for (const m of meths) L.push(`- \`${m.signature ?? m.name}\`${m.doc ? " — " + m.doc.trim() : ""}`); L.push(""); }
  };

  const own = (n) => {
    const [getters, methods] = split(pick(ref[n].methods));
    return [[...pick(ref[n].attributes), ...getters], methods, pick(ref[n].events)];
  };

  section(own(c.name), null, "##");

  // …then one section per ANCESTOR, nearest first. The model stays normalized —
  // nothing is copied into this class — so the walk happens here, at render.
  // Before this, a Button page showed 4 members and hid 97.
  for (const base of chain.slice(1)) {
    if (!ref[base]) continue;
    section(own(base), `## Inherited from ${link(base)}`, "###");
  }

  // an abstract base is the index of its family
  if (c.subclasses?.length) {
    const subs = c.subclasses.map((sid) => ref[sid]?.name).filter(Boolean);
    if (subs.length) L.push("## Subclasses", "", subs.map(link).join(" · "), "");
  }
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

// One line per shared type/function: what it is, and the thing a signature does
// not say. Keyed by name so the page stays generated — a type added to the
// PRELUDE appears here immediately, with an empty note rather than silently.
const VOCAB_NOTE = {
  Draw: "the recorder a `draw(d: Draw)` body receives — Canvas2D-shaped",
  DrawGradient: "a gradient built inside a drawing, via `d.createLinearGradient(…)`",
  Color: "a packed `0xRRGGBB` number in a `{ }` body — `null` means *no paint*, not black. **Alpha, by context**: a constant carries it in the literal — `0xRRGGBBAA` (or `#RRGGBBAA`), in bare slots and `{ }` bodies alike; a computed alpha calls `colorWithAlpha(rgb, a)` in a body; inside `draw()` the canvas takes its own CSS string (`\"rgba(51,102,153,0.5)\"`). `rgba(…)` is never a slot spelling",
  Length: "a number of pixels, or a `Percent` from a bare `50%` literal",
  Percent: "what a bare `50%` literal becomes; you never write the type",
  Shape: "a clip shape",
  Gradient: "an angle plus colour stops — build it with `gradient(…)`",
  Fill: "what paints a box: a `Color` or a `Gradient`",
  Stroke: "a width and a colour — build it with `stroke(w, c)`. A border *is* a stroke",
  Shadow: "offset, blur and colour — build it with `shadow(dx, dy, blur, c)`",
  Theme: "the prevailing token record; see **Theme tokens** for the vocabulary components read",
  Themes: "The shipped theme presets — each takes a dark flag and returns a complete token record. **This is what you build a theme from**; an empty record is not a theme. Available without an include.",
  Inspect: "The running program's introspection surface, behind the same door as `__declare.explain` — dev tooling, stubbed in a production build unless you pass `declarec --debug`.",
  Cursor: "a datapath's resolved position — `.data` and `.path`",
  MotionCurve: "an easing curve for an `Animator`",
  PointerEvent: "a pointer went down, moved, or a view was clicked",
  PointerUpEvent: "a pointer release — carries **`canceled`**, true when the browser reclaimed the gesture",
  TouchEvent: "the multi-finger stream — carries the finger list",
  Touch: "one finger within a `TouchEvent`",
  WheelEvent: "a wheel or trackpad gesture — carries **`pinch`**, true for a trackpad pinch",
  KeyEvent: "a key went down or up — `key`, `code`, and modifier flags; never a numeric code",
  FocusGeometry: "the focused control's live silhouette, for a focus indicator",
  TipEvent: "a tooltip request from the `Tip` service",
  StreamMessage: "one arrival from an `EventStream` or `Socket`",
  gradient: "build a `Gradient` from an angle and colours",
  stroke: "build a `Stroke`",
  shadow: "build a `Shadow`",
  stop: "one colour stop, for `gradient(…)`",
  frost: "build a `Backdrop` — blur (and optionally saturate) what lies beneath the view, under its own fill",
  Backdrop: "the frost a `backdrop` slot holds — blur radius and saturation, from `frost(…)`",
  colorWithAlpha: "an `0xRRGGBB` plus an alpha, as the packed form the paint slots take",
  cubicBezier: "a custom easing curve",
  back: "an overshooting easing curve",
  steps: "a stepped easing curve",
  laszlo: "the OpenLaszlo easing curve, kept",
  setTimeout: "deferred work — **a timer does not die with its node; cancel it yourself**",
  clearTimeout: "cancel a `setTimeout`",
  setInterval: "repeating work — same caveat as `setTimeout`",
  clearInterval: "cancel a `setInterval`",
};

const sharedTypesDoc = (spine) => {
  const t = spine.types.shared;
  // a union type (`number | Percent`) inside a table cell would end the column —
  // escape the pipe, or every value type renders truncated
  const cell = (s) => "`" + String(s).replace(/\|/g, "\\|") + "`";
  const note = (n) => (VOCAB_NOTE[n] ? " — " + VOCAB_NOTE[n] : "");
  const iface = (n) => t.interfaces.find((i) => i.name === n);
  const PAYLOADS = ["PointerEvent", "PointerUpEvent", "WheelEvent", "TouchEvent", "Touch", "KeyEvent", "FocusGeometry", "TipEvent", "StreamMessage"];
  const draw = iface("Draw");
  const props = (draw?.members ?? []).filter((m) => !m.includes("("));
  const calls = (draw?.members ?? []).filter((m) => m.includes("("));
  const out = ["# Types and functions", "",
    "*The shared vocabulary every `{ }` body can name. The scaffold declares all of it into",
    "each program's check block, so it is typechecked for your code exactly as for the",
    "standard library's.*", ""];

  out.push("## `Draw` — drawing as a tracked computation", "",
    "A `draw(d: Draw)` member is **not** a paint callback and not an escape hatch. It records a",
    "**display list** that both renderers replay, and it is a tracked computation like any",
    "constraint: it re-runs when what it *read* changes, **never per frame**. So a drawing composes",
    "with attributes and constraints instead of escaping them — `ink`, `width` and state are",
    "ordinary reads, and changing one re-records.",
    "",
    "This is how the library draws every mark a font cannot give it: a `Checkbox`'s tick and the",
    "whole `Icon` set are recorded paths, not glyphs. Author an icon in a 16×16 box and scale it",
    "inside the body (see `Icon`); **never animate a drawing's size** — reading size inside `draw`",
    "makes the recording size-dependent, so an animated size re-records and reallocates its backing",
    "canvas every frame.", "",
    "```declare-fragment",
    "draw(d: Draw) {",
    "    d.fillStyle = theme.accent",
    "    d.beginPath()",
    "    d.arc(width / 2, height / 2, 6, 0, Math.PI * 2, false)",
    "    d.fill()",
    "    }",
    "```", "",
    "`d.w` / `d.h` are the view's own size, for a drawing that sizes itself. Reading one is",
    "what opts a drawing into re-recording when the view resizes — a body that never mentions",
    "them never pays for the resize. (There is no `d.x`/`d.y`: a recording's origin IS the",
    "view's top-left, so they could only be 0.)", "");
  if (props.length) out.push("**State you set:** " + props.map(cell).join(" · "), "");
  if (calls.length) out.push("**Calls:** " + calls.map((m) => "`" + m.replace(/\s*\{.*$/, "") + "`").join(" · "), "");

  out.push("", "## Event payloads", "",
    "*What a handler's argument carries.*", "",
    "| type | what it is | members |", "|---|---|---|");
  for (const n of PAYLOADS) {
    const i = iface(n);
    // an `extends` payload carries its base's members too — show them, or a
    // reader concludes a WheelEvent has no x/y
    const inherited = i?.extends ? (iface(i.extends)?.members ?? []) : [];
    const all = [...inherited, ...(i?.members ?? [])];
    const shape = all.length ? all.map(cell).join(" · ") : "—";
    out.push(`| \`${n}\` | ${VOCAB_NOTE[n] ?? ""} | ${shape} |`);
  }

  const valueIfaces = t.interfaces.filter((i) => !PAYLOADS.includes(i.name) && i.name !== "Draw");
  out.push("", "## Value types", "", "| type | what it is | shape |", "|---|---|---|");
  for (const a of t.aliases) out.push(`| \`${a.name}\` |${note(a.name).replace(/^ — /, " ")} | ${cell(a.type)} |`);
  for (const i of valueIfaces) out.push(`| \`${i.name}\` |${note(i.name).replace(/^ — /, " ")} | ${i.members.map(cell).join(" · ")} |`);

  out.push("", "## Global functions", "", "| call | what it does |", "|---|---|");
  for (const f of t.functions) out.push(`| ${cell(f.signature)} | ${VOCAB_NOTE[f.name] ?? ""} |`);

  for (const ns of t.namespaces ?? []) {
    if (ns.name === "console") continue;                        // the platform's own, not ours
    out.push("", `## \`${ns.name}\``, "", VOCAB_NOTE[ns.name] ?? "", "",
      "| call | |", "|---|---|",
      ...ns.members.map((m) => `| ${cell(ns.name + "." + m)} | ${VOCAB_NOTE[ns.name + "." + m.replace(/[(:].*$/, "")] ?? ""} |`));
  }
  return out.join("\n");
};

const themeTokensDoc = (spine) => {
  const t = spine.themeTokens;
  const row = (r) => `| \`${r.name}\` | ${r.read.slice(0, 6).join(", ")}${r.read.length > 6 ? ", …" : ""} |`;
  return ["# Theme tokens", "",
    "*The vocabulary the standard library reads off the prevailing `theme` record. Measured from",
    "the library sources, so it cannot drift from what the components actually consult.*", "",
    "A `theme` is a plain record on a **prevailing** slot: set it high in the tree and every",
    "descendant follows until one overrides it. Start from a preset and spread to change a token —",
    "**an empty record is not a theme**, because the library reads specific names:", "",
    "```declare-fragment",
    "theme = { Themes.sanFrancisco(app.dark) },                 // on the App",
    "theme = { { ...app.theme, accent: 0xCC3333 } }            // override one token below",
    "```", "",
    `Presets, each taking a dark flag: ${spine.themeTokens.presets.map((p) => "`" + p + "`").join(" · ")}.`, "",
    "## Required — the contract", "",
    `**${t.required.length} tokens are read bare**, with no fallback. A record missing one of these`,
    "breaks the components that read it, which is why a theme is built from a preset rather than",
    "from scratch.", "",
    "| token | read by |", "|---|---|", ...t.required.map(row), "",
    "## Optional — the tuning surface", "",
    `**${t.optional.length} tokens are read behind a guard** and fall back to a built-in default.`,
    "These are what a city preset reaches for to change platform character — button geometry,",
    "menu material, focus-ring behaviour, dialog arrangement — and what your own theme can set",
    "without stating the whole set.", "",
    "| token | read by |", "|---|---|", ...t.optional.map(row), "",
  ].join("\n");
};

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
  const tenetLeaf = (t) => ({ name: t.name ?? t.title, subtitle: "", kind: "tenet", label: "Tenet", doc: segMd(t.segs), preview: preview(segText(t.segs)) });
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
      hydrated("Types and functions", sharedTypesDoc(spine)),
      hydrated("Theme tokens", themeTokensDoc(spine)),
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
  // The doc tree comes from extract's INTERMEDIATE (.derive/docs-extract.json)
  // when one exists — the normal case, since derive orders extract before this —
  // and falls back to the committed model's own doc-tree sections otherwise (a
  // standalone or fresh-clone run: the same self-read this tool always did).
  // This is what makes docs/declare-model.json a single-author artifact: extract
  // no longer touches it, so a bare extract can no longer corrupt it.
  const EXTRACT = join(ROOT, ".derive/docs-extract.json");
  const docsModel = JSON.parse(readFileSync(existsSync(EXTRACT) ? EXTRACT : join(ROOT, "docs/declare-model.json"), "utf8"));
  const registry = buildRegistry(docsModel.reference);
  const links = { ids: Object.fromEntries(Object.keys(registry).sort().map((k) => [k, registry[k]])), outgoing: scan(registry).outgoing };
  return JSON.stringify({
    meta: {
      // The id comes from bundles/version.json, which stamp-version has already
      // written by the time this runs (assemble is last in the derive graph,
      // ordered by this very dependency). It used to come from extract, which
      // read it before stamp-version wrote it — a cycle whose symptom was the
      // committed model trailing every build by exactly one id.
      version: 1, buildId: (() => {
        try { return JSON.parse(readFileSync(join(ROOT, "bundles/version.json"), "utf8")).build ?? "dev"; }
        catch { return docsModel.meta?.buildId ?? "dev"; }
      })(),
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
    guide: stampTeaches(docsModel.guide, spine),
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
