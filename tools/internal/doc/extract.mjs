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
import { SCHEMAS, RichTextSchema, EVENT_PAYLOAD } from "../../../runtime/dist/schema.js";
import { TAGS, LAYOUTS, DATA, ANIMATORS, SOURCES, ANIMATOR_GROUPS, STATES } from "../../../runtime/dist/registry.js";
import { compile } from "../../../compiler/dist/compile-node.js";
import { settleHeadless } from "../../../compiler/dist/headless.js";
import { parseProgram } from "../../../runtime/dist/parser.js";

// RichText is the abstract base of Markdown/HTMLText — documented, but not in the
// instantiable SCHEMAS registry (like Layout). Fold it in for the extractor only.
const DOC_SCHEMAS = { ...SCHEMAS, RichText: RichTextSchema };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TARGETS = [                                        // the documented component surface
  "View", "App", "Text", "Image", "RichText", "Markdown", "HTMLText", "DOMIsland", "TextInput",
  "Layout", "TweenLayout", "Editor",
  "Dataset", "DataSource",
  "Animator", "AnimatorGroup", "Spring", "Heartbeat", "Keys", "Focus", "Tip",
  "Stream", "EventStream", "Socket",
  "State", "Node",
];
// THE single documentation model. extract writes the walkable doc tree here;
// assemble.mjs then augments the SAME file in place with the spine/links/meta.
// One model, two scoped writers, no intermediate artifact.
const OUT = path.join(ROOT, "docs/declare-model.json");

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

// The island stage must FIT the settled app: an App fills its HOST, not its content,
// so in a fixed frame a taller program scrolls inside its box with the root's fill
// ending mid-content (the tutorial's Signals bug). Run each island headless at a
// representative island width and read the settled content extent — the docs app
// sizes each stage from this. Floor 200 (small demos keep the house frame), cap 560
// (a runaway demo scrolls rather than swallowing the page), +24 breathing room.
function measureStage(src, floor = 200) {
  try {
    // settleHeadless takes a compile()'s OUTPUT (headless.ts) — the ONE compile
    // resolves auto-includes (Slider/Button/…) and extracts deps; core build alone
    // would reject any island that uses the standard library.
    const out = compile(src, {});
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
      segs.push({ md: "", code: [{ id, source: run, lines: run.split("\n").length, stageH: measureStage(run) }] });
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
  for (const head of Object.keys(prose.methods)) {
    if (clsMethods?.[head] === undefined) unboundProse.push(`${prose.file}: '## ${head}()' binds to no method of ${cls}`);
  }
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
  "runtime/src/state.ts", "runtime/src/node.ts", "runtime/src/editor.ts",
  "runtime/src/streams.ts",
]);
// A class is ABSTRACT when no registry can instantiate it by name: Layout,
// TweenLayout, RichText and Editor are bases you extend, never tags you write.
// Derived from the registries rather than a hand list, so it cannot drift.
const INSTANTIABLE = new Set([TAGS, LAYOUTS, DATA, ANIMATORS, SOURCES, ANIMATOR_GROUPS, STATES]
  .flatMap((r) => Object.keys(r)));

const RUNTIME_NAME = {};                                // doc id → runtime class name (no mismatches since the DOMIsland rename)

// editable examples — a class has one when apps/docs/demos/<Class>.declare exists.
// A 0-or-1 array, so the app conditionally CONSTRUCTS the island by datapath
// replication. It carries the demo SOURCE (so the editor seeds straight off the
// model datapath, which is guaranteed present once the model has loaded) and the
// line count (to size the source panel). The LIVE PREVIEW is mounted separately by
// the host from `app.demoSources[<Class>]`, which the server fills from this same
// demos dir (server/index.mjs reads apps/<page>/demos/*).
function readExample(name) {
  const rel = `apps/docs/demos/${name}.declare`;
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) return [];
  const source = readFileSync(abs, "utf8").replace(/\n$/, "");
  return [{ name, lines: source.split("\n").length, source, stageH: measureStage(source, 250) }];
}

