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
import { CSS_ATTRIBUTE_HINTS, cssAttributeHint, hintedForeignName, hostGlobalHint, nearestName } from "../runtime/dist/teach.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── the answer budget (§3: elision by pointer, never truncation by accident) ──
const BUDGET_LINES = 40;
/** Shared functions a { } VALUE may not call — they act later, and a value computes. */
const HANDLER_ONLY = new Set(["afterDelay"]);

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
const TYPES = model.types ?? { pages: {}, order: [] };
/** The reference PAGE a named vocabulary has — every enum and every shared type
 *  is a page of its own (`type/<Name>`), so an answer here ends where a form's
 *  does: with the location that documents it. */
const typePage = (name) => TYPES.pages[name] ?? null;
const TREE = new Map(model.tree.map((n) => [n.id, n]));
const CONCEPTS = SPINE.concepts ?? { synonyms: {}, forms: [], negative: [] };

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
  // A THEME PRESET is a record, not a component: one line says how it is used,
  // and its pair is the other appearance of the same design.
  if (t?.kind === "theme") {
    say(`${cls} — a theme preset (${t.appearance}) · \`theme = ${cls}\` on the App provides it · pair: ${t.pair}`);
    if (t.doc) say(`  ${firstSentence(t.doc)}`);
    say(`  the record: ${t.source}`);
    json = { kind: "theme", name: cls, appearance: t.appearance, pair: t.pair, doc: t.doc ?? null };
    return true;
  }
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
  // A method's signature inline, when the model carries one: `insert() — method`
  // told an author nothing about where the index goes (it is the second argument,
  // not part of the path), and the guide's "/rows/-" example invited folding it in.
  for (const m of t?.methods ?? []) rows.push(`  ${m.signature ?? `${m.name}()`} — method`);
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
  // a theme preset has a reference entry but no schema, so the class path above
  // never sees it; route it to sayClass, whose preset branch says how it is used
  if (REF[query]?.kind === "theme") return sayClass(query);
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
  // `padding`, `position` are attributes on particular components), and because
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
  // checker declares into every program (Draw, Length, stroke(), Themes…).
  // Consulted after the attribute-owners answer below, so `stroke` (an
  // attribute AND a constructor) keeps its attribute reading first — with the
  // constructor cross-referenced — while `Draw` answers as the tier it is.
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
      if (h.cls === "Draw") say(`  the drawing surface: a \`draw(d: Draw)\` member receives it — declare-help View.method.draw`);
    }
    json = { kind: "shared-member", name: query, on: hits.map((h) => h.cls) };
    return true;
  };

  const answerHostGlobal = () => {
    const hostHint = hostGlobalHint(query);
    say(`'${query}' is the host's, not Declare's — a program runs on three renderers and names none of their globals. ${hostHint.charAt(0).toUpperCase()}${hostHint.slice(1)}`);
    json = { kind: "host-global", name: query, hint: hostHint };
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
    sharedHit("shared-function", "functions", (f) => say(`${f.name} — a shared function, callable in ${HANDLER_ONLY.has(f.name) ? "a handler or a method (a { } value never waits)" : "any { } body"}: ${f.signature}`)) ||
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
  // is refused in a body — answer as the compiler does, before the prelude hit
  if (hostGlobalHint(query) !== null) return answerHostGlobal();
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
  // is a component, so the Class.attr model has no room for them and a lookup
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
  // (`draw(d: Draw)`), so its members carry no dotted id in the reference and no
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
  // Internal entries are excluded: surfacing a component's private plumbing as
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
