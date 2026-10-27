#!/usr/bin/env node
// declare-help — one question in, one answer out, in the compiler's register.
//
//   node tools/declare-help.mjs Slider.value        # the reference entry, scoped
//   node tools/declare-help.mjs Text.lineheight     # the compiler's own near-miss
//   node tools/declare-help.mjs Segmented           # a class: its member table
//   node tools/declare-help.mjs lineHeight          # an attribute: who carries it
//   node tools/declare-help.mjs borderWidth         # a foreign name: the hint, verbatim
//   node tools/declare-help.mjs rotation            # a concept: the entry that answers it
//   node tools/declare-help.mjs scrolls             # an enum: its tokens
//   node tools/declare-help.mjs DECLARE7001         # a diagnostic code
//   node tools/declare-help.mjs DataSource --example # the guide's shortest examples using it
//   … --json                                        # the same answer as data
//   … --all                                         # lift the elision on a long table
//
// Design: docs/system-design/declare-help.md. Two contracts carry the tool:
// NEGATIVE KNOWLEDGE IS A SUCCESS (a curated "that does not exist, here is the
// real door" answer exits 0) and a TRUE MISS IS HONEST (exit 1, naming what was
// searched, so an agent can trust silence). Deterministic: same query, same
// bytes. No network, no index, no state — it must run cold in a fresh clone.
//
// One corpus, two front ends: the hint tables and the near-miss calibration are
// IMPORTED from the runtime's teach module (runtime/src/teach.ts) — the same
// code the checker's diagnostics run — so this tool and the compiler cannot
// learn different manners. Vocabularies come from docs/declare-model.json only;
// this tool adds NO new truth (the curated concepts table rides the model too,
// via assemble.mjs).

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CSS_ATTRIBUTE_HINTS, cssAttributeHint, hintedForeignName, hostGlobalHint, memberHint, nearestName } from "../runtime/dist/teach.js";
import { readBriefs, findBrief, briefIndex } from "./internal/doc/briefs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── the answer budget (§3: elision by pointer, never truncation by accident) ──
const BUDGET_LINES = 40;
/** Shared functions a { } VALUE may not call — they act later, and a value computes. */
const HANDLER_ONLY = new Set(["afterDelay"]);

// ── arguments ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const ALL = args.includes("--all");
const EXAMPLE = args.includes("--example");
const query = args.filter((a) => !a.startsWith("--")).join(" ").trim();

if (query === "" || args.includes("--help")) {
  console.log(`declare-help — ask the platform a question; it answers in the compiler's register.

  usage: node tools/declare-help.mjs <name-or-question> [--example] [--all] [--json]

  what you can ask                          what you get
    Slider.value                            the reference entry: type, default, prose
    Text.lineheight                         the near-miss: did you mean 'lineHeight'?
    Segmented                               the class: member table, file, inheritance
    lineHeight                              every class carrying the attribute
    borderWidth                             a foreign name's hint — the Declare door
    rotation · bold inside a label          the entry that answers the concept
    scrolls · fontWeight tokens             the enum's tokens, and who carries them
    DECLARE7001                             the diagnostic's family and register
    map apps/weather/weather.declare        a program's parts, each with its lines

  flags
    --example  the guide's shortest working examples that use the name, with
               the chapter and section each comes from — real code, not a whole app
    --all      lift the elision on a long answer (full member list, full prose)
    --json     the same answer as one line of JSON
    --help     this text

  exit codes — the contract worth trusting
    0  an answer — including "that deliberately does not exist, use X instead"
    1  a true miss: nothing anywhere answers; the output names what was searched

  More: docs/operational/help.md. The store is docs/declare-model.json.`);
  process.exit(0);
}

// ── briefs: the task-shaped entry points (docs/briefs) ───────────────────────
// `briefs` lists them, one line each; `brief <name>` prints one whole. A name
// may be abbreviated (`brief lists`), as long as it picks out one brief.
if (query === "briefs" || query.startsWith("brief ") || query === "brief") {
  const briefs = readBriefs(ROOT);
  if (query === "briefs" || query === "brief") {
    if (JSON_OUT) console.log(JSON.stringify({ kind: "briefs", briefs: briefs.map((b) => ({ name: b.name, title: b.title, index: b.index })) }));
    else console.log(`Take the brief for your task — declare-help brief <name>:\n${briefIndex(briefs)}`);
    process.exit(0);
  }
  const asked = query.slice("brief ".length);
  const b = findBrief(briefs, asked);
  if (b === null) {
    if (JSON_OUT) console.log(JSON.stringify({ kind: "miss", query, searched: "docs/briefs" }));
    else console.log(`no brief matches '${asked}' — the briefs are:\n${briefIndex(briefs)}`);
    process.exit(1);
  }
  const text = b.text.replace(/^<!-- index: .+ -->\n/m, "");
  if (JSON_OUT) console.log(JSON.stringify({ kind: "brief", name: b.name, file: b.file, text }));
  else console.log(text.trimEnd());
  process.exit(0);
}

// ── map: a program file's parts, by line range ───────────────────────────────
// `map <file>` — so an exemplar is read by its header and the parts the work
// needs, not whole. Any .declare file: the exemplars, the library, your own.
if (query === "map" || query.startsWith("map ")) {
  const file = query.slice("map".length).trim();
  if (file === "") { console.log("declare-help map <file.declare> — the program's parts, each with its lines and what it is"); process.exit(1); }
  let text;
  try { text = readFileSync(resolve(process.cwd(), file), "utf8"); }
  catch { try { text = readFileSync(join(ROOT, file), "utf8"); } catch { console.log(`no file at ${file}`); process.exit(1); } }
  const { formatMap, programMap } = await import("./internal/doc/program-map.mjs");
  if (JSON_OUT) console.log(JSON.stringify({ kind: "map", file, parts: programMap(text) }));
  else console.log(formatMap(file, text));
  process.exit(0);
}