for (const name of TARGETS) {
  const schema = DOC_SCHEMAS[name];
  if (!schema) throw new Error(`extract: no schema for ${name}`);
  const prose = readProse(name);
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
      doc, docSegs: segmentize(doc, id), api: doc !== null,
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
    doc: prose.class, docSegs: segmentize(prose.class, clsId), api: prose.class !== null,
    source: { file: "runtime/src/schema.ts", line: 0 },
    parent: null, seeAlso: [],
    extends: baseName,
    abstract: !INSTANTIABLE.has(name),
    subclasses: [],                                     // filled below
    origin: "ts",
    attributes, methods, events,
    example: readExample(clsId),
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
const headerProse = (src) => {
  const m = src.match(/^\s*\/\*([\s\S]*?)\*\//);
  if (!m) return null;
  return m[1].replace(/^\s*#\s*\S[^\n]*\n/, "").trim() || null;   // drop the leading "# Name" line
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
  const attributes = [], methods = [], events = [];
  for (const d of cls.body.decls) {
    const id = `${tag}.${d.name}`;
    nodes[id] = { id, name: d.name, kind: "attribute", doc: null, docSegs: [], api: true,
      source: { file: rel, line: 0 }, parent: tag, seeAlso: [],
      type: d.type, default: renderDefault(d.def),
      prevailing: !!d.prevailing, readOnly: !!d.readOnly, inheritedFrom: null };
    attributes.push(id);
  }
  for (const m of cls.body.methods) {
    const isEvent = /^on[A-Z]/.test(m.name);
    const id = `${tag}.${isEvent ? "event" : "method"}.${m.name}`;
    nodes[id] = { id, name: m.name, kind: isEvent ? "event" : "method", doc: null, docSegs: [], api: true,
      source: { file: rel, line: 0 }, parent: tag, seeAlso: [],
      signature: `${m.name}(${(m.params ?? []).map((p) => p.name ?? p).join(", ")})` };
    (isEvent ? events : methods).push(id);
  }
  const baseName = cls.base ?? null;
  if (baseName) (subclassIndex[baseName] ??= []).push(tag);
  const prose = headerProse(src);
  nodes[tag] = { id: tag, name: tag, kind: "class",
    doc: prose, docSegs: segmentize(prose, tag), api: true,
    source: { file: rel, line: 0 }, parent: null, seeAlso: [],
    extends: baseName, subclasses: [], origin: "library",
    attributes, methods, events, example: [] };
  roots.push(tag);
}

// reverse edge: subclasses (only among documented classes carry a live link)
for (const [base, subs] of Object.entries(subclassIndex)) {
  if (nodes[base]) nodes[base].subclasses = subs;
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

const buildId = (() => {
  const vp = path.join(ROOT, "bundles/version.json");
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
    extends: c.extends, chain: c.chain, abstract: c.abstract === true, subclasses: c.subclasses, origin: c.origin,
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
// `declare-docs:` symbolic links and http links are KEPT — the docs app resolves
// them (openDocLink answers the Markdown's onLink); any remaining raw file-path
// link is flattened to its text (nothing in-app can open a bare path). `guide`
// is the flat list the detail pane renders; `guideParts` groups it by Part.
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
    // Explicit overrides, captured BEFORE the comment strip below eats them:
    // <!-- nav: Relationships -->  a short rail label (the H1 stays the content
    // title — thesis-sentence titles don't fit a 248px rail); <!-- part: The idea -->
    // names the chapter's Part directly (else the number-range rule decides).
    const navm = md.match(/<!--\s*nav:\s*(.+?)\s*-->/);
    const partm = md.match(/<!--\s*part:\s*(.+?)\s*-->/);
    let demo = [];
    const dm = md.match(/<!--\s*demo:\s*(\w+)\s*-->/);
    if (dm) { demo = readExample(dm[1]); md = md.replace(dm[0], ""); }
    md = md
      .replace(/<!--[\s\S]*?-->/g, "")                       // drop any remaining HTML comments
      .replace(/\[([^\]]+)\]\((?!https?:|declare-docs:)[^)]*\)/g, "$1")   // flatten raw path links; keep http + declare-docs:
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const short = navm ? navm[1] : title.split("—")[0].trim();   // rail label: nav marker, else text before the em-dash
    const id = f.replace(/\.md$/, "");
    return { id, num, title, short, part: partm ? partm[1] : partOf(num), segs: segmentize(md, "ch_" + id), demo };
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

// ── the tenets — the language's commitments (docs/tenets/*.md) ──
// The interpretively-distilled promises the platform holds itself to (see
// docs/tenets/README.md). Pure prose, no runnable demos — carried INLINE in the
// model (they are small) so any reader has them whole: the docs app, or an LLM
// writing Declare that wants the language's intent alongside the reference. Files
// are `NN Word.md`; the leading number orders them, the Word is an opaque label.
function readTenets() {
  const dir = path.join(ROOT, "docs/tenets");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^\d+ .+\.md$/.test(f)).sort().map((f) => {
    const num = parseInt(f, 10);
    let md = readFileSync(path.join(dir, f), "utf8");
    const title = (md.match(/^#\s+(.+)$/m)?.[1] ?? f).trim();
    md = md.replace(/<!--[\s\S]*?-->/g, "").replace(/\n{3,}/g, "\n\n").trim();
    return { id: "tenet-" + num, num, title, name: f.replace(/\.md$/, ""), segs: segmentize(md, "tenet_" + num) };
  });
}
const tenets = readTenets();

// write the generated inline-example demo files (the server/host seed them by filename),
// cleaning stale `seg_*` from a prior run first so nothing orphans. Hand-authored demos
// (View.declare, State.declare, …) never start with `seg_`, so they're untouched.
if (!CHECK) for (const f of readdirSync(DEMOS)) {
  if (/^seg_.*\.declare$/.test(f)) unlinkSync(path.join(DEMOS, f));
}
if (!CHECK) for (const [id, src] of Object.entries(genFiles)) {
  writeFileSync(path.join(DEMOS, id + ".declare"), src + "\n");
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

const model = { version: 1, buildId, reference: nodes, roots, tree, guide: spine, guideParts, tenets };
if (!CHECK) writeFileSync(OUT, JSON.stringify(model, null, 2) + "\n");

// ── report ──
const counts = Object.values(nodes).reduce((a, n) => ((a[n.kind] = (a[n.kind] ?? 0) + 1), a), {});
const documented = Object.values(nodes).filter((n) => n.api).length;
console.log(`extract: wrote ${path.relative(ROOT, OUT)}`);
console.log(`  classes: ${roots.join(", ")}`);
console.log(`  nodes:   ${Object.keys(nodes).length} (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")})`);
console.log(`  guide:   ${guide.length} chapters in ${guideParts.length} parts (${guideParts.map((p) => p.part + ":" + p.chapters.length).join(", ")})`);
console.log(`  tenets:  ${tenets.length} (${tenets.map((t) => t.title).join(" · ")})`);
console.log(`  islands: ${Object.keys(genFiles).length} inline runnable examples written to apps/docs/demos/seg_*.declare`);
console.log(`  @api:    ${documented} documented / ${Object.keys(nodes).length - documented} structural-only`);

// The prose-binding gate: a `## heading` nobody claimed is prose the reference
// silently drops. Always reported; fatal under `--check` (the ops gate).
if (unboundProse.length > 0) {
  console.log(`  UNBOUND prose headings: ${unboundProse.length}`);
  for (const u of unboundProse) console.log(`    ${u}`);
  if (CHECK) process.exit(1);
}
