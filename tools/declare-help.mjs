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

import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CSS_ATTRIBUTE_HINTS, cssAttributeHint, hintedForeignName, nearestName } from "../runtime/dist/teach.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── the answer budget (§3: elision by pointer, never truncation by accident) ──
const BUDGET_LINES = 40;

// ── arguments ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const ALL = args.includes("--all");
const query = args.filter((a) => !a.startsWith("--")).join(" ").trim();

if (query === "" || args.includes("--help")) {
  console.log(`declare-help — ask the platform a question; it answers in the compiler's register.

  usage: node tools/declare-help.mjs <name-or-question> [--all] [--json]

  what you can ask                          what you get
    Slider.value                            the reference entry: type, default, prose
    Text.lineheight                         the near-miss: did you mean 'lineHeight'?
    Segmented                               the class: member table, file, inheritance
    lineHeight                              every class carrying the attribute
    borderWidth                             a foreign name's hint — the Declare door
    rotation · bold inside a label          the entry that answers the concept
    scrolls · fontWeight tokens             the enum's tokens, and who carries them
    DECLARE7001                             the diagnostic's family and register

  flags
    --all      lift the elision on a long answer (full member list, full prose)
    --json     the same answer as one line of JSON
    --help     this text

  exit codes — the contract worth trusting
    0  an answer — including "that deliberately does not exist, use X instead"
    1  a true miss: nothing anywhere answers; the output names what was searched

  More: docs/operational/help.md. The store is docs/declare-model.json.`);
  process.exit(0);
}

// ── the model, read once ─────────────────────────────────────────────────────
const model = JSON.parse(readFileSync(join(ROOT, "docs/declare-model.json"), "utf8"));
const REF = model.reference;
const SPINE = model.spine;
const TREE = new Map(model.tree.map((n) => [n.id, n]));
const CONCEPTS = SPINE.concepts ?? { synonyms: {}, negative: [] };

// Every class name the reference answers for (kernel + library), and every
// attribute name any of them carries — the two unscoped candidate pools.
const CLASS_NAMES = [...new Set([...Object.keys(SPINE.schemas), ...Object.keys(SPINE.librarySchemas)])].sort();
const schemaOf = (cls) => SPINE.schemas[cls] ?? SPINE.librarySchemas[cls] ?? null;

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
  const bits = [e.kind ?? "entry"];
  if (e.type) bits.push(`type ${e.type}`);
  if (e.default !== undefined && e.default !== null && e.default !== "") bits.push(`default ${String(e.default)}`);
  if (e.readOnly) bits.push("read-only");
  if (e.prevailing) bits.push("prevailing");
  if (e.inheritedFrom) bits.push(`inherited from ${e.inheritedFrom}`);
  say(`${e.id} — ${bits.join(" · ")}`);
  for (const line of (e.doc ?? "").split("\n")) say(`  ${line}`);
  if (e.source?.file) say(`  source: ${e.source.file}${e.source.line ? ":" + e.source.line : ""}`);
  if (Array.isArray(e.seeAlso) && e.seeAlso.length > 0) say(`  see also: ${e.seeAlso.join(", ")}`);
}

/** Print a class's member table (§3 row 3): one line per member, elided past
 *  the budget with the pointer `--all` lifts. */