// ── --example: the guide's own code, found by the names it uses ──────────────
// Every example in the guide is live and compiled by the docs test, so it is
// current by construction and idiomatic by design — the short, checked answer to
// "show me this in real code", instead of reading a whole application.
if (EXAMPLE) {
  const dir = join(ROOT, "docs/guide");
  const terms = query.split(".").filter((t) => t !== "");
  const word = (t) => new RegExp(`(^|[^A-Za-z0-9_$])${t.replace(/[$]/g, "\\$")}([^A-Za-z0-9_]|$)`);
  // USE, not mention: a tag, an attribute being set or declared, a call, a :path
  const use = (t) => new RegExp(`(^|[^A-Za-z0-9_])${t.replace(/[$]/g, "\\$")}\\s*(\\[|=|:|\\()`, "m");
  const found = [];
  for (const f of readdirSync(dir).filter((n) => /^\d\d-.*\.md$/.test(n)).sort()) {
    const lines = readFileSync(join(dir, f), "utf8").split("\n");
    const title = (lines.find((l) => l.startsWith("# ")) ?? f).replace(/^# /, "");
    let section = "", inBlock = null, buf = [], startLine = 0;
    for (let n = 0; n < lines.length; n++) {
      const l = lines[n];
      if (inBlock === null) {
        const h = /^#{2,3} (.*)/.exec(l);
        if (h) section = h[1];
        const open = /^```(declare|declare-fragment)\s*$/.exec(l);
        if (open) { inBlock = open[1]; buf = []; startLine = n + 2; }
        continue;
      }
      if (l.startsWith("```")) {
        const code = buf.join("\n");
        if (terms.length > 0 && terms.every((t) => word(t).test(code))) {
          const last = terms[terms.length - 1].toLowerCase();
          const used = use(terms[terms.length - 1]).test(code);
          const about = (section + " " + title).toLowerCase().includes(last);   // the section is ABOUT it
          found.push({ file: "docs/guide/" + f, from: startLine, to: startLine + buf.length - 1, chapter: title, section, kind: inBlock, code, lines: buf.length, used, about });
        }
        inBlock = null;
        continue;
      }
      buf.push(l);
    }
  }
  // a block that USES the name beats one that mentions it; then shorter first,
  // but never a two-line scrap when a real example exists
  found.sort((a, b) => (b.used - a.used) || (b.about - a.about) || ((a.lines < 3) - (b.lines < 3)) || (a.lines - b.lines));
  const pick = found.slice(0, ALL ? 6 : 2);
  if (pick.length === 0) {
    if (JSON_OUT) console.log(JSON.stringify({ kind: "miss", query, searched: "the guide's examples" }));
    else console.log(`no guide example uses '${query}' — try the class or attribute name alone, or declare-help ${query} for the reference entry.`);
    process.exit(1);
  }
  if (JSON_OUT) console.log(JSON.stringify({ kind: "examples", query, examples: pick.map(({ used, about, ...e }) => e) }));
  else {
    for (const e of pick) {
      console.log(`${e.file}:${e.from}-${e.to} — ${e.section === "" ? e.chapter : e.chapter + " › " + e.section}`);
      console.log("```" + e.kind + "\n" + e.code + "\n```");
    }
    if (found.length > pick.length && !ALL) console.log(`…${found.length - pick.length} more in the guide — declare-help ${query} --example --all`);
  }
  process.exit(0);
}

// ── the model, read once ─────────────────────────────────────────────────────
const model = JSON.parse(readFileSync(join(ROOT, "docs/declare-model.json"), "utf8"));
// no prototype: a name every object inherits (toLocaleString) is not an entry
const REF = Object.assign(Object.create(null), model.reference);
const SPINE = model.spine;
const TYPES = model.types ?? { pages: {}, order: [] };
/** The reference PAGE a named vocabulary has — every enum and every shared type
 *  is a page of its own (`type/<Name>`), so an answer here ends where a form's
 *  does: with the location that documents it. */
const typePage = (name) => TYPES.pages[name] ?? null;
const TREE = new Map(model.tree.map((n) => [n.id, n]));
const CONCEPTS = SPINE.concepts ?? { synonyms: {}, forms: [], negative: [] };
/** The theme's vocabulary as the library reads it (the *Theme tokens* page). */
const TOKENS = SPINE.themeTokens ?? { required: [], optional: [], presets: [] };

/** Is this word a name the language actually has — a class, any class's member,
 *  or one of the shared types and functions every `{ }` body may name? What the
 *  CSS-instinct table must never contradict: a hint that says "X is not a
 *  Declare name" while X is declared is the worst answer the tool can give,
 *  because it is confident and wrong. */
const REAL_NAMES = new Set([
  ...Object.keys(REF).map((id) => id.split(".").pop()),
  ...Object.keys(REF),
  ...["interfaces", "aliases", "functions", "namespaces"].flatMap((k) => (SPINE.types?.shared?.[k] ?? []).map((x) => x.name)),
]);
const isRealName = (q) => REAL_NAMES.has(q) || REAL_NAMES.has(q.toLowerCase())
  || [...REAL_NAMES].some((n) => n.toLowerCase() === q.toLowerCase());

// Every class name the reference answers for (kernel + library), and every
// attribute name any of them carries — the two unscoped candidate pools.
const CLASS_NAMES = [...new Set([...Object.keys(SPINE.schemas), ...Object.keys(SPINE.librarySchemas)])].sort();
// own keys only: a name every object inherits (toLocaleString, constructor) is no class
const ownKey = (o, k) => (o !== undefined && Object.hasOwn(o, k) ? o[k] : undefined);
const schemaOf = (cls) => ownKey(SPINE.schemas, cls) ?? ownKey(SPINE.librarySchemas, cls) ?? null;

/** The inheritance chain of a class, itself first — from the tree when it is
 *  documented there, from the schema spine's base links otherwise. */
function chainOf(cls) {
  const t = TREE.get(cls);
  if (t?.chain) return t.chain.filter((c) => c !== "Node");
  const out = [];
  for (let c = cls; c !== null && schemaOf(c) !== null; c = schemaOf(c).base) out.push(c);
  return out;
}

/** Every member name `cls` answers to (attrs + event handlers as written),
 *  walking the chain — the compiler's own candidate pool (check.ts attrNames). */
function memberNames(cls) {
  const out = new Set();
  for (const c of chainOf(cls)) {
    const s = schemaOf(c);
    if (s === null) continue;
    for (const a of Object.keys(s.attrs)) out.add(a);
    for (const e of s.events ?? []) out.add("on" + e.charAt(0).toUpperCase() + e.slice(1));
  }
  return [...out];
}

/** Resolve `cls.member` to its reference entry, walking the chain and the
 *  three id spellings (attr, method, event — `onWheel` reads as event wheel). */
function findMember(cls, member) {
  const event = member.startsWith("on") && member.length > 2
    ? member.charAt(2).toLowerCase() + member.slice(3) : null;
  for (const c of chainOf(cls)) {
    for (const id of [`${c}.${member}`, `${c}.method.${member}`, ...(event ? [`${c}.event.${event}`, `${c}.on.${event}`] : [])]) {
      if (REF[id]) return REF[id];
    }
  }
  return null;
}

// ── rendering, in the diagnostic register ────────────────────────────────────
const out = [];
const say = (s = "") => out.push(s);

function firstSentence(md) {
  const t = (md ?? "").replace(/\s+/g, " ").trim();
  const m = t.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : t).trim();
}

