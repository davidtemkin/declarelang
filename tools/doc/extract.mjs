// tools/doc/extract.mjs — THE EXTRACTOR: source ──► model.json (tools/doc/model.ts).
//
// Vertical slice: the three canonical view classes (View, Text, Image). Structure
// is read losslessly from the runtime's own `ComponentSchema` chain (runtime/dist)
// so it CANNOT drift from the checker; defaults are read from the `defineAttributes`
// specs in the runtime source via the TypeScript compiler API (design/doc-system.md
// §"Structure generation" — schema ⨝ decoration ⨝ tsc). Prose + the @api surface
// come, for the slice, from keyed Markdown files under tools/doc/prose/ (the
// file-prose path doc-system.md blesses) — later swapped for captured `/* *​/`
// blocks with no change to this model or the renderer.
//
//   node tools/doc/extract.mjs        # writes examples/docs/model.json
//
// Run after `npm run build` (needs runtime/dist).

import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { SCHEMAS } from "../../runtime/dist/schema.js";
import { compile } from "../../compiler/dist/compile-node.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TARGETS = [                                        // the documented component surface
  "View", "App", "Text", "Image", "Markdown", "HTMLText", "HTML", "TextInput",
  "SimpleLayout", "WrappingLayout", "TweenLayout",
  "Dataset", "DataSource",
  "Animator", "AnimatorGroup", "Spring", "State", "Node",
];
const OUT = path.join(ROOT, "examples/docs/model.json");
const DEMOS = path.join(ROOT, "examples/docs/demos");         // generated islands land here (server seeds them)

