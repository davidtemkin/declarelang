// coverage-sweep — the dark-surface detector (assessment §6.4, David's
// directive 2026-08-06). The 2026-08 field round proved that gaps survive
// app-scale evals precisely where no brief ever points: image fit sat behind
// square fixtures, leading behind unmeasured prose, rotation behind agents
// designing within the language's reach. This sweep makes the dark surface a
// LIST instead of a replication accident: every schema attribute the corpus
// — apps, evals, test fixtures, doc examples — exercises ZERO times.
//
//   node tools/internal/coverage-sweep.mjs [--json]
//
// A REPORT, not a gate: zero-coverage is a fact to aim the next brief at,
// not an error to block a commit on. Matching is textual by design (an
// attribute NAME appearing as a member write/declare in any .declare source
// or fenced example) — cheap, over-approximate in the safe direction: a
// false "covered" needs the name used somewhere, which is already more than
// the dark surface had.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const asJson = process.argv.includes("--json");

// ── the surface: every class's own attributes, from the derived model ───────
const model = JSON.parse(readFileSync(join(ROOT, "docs/declare-model.json"), "utf8"));
const schemas = model.spine.schemas;

// ── the corpus: every .declare under the teaching + proving trees, plus the
// fenced examples inside the docs (guide chapters, reference prose) ─────────
const CORPUS_DIRS = ["apps", "evals", "test", "library", "docs", "tools/internal/doc/prose", "tools/internal/sim"];
const SKIP = new Set(["node_modules", "dist", "baselines", ".derive"]);
const sources = [];
function walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries.sort()) {
    if (SKIP.has(e)) continue;
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p);
    else if (e.endsWith(".declare") || e.endsWith(".md") || e.endsWith(".json")) sources.push(p);
  }
}
for (const d of CORPUS_DIRS) walk(join(ROOT, d));
const corpus = sources
  // Neither the surface nor the REPORT may attest itself: the model carries
  // every name by definition, and evals/README.md §Coverage quotes the dark
  // list — counting it would launder each finding into "covered" one run
  // after it was reported.
  .filter((p) => !p.endsWith("declare-model.json") && !p.endsWith("evals/README.md"))
  .map((p) => ({ p, text: readFileSync(p, "utf8") }));

// The JS tier, reported separately: a unit test poking `app.a.paused` from
// .mjs proves the RUNTIME behavior without giving any Declare author a
// single example — dark-for-authors, tested-for-the-runtime. Scanning it
// keeps the headline honest ("nothing" must mean nothing).
const jsTier = readdirSync(join(ROOT, "test")).filter((e) => e.endsWith(".mjs"))
  .map((e) => readFileSync(join(ROOT, "test", e), "utf8")).join("\n");

// ── the join ────────────────────────────────────────────────────────────────
// An attribute counts as exercised when its name appears in USE position:
// `name =`, `name:` (a typed declare of the same slot), or `.name` (a read).
// Names that are also everyday words (text, source, width…) inevitably match
// often — fine: the sweep hunts ZEROS, and a zero on a common word is all the
// more damning.
const dark = [];
const covered = [];
for (const [cls, sch] of Object.entries(schemas)) {
  for (const attr of Object.keys(sch.attrs ?? {})) {
    const use = new RegExp(`(\\b${attr}\\s*=[^=]|\\b${attr}\\s*:|\\.${attr}\\b)`);
    const hits = [];
    for (const { p, text } of corpus) {
      if (use.test(text)) { hits.push(relative(ROOT, p)); if (hits.length >= 3) break; }
    }
    const jsOnly = hits.length === 0 && new RegExp(`(\\.${attr}\\b|\\b${attr} =)`).test(jsTier);
    (hits.length === 0 ? dark : covered).push({ id: `${cls}.${attr}`, hits, jsOnly });
  }
}

if (asJson) {
  console.log(JSON.stringify({ dark: dark.map((d) => d.id), total: dark.length + covered.length }, null, 1));
} else {
  console.log(`coverage-sweep: ${covered.length + dark.length} schema attributes, ${dark.length} exercised by NOTHING in the corpus`);
  for (const d of dark.sort((a, b) => a.id.localeCompare(b.id))) {
    console.log(`  dark${d.jsOnly ? " (runtime-tested from .mjs; zero author-facing use)" : "                "}  ${d.id}`.replace(/ +  /, "  "));
  }
  if (dark.length === 0) console.log("  (no dark surface — every attribute has at least one example)");
  console.log(`\nAim the next brief here — a dark attribute is a gap no eval can find (evals/README.md §coverage).`);
}