/** Print one reference entry — the dotted-exact answer (§3 row 1). */
function sayEntry(e) {
  // the page's side of embedding (origin "page", browser/declare-boot.d.ts) is
  // JavaScript a page calls, not a class a program writes — say which it is
  const bits = [e.origin === "page" && e.kind === "class" ? (e.signature ? "page API function" : "page API handle") : e.kind ?? "entry"];
  if (e.type) bits.push(`type ${e.type}`);
  if (e.default !== undefined && e.default !== null && e.default !== "") bits.push(`default ${String(e.default)}`);
  if (e.readOnly) bits.push("read-only");
  if (e.inheritedFrom) bits.push(`inherited from ${e.inheritedFrom}`);
  say(`${e.id} — ${bits.join(" · ")}`);
  // a method's whole signature, as the runtime declares it: the argument order
  // and types prose cannot be trusted to carry
  if ((e.kind === "method" || e.origin === "page") && e.signature) say(`  ${e.signature}`);
  // the marks that ship come before how to write one: most who ask want one of them
  if (e.id === "Icon") sayIcons();
  for (const line of (e.doc ?? "").split("\n")) say(`  ${line}`);
  // a page-API entry lists its members — boot's options, a handle's properties and verbs
  if (e.origin === "page" && e.kind === "class") {
    for (const id of [...(e.attributes ?? []), ...(e.methods ?? [])]) {
      const m = REF[id];
      if (m) say(`  ${id} — ${(m.doc ?? "").split("\n")[0]}`);
    }
  }
  if (e.source?.file) say(`  source: ${e.source.file}${e.source.line ? ":" + e.source.line : ""}`);
  if (Array.isArray(e.seeAlso) && e.seeAlso.length > 0) say(`  see also: ${e.seeAlso.join(", ")}`);
}

/** A theme preset's own `name = value` pairs, read from its source: the
 *  `theme Name [ … ]` block, split at its top-level commas, comments dropped. */