// ── inline runnable examples: every prose ```declare block becomes a live edit/run
// island IF it compiles as a whole program — as written (a complete `App […]`, or a
// `class …` + `App`), or wrapped in `App [ … ]` for a bare view fragment. Each runnable
// block is WRITTEN as examples/docs/demos/<id>.declare so the server/host seed it into
// `app.demoSources[<id>]` exactly like the homepage demos, and the model records the
// prose as an ordered segment list the app renders (Markdown text, or an island).
const genFiles = {};                                          // id → source, written to DEMOS at the end
function compilesOK(src) { try { return !compile(src, {}).errors?.length; } catch { return false; } }
function runnableForm(block) {
  // A program needs an `App` root. If the block already has a top-level `App [` (a whole
  // program, or `class … App […]`), use it as written. Otherwise it's a view fragment —
  // wrap it in `App [ … ]` so it actually RUNS (a bare `View […]` compiles but has no root
  // and throws at runtime). Only forms that compile become islands; the rest stay static.
  if (/^App\s*\[/m.test(block)) return compilesOK(block) ? block : null;
  const wrapped = "App [\n" + block.split("\n").map((l) => "    " + l).join("\n") + "\n]";
  return compilesOK(wrapped) ? wrapped : null;
}
// slug → a filesystem/slot-safe id
function slug(s) { return s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }

// split prose Markdown into ordered segments: { md } for text/static-code, or
// { md:"", code:[{id, source, lines}] } for a runnable island (0-or-1 array so the app
// constructs the island by datapath replication). Merges runs of plain text.
function segmentize(md, idBase) {
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
    const run = runnableForm(block);
    if (run) {
      const id = "seg_" + slug(idBase) + "_" + n++;
      genFiles[id] = run;
      segs.push({ md: "", code: [{ id, source: run, lines: run.split("\n").length }] });
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
    case "number": return "number";
    case "boolean": return "boolean";
    case "string": return "string";
    case "color": return "Color";
    case "shape": return "Shape";
    case "enum": return t.tokens.join(" | ");
    case "component": return t.of;
    case "cursor": return "datapath";
    case "slotref": return "slot";
    case "record": return t.name;
    case "fill": return "Fill";
    case "stroke": return "Stroke";
    case "shadow": return "Shadow";
    case "motion": return "Motion";
    case "styles": return "Style[]";
    case "stylesheet": return "Stylesheet";
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
// Walks each `export class X { … }` and records its OWN public instance methods:
// name, parameter names+types, and return type — the authoritative signature, so
// it cannot drift from the code. Skips the constructor, `private`/`protected`, and
// `_`-prefixed internals. Inherited methods are reached through the `extends` edge
// (per-declaration model), exactly like attributes.
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
          if (!ts.isMethodDeclaration(m) || !m.name || !ts.isIdentifier(m.name)) continue;
          const mods = (ts.canHaveModifiers(m) ? ts.getModifiers(m) : undefined) ?? [];
          if (mods.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword || x.kind === ts.SyntaxKind.ProtectedKeyword)) continue;
          const name = m.name.text;
          if (name.startsWith("_")) continue;
          const params = m.parameters
            .filter((p) => ts.isIdentifier(p.name))
            .map((p) => ({ name: p.name.text, type: p.type ? p.type.getText(sf) : null, optional: !!p.questionToken }));
          const returns = m.type ? m.type.getText(sf) : "void";
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

// ── prose + @api surface, from tools/doc/prose/<Class>.md ──
// Format: the text before the first `## ` heading is the CLASS prose; each
// `## <name>` section is that member's prose, and a `## <name>()` heading (trailing
// parens) is a METHOD's prose — parked in its own map so `remove()` the method never
// collides with an `onRemove` event or a `remove` attribute. Presence ⇒ @api (for the
// slice; the explicit `@api` marker + coverage gate arrive with the block-capture parser).
function readProse(cls) {
  const abs = path.join(ROOT, "tools/doc/prose", cls + ".md");
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
  return { class: parts[0].trim() || null, members, methods };
}

// ── build the model ──
const nodes = {};
const roots = [];
const subclassIndex = {};                               // base name → [subclass names]

const DECOR = readDecorations(["runtime/src/view.ts", "runtime/src/text.ts", "runtime/src/image.ts"]);

// method signatures — read from every runtime file that declares a documented class.
const METHODS = readMethods([
  "runtime/src/view.ts", "runtime/src/text.ts", "runtime/src/image.ts",
  "runtime/src/markdown.ts", "runtime/src/text-input.ts", "runtime/src/layout.ts",
  "runtime/src/data.ts", "runtime/src/animator.ts", "runtime/src/spring.ts",
  "runtime/src/state.ts", "runtime/src/node.ts",
]);
const RUNTIME_NAME = { HTML: "Html" };                  // doc id → runtime class name (the one mismatch)

// editable examples — a class has one when examples/docs/demos/<Class>.declare exists.
// A 0-or-1 array, so the app conditionally CONSTRUCTS the island by datapath
// replication. It carries the demo SOURCE (so the editor seeds straight off the
// model datapath, which is guaranteed present once the model has loaded) and the
// line count (to size the source panel). The LIVE PREVIEW is mounted separately by
// the host from `app.demoSources[<Class>]`, which the server fills from this same
// demos dir (server/index.mjs reads examples/<page>/demos/*).
function readExample(name) {
  const rel = `examples/docs/demos/${name}.declare`;
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) return [];
  const source = readFileSync(abs, "utf8").replace(/\n$/, "");
  return [{ name, lines: source.split("\n").length, source }];
}

for (const name of TARGETS) {
  const schema = SCHEMAS[name];
  if (!schema) throw new Error(`extract: no schema for ${name}`);
  const prose = readProse(name);
  const decor = DECOR[name] ?? {};
  const clsMethods = METHODS[RUNTIME_NAME[name] ?? name] ?? {};
  const clsId = name;

  // members: OWN attributes + OWN methods + OWN events (inherited ones are reachable
  // through the `extends` edge — the renderer walks the chain, the model stays
  // per-declaration).
  const attributes = [];
  const methods = [];
  const events = [];

  for (const attr of Object.keys(schema.attrs)) {
    const id = `${clsId}.${attr}`;
    const doc = prose.members[attr] ?? null;
    const d = decor[attr];
    nodes[id] = {
      id, name: attr, kind: "attribute",
      doc, docSegs: segmentize(doc, id), api: doc !== null,
      source: d ? { file: d.file, line: d.line } : { file: "runtime/src/schema.ts", line: 0 },
      parent: clsId, seeAlso: [],
      type: renderType(schema.attrs[attr]),
      default: d?.default ?? null,
      prevailing: (schema.prevailing ?? []).includes(attr),
      readOnly: (schema.readOnly ?? []).includes(attr),
      inheritedFrom: null,
    };
    attributes.push(id);
  }

  // methods: OWN public methods (signature is authoritative, from tsc). A method with
  // prose becomes @api and shows in the reference; the rest are recorded structural-only
  // for the object browser.
  for (const [mname, m] of Object.entries(clsMethods)) {
    const doc = prose.methods[mname] ?? null;
    const id = `${clsId}.method.${mname}`;
    nodes[id] = {
      id, name: mname, kind: "method",
      doc, docSegs: segmentize(doc, id), api: doc !== null,
      source: { file: m.file, line: m.line },
      parent: clsId, seeAlso: [],
      signature: m.signature,
      returns: m.returns,
    };
    methods.push(id);
  }

  for (const ev of schema.events ?? []) {
    const id = `${clsId}.event.${ev}`;
    const handler = "on" + ev[0].toUpperCase() + ev.slice(1);
    // event prose is keyed by the HANDLER name (`## onRepeat`), so it can't collide
    // with a same-named attribute's prose (`## repeat`) in the one prose map.
    const doc = prose.members[handler] ?? null;
    nodes[id] = {
      id, name: ev, kind: "event",
      doc, docSegs: segmentize(doc, id), api: doc !== null,
      source: { file: "runtime/src/schema.ts", line: 0 },
      parent: clsId, seeAlso: [],
      signature: `${handler}()`,
    };
    events.push(id);
  }

  const baseName = schema.base?.name ?? null;
  if (baseName) (subclassIndex[baseName] ??= []).push(clsId);

  nodes[clsId] = {
    id: clsId, name, kind: "class",
    doc: prose.class, docSegs: segmentize(prose.class, clsId), api: prose.class !== null,
    source: { file: "runtime/src/schema.ts", line: 0 },
    parent: null, seeAlso: [],
    extends: baseName && TARGETS.includes(baseName) ? baseName : baseName,
    subclasses: [],                                     // filled below
    origin: "ts",
    attributes, methods, events,
    example: readExample(clsId),
  };
  roots.push(clsId);
}

// reverse edge: subclasses (only among documented classes carry a live link)
for (const [base, subs] of Object.entries(subclassIndex)) {
  if (nodes[base]) nodes[base].subclasses = subs;
}

const buildId = (() => {
  const vp = path.join(ROOT, "web/version.json");
  if (existsSync(vp)) { try { return JSON.parse(readFileSync(vp, "utf8")).build ?? "dev"; } catch {} }
  return "dev";
})();

// derived projection for array-based renderers (the Declare doc app) — same node
// objects, inlined as arrays so datapath replication can walk them. The reference
// shows only the DOCUMENTED (@api) surface (doc-system.md: "absence = internal,
// excluded"); the full `nodes` map keeps everything for the object browser.
const tree = roots.map((id) => {
  const c = nodes[id];
  return {
    id: c.id, name: c.name, doc: c.doc, docSegs: c.docSegs, api: c.api,
    extends: c.extends, subclasses: c.subclasses, origin: c.origin,
    attributes: c.attributes.map((a) => nodes[a]).filter((n) => n.api),
    events: c.events.map((e) => nodes[e]).filter((n) => n.api),
    methods: c.methods.map((m) => nodes[m]).filter((n) => n.api),
    example: c.example,
  };
});

// ── the developer's guide — narrative chapters from docs/guide/*.md ──
// Each `NN-slug.md` becomes a chapter { id, num, title, part, markdown, demo }.
// A chapter may embed ONE runnable demo via a `<!-- demo: <Class> -->` marker
// (reusing the reference's demo corpus); the marker is stripped from the prose.
// Intra-guide `.md` links are flattened to plain text (the app has no file router),
// while http links are kept. `guide` is the flat list the detail pane renders;
// `guideParts` groups it by Part for the rail.
function readGuide() {
  const dir = path.join(ROOT, "docs/guide");
  if (!existsSync(dir)) return { guide: [], guideParts: [] };
  // Parts group by chapter number: <20 Orientation, <30 Fundamentals, <90 In
  // Depth, >=90 Internals (maintainer notes on how this docs app is built — not
  // framework API, deliberately last and clearly labelled).
  const partOf = (num) => (num < 20 ? "Orientation" : num < 30 ? "Fundamentals" : num < 90 ? "In Depth" : "Internals");
  const files = readdirSync(dir).filter((f) => /^\d+-.+\.md$/.test(f)).sort();
  const guide = files.map((f) => {
    const num = parseInt(f, 10);
    let md = readFileSync(path.join(dir, f), "utf8");
    const title = (md.match(/^#\s+(.+)$/m)?.[1] ?? f).trim();
    let demo = [];
    const dm = md.match(/<!--\s*demo:\s*(\w+)\s*-->/);
    if (dm) { demo = readExample(dm[1]); md = md.replace(dm[0], ""); }
    md = md
      .replace(/<!--[\s\S]*?-->/g, "")                       // drop any remaining HTML comments
      .replace(/\[([^\]]+)\]\((?!https?:)[^)]*\)/g, "$1")    // flatten non-http links to their text
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const short = title.split("—")[0].trim();             // rail label: text before the em-dash
    const id = f.replace(/\.md$/, "");
    return { id, num, title, short, part: partOf(num), markdown: md, segs: segmentize(md, "ch_" + id), demo };
  });
  const guideParts = [];
  for (const ch of guide) {
    let g = guideParts.find((p) => p.part === ch.part);
    if (!g) guideParts.push((g = { part: ch.part, chapters: [] }));
    g.chapters.push({ id: ch.id, num: ch.num, title: ch.title, short: ch.short });
  }
  return { guide, guideParts };
}
const { guide, guideParts } = readGuide();

// write the generated inline-example demo files (the server/host seed them by filename),
// cleaning stale `seg_*` from a prior run first so nothing orphans. Hand-authored demos
// (View.declare, State.declare, …) never start with `seg_`, so they're untouched.
for (const f of readdirSync(DEMOS)) {
  if (/^seg_.*\.declare$/.test(f)) unlinkSync(path.join(DEMOS, f));
}
for (const [id, src] of Object.entries(genFiles)) {
  writeFileSync(path.join(DEMOS, id + ".declare"), src + "\n");
}

const model = { version: 1, buildId, nodes, roots, tree, guide, guideParts };
writeFileSync(OUT, JSON.stringify(model, null, 2) + "\n");

// ── report ──
const counts = Object.values(nodes).reduce((a, n) => ((a[n.kind] = (a[n.kind] ?? 0) + 1), a), {});
const documented = Object.values(nodes).filter((n) => n.api).length;
console.log(`extract: wrote ${path.relative(ROOT, OUT)}`);
console.log(`  classes: ${roots.join(", ")}`);
console.log(`  nodes:   ${Object.keys(nodes).length} (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")})`);
console.log(`  guide:   ${guide.length} chapters in ${guideParts.length} parts (${guideParts.map((p) => p.part + ":" + p.chapters.length).join(", ")})`);
console.log(`  islands: ${Object.keys(genFiles).length} inline runnable examples written to examples/docs/demos/seg_*.declare`);
console.log(`  @api:    ${documented} documented / ${Object.keys(nodes).length - documented} structural-only`);
