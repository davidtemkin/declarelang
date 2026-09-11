// audit.mjs — the reference MISS CHECK, over the committed model: what the docs
// gates enforce, read back from docs/declare-model.json as one report, so a
// hole is a line here and not a page someone happens to open. Run from the
// repo root: node tools/internal/doc/audit.mjs   (exit 1 when anything is missing)
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const m = JSON.parse(readFileSync(path.join(ROOT, "docs/declare-model.json"), "utf8"));
const problems = [];
const say = (s) => problems.push(s);

const classes = m.tree.filter((c) => c.attributes);
const byName = new Map(classes.map((c) => [c.id, c]));
const hasUsage = (c) => (c.example && c.example.length) || (c.docSegs || []).some((s) => (s.code || []).length);

// ── class pages ──
for (const c of classes) {
  if (!c.doc) say(`class ${c.id}: no class prose`);
  if (!c.abstract && !hasUsage(c)) say(`class ${c.id}: no usage example (apps/docs/demos/${c.id}.declare, or a compiling fence in its prose)`);
  for (const a of c.attributes) {
    if (a.overrides && !a.doc && /^\{/.test("" + a.default)) say(`${c.id}.${a.name}: an expression override with no intent (## ${a.name} in the class's prose)`);
    if (!a.overrides && !a.doc) say(`${c.id}.${a.name}: no prose`);
  }
  for (const x of c.methods) if (!x.doc) say(`${c.id}.${x.name}(): no prose`);
  for (const e of c.events) if (!e.doc) say(`${c.id}.on${e.name[0].toUpperCase()}${e.name.slice(1)}: no prose`);
  for (const s of c.siblings ?? []) if (!byName.has(s)) say(`${c.id}: sibling '${s}' is not a documented class`);
  for (const s of c.subclasses ?? []) if (!byName.has(s)) say(`${c.id}: subclass '${s}' is not a documented class`);
  for (const a of c.chain.slice(1)) if (!byName.has(a)) say(`${c.id}: ancestor '${a}' is not a documented class`);
}

// ── the language forms ──
const forms = m.forms ?? { groups: [], pages: {}, order: [] };
if (!forms.order.length) say("forms: the model carries no language forms");
const guideIds = new Set((m.guide ?? []).map((g) => g.id));
for (const slug of forms.order) {
  const f = forms.pages[slug];
  if (!f.example.length) say(`form ${slug}: no usage demo`);
  if (!f.rules.length) say(`form ${slug}: no rules`);
  for (const r of f.rules) if (!r.probe) say(`form ${slug}: rule "${r.rule.slice(0, 40)}…" has no probe`);
  for (const rf of f.related.forms) if (!forms.pages[rf]) say(`form ${slug}: related form '${rf}' has no page`);
  for (const rc of f.related.classes) if (!byName.has(rc)) say(`form ${slug}: related class '${rc}' is not documented`);
  for (const g of f.related.guide) if (!guideIds.has(g.chapter)) say(`form ${slug}: related chapter '${g.chapter}' does not exist`);
  if (!f.terms.length) say(`form ${slug}: no help terms`);
}
// every group in the index names forms that exist, and every form is in exactly one group
const grouped = forms.groups.flatMap((g) => g.forms.map((x) => x.slug));
for (const slug of forms.order) if (grouped.filter((x) => x === slug).length !== 1) say(`form ${slug}: not in exactly one index group`);

// ── the demos on disk are the demos the model names ──
const demos = path.join(ROOT, "apps/docs/demos");
for (const c of classes) for (const e of c.example ?? []) if (!existsSync(path.join(demos, e.name + ".declare"))) say(`class ${c.id}: demo ${e.name}.declare missing on disk`);
for (const slug of forms.order) for (const e of forms.pages[slug].example) if (!existsSync(path.join(demos, e.name + ".declare"))) say(`form ${slug}: demo ${e.name}.declare missing on disk`);

// ── the search index covers every page ──
const idx = JSON.parse(readFileSync(path.join(ROOT, "apps/docs/search-index.json"), "utf8")).entries;
const locs = new Set(idx.map((e) => e.loc));
for (const c of classes) if (!locs.has("reference/" + c.id)) say(`search: reference/${c.id} is not indexed`);
for (const slug of forms.order) if (!locs.has("language/" + slug)) say(`search: language/${slug} is not indexed`);

// ── report ──
const n = { classes: classes.length, withUsage: classes.filter(hasUsage).length, abstract: classes.filter((c) => c.abstract).length,
  attributes: classes.reduce((a, c) => a + c.attributes.length, 0), overrides: classes.reduce((a, c) => a + c.attributes.filter((x) => x.overrides).length, 0),
  forms: forms.order.length, rules: forms.order.reduce((a, s) => a + forms.pages[s].rules.length, 0), formDemos: forms.order.reduce((a, s) => a + forms.pages[s].example.length, 0) };
console.log(`audit: ${n.classes} classes (${n.withUsage} with usage, ${n.abstract} abstract) · ${n.attributes} attributes (${n.overrides} overrides) · ${n.forms} forms, ${n.rules} rules, ${n.formDemos} form demos`);
if (problems.length) {
  console.log(`  ${problems.length} problem(s):`);
  for (const p of problems) console.log("    " + p);
  process.exitCode = 1;
} else console.log("  no misses");
