// tools/internal/doc/extract.mjs — THE EXTRACTOR: source ──► docs-model.json (tools/internal/doc/model.ts).
//
// Vertical slice: the three canonical view classes (View, Text, Image). Structure
// is read losslessly from the runtime's own `ComponentSchema` chain (runtime/dist)
// so it CANNOT drift from the checker; defaults are read from the `defineAttributes`
// specs in the runtime source via the TypeScript compiler API (docs/system-design/doc-system.md
// §"Structure generation" — schema ⨝ decoration ⨝ tsc). Prose + the @api surface
// come, for the slice, from keyed Markdown files under tools/internal/doc/prose/ (the
// file-prose path doc-system.md blesses) — later swapped for captured `/* *​/`
// blocks with no change to this model or the renderer.
//
//   node tools/internal/doc/extract.mjs        # writes the doc tree into docs/declare-model.json (assemble augments it in place)
//
// Run after `npm run build` (needs runtime/dist).

import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { formatSource } from "../../format.mjs";
import { SCHEMAS, RichTextSchema, EVENT_PAYLOAD } from "../../../runtime/dist/schema.js";

/** Canon a generated demo, or leave it exactly as-is if the formatter cannot take
 *  it. A guide fence may legitimately use surface the formatter's grammar does not
 *  cover yet; that is a reason to skip the file, never to fail the extract — the
 *  demo's job is to run, and `format --check` is the place that reports drift. */
function canonize(src) {
  try { return formatSource(src); } catch { return src; }
}
import { TAGS, LAYOUTS, DATA, ANIMATORS, SOURCES, ANIMATOR_GROUPS, STATES } from "../../../runtime/dist/registry.js";
import { LANGUAGE_API, LANGUAGE_STATICS } from "../../../compiler/dist/scaffold.js";
import { compile } from "../../../compiler/dist/compile-node.js";
import { settleHeadless } from "../../../compiler/dist/headless.js";
import { parseProgram } from "../../../runtime/dist/parser.js";

// RichText is the abstract base of Markdown/HTMLText — documented, but not in the
// instantiable SCHEMAS registry (like Layout). Fold it in for the extractor only.
const DOC_SCHEMAS = { ...SCHEMAS, RichText: RichTextSchema };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TARGETS = [                                        // the documented component surface
  "View", "App", "Text", "Image", "Media", "Video", "Audio", "RichText", "Markdown", "HTMLText", "DOMIsland", "TextInput",
  "Layout", "TweenLayout", "Editor",
  "Dataset", "DataSource",
  "Animator", "AnimatorGroup", "Spring", "Time", "Keys", "Focus", "Tip",
  "Stream", "EventStream", "Socket",
  "State", "Node",
];
// THE single documentation model. extract writes the walkable doc tree here;
// assemble.mjs then augments the SAME file in place with the spine/links/meta.
// One model, two scoped writers, no intermediate artifact.
// The extractor's output is an INTERMEDIATE, not the committed artifact.
// docs/declare-model.json has exactly one author — assemble — which reads this
// file and emits the final model (spine, links, browse, meta + the doc tree
// carried through). Two tools writing one committed file in sequence was the
// structural bug behind a whole class of failures: a bare extract used to
// DELETE assemble's half (patched with a carry-forward hack, now deleted), and
// the buildId extract baked in was one stamp-version behind by construction.
// Untracked (.derive/ is gitignored); derive.mjs orders extract before assemble
// by declared IO, and a standalone assemble falls back to the committed model's
// own doc-tree sections — the same self-read it always did.
const OUT = path.join(ROOT, ".derive/docs-extract.json");

// `--check` is the prose-binding GATE and must be READ-ONLY: extract writes the
// model, assemble then augments the SAME file with its spine/browse sections —
// so a checking run that wrote would silently strip them. (It did, once.)
const CHECK = process.argv.includes("--check");
const DEMOS = path.join(ROOT, "apps/docs/demos");         // generated islands land here (server seeds them)