function sayClass(cls) {
  const s = schemaOf(cls);
  const t = TREE.get(cls);
  const lib = SPINE.library[cls];
  const chain = chainOf(cls);
  const head = [lib ? `library component (${lib})` : "component", s?.base ? `extends ${s.base}` : null]
    .filter(Boolean).join(" · ");
  say(`${cls} — ${head}`);
  if (t?.doc) say(`  ${firstSentence(t.doc)}`);
  const rows = [];
  const own = schemaOf(cls);
  if (own) {
    for (const [a, ty] of Object.entries(own.attrs)) rows.push(`  ${a}: ${ty}`);
    for (const e of own.events ?? []) rows.push(`  on${e.charAt(0).toUpperCase() + e.slice(1)}() — event`);
  }
  for (const m of t?.methods ?? []) rows.push(`  ${m.name}() — method`);
  const inherited = chain.slice(1);
  const cap = ALL ? Infinity : BUDGET_LINES - out.length - 3;
  say(`  members (own):`);
  for (const r of rows.slice(0, cap)) say(`  ${r}`);
  if (rows.length > cap) say(`    …and ${rows.length - cap} more — declare-help ${cls} --all`);
  if (inherited.length > 0) say(`  inherits the rest from ${inherited.join(" → ")} — ask for any member: declare-help ${cls}.<name>`);
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

function answer() {
  // a bare class answers with its member table (§3 row 3) — the reference's
  // full prose is behind --all, not in the way of the lookup
  if (schemaOf(query) !== null) { sayClass(query); json = { kind: "class", name: query }; return true; }

  // exact reference id — dotted, the model's own spelling
  if (REF[query]) { sayEntry(REF[query]); json = { kind: "entry", entry: REF[query] }; return true; }

  // dotted: Class.member (or a near-missed class)
  const dot = query.match(/^([A-Za-z][A-Za-z0-9]*)\.([A-Za-z][A-Za-z0-9]*)$/);
  if (dot) {
    const [, cls, member] = dot;
    if (schemaOf(cls) !== null) return answerDotted(cls, member);
    const nearCls = nearestName(cls, CLASS_NAMES);
    if (nearCls !== null) { say(`no component '${cls}' — did you mean '${nearCls}'? (then: declare-help ${nearCls}.${member})`); json = { kind: "near-miss", name: cls, suggestion: nearCls }; return true; }
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

  // foreign name — the hint table verbatim, then its near-misses
  if (Object.hasOwn(CSS_ATTRIBUTE_HINTS, query)) { say(`'${query}' is not a Declare name${cssAttributeHint(query)}`); json = { kind: "foreign", name: query, hint: cssAttributeHint(query) }; return true; }

  // enum — by enum name or by an attribute that carries one
  const enumByName = Object.keys(SPINE.enums).find((k) => k.toLowerCase() === query.toLowerCase());
  if (enumByName) {
    say(`${enumByName} — tokens: ${SPINE.enums[enumByName].join(" · ")}`);
    const carrier = CLASS_NAMES.flatMap((c) => Object.entries(schemaOf(c).attrs)
      .filter(([, ty]) => typeof ty === "string" && ty.startsWith("enum(") &&
        ty.slice(5, -1).split("|").join() === SPINE.enums[enumByName].join())
      .map(([a]) => `${c}.${a}`))[0];
    if (carrier) say(`  carried by ${carrier} — full entry: declare-help ${carrier}`);
    json = { kind: "enum", name: enumByName, tokens: SPINE.enums[enumByName] };
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
  // checker declares into every program (Draw, Length, stroke(), Themes…).
  // Consulted after the attribute-owners answer below, so `stroke` (an
  // attribute AND a constructor) keeps its attribute reading first — with the
  // constructor cross-referenced — while `Draw` answers as the tier it is.
  const sharedHit = (kind, list, render) => {
    const hit = (SPINE.types.shared[list] ?? []).find((x) => x.name.toLowerCase() === query.toLowerCase());
    if (!hit) return false;
    render(hit);
    json = { kind, entry: hit };
    return true;
  };
  const answerShared = () =>
    sharedHit("shared-interface", "interfaces", (i) => {
      say(`${i.name} — a shared interface: every { } body may name it${i.name === "Draw" ? " (the argument of a draw(d: Draw) member — declare one on any view for custom drawing)" : ""}${i.extends ? ` · extends ${i.extends}` : ""}`);
      const cap = ALL ? Infinity : BUDGET_LINES - 4;
      for (const mline of i.members.slice(0, cap)) say(`  ${mline}`);
      if (i.members.length > cap) say(`  …and ${i.members.length - cap} more — declare-help ${i.name} --all`);
    }) ||
    sharedHit("shared-alias", "aliases", (a) => say(`${a.name} — a shared type alias: ${a.type}`)) ||
    sharedHit("shared-function", "functions", (f) => say(`${f.name} — a shared function, callable in any { } body: ${f.signature}`)) ||
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
    say(`${query} — an attribute on: ${owners.slice(0, ALL ? Infinity : 8).join(", ")}${owners.length > 8 && !ALL ? `, …and ${owners.length - 8} more (--all)` : ""}`);
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
  if (answerShared()) return true;

  // a case-only miss on a class name answers AS the class — `button`, `image`,
  // `checkbox` are the HTML spellings of things the library ships, and the
  // member table beats a did-you-mean. After attributes (so `text` stays the
  // attribute it also is), before concepts and near-misses.
  const ciClass = CLASS_NAMES.find((c) => c.toLowerCase() === query.toLowerCase());
  if (ciClass) { sayClass(ciClass); json = { kind: "class", name: ciClass }; return true; }

  // concept — the curated synonym table, then negative knowledge, then retrieval
  const norm = query.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const syn = CONCEPTS.synonyms[norm] ?? CONCEPTS.synonyms[query];
  if (syn && REF[syn]) { sayEntry(REF[syn]); json = { kind: "entry", concept: norm, entry: REF[syn] }; return true; }
  for (const neg of CONCEPTS.negative) {
    if (neg.terms.some((t) => norm === t.toLowerCase() || norm.includes(t.toLowerCase()))) {
      for (const line of neg.answer.split("\n")) say(line);
      json = { kind: "negative", terms: neg.terms, answer: neg.answer };
      return true;
    }
  }
  // multiword: any word that is a synonym answers (the "cover crop" case)
  const words = norm.split(" ");
  for (let span = Math.min(3, words.length); span >= 1; span--) {
    for (let i = 0; i + span <= words.length; i++) {
      const phrase = words.slice(i, i + span).join(" ");
      const hit = CONCEPTS.synonyms[phrase];
      if (hit && REF[hit]) { sayEntry(REF[hit]); json = { kind: "entry", concept: phrase, entry: REF[hit] }; return true; }
    }
  }
  // foreign near-miss for the whole query (colour → color's hint)
  const hinted = hintedForeignName(query);
  if (hinted !== null) { say(`'${query}' is not a Declare name${cssAttributeHint(hinted)}`); json = { kind: "foreign", name: query, hint: cssAttributeHint(hinted) }; return true; }
  // unscoped near-miss, stricter than the compiler's (§4): one edit only
  const nearAttr = nearestName(query, [...new Set(CLASS_NAMES.flatMap((c) => Object.keys(schemaOf(c).attrs)))], 1);
  if (nearAttr !== null) { say(`no '${query}' — did you mean '${nearAttr}'? (owners: declare-help ${nearAttr})`); json = { kind: "near-miss", name: query, suggestion: nearAttr }; return true; }
  const nearCls = nearestName(query, CLASS_NAMES, 1);
  if (nearCls !== null) { say(`no '${query}' — did you mean '${nearCls}'?`); json = { kind: "near-miss", name: query, suggestion: nearCls }; return true; }

  // last: deterministic retrieval over reference prose (all query words present)
  const hits = [];
  for (const [id, e] of Object.entries(REF)) {
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