function presetValues(source, name) {
  let text;
  try { text = readFileSync(join(ROOT, source), "utf8"); } catch { return []; }
  const at = text.search(new RegExp(`^theme ${name}\\s*\\[`, "m"));
  if (at < 0) return [];
  let i = text.indexOf("[", at) + 1, depth = 0, cur = "";
  const parts = [];
  for (; i < text.length; i++) {
    const ch = text[i];
    if (ch === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (ch === "/" && text[i + 1] === "*") { i = text.indexOf("*/", i) + 1; continue; }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") { if (depth === 0) break; depth--; }
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p.includes("=")).map((p) => {
    const k = p.slice(0, p.indexOf("=")).trim(), v = p.slice(p.indexOf("=") + 1).trim().replace(/\s+/g, " ");
    return [k, v];
  });
}

/** Print a class's member table (§3 row 3): one line per member, elided past
 *  the budget with the pointer `--all` lifts. */
function sayClass(cls) {
  const s = schemaOf(cls);
  const t = TREE.get(cls);
  // A THEME PRESET is a record, not a class: one line says how it is used,
  // and its pair is the other appearance of the same design.
  if (t?.kind === "theme") {
    if (cls === "ThemeDefaults") say(`${cls} — the library's defaults for its optional theme tokens, laid under every provided theme · not a preset: no program names it`);
    else say(`${cls} — a theme preset (${t.appearance}) · \`theme = ${cls}\` on the App provides it · pair: ${t.pair}`);
    if (t.doc) say(`  ${firstSentence(t.doc)}`);
    // what it sets each token to — the values a program spreads over or reads
    const values = presetValues(t.source, cls);
    if (values.length > 0) {
      say(`  its values (${values.length}):`);
      const cap = ALL ? Infinity : 24;
      for (const [k, v] of values.slice(0, cap)) say(`    ${k} = ${v}`);
      if (values.length > cap) say(`    …and ${values.length - cap} more — declare-help ${cls} --all`);
    }
    say(`  which classes read each token: declare-help "theme tokens" · the record: ${t.source}`);
    json = { kind: "theme", name: cls, appearance: t.appearance, pair: t.pair, doc: t.doc ?? null, values: Object.fromEntries(values) };
    return true;
  }
  const lib = ownKey(SPINE.library, cls);
  const chain = chainOf(cls);
  const head = [lib ? `library class (${lib})` : "class", s?.base ? `extends ${s.base}` : null]
    .filter(Boolean).join(" · ");
  say(`${cls} — ${head}`);
  if (t?.doc) say(`  ${firstSentence(t.doc)}`);
  const rows = [];
  const own = schemaOf(cls);
  // a `_` member is the class's own machinery, not its interface: left off the
  // table (asked for by name, it still answers)
  if (own) {
    for (const [a, ty] of Object.entries(own.attrs)) if (!a.startsWith("_")) rows.push(`  ${a}: ${ty}`);
    for (const e of own.events ?? []) rows.push(`  on${e.charAt(0).toUpperCase() + e.slice(1)}() — event`);
  }
  // A method's signature inline, when the model carries one: `insert() — method`
  // told an author nothing about where the index goes (it is the second argument,
  // not part of the path), and the guide's "/rows/-" example invited folding it in.
  for (const m of t?.methods ?? []) if (!m.name.startsWith("_")) rows.push(`  ${m.signature ?? `${m.name}()`} — method`);
  const inherited = chain.slice(1);
  const cap = ALL ? Infinity : BUDGET_LINES - out.length - 3;
  say(`  members (own):`);
  for (const r of rows.slice(0, cap)) say(`  ${r}`);
  if (rows.length > cap) say(`    …and ${rows.length - cap} more — declare-help ${cls} --all`);
  // what a library base adds is how the class is used as often as its own
  // members are (a Sheet opens with Floating's `shown` and `input`): named, a
  // line per base; the platform's own View and Node are the reference's to list
  for (const base of inherited) {
    const bs = ownKey(SPINE.library, base) !== undefined ? schemaOf(base) : null;
    if (bs === null) continue;
    // in the order the class documents itself — its attributes, then its methods
    // and events — and never its `_` machinery
    const names = [...Object.keys(bs.attrs).filter((n) => !n.startsWith("_") && !(own && Object.hasOwn(own.attrs, n))),
      ...(TREE.get(base)?.methods ?? []).filter((m) => !m.name.startsWith("_")).map((m) => `${m.name}()`),
      ...(bs.events ?? []).map((e) => `on${e.charAt(0).toUpperCase() + e.slice(1)}()`)];
    if (names.length > 0) say(`  from ${base}: ${names.slice(0, ALL ? Infinity : 24).join(", ")}${names.length > 24 && !ALL ? ", …" : ""}`);
  }
  if (inherited.length > 0) say(`  inherits the rest from ${inherited.join(" → ")} — ask for any member: declare-help ${cls}.<name>`);
  // the theme tokens this class's file reads, from the library's own sources
  const stem = typeof lib === "string" ? lib.replace(/^.*\//, "").replace(/\.declare$/, "") : null;
  const reads = stem === null ? [] : [...TOKENS.required, ...TOKENS.optional].filter((tk) => tk.read.includes(stem)).map((tk) => tk.name);
  if (reads.length > 0) say(`  theme tokens it reads: ${reads.slice(0, ALL ? Infinity : 16).join(", ")}${reads.length > 16 && !ALL ? `, …and ${reads.length - 16} more (--all)` : ""} — every token: declare-help "theme tokens"`);
  const subs = t?.subclasses ?? [];
  if (subs.length > 0) say(`  extended by: ${subs.join(", ")}`);
  const chapters = (model.guide ?? [])
    .filter((g) => (g.teaches?.[cls] ?? 0) > 0)
    .sort((a, b) => b.teaches[cls] - a.teaches[cls] || a.num - b.num);
  if (chapters.length > 0) say(`  guide: ${chapters.slice(0, 3).map((g) => `docs/guide/${g.id}.md (${g.title})`).join(" · ")}`);
  if (REF[cls]?.doc) {
    if (ALL) { say(`  ─ full reference prose ─`); for (const line of REF[cls].doc.split("\n")) say(`  ${line}`); }
    else say(`  full prose: declare-help ${cls} --all`);
  }
  // …and, all of it, what each of its own members' entries says: the details a
  // class's prose leaves to them (what `refusal(body)` reads, what `purpose`
  // fills) were only in reach one name at a time, and an agent read the
  // library's source for them instead
  if (ALL) {
    const names = [...(own ? Object.keys(own.attrs) : []), ...(own?.events ?? []).map((e) => `on${e.charAt(0).toUpperCase() + e.slice(1)}`),
      ...(t?.methods ?? []).map((m) => m.name)].filter((n) => !n.startsWith("_"));
    const entries = [...new Set(names)].map((n) => {
      const ev = n.startsWith("on") && n.length > 2 ? n.charAt(2).toLowerCase() + n.slice(3) : null;
      return [`${cls}.${n}`, `${cls}.method.${n}`, ...(ev ? [`${cls}.event.${ev}`, `${cls}.on.${ev}`] : [])].map((id) => REF[id]).find((e) => e && e.doc);
    }).filter(Boolean);
    if (entries.length > 0) {
      say(`  ─ its members ─`);
      for (const e of entries) {
        say(`  ${e.id.replace(/\.(method|event|on)\./, ".")}${e.signature ? ` — ${e.signature}` : ""}`);
        for (const line of e.doc.split("\n")) say(`    ${line}`);
      }
    }
  }
}

// ── the grammar, one shape at a time (§3, top row wins) ──────────────────────
let json = null; // the --json payload for the shape that answered

function answerDotted(cls, member) {
  const schema = schemaOf(cls);
  if (schema === null) return false;
  const hit = findMember(cls, member);
  if (hit) { sayEntry(hit); json = { kind: "entry", entry: hit }; return true; }
  // the compiler's own miss, minus a position (teach.ts routing: hint first,
  // hinted near-miss second, member near-miss last)
  const hint = cssAttributeHint(member);
  if (hint !== "") { say(`${cls} has no attribute '${member}'${hint}`); json = { kind: "foreign", name: member, hint }; return true; }
  const hinted = hintedForeignName(member);
  if (hinted !== null) { say(`${cls} has no attribute '${member}'${cssAttributeHint(hinted)}`); json = { kind: "foreign", name: member, hint: cssAttributeHint(hinted) }; return true; }
  const near = nearestName(member, memberNames(cls));
  if (near !== null) {
    const target = findMember(cls, near);
    say(`${cls} has no '${member}' — did you mean '${near}'${target ? ` (${firstSentence(target.doc)})` : ""}?`);
    if (target) say(`  full entry: declare-help ${target.id}`);
    json = { kind: "near-miss", scope: cls, name: member, suggestion: near, target: target?.id ?? null };
    return true;
  }
  say(`${cls} has no member '${member}' and nothing near it — the member table: declare-help ${cls}`);
  json = { kind: "member-miss", scope: cls, name: member };
  return true;
}

/** The icons the library ships — every class that extends `Icon`, each with
 *  what it is for, so one can be found without knowing its name. */
function sayIcons() {
  const icons = TREE.get("Icon")?.subclasses ?? [];
  say(`  the icons that ship (${icons.length}) — use one as a view, e.g. CloseIcon [ iconSize = 16 ]:`);
  for (const n of icons) say(`    ${n} — ${firstSentence(REF[n]?.doc ?? TREE.get(n)?.doc ?? "")}`);
}

/** The theme's vocabulary — the reference page *Theme tokens*, from the same
 *  measurement: every token the library reads, required or with a default. */
function sayTokens() {
  const row = (tk) => `  ${tk.name}${tk.default !== undefined ? ` = ${tk.default}` : ""} — read by ${tk.read.slice(0, 5).join(", ")}${tk.read.length > 5 ? ", …" : ""}`;
  say(`Theme tokens — the names the library reads from provided("theme"). Start from a preset (${TOKENS.presets.join(", ")}, each with a …Dark companion) and spread to change one: theme = { { ...SanFrancisco, accent: #CC3333 } }`);
  say(`  required (${TOKENS.required.length}, no default — every theme states them; a preset's values: declare-help SanFrancisco):`);
  for (const tk of TOKENS.required) say(row(tk));
  const cap = ALL ? Infinity : Math.max(8, BUDGET_LINES - out.length - 3);
  say(`  optional (${TOKENS.optional.length}, each with a default a theme may change):`);
  for (const tk of TOKENS.optional.slice(0, cap)) say(row(tk));
  if (TOKENS.optional.length > cap) say(`    …and ${TOKENS.optional.length - cap} more — declare-help "theme tokens" --all`);
  say(`  which tokens one class reads: declare-help <Class> · guide: docs/guide/11-paint-and-themes.md (Themes)`);
}

function answer() {
  // a bare class answers with its member table (§3 row 3) — the reference's
  // full prose is behind --all, not in the way of the lookup
  if (schemaOf(query) !== null) { sayClass(query); json = { kind: "class", name: query }; return true; }

  // the icons that ship, asked for as a set
  if (/^(the )?icons$|^icon (catalog(ue)?|list)$/i.test(query.trim())) { say(`Icons — small drawn marks; each is a class, placed like any view (declare-help Icon: writing your own)`); sayIcons(); json = { kind: "icons" }; return true; }

  // the theme's vocabulary, by the guide's name for it
  if (/^(theme )?tokens?$/i.test(query.trim())) { sayTokens(); json = { kind: "theme-tokens" }; return true; }

  // exact reference id — dotted, the model's own spelling
  // a theme preset has a reference entry but no schema, so the class path above
  // never sees it; route it to sayClass, whose preset branch says how it is used
  if (REF[query]?.kind === "theme") return sayClass(query);
  if (REF[query]) { sayEntry(REF[query]); json = { kind: "entry", entry: REF[query] }; return true; }

  // dotted: Class.member (or a near-missed class)
  const dot = query.match(/^([A-Za-z][A-Za-z0-9]*)\.([A-Za-z][A-Za-z0-9]*)$/);
  if (dot) {
    const [, cls, member] = dot;
    if (schemaOf(cls) !== null) return answerDotted(cls, member);
    // a page-API handle's member (Tenant.post, IslandHandle.watchProvided, boot.host)
    if (REF[cls]?.origin === "page") {
      const hit = REF[`${cls}.${member}`] ?? REF[`${cls}.method.${member}`];
      if (hit) { sayEntry(hit); json = { kind: "entry", entry: hit }; return true; }
      say(`no '${member}' on ${cls} — declare-help ${cls} lists what it has`);
      json = { kind: "miss", name: query };
      return true;
    }
    const nearCls = nearestName(cls, CLASS_NAMES);
    if (nearCls !== null) { say(`no class '${cls}' — did you mean '${nearCls}'? (then: declare-help ${nearCls}.${member})`); json = { kind: "near-miss", name: cls, suggestion: nearCls }; return true; }
    return false;
  }

  // diagnostic code
  const code = query.toUpperCase().match(/^DECLARE\d{4}$/) ? query.toUpperCase() : null;
  if (code) {
    const known = (SPINE.diagnostics.codes ?? []).includes(code);
    if (!known) { say(`no diagnostic ${code} — the register runs ${SPINE.diagnostics.codes[0]}…${SPINE.diagnostics.codes.at(-1)}`); json = { kind: "diagnostic-miss", code }; return true; }
    const family = { 1: "syntax", 2: "structure", 3: "type / value", 4: "data", 5: "runtime contract", 6: "typecheck ({ } bodies)", 7: "constraint analysis" }[code.charAt(7)] ?? "";
    say(`${code} — ${family} family.`);
    say(`  The compiler's message carries the rule and the fix for the specific site;`);
    say(`  the register and its contract: docs/system-design/diagnostics.md §4.`);
    json = { kind: "diagnostic", code, family };
    return true;
  }

  // RUNTIME error code — what a PRODUCTION build throws in place of the
  // sentence (`[Declare E42] '/rows/0/n', number, string`). Production strips
  // the prose to save wire weight (tools/internal/error-codes.mjs); this gives
  // it back, from the same catalog the strip is generated from.
  const rcode = query.toUpperCase().match(/^E[0-9A-F]{6}$/) ? query.toUpperCase() : null;
  if (rcode) {
    const entry = (SPINE.runtimeErrors ?? {})[rcode];
    if (entry === undefined) {
      say(`no runtime error ${rcode} — a production build's codes come from this runtime's own messages; check the build's version`);
      json = { kind: "runtime-error-miss", code: rcode };
      return true;
    }
    say(`${rcode} — a runtime error. Its message:`);
    say(`  ${entry.message}`);
    say(`  (… stands for a value the throw interpolates; the production throw carries them after the code.)`);
    say(`  thrown at ${entry.at}`);
    json = { kind: "runtime-error", code: rcode, message: entry.message, at: entry.at };
    return true;
  }

  // A HANDLER NAME, or the event's own name. `onClick` is what an author types
  // and what the compiler refuses when it is wrong, so it must be answerable:
  // the events are in the reference (75 entries, `View.event.click`) and were
  // reachable only class-qualified, which is the one spelling nobody guesses.
  //
  // TWO PRIORITIES, because the two spellings differ in ambiguity. `onBlur` can
  // only be the event, so it answers ahead of everything. The bare word `blur`
  // is far more likely to be the CSS filter an author is hunting for, and
  // `focus`, `load` and `change` are English the concept table answers better —
  // so a bare event name answers LAST, only if nothing else claimed it.
  const answerEvent = (handlerOnly) => {
    const ev = query.startsWith("on") && query.length > 2
      ? query.charAt(2).toLowerCase() + query.slice(3) : null;
    if (handlerOnly && ev === null) return false;
    for (const name of ev !== null ? [ev] : [query]) {
      const owners = CLASS_NAMES.filter((c) => (schemaOf(c)?.events ?? []).includes(name));
      if (owners.length === 0) continue;
      const handler = "on" + name.charAt(0).toUpperCase() + name.slice(1);
      const payload = SPINE.events?.payload?.[name];
      const sig = `${handler}(${payload === undefined ? "" : "e: " + payload})`;
      const entry = owners.map((c) => REF[`${c}.event.${name}`]).find((e) => e);
      say(`${sig} — an event on: ${owners.slice(0, ALL ? Infinity : 8).join(", ")}${owners.length > 8 && !ALL ? `, …and ${owners.length - 8} more (--all)` : ""}`);
      if (entry) for (const line of (ALL ? entry.doc : firstSentence(entry.doc)).split("\n")) say("  " + line);
      say(`  a handler is a method answering it: ${sig} { … }`);
      say(`  scoped entry: declare-help ${owners[0]}.${handler}`);
      json = { kind: "event", name, handler, payload: payload ?? null, owners };
      return true;
    }
    return false;
  };
  if (answerEvent(true)) return true;

  // foreign name — the hint table verbatim, then its near-misses.
  //
  // ONLY when the word is not also a real name. Six hint keys had become real
  // (`scaleX`, `perspective`, `blur` arrived with the graphics pass; `gap`,
  // `padding`, `position` are attributes on particular classes), and because
  // this table was consulted first and returned, the tool answered "'scaleX' is
  // not a Declare name — per-axis scale is 'scaleX'": a denial and the answer in
  // one sentence. A real name now answers as itself, and the instinct rides
  // ALONG as orientation rather than replacing it — the CSS reader still learns
  // that there is no general padding, and the Declare reader still gets
  // `TextInput.padding`. The gate in surfaces.mjs keeps the two halves honest.
  if (Object.hasOwn(CSS_ATTRIBUTE_HINTS, query) && !isRealName(query)) {
    say(`'${query}' is not a Declare name${cssAttributeHint(query)}`);
    json = { kind: "foreign", name: query, hint: cssAttributeHint(query) };
    return true;
  }
  // a member a newcomer reads or calls on a node (teach.ts MEMBER_HINTS) — the
  // same answer the compiler gives when a body writes it
  // (`root` is also TooltipEvent's: a name some record really carries is not denied)
  const onARecord = (SPINE.types?.shared?.interfaces ?? []).some((i) => i.members.some((m) => new RegExp(`^(readonly\\s+)?${query}\\??\\s*[:(]`).test(m)));
  if (memberHint(query) !== "" && !isRealName(query) && !onARecord) {
    say(`'${query}' is not a Declare name — ${memberHint(query)}`);
    json = { kind: "foreign", name: query, hint: memberHint(query) };
    return true;
  }

  // enum — by enum name or by an attribute that carries one
  const enumByName = Object.keys(SPINE.enums).find((k) => k.toLowerCase() === query.toLowerCase());
  if (enumByName) {
    say(`${enumByName} — tokens: ${SPINE.enums[enumByName].join(" · ")}`);
    const carrier = CLASS_NAMES.flatMap((c) => Object.entries(schemaOf(c).attrs)
      .filter(([, ty]) => typeof ty === "string" && ty.startsWith("enum(") &&
        ty.slice(5, -1).split("|").join() === SPINE.enums[enumByName].join())
      .map(([a]) => `${c}.${a}`))[0];
    if (carrier) say(`  carried by ${carrier} — full entry: declare-help ${carrier}`);
    // the vocabulary's own prose and its page — the same answer the reference
    // shows, from the same place (tools/internal/doc/prose/enums.md → model.types)
    const page = typePage(enumByName);
    if (page?.doc) for (const line of page.doc.split("\n\n")) say(line.replace(/\n/g, " "));
    if (page) say(`  ${page.nUsed} use${page.nUsed === 1 ? "" : "s"} in the reference · docs: type/${enumByName}`);
    json = { kind: "enum", name: enumByName, tokens: SPINE.enums[enumByName], docs: page ? `type/${enumByName}` : null };
    return true;
  }
  const tokensQ = query.match(/^([A-Za-z]+)\s+tokens$/);
  if (tokensQ) {
    const attr = tokensQ[1];
    for (const cls of CLASS_NAMES) {
      const s = schemaOf(cls);
      const ty = s?.attrs?.[attr];
      const m = typeof ty === "string" ? ty.match(/^enum\((.+)\)$/) : null;
      if (m) { say(`${cls}.${attr} — tokens: ${m[1].split("|").join(" · ")}`); json = { kind: "enum", attr: `${cls}.${attr}`, tokens: m[1].split("|") }; return true; }
    }
  }

  // the shared { } vocabulary — interfaces, aliases, functions, namespaces the
  // checker declares into every program (DrawContext, Length, stroke(), Themes…).
  // Consulted after the attribute-owners answer below, so `stroke` (an
  // attribute AND a constructor) keeps its attribute reading first — with the
  // constructor cross-referenced — while `DrawContext` answers as the tier it is.
  const sharedHit = (kind, list, render) => {
    const hit = (SPINE.types.shared[list] ?? []).find((x) => x.name.toLowerCase() === query.toLowerCase());
    if (!hit) return false;
    render(hit);
    // …and what it IS. The signature alone was the whole answer for every shared
    // name — a name, a type, and a blank body, which reads as an answer and
    // teaches nothing. The sentence is the declaration's own doc comment in the
    // scaffold PRELUDE, carried here by the projection and required by the
    // completeness gate, so a new shared name cannot ship without one.
    if (hit.doc) say(hit.doc);
    // …and where the reference documents it. A shared type is a page like an
    // enum is (`type/Color`), with its definition and everywhere it is used.
    const page = typePage(hit.name);
    if (page) say(`  ${page.nUsed} use${page.nUsed === 1 ? "" : "s"} in the reference · docs: type/${hit.name}`);
    json = { kind, entry: hit, ...(page ? { docs: `type/${hit.name}` } : {}) };
    return true;
  };
  /** A bare name that is a MEMBER of one of the shared interfaces. Reports every
   *  interface carrying it (the drawing surface, a gradient), with its signature
   *  as the interface declares it. */
  const answerSharedMember = () => {
    const hits = [];
    for (const i of SPINE.types.shared.interfaces ?? []) {
      for (const mline of i.members ?? []) {
        const n = (mline.match(/^([A-Za-z_$][\w$]*)\s*[<(:]/) ?? [])[1];
        if (n !== undefined && n.toLowerCase() === query.toLowerCase()) hits.push({ cls: i.name, mline, doc: i.doc ?? null });
      }
    }
    if (hits.length === 0) return false;
    for (const h of hits) {
      say(`${h.mline.trim()} — a member of ${h.cls}, a shared interface every { } body may name`);
      if (h.cls === "DrawContext") say(`  the drawing surface: a \`draw(d: DrawContext)\` member receives it — declare-help View.method.draw`);
    }
    json = { kind: "shared-member", name: query, on: hits.map((h) => h.cls) };
    return true;
  };

  const answerHostGlobal = () => {
    const hostHint = hostGlobalHint(query);
    say(`'${query}' is the host's, not Declare's — a program runs on three renderers and names none of their globals. ${hostHint.charAt(0).toUpperCase()}${hostHint.slice(1)}`);
    say(`  what code may name, and where (bodies, handlers, script): declare-help globals`);
    json = { kind: "host-global", name: query, hint: hostHint };
    return true;
  };

  const answerShared = () =>
    sharedHit("shared-interface", "interfaces", (i) => {
      say(`${i.name} — a shared interface: every { } body may name it${i.name === "DrawContext" ? " (the argument of a draw(d: DrawContext) member — declare one on any view for custom drawing)" : ""}${i.extends ? ` · extends ${i.extends}` : ""}`);
      const cap = ALL ? Infinity : BUDGET_LINES - 4;
      for (const mline of i.members.slice(0, cap)) say(`  ${mline}`);
      if (i.members.length > cap) say(`  …and ${i.members.length - cap} more — declare-help ${i.name} --all`);
      // …and what it carries from what it extends: a wheel event's deltaX is a
      // pointer event's, and an interface that listed only its own looked bare
      const all = SPINE.types.shared.interfaces ?? [];
      for (let b = all.find((x) => x.name === i.extends), seen = new Set(); b && !seen.has(b.name); seen.add(b.name), b = all.find((x) => x.name === b.extends)) {
        say(`  from ${b.name}:`);
        for (const mline of b.members.slice(0, cap)) say(`    ${mline}`);
        if (b.members.length > cap) say(`    …and ${b.members.length - cap} more — declare-help ${b.name} --all`);
      }
    }) ||
    sharedHit("shared-alias", "aliases", (a) => say(`${a.name} — a shared type alias: ${a.type}`)) ||
    sharedHit("shared-function", "functions", (f) => {
      say(`${f.name} — a shared function, callable in ${HANDLER_ONLY.has(f.name) ? "a handler or a method (a { } value never waits)" : "any { } body"}: ${f.signature}`);
      // a view's event by the same name (blur the filter, blur the focus leaving)
      if ((schemaOf("View")?.events ?? []).includes(f.name)) say(`  also an event of every view, on${f.name[0].toUpperCase()}${f.name.slice(1)}(): declare-help View.event.${f.name}`);
    }) ||
    sharedHit("shared-namespace", "namespaces", (n) => {
      say(`${n.name} — a shared namespace:`);
      for (const mline of n.members.slice(0, ALL ? Infinity : BUDGET_LINES - 3)) say(`  ${n.name}.${mline}`);
    });

  // bare attribute — ranked owners, no single guess (§3 row 4)
  const owners = [];
  for (const cls of CLASS_NAMES) {
    const s = schemaOf(cls);
    if (s && Object.hasOwn(s.attrs, query)) owners.push(`${cls} (${s.attrs[query]})`);
  }
  if (owners.length > 0) {
    const asForm = (CONCEPTS.forms ?? []).find((f) => f.terms.some((t) => t.toLowerCase() === query.toLowerCase().trim()));
    if (asForm) { for (const line of asForm.answer.split("\n")) say(line); say(""); }
    // ONE owner: the answer is that entry, not a pointer to it — `waypoint`
    // answered "an attribute on: App" and an agent went without its prose
    const sole = owners.length === 1 ? findMember(owners[0].split(" ")[0], query) : null;
    if (sole && !asForm) { sayEntry(sole); json = { kind: "entry", entry: sole }; return true; }
    say(`${query} — ${asForm ? "also " : ""}an attribute on: ${owners.slice(0, ALL ? Infinity : 8).join(", ")}${owners.length > 8 && !ALL ? `, …and ${owners.length - 8} more (--all)` : ""}`);
    say(`  scoped entry: declare-help <Class>.${query}`);
    // a word that is ALSO a curated concept gets both readings — `arrangement`
    // is a Dialog attribute by coincidence and the layout concept by intent
    const asConcept = CONCEPTS.synonyms[query.toLowerCase()];
    if (asConcept && !owners.some((o) => `${o.split(" ")[0]}.${query}` === asConcept)) {
      say(`  the concept by this name: declare-help ${asConcept}`);
    }
    // …and one that is ALSO a shared constructor names both — `stroke` the
    // attribute is set WITH stroke() the function
    const fn = (SPINE.types.shared.functions ?? []).find((f) => f.name === query);
    if (fn) say(`  the shared function by this name: ${fn.signature}`);
    json = { kind: "attribute-owners", name: query, owners };
    return true;
  }
  // a host global the prelude declares for script blocks (fetch, the timers)
  // is refused in a body — answer as the compiler does, before the prelude hit;
  // a name that is itself a curated absence answers as that absence (below)
  const curatedAbsence = CONCEPTS.negative.some((n) => n.terms.includes(query));
  if (!curatedAbsence && hostGlobalHint(query) !== null) return answerHostGlobal();
  if (answerShared()) return true;


  // a case-only miss on a class name answers AS the class — `button`, `image`,
  // `checkbox` are the HTML spellings of things the library ships, and the
  // member table beats a did-you-mean. After attributes (so `text` stays the
  // attribute it also is), before concepts and near-misses.
  const ciClass = CLASS_NAMES.find((c) => c.toLowerCase() === query.toLowerCase());
  if (ciClass) { sayClass(ciClass); json = { kind: "class", name: ciClass }; return true; }

  // the bare event word, last: after attributes, shared types and class names,
  // so `focus` stays the focus SERVICE and `text` stays the attribute, while
  // `click` — a word nothing else owns — reaches its event.
  if (answerEvent(false)) return true;

  // concept — the curated synonym table, then negative knowledge, then retrieval
  const norm = query.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const syn = CONCEPTS.synonyms[norm] ?? CONCEPTS.synonyms[query];
  if (syn && REF[syn]) {
    // Say that the answer is a SYNONYM's, so `declare-help Popover` printing
    // Menu reads as an answer rather than a wrong lookup.
    if (syn.toLowerCase() !== norm) say(`'${query}' is not a Declare name — the Declare concept is ${syn}:`);
    sayEntry(REF[syn]); json = { kind: "entry", concept: norm, entry: REF[syn] }; return true;
  }
  // terms are normalized the same way as the query — a stored "viewport-fit"
  // must match the query "viewport-fit" after both lose their hyphen
  const normTerm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  // FORMS — the language's own vocabulary: the top-level declarations, the
  // class-level keywords, the binding operators, the scope nouns. None of them
  // is a class, so the Class.attr model has no room for them and a lookup
  // fell through to substring noise ("use" matched 127 entries). These are
  // POSITIVE facts, so they answer before negative knowledge.
  for (const form of (CONCEPTS.forms ?? [])) {
    // EXACT match on the raw query first: an operator normalizes to the empty
    // string (punctuation is stripped), and an empty needle makes includes()
    // true for everything — so `<-` would answer every query. Substring is
    // only allowed for terms that survive normalization.
    // EXACT only. Substring matching is wrong here in both directions: an
    // operator normalizes to the empty string (so `<-` would answer every
    // query), and a longer name CONTAINS a shorter form (`classroot` would be
    // answered by `class`). Every phrasing worth catching is an explicit term.
    if (form.terms.some((t) => t.toLowerCase() === query.toLowerCase().trim()
        || (normTerm(t).length > 0 && normTerm(t) === norm))) {
      for (const line of form.answer.split("\n")) say(line);
      json = { kind: "form", terms: form.terms, answer: form.answer };
      return true;
    }
  }
  // A negative term matches on WORD boundaries, never by substring: `key` (the
  // React key prop) must not answer `onKeyDown`, nor `grid` answer `DataGrid` —
  // a substring match sent real names to "there is no such thing" (the 2026-09
  // reference audit).
  const hasPhrase = (hay, needle) => needle.length > 0 && (" " + hay + " ").includes(" " + needle + " ");
  for (const neg of CONCEPTS.negative) {
    if (neg.terms.some((t) => norm === normTerm(t) || hasPhrase(norm, normTerm(t)))) {
      for (const line of neg.answer.split("\n")) say(line);
      json = { kind: "negative", terms: neg.terms, answer: neg.answer };
      return true;
    }
  }

  // A MEMBER of a shared interface, by its bare name — `fillText`, `beginPath`,
  // `addColorStop`. The drawing surface is reached through a PARAMETER
  // (`draw(d: DrawContext)`), so its members carry no dotted id in the reference and no
  // spelling answered them: `fillText` fell through to the generic miss while
  // `measureText` beside it answered cleanly.
  //
  // Placed HERE, after the curated knowledge, and that position is the whole
  // subtlety: `key` is a NEGATIVE entry — the language infers identity and has no
  // `key` attribute — and it is also `KeyEvent.key`. Answering the member first
  // replaced a ruling with a coincidence.
  if (answerSharedMember()) return true;
  // multiword: any word that is a synonym answers (the "cover crop" case)
  const words = norm.split(" ");
  for (let span = Math.min(3, words.length); span >= 1; span--) {
    for (let i = 0; i + span <= words.length; i++) {
      const phrase = words.slice(i, i + span).join(" ");
      const hit = CONCEPTS.synonyms[phrase];
      if (hit && REF[hit]) {
        // Say that the answer is a SYNONYM's, so `declare-help Popover` printing
        // Menu reads as an answer rather than a wrong lookup.
        if (phrase !== norm || hit.toLowerCase() !== norm) say(`'${query}' is not a Declare name — the Declare concept is ${hit}:`);
        sayEntry(REF[hit]); json = { kind: "entry", concept: phrase, entry: REF[hit] }; return true;
      }
    }
  }
  // a named color — bare-slot vocabulary, with the number a { } body writes instead
  const colorHex = (SPINE.colors ?? {})[query.toLowerCase().trim()];
  if (colorHex) {
    say(`${query.toLowerCase().trim()} — a named color, ${colorHex}. The name works in a BARE slot (fill = ${query.toLowerCase().trim()}); inside a { } body write the number: 0x${colorHex.slice(1)}. Vocabulary → Named colors lists the set.`);
    json = { kind: "color", name: query.toLowerCase().trim(), hex: colorHex };
    return true;
  }
  // a host global (document, localStorage, process …) — the compiler's own
  // answer, verbatim, so the tool and the diagnostic cannot disagree
  if (hostGlobalHint(query) !== null) return answerHostGlobal();
  // foreign near-miss for the whole query (colour → color's hint)
  const hinted = hintedForeignName(query);
  if (hinted !== null) { say(`'${query}' is not a Declare name${cssAttributeHint(hinted)}`); json = { kind: "foreign", name: query, hint: cssAttributeHint(hinted) }; return true; }
  // unscoped near-miss, stricter than the compiler's (§4): one edit only
  const nearAttr = nearestName(query, [...new Set(CLASS_NAMES.flatMap((c) => Object.keys(schemaOf(c).attrs)))], 1);
  if (nearAttr !== null) { say(`no '${query}' — did you mean '${nearAttr}'? (owners: declare-help ${nearAttr})`); json = { kind: "near-miss", name: query, suggestion: nearAttr }; return true; }
  const nearCls = nearestName(query, CLASS_NAMES, 1);
  if (nearCls !== null) { say(`no '${query}' — did you mean '${nearCls}'?`); json = { kind: "near-miss", name: query, suggestion: nearCls }; return true; }

  // last: deterministic retrieval over reference prose (all query words present).
  // Internal entries are excluded: surfacing a class's private plumbing as
  // the answer to a capability question actively misleads — a real agent asked
  // "drag and drop" and was answered with DataGrid's internal drop-commit
  // methods instead of the viewAt idiom (2026-08-07).
  const hits = [];
  for (const [id, e] of Object.entries(REF)) {
    if (e.internal === true) continue;
    const hay = ((e.doc ?? "") + " " + id).toLowerCase();
    if (words.every((w) => hay.includes(w))) hits.push(id);
  }
  if (hits.length > 0 && hits.length <= 200) {
    say(`'${query}' appears in ${hits.length} reference entr${hits.length === 1 ? "y" : "ies"}:`);
    for (const id of hits.slice(0, ALL ? Infinity : 6)) say(`  ${id} — ${firstSentence(REF[id].doc)}`);
    if (hits.length > 6 && !ALL) say(`  …and ${hits.length - 6} more (--all)`);
    json = { kind: "retrieval", query, hits };
    return true;
  }
  return false;
}

const answered = answer();

// A word that is BOTH a real name and a CSS instinct gets the real answer above
// and the orientation here — the reader arriving from CSS still learns that there
// is no general padding, and is not told the name does not exist.
if (answered && json?.kind !== "foreign" && Object.hasOwn(CSS_ATTRIBUTE_HINTS, query)) {
  say(cssAttributeHint(query).replace(/^\s*—\s*/, ""));
}

if (!answered) {
  const searched = `reference (${Object.keys(REF).length} entries), classes (${CLASS_NAMES.length}), enums, diagnostics, the hint tables, and the concept table`;
  if (JSON_OUT) console.log(JSON.stringify({ kind: "miss", query, searched }));
  else {
    console.log(`no entry for '${query}' — searched ${searched}.`);
    console.log(`If it is a concept the docs discuss in prose, the guide index is docs/guide/;`);
    console.log(`if it should exist and does not, that absence is worth reporting.`);
  }
  process.exit(1);
}

if (JSON_OUT) console.log(JSON.stringify(json));
else {
  const capped = out.length > BUDGET_LINES && !ALL
    ? [...out.slice(0, BUDGET_LINES - 1), `  …answer elided at ${BUDGET_LINES} lines — declare-help ${query.split(" ")[0]} --all`]
    : out;
  console.log(capped.join("\n"));
}
process.exit(0);