// ── inline runnable examples: every prose ```declare block becomes a live edit/run
// island IF it compiles as a whole program — as written (a complete `App […]`, or a
// `class …` + `App`), or wrapped in `App [ … ]` for a bare view fragment. Each runnable
// block is WRITTEN as apps/docs/demos/<id>.declare so the server/host seed it into
// `app.demoSources[<id>]` exactly like the homepage demos, and the model records the
// prose as an ordered segment list the app renders (Markdown text, or an island).
const genFiles = {};                                          // id → source, written to DEMOS at the end
const PROSE = {};                                             // class → its parsed prose (members/methods), for the post-pass
const LIB_SRC = {};                                           // library class → its source slice (reads are scanned here)
const LIB_SETS = {};                                          // library class → its bare `name = value` sets (overrides)
async function compilesOK(src) { try { return !(await compile(src, {})).errors?.length; } catch { return false; } }
async function runnableForm(block) {
  // A program needs an `App` root. If the block already has a top-level `App [` (a whole
  // program, or `class … App […]`), use it as written. Otherwise it's a view fragment —
  // wrap it in `App [ … ]` so it actually RUNS (a bare `View […]` compiles but has no root
  // and throws at runtime). Only forms that compile become islands; the rest stay static.
  if (/^App\s*\[/m.test(block)) return await compilesOK(block) ? block : null;
  const wrapped = "App [\n" + block.split("\n").map((l) => "    " + l).join("\n") + "\n]";
  return await compilesOK(wrapped) ? wrapped : null;
}
// slug → a filesystem/slot-safe id
function slug(s) { return s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }

// The island stage must FIT the settled app: an App fills its HOST, not its content,
// so in a fixed frame a taller program scrolls inside its box with the root's fill
// ending mid-content (the tutorial's Signals bug). Run each island headless at a
// representative island width and read the settled content extent — the docs app
// sizes each stage from this. Floor 200 (small demos keep the house frame), cap 560
// (a runaway demo scrolls rather than swallowing the page), +24 breathing room.
async function measureStage(src, floor = 200) {
  try {
    // settleHeadless takes a compile()'s OUTPUT (headless.ts) — the ONE compile
    // resolves auto-includes (Slider/Button/…) and extracts deps; core build alone
    // would reject any island that uses the standard library.
    const out = await compile(src, {});
    if (out.errors?.length) return floor;
    const app = settleHeadless(out.source, { deps: out.deps, env: { hostWidth: 640, hostHeight: floor } });
    // A fixed-size app's DECLARED height wins over its settled content extent —
    // a State/Spring may grow content into that declared box on interaction
    // (contentHeight alone under-measured a states demo by 40px).
    const h = Math.ceil(Math.max(app.contentHeight, app.height || 0));
    app.discard();
    return Math.max(floor, Math.min(h + 24, 560));
  } catch { return floor; }
}

// split prose Markdown into ordered segments: { md } for text/static-code, or
// { md:"", code:[{id, source, lines, stageH}] } for a runnable island (0-or-1 array so
// the app constructs the island by datapath replication). Merges runs of plain text.
async function segmentize(md, idBase) {
  if (!md) return [];
  const segs = [];
  const pushMd = (t) => {
    if (!t.trim()) return;
    const last = segs[segs.length - 1];
    if (last && last.code.length === 0) last.md += "\n\n" + t.trim();   // merge adjacent prose
    else segs.push({ md: t.trim(), code: [] });
  };
  let n = 0;
  for (const part of md.split(/(```declare\n[\s\S]*?```)/g)) {
    const m = part.match(/^```declare\n([\s\S]*?)```$/);
    if (!m) { pushMd(part); continue; }
    const block = m[1].replace(/\n+$/, "");
    const run = await runnableForm(block);
    if (run) {
      const id = "seg_" + slug(idBase) + "_" + n++;
      genFiles[id] = run;
      segs.push({ md: "", code: [{ id, source: run, lines: run.split("\n").length, stageH: await measureStage(run) }] });
    } else {
      pushMd(part);                                          // non-runnable → render as static code
    }
  }
  return segs;
}

// ── type rendering: an AttrType (value.ts) → a readable reference string ──
function renderType(t) {
  switch (t.kind) {
    case "length": return "Length";
    case "radius": return "Radius";
    case "number": return "number";
    case "boolean": return "boolean";
    case "string": return "string";
    case "color": return "Color";
    case "shape": return "Shape";
    // an authored-style union's NAME is its quoted member list — the spelling
    // the ruling requires at every use site; a named vocabulary lists tokens
    case "enum": return t.name.startsWith('"') ? t.name : t.tokens.join(" | ");
    case "component": return t.of;
    case "cursor": return "datapath";
    case "slotref": return "slot";
    case "record": return t.name;
    case "fill": return "Fill";
    case "stroke": return "Stroke";
    case "shadow": return "Shadow";
    case "motion": return "Motion";
    case "font": return "Font";
    default: return t.kind;
  }
}

// ── defaults + source lines, read from the runtime source with tsc ──
// Walks every `defineAttributes(Ctor, { name: { def: <expr>, … }, … })` call in a
// source file, yielding { ctor, attr → { default, line } }. The `def` initializer's
// verbatim source text is the rendered default (`0`, `null`, `0x000000`, `"normal"`).
function readDecorations(files) {
  const byCtor = {};                                    // ctorName → { attr → {default, file, line} }
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    if (!existsSync(abs)) continue;
    const src = readFileSync(abs, "utf8");
    const sf = ts.createSourceFile(abs, src, ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "defineAttributes" &&
        node.arguments.length >= 2 &&
        ts.isIdentifier(node.arguments[0]) &&
        ts.isObjectLiteralExpression(node.arguments[1])
      ) {
        const ctor = node.arguments[0].text;
        const table = (byCtor[ctor] ??= {});
        for (const prop of node.arguments[1].properties) {
          if (!ts.isPropertyAssignment(prop) || !ts.isObjectLiteralExpression(prop.initializer)) continue;
          const attr = prop.name.getText(sf).replace(/^["']|["']$/g, "");
          const defProp = prop.initializer.properties.find(
            (p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === "def"
          );
          const line = sf.getLineAndCharacterOfPosition(prop.getStart(sf)).line + 1;
          table[attr] = {
            default: defProp ? defProp.initializer.getText(sf) : null,
            file: rel,
            line,
          };
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return byCtor;
}

// ── methods + signatures, read from the runtime source with tsc ──
// Walks each `export class X { … }` and records its OWN public instance methods
// AND public GETTERS: name, parameter names+types, and return type — the
// authoritative signature, so it cannot drift from the code. A getter is a
// read-only member (`childViews`, `loaded`, `contentWidth`) and reads as one,
// not as a call; before 2026-07-28 they were skipped outright, so the model
// advertised none of them. Skips the constructor, `private`/`protected`, and
// `_`-prefixed internals. Inherited members are reached through the `extends`
// edge (per-declaration model), exactly like attributes.
function readMethods(files) {
  const byClass = {};                                   // className → { method → { signature, params, returns, file, line } }
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    if (!existsSync(abs)) continue;
    const sf = ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const table = (byClass[node.name.text] ??= {});
        for (const m of node.members) {
          const isGetter = ts.isGetAccessor(m);
          if ((!ts.isMethodDeclaration(m) && !isGetter) || !m.name || !ts.isIdentifier(m.name)) continue;
          const mods = (ts.canHaveModifiers(m) ? ts.getModifiers(m) : undefined) ?? [];
          if (mods.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword || x.kind === ts.SyntaxKind.ProtectedKeyword)) continue;
          const name = m.name.text;
          if (name.startsWith("_")) continue;
          if (table[name] !== undefined) continue;      // first declaration wins (a get/set pair)
          const returns = m.type ? m.type.getText(sf) : "void";
          if (isGetter) {
            // a read-only member: no parens, and the reference reads it as one
            table[name] = { signature: `${name}: ${returns}`, params: [], returns, getter: true,
              file: rel, line: sf.getLineAndCharacterOfPosition(m.getStart(sf)).line + 1 };
            continue;
          }
          const params = m.parameters
            .filter((p) => ts.isIdentifier(p.name))
            .map((p) => ({ name: p.name.text, type: p.type ? p.type.getText(sf) : null, optional: !!p.questionToken }));
          const sig = `${name}(${params.map((p) => p.name + (p.optional ? "?" : "") + (p.type ? ": " + p.type : "")).join(", ")}): ${returns}`;
          table[name] = { signature: sig, params, returns, file: rel, line: sf.getLineAndCharacterOfPosition(m.getStart(sf)).line + 1 };
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return byClass;
}

// ── prose + @api surface, from tools/internal/doc/prose/<Class>.md ──
// Format: the text before the first `## ` heading is the CLASS prose; each
// `## <name>` section is that member's prose, and a `## <name>()` heading (trailing
// parens) is a METHOD's prose — parked in its own map so `remove()` the method never
// collides with an `onRemove` event or a `remove` attribute. Presence ⇒ @api (for the
// slice; the explicit `@api` marker + coverage gate arrive with the block-capture parser).
function readProse(cls) {
  const abs = path.join(ROOT, "tools/internal/doc/prose", cls + ".md");
  if (!existsSync(abs)) return { class: null, members: {}, methods: {} };
  const text = readFileSync(abs, "utf8");
  const parts = text.split(/^## +(.+)$/m);              // [classProse, name1, body1, name2, body2, …]
  const members = {}, methods = {};
  for (let i = 1; i < parts.length; i += 2) {
    const head = parts[i].trim(), body = parts[i + 1].trim();
    const asMethod = head.match(/^([A-Za-z_$][\w$]*)\(\)$/);
    if (asMethod) methods[asMethod[1]] = body;
    else members[head] = body;
  }
  return { class: parts[0].trim() || null, members, methods, file: `tools/internal/doc/prose/${cls}.md` };
}

// Every `## heading` a prose file offers that NOTHING in the model claimed.
// A heading binds to an attribute, an event (by handler name `onKeyDown`, or by
// event name when no attribute can claim it), or — with trailing parens — a
// method. One that binds to nothing is prose the reference silently drops:
// exactly how 13 documented events came to render blank. Reported by
// `--check`, so it fails the ops gate instead of going unnoticed.
const unboundProse = [];
function auditProse(cls, prose, schema, clsMethods) {
  const attrs = new Set(Object.keys(schema?.attrs ?? {}));
  const events = new Set(schema?.events ?? []);
  const handlers = new Set([...events].map((e) => "on" + e[0].toUpperCase() + e.slice(1)));
  for (const head of Object.keys(prose.members)) {
    if (attrs.has(head) || handlers.has(head) || events.has(head)) continue;
    unboundProse.push(`${prose.file}: '## ${head}' binds to no attribute or event of ${cls}`);
  }
  // A method reaches the reference from EITHER source — tsc's public surface, or
  // the check block (CALLABLE, below): a `protected` runtime member and a service
  // static are both real, documented API that `clsMethods` alone cannot see.
  const callable = CALLABLE[cls] ?? new Map();
  for (const head of Object.keys(prose.methods)) {
    if (clsMethods?.[head] === undefined && !callable.has(head)) {
      unboundProse.push(`${prose.file}: '## ${head}()' binds to no method of ${cls}`);
    }
  }
}

// ── build the model ──
const nodes = {};
const roots = [];
const subclassIndex = {};                               // base name → [subclass names]

const DECOR = readDecorations(["runtime/src/view.ts", "runtime/src/text.ts", "runtime/src/image.ts", "runtime/src/video.ts"]);

// method signatures — read from every runtime file that declares a documented class.
const METHODS = readMethods([
  "runtime/src/view.ts", "runtime/src/text.ts", "runtime/src/image.ts", "runtime/src/video.ts",
  "runtime/src/markdown.ts", "runtime/src/text-input.ts", "runtime/src/layout.ts",
  "runtime/src/data.ts", "runtime/src/animator.ts", "runtime/src/spring.ts",
  "runtime/src/state.ts", "runtime/src/node.ts", "runtime/src/editor.ts",
  "runtime/src/streams.ts",
]);
// A class is ABSTRACT when no registry can instantiate it by name: Layout,
// TweenLayout, RichText and Editor are bases you extend, never tags you write.
// Derived from the registries rather than a hand list, so it cannot drift.
const INSTANTIABLE = new Set([TAGS, LAYOUTS, DATA, ANIMATORS, SOURCES, ANIMATOR_GROUPS, STATES]
  .flatMap((r) => Object.keys(r)));

// ── THE CALLABLE SURFACE — what a `{ }` body may actually call ───────────────
// `LANGUAGE_API` and `LANGUAGE_STATICS` (compiler/src/scaffold.ts) are the
// AUTHORITATIVE statement of what user code can call: the scaffold emits them
// into every program's check block, so they are typechecked for an app exactly
// as they are for a library component. Until 2026-08-05 the reference did not
// read them, and the consequence was the thing the library charter promises
// against (§2a): `App.createView` is taught four times in declare.md, `View.raise`
// is what every overlay in `library/` calls, `Layout.laid` is what every `place()`
// is written against — and none of them appeared in the reference at all. Fully
// supported, fully typechecked, undiscoverable.
//
// Two gaps to close, and they have different causes:
//   1. METHODS is read from tsc's PUBLIC surface, so a member the runtime marks
//      `protected` (Layout.laid, TweenLayout.laid) is absent even though the
//      scaffold declares it public for check blocks — a subclass's `place()`
//      cannot be written without it.
//   2. A service STATIC (`Focus.focus`, `Keys.isDown`) is not an instance method
//      of anything, so it is in no class's METHODS at all. `Focus` and `Keys`
//      published their events and nothing else.
// So membership here MAKES a method @api — prose describes a member, it should
// not decide whether the member exists. `test/docs.test.mjs` then requires prose
// for every one, so nothing surfaces blank.
const sigName = (line) => {
  const m = line.trim().match(/^(?:static\s+)?(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*[<(:]/);
  return m ? m[1] : null;
};
const CALLABLE = {};                                    // class → Map(name → { signature, static })
for (const [cls, lines] of Object.entries(LANGUAGE_API)) {
  CALLABLE[cls] ??= new Map();
  for (const line of lines) {
    // `readonly` entries are host-fed PROPERTIES, not calls (App.demoSources /
    // liveReport — the interim live-demo channels scaffold.ts rules will dissolve
    // into a per-instance component). Projecting them as methods would document
    // the wrong kind of thing, and they are not authoring surface either way.
    // …and a PROPERTY signature (`view: View;`) is not a call either. Only real
    // call signatures become method nodes; a property's meaning belongs in the
    // prose of whatever method reads it (Layout.view, in `laid()`).
    if (/^\s*readonly\b/.test(line) || !line.includes("(")) continue;
    const n = sigName(line);
    if (n) CALLABLE[cls].set(n, { signature: line.trim().replace(/;$/, ""), isStatic: false });
  }
}
for (const [cls, lines] of Object.entries(LANGUAGE_STATICS)) {
  CALLABLE[cls] ??= new Map();
  for (const line of lines) {
    const n = sigName(line);
    if (n) CALLABLE[cls].set(n, { signature: line.trim().replace(/^static\s+/, "").replace(/;$/, ""), isStatic: true });
  }
}

// `draw(d: Draw)` is a member with a RESERVED name a view may define (declare.md
// §3: "a first-class member, not an escape hatch") — author-declared, so tsc's
// surface never lists it on View. It enters through the callable door, so the
// View page carries it (`## draw()` prose, View.md) and `declare-help View.draw`
// answers. The Draw interface itself is on the Types page.
(CALLABLE.View ??= new Map()).set("draw", { signature: "draw(d: Draw): void", isStatic: false });

const RUNTIME_NAME = {};                                // doc id → runtime class name (no mismatches since the DOMIsland rename)

// USAGE examples — the class page's Usage section. A class has one per file
// `apps/docs/demos/<Class>.declare` or `<Class>.<slug>.declare` (sorted: the bare
// name first, then the slugs alphabetically). Each carries the demo SOURCE (so the
// editor seeds straight off the model datapath), the line count (to size the
// panel), a measured stage height, and a TITLE + LEAD read from the file's opening
// comment: the first `//` line is the title, the `//` lines after it (to the first
// blank or code line) are the lead — Markdown, one or two sentences on what the
// example shows. A demo without the comment titles itself "Example". The LIVE
// PREVIEW is mounted by the host from the demos dir by the same name (dots
// included — `Button.pair` → demos/Button.pair.declare).
async function readExample(name) {
  const dir = path.join(ROOT, "apps/docs/demos");
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f === `${name}.declare` || (f.startsWith(`${name}.`) && f.endsWith(".declare") && !f.slice(name.length + 1, -8).includes(".")));
  files.sort((a, b) => (a === `${name}.declare` ? -1 : b === `${name}.declare` ? 1 : a.localeCompare(b)));
  const out = [];
  for (const f of files) {
    const id = f.replace(/\.declare$/, "");
    const raw = readFileSync(path.join(dir, f), "utf8").replace(/\n$/, "");
    const lines = raw.split("\n");
    let title = "Example", lead = "";
    const head = [];
    while (lines.length && /^\/\//.test(lines[0])) head.push(lines.shift().replace(/^\/\/ ?/, ""));
    if (head.length) { title = head[0].trim(); lead = head.slice(1).join(" ").trim(); while (lines.length && lines[0].trim() === "") lines.shift(); }
    const source = lines.join("\n");
    out.push({ name: id, title, lead, lines: source.split("\n").length, source, stageH: await measureStage(source, 110) });
  }
  return out;
}

for (const name of TARGETS) {
  const schema = DOC_SCHEMAS[name];
  if (!schema) throw new Error(`extract: no schema for ${name}`);
  const prose = readProse(name);
  PROSE[name] = prose;
  const decor = DECOR[name] ?? {};
  const clsMethods = METHODS[RUNTIME_NAME[name] ?? name] ?? {};
  auditProse(name, prose, schema, clsMethods);
  const clsId = name;

  // members: OWN attributes + OWN methods + OWN events (inherited ones are reachable
  // through the `extends` edge — the renderer walks the chain, the model stays
  // per-declaration).
  const attributes = [];
  const methods = [];
  const events = [];

  for (const attr of Object.keys(schema.attrs)) {
    const id = `${clsId}.${attr}`;
    // The prose convention opens a read-only slot's section with "**Read-only.**";
    // the entry carries the same fact as a flag (`readOnly`, the page's badge), so
    // the sentence-opener is dropped here rather than said twice.
    const raw = prose.members[attr] ?? null;
    const doc = raw === null ? null : raw.replace(/^\*\*Read-only\.?\*\*\s*[—–-]?\s*/, "");
    const d = decor[attr];
    nodes[id] = {
      id, name: attr, kind: "attribute",
      doc, docSegs: await segmentize(doc, id), api: doc !== null,
      source: d ? { file: d.file, line: d.line } : { file: "runtime/src/schema.ts", line: 0 },
      parent: clsId, seeAlso: [],
      type: renderType(schema.attrs[attr]),
      default: d?.default ?? null,
      readOnly: (schema.readOnly ?? []).includes(attr),
      inheritedFrom: null,
    };
    attributes.push(id);
  }

  // methods: OWN public methods (signature is authoritative, from tsc). A method with
  // prose becomes @api and shows in the reference; the rest are recorded structural-only
  // for the object browser.
  // The callable surface for THIS class, plus any of its members tsc could not
  // see (a `protected` runtime member the scaffold declares public — Layout.laid).
  const callable = CALLABLE[clsId] ?? new Map();
  for (const [cname, c] of callable) {
    if (clsMethods[cname]) continue;                     // tsc already has it; the loop below wins
    const doc = prose.methods[cname] ?? null;
    const id = `${clsId}.method.${cname}`;
    nodes[id] = {
      id, name: cname, kind: "method",
      doc, docSegs: await segmentize(doc, id), api: true,      // in the check block ⇒ callable ⇒ API
      source: { file: "compiler/src/scaffold.ts", line: 0 },
      parent: clsId, seeAlso: [], signature: c.signature, returns: null,
      ...(c.isStatic ? { isStatic: true } : {}),
    };
    methods.push(id);
  }

  for (const [mname, m] of Object.entries(clsMethods)) {
    const doc = prose.methods[mname] ?? null;
    const id = `${clsId}.method.${mname}`;
    nodes[id] = {
      id, name: mname, kind: "method",
      doc, docSegs: await segmentize(doc, id),
      // Prose describes a member; it does not decide whether the member exists.
      // Membership in the check block does — everything else stays structural-only.
      api: doc !== null || callable.has(mname),
      source: { file: m.file, line: m.line },
      parent: clsId, seeAlso: [],
      signature: m.signature,
      returns: m.returns,
      // a GETTER is a read-only member, not a call — carried so the reference
      // renders it as `childViews: readonly View[]`, without parens
      ...(m.getter === true ? { getter: true, readOnly: true } : {}),
    };
    methods.push(id);
  }

  for (const ev of schema.events ?? []) {
    const id = `${clsId}.event.${ev}`;
    const handler = "on" + ev[0].toUpperCase() + ev.slice(1);
    // Event prose is keyed by the HANDLER name (`## onRepeat`) — Animator really
    // does have BOTH a `repeat` attribute and a `repeat` event, which is why the
    // handler spelling exists. But half the corpus wrote the EVENT name
    // (`## keyDown`), and those bound to nothing at all: 13 documented events
    // rendered blank. Both spellings are accepted now, the bare one only when
    // no attribute of that name can claim it — so the collision stays impossible
    // and nobody's prose is silently dropped. The gate below keeps it honest.
    const doc = prose.members[handler]
      ?? (schema.attrs?.[ev] === undefined ? prose.members[ev] ?? null : null);
    nodes[id] = {
      id, name: ev, kind: "event",
      doc, docSegs: await segmentize(doc, id), api: doc !== null,
      source: { file: "runtime/src/schema.ts", line: 0 },
      parent: clsId, seeAlso: [],
      // the payload rides the signature — the model must advertise what a
      // handler RECEIVES (`onKeyUp(e: KeyEvent)`), not empty parens; EVENT_PAYLOAD
      // is the runtime's own table, so the two cannot drift. The parameter NAME
      // is the corpus convention per event (`onFrame(dt: …)`, `onInput(v: …)`).
      signature: EVENT_PAYLOAD[ev] !== undefined
        ? `${handler}(${({ frame: "dt", input: "v", link: "href", focusChange: "v", geometry: "g" })[ev] ?? "e"}: ${EVENT_PAYLOAD[ev]})`
        : `${handler}()`,
    };
    events.push(id);
  }

  const baseName = schema.base?.name ?? null;
  if (baseName) (subclassIndex[baseName] ??= []).push(clsId);

  nodes[clsId] = {
    id: clsId, name, kind: "class",
    doc: prose.class, docSegs: await segmentize(prose.class, clsId), api: prose.class !== null,
    source: { file: "runtime/src/schema.ts", line: 0 },
    parent: null, seeAlso: [],
    extends: baseName,
    abstract: !INSTANTIABLE.has(name),
    subclasses: [],                                     // filled below
    origin: "ts",
    attributes, methods, events,
    example: await readExample(clsId),
  };
  roots.push(clsId);
}

// ── the standard library: components authored as .declare (library/*.declare).
// Their doc surface is not in the runtime SCHEMAS — it lives in the source: the
// header /* # Name … */ block is the class prose, and the DECLARED members
// (body.decls, body.methods) are the public interface (body.attrs are internal
// style overrides — excluded). A declared member IS the API, so it is @api by
// declaration (unlike the built-ins, where prose gates @api). Parsed with a
// throwaway `App []` root so the program parser accepts a class-only file, and
// emitted in the SAME node shape so the reference and tree treat them uniformly.
const renderDefault = (def) =>
  !def ? null
  : def.kind === "string" ? JSON.stringify(def.value)
  : def.kind === "number" ? String(def.value)
  : def.kind === "ident"  ? def.name              // false / true / null
  : null;                                         // computed/complex — omit
// The header block is the class's doc surface, and it uses the SAME `## name`
// convention as tools/internal/doc/prose/<Class>.md — one shape for both halves of
// the corpus, and for a .declare class the prose sits in the file the member is
// declared in, which is where the author is already looking.
//
// Until this existed, every declared library member was `doc: null` BY
// CONSTRUCTION: 295 members across 44 classes, blank not because nobody wrote the
// prose but because there was nowhere to put it.
//
// A section whose body opens with `**Internal.**` is DELIBERATELY undocumented —
// the marker (`isSegmented`, `isTable`: the wrap-probe discipline) that lets a
// sibling identify its parent, and which a .declare class cannot avoid declaring
// because it has no undeclared reactive cells. Whether something is API is an
// editorial judgment, not a runtime fact, so it lives here and not in the grammar.
// Recorded so a coverage gate can tell "marked not-API" from "nobody wrote it":
// silence and a decision must not look the same.
//
// A file may hold SEVERAL classes (icons/icon.declare is Icon + IconHost;
// icons/core.declare is six marks). Each `/* # Name … */` block is claimed by the
// class its heading names, so those classes stop sharing one lead — before this,
// every class in a shared file rendered the FIRST block's prose, so `IconHost`'s
// page was Icon's essay and six icon classes were six copies of one paragraph.
// A compound heading (`# Table / TableRow`, `# RadioGroup / Radio`) names both and
// is claimed by both, which is what those files already meant; a class no heading
// names falls back to the first block, so single-class files are unchanged.
const headingNames = (block) => {
  const h = block.match(/^\s*#\s+([^\n]+)/);
  if (!h) return [];
  return h[1].split(/[—–-]/)[0].split("/").map((s) => s.trim()).filter(Boolean);
};
const blocksOf = (src) => [...src.matchAll(/\/\*([\s\S]*?)\*\//g)].map((m) => m[1]);
const headerProse = (src, cls) => {
  const blocks = blocksOf(src);
  if (!blocks.length) return { class: null, members: {}, methods: {}, internal: new Set() };
  const own = cls ? blocks.find((b) => headingNames(b).includes(cls)) : null;
  const blockIndex = own ? blocks.indexOf(own) : 0;
  const text = (own ?? blocks[0]).replace(/^\s*#\s*\S[^\n]*\n/, "");   // drop the leading "# Name" line
  const parts = text.split(/^## +(.+)$/m);
  const members = {}, methods = {}, internal = new Set();
  for (let i = 1; i < parts.length; i += 2) {
    const head = parts[i].trim(), body = (parts[i + 1] ?? "").trim();
    const asMethod = head.match(/^([A-Za-z_$][\w$]*)\(\)$/);
    const name = asMethod ? asMethod[1] : head;
    if (/^\*\*Internal\.\*\*/.test(body)) internal.add(name);
    (asMethod ? methods : members)[name] = body;
  }
  return { class: parts[0].trim() || null, members, methods, internal, blockIndex };
};
const LIBRARY = JSON.parse(readFileSync(path.join(ROOT, "library/autoincludes.json"), "utf8"));
for (const [tag, file] of Object.entries(LIBRARY)) {
  if (tag.startsWith("$") || typeof file !== "string") continue;  // $provide etc.
  const rel = "library/" + file;
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs) || nodes[tag]) continue;
  const src = readFileSync(abs, "utf8");
  let cls;
  try { cls = parseProgram(src + "\nApp [ ]\n").classes.find((c) => c.name === tag); } catch { cls = null; }
  if (!cls) continue;
  const prose = headerProse(src, tag);
  PROSE[tag] = prose;
  // the class's SET attributes (`name = value` — a re-default of an inherited slot,
  // an override) and its source slice, for the post-pass below
  {
    const all = parseProgram(src + "\nApp [ ]\n").classes.map((c) => c.pos?.offset ?? 0).filter((o) => o > (cls.pos?.offset ?? 0)).sort((a, b) => a - b);
    LIB_SRC[tag] = src.slice(cls.pos?.offset ?? 0, all[0] ?? src.length);
    LIB_SETS[tag] = cls.body.attrs.map((a) => ({ name: a.name, value: a.value, col: (a.value?.pos?.col ?? 1) - 1 }));
  }
  const attributes = [], methods = [], events = [];
  for (const d of cls.body.decls) {
    const id = `${tag}.${d.name}`;
    const pd = prose.members[d.name] ?? null;
    nodes[id] = { id, name: d.name, kind: "attribute", doc: pd, docSegs: await segmentize(pd, id),
      api: !prose.internal.has(d.name), internal: prose.internal.has(d.name),
      source: { file: rel, line: 0 }, parent: tag, seeAlso: [],
      type: d.type, default: renderDefault(d.def),
      readOnly: !!d.readOnly, inheritedFrom: null };
    attributes.push(id);
  }
  for (const m of cls.body.methods) {
    const isEvent = /^on[A-Z]/.test(m.name);
    // ONE event vocabulary: keys carry the EVENT name (`Button.event.click`),
    // exactly as the runtime classes' entries do — a handler name is derived
    // (`on` + capitalized event), never a second key form. Before this, 21
    // library events sat under `Class.event.onClick` where the help tool's
    // class walk could not reach them, so `declare-help Button.onClick`
    // answered with View's inherited prose while Button's own sat unreachable
    // (found by the 2026-08-07 prose audit). Prose stays keyed by the handler
    // heading (`## onClick`), which is how the corpus writes it.
    const evName = isEvent ? m.name[2].toLowerCase() + m.name.slice(3) : m.name;
    const id = `${tag}.${isEvent ? "event" : "method"}.${evName}`;
    const pm = prose.methods[m.name] ?? prose.members[m.name] ?? null;
    nodes[id] = { id, name: evName, kind: isEvent ? "event" : "method", doc: pm, docSegs: await segmentize(pm, id),
      api: !prose.internal.has(m.name), internal: prose.internal.has(m.name),
      source: { file: rel, line: 0 }, parent: tag, seeAlso: [],
      signature: `${m.name}(${(m.params ?? []).map((p) => p.name ?? p).join(", ")})` };
    (isEvent ? events : methods).push(id);
  }
  const baseName = cls.base ?? null;
  if (baseName) (subclassIndex[baseName] ??= []).push(tag);
  nodes[tag] = { id: tag, name: tag, kind: "class",
    doc: prose.class, docSegs: await segmentize(prose.class, tag), api: true,
    source: { file: rel, line: 0 }, parent: null, seeAlso: [],
    extends: baseName, subclasses: [], origin: "library",
    attributes, methods, events, example: await readExample(tag) };
  roots.push(tag);
}

// reverse edge: subclasses (only among documented classes carry a live link)
for (const [base, subs] of Object.entries(subclassIndex)) {
  if (nodes[base]) nodes[base].subclasses = subs;
}

// the audit for LIBRARY classes: a `## heading` in a .declare header block that
// binds to no own attribute, own method, event handler, or OVERRIDDEN inherited
// attribute (below) is prose the page silently drops. Runtime classes have had
// this gate since the 2026-08-07 audit; the library had none.
// Classes that read the SAME block (a "DataGrid / Column / GridRow" heading, or
// a class with no block of its own falling back to the file's first) are one
// documentation unit: a heading is bound if any class in the unit owns it.
{
  const units = new Map();                                // file#block → [tags]
  for (const tag of Object.keys(LIB_SRC)) {
    const key = LIBRARY[tag] + "#" + (PROSE[tag].blockIndex ?? 0);
    (units.get(key) ?? units.set(key, []).get(key)).push(tag);
  }
  for (const [key, tags] of units) {
    const own = new Set(), sets = new Set(), handlers = new Set(), meths = new Set();
    for (const tag of tags) {
      for (const id of nodes[tag].attributes) own.add(nodes[id].name);
      for (const x of LIB_SETS[tag]) sets.add(x.name);
      for (const id of nodes[tag].events) handlers.add("on" + nodes[id].name[0].toUpperCase() + nodes[id].name.slice(1));
      for (const id of nodes[tag].methods) meths.add(nodes[id].name);
    }
    const prose = PROSE[tags[0]];
    const file = key.split("#")[0];
    for (const head of Object.keys(prose.members)) {
      if (own.has(head) || sets.has(head) || handlers.has(head)) continue;
      unboundProse.push(`library/${file}: '## ${head}' binds to no attribute, override, or event of ${tags.join("/")}`);
    }
    for (const head of Object.keys(prose.methods)) {
      if (meths.has(head)) continue;
      unboundProse.push(`library/${file}: '## ${head}()' binds to no method of ${tags.join("/")}`);
    }
  }
}

// ANCESTRY, precomputed: `chain` is the class's own name followed by every base
// up to the root (Button → Control → View → Node). The model stays NORMALIZED —
// inherited members are NOT copied into each class, which would multiply the
// file and invite drift — but every consumer needs the walk, so it is done once
// here. (Before 2026-07-28 there was no walk to do: View's base was null and
// every chain stopped one link in.)
for (const n of Object.values(nodes)) {
  if (n.kind !== "class") continue;
  const chain = [];
  for (let c = n.name; c && !chain.includes(c); c = nodes[c]?.extends) chain.push(c);
  n.chain = chain;
}

// ── the class page's other three facts, computed once the chain exists ──
//
// SIBLINGS: the base's other subclasses — a leaf has no subclasses, and "what
// else is a Control" is the next question its page gets asked.
//
// READS: what the class's own body reads from ABOVE — `theme.<token>` and
// `provided("…")` — its contract with whatever contains it. A library class
// is scanned at the source; a runtime class reads no named token in its own
// code (its slots default to null, the house look resolved at paint).
//
// OVERRIDES: an inherited attribute the class re-defaults. A library class
// does it with a bare `name = value` in its body; a runtime class by
// re-declaring the slot in its own schema (App.scrollY). Each becomes an
// attribute node of its own on the overriding class — `overrides: { from, was }`
// naming the ancestor that declares the slot and its default there, `default`
// the new one AS WRITTEN (a multi-line `{ }` keeps its lines, dedented to the
// column its value starts on), and `doc` the class's own `## name` section: the
// INTENT of the override, one to three sentences. The ancestor's page keeps the
// attribute's meaning; the override line links there.
const ownerOf = (cls, attr) => cls.chain.slice(1).find((a) => nodes[a]?.attributes.some((id) => nodes[id].name === attr)) ?? null;
for (const c of Object.values(nodes)) {
  if (c.kind !== "class") continue;
  const base = c.extends ? nodes[c.extends] : null;
  c.siblings = base ? base.subclasses.filter((s) => s !== c.id) : [];
  const src = LIB_SRC[c.id] ?? "";
  c.reads = {
    theme: [...new Set([...src.matchAll(/theme\.([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1]))].sort(),
    provided: [...new Set([...src.matchAll(/provided\("([^"]+)"/g)].map((m) => m[1]))].sort(),
  };
  const prose = PROSE[c.id] ?? { members: {} };
  // a method an ancestor also has — an override (Button.press over Control.press)
  for (const id of c.methods) {
    const m = nodes[id];
    const from = c.chain.slice(1).find((a) => nodes[a]?.methods.some((x) => nodes[x].name === m.name)) ?? null;
    if (from) m.overrides = { from, was: null };
  }
  // a runtime class's own attribute that an ancestor also declares
  for (const id of c.attributes) {
    const a = nodes[id];
    const from = ownerOf(c, a.name);
    if (from) a.overrides = { from, was: nodes[`${from}.${a.name}`]?.default ?? null };
  }
  // a library class's bare sets on inherited slots
  for (const set of LIB_SETS[c.id] ?? []) {
    const from = ownerOf(c, set.name);
    if (!from) continue;                                  // a provision (textColor on a Button) — no ancestor declares it
    const anc = nodes[`${from}.${set.name}`];
    let text;
    if (set.value?.kind === "code") {
      const lines = set.value.src.replace(/^ /, "").replace(/ $/, "").split("\n");
      text = "{ " + lines.map((l, i) => (i === 0 ? l : l.replace(new RegExp("^ {0," + set.col + "}"), ""))).join("\n") + " }";
    } else text = renderDefault(set.value);
    const doc = prose.members[set.name] ?? null;
    const id = `${c.id}.${set.name}`;
    nodes[id] = { id, name: set.name, kind: "attribute", doc, docSegs: await segmentize(doc, id), api: true, internal: false,
      source: { file: "library/" + LIBRARY[c.id], line: set.value?.pos?.line ?? 0 }, parent: c.id, seeAlso: [],
      type: anc?.type ?? "", default: text, readOnly: false, inheritedFrom: null,
      overrides: { from, was: anc?.default ?? null } };
    c.attributes.push(id);
  }
}

// (No buildId here, deliberately. The extractor once baked the id from
// bundles/version.json into its output — a genuine CYCLE, since stamp-version
// writes that file after hashing bundles/cache, which prewarm derives from this
// tool's outputs. The committed model always trailed by one build. The id is
// assemble's to stamp: it runs after stamp-version by declared dependency and
// reads the final answer.)

// derived projection for array-based renderers (the Declare doc app) — same node
// objects, inlined as arrays so datapath replication can walk them. The reference
// shows only the DOCUMENTED (@api) surface (doc-system.md: "absence = internal,
// excluded"); the full `nodes` map keeps everything for the object browser.
// ── the CLASS GROUPS — the reference rail's order, chosen rather than inherited.
// Without this the rail is the extractor's traversal (schema registration order,
// then the autoinclude manifest): topical by accident, seamless. Each group is a
// topic; inside one the base class leads and the rest follow by reach, not by
// alphabet (which would put Radio before RadioGroup). The gate below files EVERY
// documented class exactly once — a new class fails extract until it is placed.
const CLASS_GROUPS = [
  ["Core",          ["View", "App", "Node"]],
  ["Text",          ["Text", "TextLabel", "RichText", "Markdown", "HTMLText"]],
  ["Media",         ["Image", "Media", "Video", "Audio"]],
  ["Layout",        ["Layout", "SimpleLayout", "WrappingLayout", "ResponsiveLayout", "TweenLayout", "Spacer"]],
  ["Controls",      ["Control", "Button", "Checkbox", "Switch", "Slider", "RadioGroup", "Radio", "Field", "Editor", "TextInput", "Combobox", "Segmented", "SegmentedItem", "ProgressBar", "FocusRing"]],
  ["Chrome",        ["Bar", "MenuBar", "Menu", "ContextMenu", "Dialog", "Tooltip", "Accordion", "Pane"]],
  ["Data",          ["Dataset", "DataSource", "Stream", "EventStream", "Socket", "Table", "TableRow", "DataGrid", "Column", "GridRow"]],
  ["Motion and state", ["Animator", "AnimatorGroup", "Spring", "State", "Time"]],
  ["Services",      ["Keys", "Focus", "Tip"]],
  ["Embedding",     ["DOMIsland", "AppIsland"]],
  ["Icons",         ["Icon", "IconHost", "ArrowIcon", "ChevronIcon", "CheckIcon", "CloseIcon", "PlusIcon", "MinusIcon", "LightbulbIcon", "SunIcon", "MoonIcon", "AutoIcon"]],
];
const groupProblems = [];
{
  const filed = new Map();
  for (const [g, names] of CLASS_GROUPS) for (const n of names) {
    if (filed.has(n)) groupProblems.push(`class ${n} is filed twice (${filed.get(n)}, ${g})`);
    filed.set(n, g);
    if (!roots.includes(n)) groupProblems.push(`group '${g}' files ${n}, which is not a documented class`);
  }
  for (const id of roots) if (!filed.has(id)) groupProblems.push(`class ${id} is in no group — file it in CLASS_GROUPS (extract.mjs)`);
}
const classGroups = CLASS_GROUPS.map(([name, names]) => ({ name, classes: names.filter((n) => roots.includes(n)).map((n) => ({ name: n })) }));

const tree = roots.map((id) => {
  const c = nodes[id];
  return {
    id: c.id, name: c.name, doc: c.doc, docSegs: c.docSegs, api: c.api,
    extends: c.extends, chain: c.chain, abstract: c.abstract === true, subclasses: c.subclasses, origin: c.origin,
    attributes: c.attributes.map((a) => nodes[a]).filter((n) => n.api),
    events: c.events.map((e) => nodes[e]).filter((n) => n.api),
    methods: c.methods.map((m) => nodes[m]).filter((n) => n.api),
    example: c.example,
    siblings: c.siblings, reads: c.reads,
    source: c.source?.file ?? null,
  };
});

// ── the developer's guide — narrative chapters from docs/guide/*.md ──
// Each `NN-slug.md` becomes a chapter { id, num, title, part, markdown, demo }.
// A chapter may embed ONE runnable demo via a `<!-- demo: <Class> -->` marker
// (reusing the reference's demo corpus); the marker is stripped from the prose.
// `declare-docs:` symbolic links and http links are KEPT — the docs app resolves
// them (openDocLink answers the Markdown's onLink); any remaining raw file-path
// link is flattened to its text (nothing in-app can open a bare path). `guide`
// is the flat list the detail pane renders; `guideParts` groups it by Part.
async function readGuide() {
  const dir = path.join(ROOT, "docs/guide");
  if (!existsSync(dir)) return { guide: [], guideParts: [] };
  // Parts group by chapter number: <20 Orientation, <30 Fundamentals, <90 In
  // Depth, >=90 Internals (maintainer notes on how this docs app is built — not
  // framework API, deliberately last and clearly labelled).
  const partOf = (num) => (num < 20 ? "Orientation" : num < 30 ? "Fundamentals" : num < 90 ? "In Depth" : "Internals");
  const files = readdirSync(dir).filter((f) => /^\d+-.+\.md$/.test(f)).sort();
  const guide = await Promise.all(files.map(async (f) => {
    const num = parseInt(f, 10);
    let md = readFileSync(path.join(dir, f), "utf8");
    const title = (md.match(/^#\s+(.+)$/m)?.[1] ?? f).trim();
    // Explicit overrides, captured BEFORE the comment strip below eats them:
    // <!-- nav: Relationships -->  a short rail label (the H1 stays the content
    // title — thesis-sentence titles don't fit a 248px rail); <!-- part: The idea -->
    // names the chapter's Part directly (else the number-range rule decides).
    const navm = md.match(/<!--\s*nav:\s*(.+?)\s*-->/);
    const partm = md.match(/<!--\s*part:\s*(.+?)\s*-->/);
    let demo = [];
    const dm = md.match(/<!--\s*demo:\s*(\w+)\s*-->/);
    if (dm) { demo = await readExample(dm[1]); md = md.replace(dm[0], ""); }
    md = md
      .replace(/<!--[\s\S]*?-->/g, "")                       // drop any remaining HTML comments
      .replace(/\[([^\]]+)\]\((?!https?:|declare-docs:)[^)]*\)/g, "$1")   // flatten raw path links; keep http + declare-docs:
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const short = navm ? navm[1] : title.split("—")[0].trim();   // rail label: nav marker, else text before the em-dash
    const id = f.replace(/\.md$/, "");
    return { id, num, title, short, part: partm ? partm[1] : partOf(num), segs: await segmentize(md, "ch_" + id), demo };
  }));
  const guideParts = [];
  for (const ch of guide) {
    let g = guideParts.find((p) => p.part === ch.part);
    if (!g) guideParts.push((g = { part: ch.part, chapters: [] }));
    g.chapters.push({ id: ch.id, num: ch.num, title: ch.title, short: ch.short });
  }
  return { guide, guideParts };
}
const { guide, guideParts } = await readGuide();

// ── the tenets — the language's commitments (docs/tenets/*.md) ──
// The interpretively-distilled promises the platform holds itself to (see
// docs/tenets/README.md). Pure prose, no runnable demos — carried INLINE in the
// model (they are small) so any reader has them whole: the docs app, or an LLM
// writing Declare that wants the language's intent alongside the reference. Files
// are `NN Word.md`; the leading number orders them, the Word is an opaque label.
async function readTenets() {
  const dir = path.join(ROOT, "docs/tenets");
  if (!existsSync(dir)) return [];
  return await Promise.all(readdirSync(dir).filter((f) => /^\d+ .+\.md$/.test(f)).sort().map(async (f) => {
    const num = parseInt(f, 10);
    let md = readFileSync(path.join(dir, f), "utf8");
    const title = (md.match(/^#\s+(.+)$/m)?.[1] ?? f).trim();
    md = md.replace(/<!--[\s\S]*?-->/g, "").replace(/\n{3,}/g, "\n\n").trim();
    return { id: "tenet-" + num, num, title, name: f.replace(/\.md$/, ""), segs: await segmentize(md, "tenet_" + num) };
  }));
}
const tenets = await readTenets();

// write the generated inline-example demo files (the server/host seed them by filename),
// cleaning stale `seg_*` from a prior run first so nothing orphans. Hand-authored demos
// (View.declare, State.declare, …) never start with `seg_`, so they're untouched.
if (!CHECK) for (const f of readdirSync(DEMOS)) {
  if (/^seg_.*\.declare$/.test(f)) unlinkSync(path.join(DEMOS, f));
}
// Written through the FORMATTER. A guide fence is prose-shaped — the author packs
// it for the page, not for canon — so emitting it verbatim produced generated files
// that failed `format --check` the moment they were regenerated. Hand-formatting them
// is futile: the next extract undoes it. Canon has to be produced at the source, so
// the one place these files come from is the one place it is applied.
if (!CHECK) for (const [id, src] of Object.entries(genFiles)) {
  writeFileSync(path.join(DEMOS, id + ".declare"), canonize(src + "\n"));
}

// ── per-chapter content files (apps/docs/chapters/<id>.json) ──
// The model carries the guide SPINE (id/num/title/short/part — what the rail
// and cross-links need); each chapter's content ({ segs, demo }) is its own
// generated file, fetched by the chapter's DataSource. Boot loads the spine
// and streams chapters behind it; the crawl fetches them through the data
// resolver, so a missing chapter fails the build loudly (never a silently
// thinner document). Stale files from renamed/removed chapters are cleaned
// first so nothing orphans.
const CHAPTERS = path.join(ROOT, "apps/docs/chapters");
if (!existsSync(CHAPTERS)) mkdirSync(CHAPTERS);
const live = new Set(guide.map((ch) => ch.id + ".json"));
for (const f of readdirSync(CHAPTERS)) {
  if (f.endsWith(".json") && !live.has(f)) unlinkSync(path.join(CHAPTERS, f));
}
for (const ch of guide) {
  writeFileSync(path.join(CHAPTERS, ch.id + ".json"), JSON.stringify({ segs: ch.segs, demo: ch.demo }) + "\n");
}
const spine = guide.map(({ id, num, title, short, part }) => ({ id, num, title, short, part }));

// ── the language forms (tools/internal/doc/forms.md) ──
// The registry of every form the grammar accepts — keyword, delimiter, operator,
// member shape — one `## slug` section each, in the anatomy the file's own preamble
// states. Parsed here into `forms`: the grouped INDEX (slug, display name, gist)
// and one PAGE per form (syntax, lead, usage demos by the same readExample the
// class pages use, RULES each quoting the checker verbatim with the probe that
// provokes it, related). The gate: every form has a page, a usage demo, and at
// least one rule; and every probe COMPILES TO ITS SENTENCE — a page can never
// quote a diagnostic the compiler no longer says.
const FORMS_MD = path.join(ROOT, "tools/internal/doc/forms.md");
const formsProblems = [];
async function readForms() {
  if (!existsSync(FORMS_MD)) return { groups: [], pages: {} };
  const md = readFileSync(FORMS_MD, "utf8");
  const secs = md.split(/^## (?=\S)/m).slice(1).map((t) => { const [head, ...rest] = t.split("\n"); return { slug: head.trim(), body: rest.join("\n") }; });
  const pages = {}; const groups = []; const order = [];
  for (const sec of secs) {
    const b = sec.body;
    const field = (k) => (b.match(new RegExp("^" + k + ":\\s*(.*)$", "m")) ?? [])[1]?.trim() ?? "";
    const syntax = (b.match(/^syntax:\n((?:    .*\n)+)/m) ?? [])[1]?.split("\n").filter(Boolean).map((l) => l.replace(/^    /, "")) ?? [];
    const lead = b.split(/^### rules/m)[0].replace(/^(name|short|group|family|spec|terms|syntax|usage):.*$/gm, "").replace(/^    .*$/gm, "").trim();
    const rulesText = (b.split(/^### rules/m)[1] ?? "").split(/^### related/m)[0];
    const rules = [...rulesText.matchAll(/^- ([\s\S]*?)\n\s*> says: (.*)\n(?:\s*> probe: (.*)\n)?/gm)]
      .map((m) => ({ rule: m[1].replace(/\n\s+/g, " ").trim(), says: m[2].trim(), probe: (m[3] ?? "").replace(/\\n/g, "\n") }));
    const rel = (b.split(/^### related/m)[1] ?? "");
    const list = (k) => ((rel.match(new RegExp("^" + k + ":\\s*(.*)$", "m")) ?? [])[1] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    // guide entries are `NN-slug · Title` — a title may carry commas, so the list
    // splits only before a chapter id
    const guide = (((rel.match(/^guide:\s*(.*)$/m) ?? [])[1] ?? "").split(/,\s*(?=\d\d-)/).map((x) => x.trim()).filter(Boolean))
      .map((g) => { const [chapter, title] = g.split("·").map((x) => x.trim()); return { chapter, title: title ?? chapter }; });
    const usage = [];
    for (const id of field("usage").split(",").map((x) => x.trim()).filter(Boolean)) usage.push(...(await readExample(id)));
    const gist = lead.split(/(?<=\.)\s/)[0].replace(/\n/g, " ");
    const page = { slug: sec.slug, name: field("name") || sec.slug, group: field("group") || "Other", family: field("family"), spec: field("spec"),
      terms: field("terms").split(",").map((x) => x.trim()).filter(Boolean),
      syntax, syntaxText: syntax.join("\n"), lead, docSegs: await segmentize(lead, "form_" + sec.slug), gist, rules, related: { forms: list("forms"), classes: list("classes"), guide }, example: usage };
    pages[sec.slug] = page; order.push(sec.slug);
    let g = groups.find((x) => x.name === page.group);
    if (!g) { g = { name: page.group, forms: [] }; groups.push(g); }
    g.forms.push({ slug: sec.slug, name: page.name, short: field("short") || page.name, gist });
    // the gate
    if (!usage.length) formsProblems.push(`forms.md '## ${sec.slug}': no usage demo (apps/docs/demos/${field("usage") || "form-" + sec.slug}.declare)`);
    if (!rules.length) formsProblems.push(`forms.md '## ${sec.slug}': no rules`);
    for (const r of rules) {
      if (!r.probe) { formsProblems.push(`forms.md '## ${sec.slug}': rule "${r.rule.slice(0, 40)}…" has no probe`); continue; }
      let msgs = [];
      try {
        const out = await compile(r.probe, {});
        msgs = (out.errors ?? []).map((e) => e.message.replace(/\s+/g, " "));
        if (!msgs.length && out.source) {
          try { const app = settleHeadless(out.source, { deps: out.deps }); app.discard(); }
          catch (e) { msgs = [String(e?.message ?? e).replace(/\s+/g, " ")]; }
        }
      } catch (e) { msgs = [String(e?.message ?? e).replace(/\s+/g, " ")]; }
      if (!msgs.some((m) => m.includes(r.says))) formsProblems.push(`forms.md '## ${sec.slug}': the checker no longer says "${r.says.slice(0, 60)}…" for its probe (it says: ${(msgs[0] ?? "nothing").slice(0, 120)})`);
    }
  }
  const intro = `Every form the grammar accepts — ${order.length} of them, in ${groups.length} groups. Each is a page: its syntax, what it is, live usage, the rules the compiler enforces in the checker's own words, and what it relates to. \`declare.md\` is the same language in one file, in order; these are its forms one at a time, for the reader who arrived with a keyword.`;
  return { groups, pages, order, docSegs: await segmentize(intro, "forms_intro") };
}
const forms = await readForms();

// ── the search index (apps/docs/search-index.json) ──
// One flat PLAIN-TEXT projection of everything the docs app can navigate to —
// guide chapters and the documented reference surface — for the header search
// (docs.declare). Emitted HERE because this is the one place that holds all
// the prose in structured form; Markdown is stripped at build time so both
// matching and snippets are clean at runtime, and per-member entries give
// results their precise names (View.width, not just View). The app fetches
// this only when search is first used (the demand-loading contract — never at
// boot), and the artifact rides the same derive freshness gates as the
// chapters it summarizes.
function plainText(md) {
  if (!md) return "";
  return md
    .replace(/```[a-z-]*\n([\s\S]*?)```/g, " $1 ")   // keep fence text (API names are searched), drop the fence
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")         // links → their text
    .replace(/^#{1,6}\s+/gm, "")                     // heading markers (the text stays)
    .replace(/[*_]{1,3}([^*_\n]+)[*_]{1,3}/g, "$1")  // emphasis
    .replace(/^\s*[-+*]\s+/gm, "")                   // list bullets
    .replace(/\*+/g, " ")                            // stray emphasis markers (nested md — code inside bold — defeats the pair regex; `_` stays, it's identifier material)
    .replace(/\|/g, " ")                             // table pipes
    .replace(/\s+/g, " ")
    .trim();
}
const segText = (segs) =>
  segs.map((s) => [plainText(s.md), ...(s.code ?? []).map((c) => c.source)].join(" ")).join(" ").replace(/\s+/g, " ").trim();
const searchEntries = [];
for (const ch of guide) {
  searchEntries.push({ loc: "guide/" + ch.id, title: ch.num + ". " + ch.short, crumb: "Guide · " + ch.part, text: segText(ch.segs) });
}
for (const c of tree) {
  searchEntries.push({ loc: "reference/" + c.name, title: c.name, crumb: "Reference · class", text: plainText(c.doc ?? "") });
  for (const [kind, list] of [["attribute", c.attributes], ["method", c.methods], ["event", c.events]]) {
    for (const m of list) {
      searchEntries.push({
        loc: "reference/" + c.name, title: c.name + "." + m.name, crumb: "Reference · " + kind,
        text: [plainText(m.doc ?? ""), m.signature ?? "", m.type ?? ""].filter(Boolean).join(" "),
      });
    }
  }
}
for (const slug of forms.order ?? []) {
  const f = forms.pages[slug];
  searchEntries.push({ loc: "language/" + slug, title: f.name, crumb: "Language · " + f.group, text: [f.terms.join(" "), plainText(f.lead), f.syntax.join(" "), f.rules.map((r) => r.rule).join(" ")].join(" ").replace(/\s+/g, " ").trim() });
}
if (!CHECK) {
  writeFileSync(path.join(ROOT, "apps/docs/search-index.json"), JSON.stringify({ v: 1, entries: searchEntries }) + "\n");
}

// One author per committed file: this model is the intermediate assemble reads
// (see OUT above), so there is nothing of assemble's to preserve and no way for
// a bare extract to corrupt the committed artifact any more — the carry-forward
// hack that used to live here is dead by construction.
const model = { version: 1, reference: nodes, roots, tree, classGroups, guide: spine, guideParts, tenets, forms };
if (!CHECK) {
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(model, null, 2) + "\n");
}

// ── report ──
const counts = Object.values(nodes).reduce((a, n) => ((a[n.kind] = (a[n.kind] ?? 0) + 1), a), {});
const documented = Object.values(nodes).filter((n) => n.api).length;
console.log(`extract: wrote ${path.relative(ROOT, OUT)}`);
console.log(`  classes: ${roots.join(", ")}`);
console.log(`  nodes:   ${Object.keys(nodes).length} (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")})`);
console.log(`  guide:   ${guide.length} chapters in ${guideParts.length} parts (${guideParts.map((p) => p.part + ":" + p.chapters.length).join(", ")})`);
console.log(`  tenets:  ${tenets.length} (${tenets.map((t) => t.title).join(" · ")})`);
console.log(`  islands: ${Object.keys(genFiles).length} inline runnable examples written to apps/docs/demos/seg_*.declare`);
console.log(`  search:  ${searchEntries.length} index entries (${Math.round(JSON.stringify(searchEntries).length / 1024)}KB) → apps/docs/search-index.json`);
console.log(`  @api:    ${documented} documented / ${Object.keys(nodes).length - documented} structural-only`);

// The prose-binding gate: a `## heading` nobody claimed is prose the reference
// silently drops. Always reported; fatal under `--check` (the ops gate).
// ── the coverage gates: every documented, non-abstract class has a usage example;
//    every expression override carries its intent ──
const coverage = [];
for (const c of tree) {
  const has = (c.example && c.example.length) || (c.docSegs || []).some((sg) => (sg.code || []).length);
  if (!c.abstract && !has) coverage.push(`${c.id}: no usage example (apps/docs/demos/${c.id}.declare, or a compiling \`\`\`declare fence in its prose)`);
  for (const a of c.attributes) if (a.overrides && !a.doc && /^\{/.test("" + a.default)) coverage.push(`${c.id}.${a.name}: an expression override with no intent — add '## ${a.name}' to the class's prose`);
}
// A fence that compiles becomes a LIVE island — and an island that settles to
// nothing visible (no fill, no text, no image, no drawing anywhere) is an empty
// frame under a code box: the reader gets "runs live below" and sees nothing.
// Such a fence is either made to render, or marked ```declare-fragment (static).
const blankIslands = [];
for (const [id, src] of Object.entries(genFiles)) {
  try {
    const out = await compile(src, {});
    if (out.errors?.length) continue;
    const app = settleHeadless(out.source, { deps: out.deps, env: { hostWidth: 640, hostHeight: 240 } });
    let seen = 0;
    const walk = (v) => {
      if (v !== app && v.visible !== false && ((v.fill != null && v.width > 0 && v.height > 0) || (typeof v.text === "string" && v.text !== "") || v.source || typeof v.draw === "function")) seen++;
      for (const c of v.children ?? []) walk(c);
    };
    walk(app);
    app.discard();
    if (seen === 0) blankIslands.push(`${id}: the fence compiles but paints nothing — give it something to show, or mark it \`\`\`declare-fragment`);
  } catch { /* a fence that needs a browser to settle is not judged here */ }
}
for (const b of blankIslands) coverage.push(b);
if (coverage.length > 0) {
  console.log(`  COVERAGE: ${coverage.length} gap(s)`);
  for (const u of coverage) console.log(`    ${u}`);
  if (CHECK) process.exitCode = 1;
}
if (groupProblems.length > 0) {
  console.log(`  CLASS GROUPS: ${groupProblems.length} problem(s)`);
  for (const u of groupProblems) console.log(`    ${u}`);
  if (CHECK) process.exitCode = 1;
}
if (formsProblems.length > 0) {
  console.log(`  LANGUAGE FORMS: ${formsProblems.length} problem(s)`);
  for (const u of formsProblems) console.log(`    ${u}`);
  if (CHECK) process.exitCode = 1;
}
if (unboundProse.length > 0) {
  console.log(`  UNBOUND prose headings: ${unboundProse.length}`);
  for (const u of unboundProse) console.log(`    ${u}`);
  if (CHECK) process.exit(1);
}
