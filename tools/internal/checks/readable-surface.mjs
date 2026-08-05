// Readable-surface sweep — everything an agent in a fresh clone might READ and
// believe. The repo is the product: a stale example is a shipped defect, not
// internal debt. Three surfaces:
//
//   1. markdown ```declare fences   → must COMPILE   (```declare-fragment → must PARSE)
//   2. .declare source files        → must COMPILE   (component files get an App root appended,
//                                                     the declarec.mjs:625 convention)
//   3. .declare docstring examples  → must PARSE     (the C3 blind spot: indented blocks inside
//                                                     the leading /* */ comment, covered by nothing)
//
// Fragment wrapping matches test/docs.test.mjs exactly: whole program, else
// declaration-excerpt + appended root, else member list inside an App body.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const { compile } = await import(`file://${ROOT}/compiler/dist/compile-node.js`);
const { parseProgram } = await import(`file://${ROOT}/runtime/dist/parser.js`);

// Directories an agent would not read as documentation: dependencies, build
// output, per-run eval artifacts, the vendored React comparison's node_modules.
const SKIP = new Set([
  "node_modules", ".git", "dist", "runs", "browser", "bundles", "assets",
  "baselines", "artifacts", "fixtures", "screenshots", "shots",
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const findings = [];
const counts = { fence: 0, fragment: 0, source: 0, docstring: 0, mislabeled: 0 };

// An excerpt is one of three things (test/docs.test.mjs's convention, lifted to
// COMPILE rather than parse): a whole program; top-level declarations needing a
// root appended; or a member list belonging inside an App body. Only an excerpt
// that fails ALL THREE is broken — anything else is a fence-label question, and
// the report must not conflate the two.
function tryCompile(src, originDir) {
  // Order matters, and not for speed: whichever form is tried first is the one
  // whose error gets reported, so the excerpt's shape has to decide. An excerpt
  // opening `rows: array = …` is a MEMBER; reporting the whole-program parse's
  // "expected end of input, got ':'" for it sends the reader to a phantom.
  const looksLikeMember = /^\s*[A-Za-z_]\w*\s*[:=]/.test(src);
  const looksLikeDecl = /^\s*(class|style|stylesheet|font|include|script|use)\b/.test(src);
  const wrapped = looksLikeDecl
    ? ["declarations", `${src.trimEnd()}\n\nApp [ width = 1, height = 1 ]\n`]
    : ["members", `App [\n${src.trimEnd()}\n]`];
  const forms = looksLikeMember || looksLikeDecl ? [wrapped, ["program", src]] : [["program", src], wrapped];

  let best = null;
  for (const [form, text] of forms) {
    let out;
    try { out = compile(text, { originDir }); } catch (e) { best ??= String(e?.message ?? e); continue; }
    if (!out.errors.length) return { ok: true, form };
    best ??= out.errors.slice(0, 3).map((e) => `${e.message}${e.line ? ` (line ${e.line})` : ""}`).join(" | ");
  }
  return { ok: false, detail: best };
}

// Prose decoration, not code: an elision marker, a callout arrow, an annotation
// column, a Markdown blockquote. These excerpts were never meant to compile, and
// reporting them as broken examples is how a check loses its audience.
const ILLUSTRATIVE = /[…▾▸⟵⟶→←↑↓✓✗•]|^\s*>/m;

function note(surface, file, label, detail, severity = "broken") {
  findings.push({ surface, file: relative(ROOT, file), label, detail, severity });
}

// ── 1. markdown fences ───────────────────────────────────────────────────────
for (const f of files.filter((f) => f.endsWith(".md"))) {
  const md = readFileSync(f, "utf8");

  for (const [i, m] of [...md.matchAll(/```declare\n([\s\S]*?)```/g)].entries()) {
    counts.fence++;
    const src = m[1];
    const head = src.trim().split("\n")[0].slice(0, 60);
    const v = tryCompile(src, dirname(f));
    if (v.ok) { if (v.form !== "program") counts.mislabeled++; continue; }
    note("fence", f, `fence ${i + 1}: ${head}`, v.detail, ILLUSTRATIVE.test(src) ? "illustrative" : "broken");
  }

  for (const [i, m] of [...md.matchAll(/```declare-fragment\n([\s\S]*?)```/g)].entries()) {
    counts.fragment++;
    const frag = m[1];
    const head = frag.trim().split("\n")[0].slice(0, 60);
    let err = null;
    try { parseProgram(frag); continue; } catch (e) { err = e; }
    if (/^\s*(class|style|stylesheet|font|include|script|use)\b/.test(frag)) {
      try { parseProgram(`${frag.trimEnd()}\n\nApp [ width = 1, height = 1 ]\n`); continue; } catch (e) { err = e; }
    } else {
      try { parseProgram(`App [\n${frag.trimEnd()}\n]`); continue; } catch (e) { err = e; }
    }
    note("fragment", f, `fragment ${i + 1}: ${head}`, String(err?.message ?? err).slice(0, 200),
      ILLUSTRATIVE.test(frag) ? "illustrative" : "broken");
  }
}

// ── 2. .declare source files ─────────────────────────────────────────────────
for (const f of files.filter((f) => f.endsWith(".declare"))) {
  counts.source++;
  const src = readFileSync(f, "utf8");
  const isComponent = !/^\s*App\s*\[/m.test(src);
  let out;
  try {
    out = compile(isComponent ? `${src}\nApp [ ]\n` : src, { originDir: dirname(f) });
  } catch (e) {
    // A THROW is not a diagnostic: the compiler fell over instead of reporting.
    // That is a worse finding than a broken example and gets its own severity.
    note("source", f, "(compiler threw)", String(e?.message ?? e).slice(0, 200), "compiler-crash");
    continue;
  }
  if (out.errors.length) {
    note("source", f, isComponent ? "(component file, App root appended)" : "(program)",
      out.errors.slice(0, 3).map((e) => `${e.message}${e.line ? ` (line ${e.line})` : ""}`).join(" | "));
  }
}

// ── 3. docstring examples inside .declare files ──────────────────────────────
// The convention (library/*.declare): a leading /* */ block holding Markdown,
// with examples as 4-space-indented blocks. Nothing checks these today.
for (const f of files.filter((f) => f.endsWith(".declare"))) {
  const src = readFileSync(f, "utf8");
  for (const block of src.matchAll(/\/\*([\s\S]*?)\*\//g)) {
    const body = block[1];
    const lines = body.split("\n");
    let buf = [];
    const flush = () => {
      if (!buf.length) return;
      const text = buf.join("\n");
      buf = [];
      // Declare-looking: opens with a capitalized name and a bracket somewhere.
      const first = text.trim().split("\n")[0];
      if (!/^[A-Z][\w]*\s*(\[|\{)/.test(first) || !text.includes("[")) return;
      counts.docstring++;
      const head = first.slice(0, 60);
      // Docstring examples name their OWN component, which lives in this file —
      // so compile the file's source ahead of the excerpt, the way a reader
      // would use it. This is the C3 blind spot: covered by nothing today.
      const asRoot = /^\s*App\s*\[/.test(text);
      const v = tryCompile(asRoot ? `${src}\n\n${text}` : `${src}\n\nApp [\n${text.trimEnd()}\n]`, dirname(f));
      if (v.ok) return;
      // An example reading `app.d.value` is not broken — it is shorthand for
      // "your dataset here", and a reader supplies the context. Only errors
      // about names the SYNTHETIC App wrapper lacks are that shorthand; a
      // syntax or type error is a genuinely wrong example. Flagging the first
      // kind as a defect spends the credibility of the second, so they are
      // separated rather than merged — the warning policy of diagnostics.md §4
      // applied to our own checks.
      const contextOnly = v.detail.split(" | ")
        .every((e) => /is not a member of this App — declare it/.test(e));
      note("docstring", f, `example: ${head}`, v.detail, contextOnly ? "context-assuming" : "broken");
    };
    for (const ln of lines) {
      if (/^\s{4,}\S/.test(ln)) buf.push(ln.replace(/^\s{4}/, ""));
      else if (ln.trim() === "" && buf.length) buf.push("");
      else flush();
    }
    flush();
  }
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`swept: ${counts.fence} fences · ${counts.fragment} fragments · ${counts.source} .declare files · ${counts.docstring} docstring examples`);
console.log(`fences that compile only as an excerpt (label hygiene, not a defect): ${counts.mislabeled}`);
// Two tiers, and the split is the point: a DEFECT is something a reader who
// trusts it gets burned by; an ADVISORY is an excerpt that assumes a context a
// reader supplies. Only the first tier should ever fail a build.
const defects = findings.filter((f) => f.severity === "broken" || f.severity === "compiler-crash");
const advisories = findings.filter((f) => !defects.includes(f));

console.log(`defects: ${defects.length} · advisories: ${advisories.length}\n`);

const show = (title, items) => {
  if (!items.length) return;
  console.log(`\n## ${title} — ${items.length}\n`);
  const bySurface = {};
  for (const f of items) (bySurface[f.surface] ??= []).push(f);
  for (const [surface, group] of Object.entries(bySurface)) {
    for (const it of group) {
      console.log(`  ${it.file}   (${surface})`);
      console.log(`    ${it.label}${it.severity !== "broken" ? `  [${it.severity}]` : ""}`);
      console.log(`    → ${it.detail}\n`);
    }
  }
};

show("defects — a reader who trusts these gets burned", defects);
show("advisories — excerpts assuming a context the reader supplies", advisories);

process.exit(defects.length ? 1 : 0);
