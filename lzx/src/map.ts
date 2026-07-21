// map — the parser-surface mapping core: LzxDoc → the Declare emission IR,
// recording a Gap for every construct the implemented parser/checker cannot
// express. Handles canvas→App, classes/attributes/methods/handlers, type-aware
// attribute values, the constraint-timing prefixes, and unknown-tag/mixin gaps.
import type { LzxDoc, LzxNode, LzxAttr } from "./parse.js";
import type { Naming, AttrTypeKind } from "./naming.js";
import type { GapSink, Severity, S13Ref } from "./gaps.js";
import type { Pos } from "./pos.js";
import type { DProgram, DClass, DNode, DAttr, DDecl, DMethod, DValue } from "./ir.js";

// Position-independent routing for LZX constructs that are NOT UI components:
// documentation prose and language constructs. Runs in mapElement (before
// resolveTag) so it fires at ROOT (e.g. <library>) and child position alike.
const SPECIAL: Record<string, { ref: S13Ref; sev: Severity; note: string; walk?: true }> = {
  doc:        { ref: "documentation", sev: "info",     note: "documentation prose" },
  include:    { ref: "modules",       sev: "degraded", note: "<include> module directive" },
  import:     { ref: "modules",       sev: "degraded", note: "<import> module directive" },
  library:    { ref: "modules",       sev: "degraded", note: "<library> module root", walk: true },
  event:      { ref: "event-decl",    sev: "degraded", note: "<event> declaration" },
  setter:     { ref: "custom-setter", sev: "degraded", note: "<setter>" },
  remotecall: { ref: "rpc",           sev: "degraded", note: "<remotecall>" },
  rpc:        { ref: "rpc",           sev: "degraded", note: "<rpc>" },
  param:      { ref: "rpc",           sev: "degraded", note: "<param> RPC argument" },
  stylesheet: { ref: "styling",       sev: "degraded", note: "<stylesheet>" },
  script:     { ref: "script-block",  sev: "degraded", note: "<script> block" },
};

function routeSpecial(el: LzxNode, sink: GapSink): "handled" | "walk" | null {
  const s = SPECIAL[el.tag.toLowerCase()];
  if (!s) return null;
  sink.add({ kind: s.note, severity: s.sev, s13Ref: s.ref, pos: el.pos, note: s.note });
  return s.walk ? "walk" : "handled";
}

export function mapDoc(doc: LzxDoc, naming: Naming, sink: GapSink): DProgram | null {
  if (!doc.root) return null;
  const classes: DClass[] = [];
  const root = mapElement(doc.root, naming, sink, classes);
  if (!root) return null;
  const prog: DProgram = { classes, root };
  rewriteProgramBodies(prog, sink);
  return prog;
}

const NOWHERE: Pos = { line: 1, col: 1, offset: 0 };

/** Post-map pass: rewrite `setAttribute`/`getAttribute` (Appendix B's "no
 *  bypass" rule) in every method body and `code` value, across the whole tree. */
function rewriteProgramBodies(prog: DProgram, sink: GapSink): void {
  const walk = (n: DNode): void => {
    for (const m of n.methods) m.body = rewriteBody(m.body, sink);
    for (const a of n.attrs) if (a.value.kind === "code") a.value.src = rewriteBody(a.value.src, sink);
    for (const d of n.decls) if (d.def?.kind === "code") d.def.src = rewriteBody(d.def.src, sink);
    n.children.forEach(walk);
  };
  for (const c of prog.classes) walk(c.body);
  walk(prog.root);
}

/** Rewrite `receiver.setAttribute('name', expr)` → `receiver.name = expr` and
 *  `receiver.getAttribute('name')` → `receiver.name`, using a paren/string-
 *  balanced scan (not a regex). Any other shape (computed name, wrong arity) is
 *  left verbatim and recorded as a `dynamic-body` gap. */
function rewriteBody(body: string, sink: GapSink): string {
  const CALL = /\.(set|get)Attribute\s*\(/;
  let out = "";
  let i = 0;
  for (;;) {
    const m = CALL.exec(body.slice(i));
    if (!m) { out += body.slice(i); break; }
    const callIdx = i + m.index;
    const parenIdx = callIdx + m[0].length - 1;
    let r = callIdx;
    while (r > 0 && /[\w.$]/.test(body[r - 1]!)) r--;
    const receiver = body.slice(r, callIdx);
    const parsed = scanArgs(body, parenIdx);
    const isSet = m[1] === "set";
    out += body.slice(i, r);
    if (parsed && receiver !== "" && isStringLit(parsed.args[0] ?? "") &&
        ((isSet && parsed.args.length === 2) || (!isSet && parsed.args.length === 1))) {
      const name = parsed.args[0]!.slice(1, -1);
      out += isSet ? `${receiver}.${name} = ${parsed.args[1]}` : `${receiver}.${name}`;
      i = parsed.end + 1;
    } else {
      const end = parsed ? parsed.end : body.length - 1;
      out += body.slice(r, end + 1);
      sink.add({ kind: `${m[1]}Attribute not rewritable`, severity: "degraded", s13Ref: "dynamic-body", pos: NOWHERE, note: "computed name or non-standard argument shape" });
      i = end + 1;
    }
  }
  return out;
}

/** Scan a balanced argument list. `open` indexes the `(`; returns the top-level
 *  comma-split args and the index of the matching `)`, or null if unbalanced. */
function scanArgs(s: string, open: number): { args: string[]; end: number } | null {
  let i = open + 1, depth = 1, quote = "";
  const args: string[] = [];
  let cur = "";
  while (i < s.length) {
    const ch = s[i]!;
    if (quote !== "") { cur += ch; if (ch === quote && s[i - 1] !== "\\") quote = ""; i++; continue; }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; cur += ch; i++; continue; }
    if (ch === "(" || ch === "[" || ch === "{") { depth++; cur += ch; i++; continue; }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) { if (cur.trim() !== "" || args.length > 0) args.push(cur.trim()); return { args, end: i }; }
      cur += ch; i++; continue;
    }
    if (ch === "," && depth === 1) { args.push(cur.trim()); cur = ""; i++; continue; }
    cur += ch; i++;
  }
  return null;
}

function isStringLit(s: string): boolean {
  return /^'[^']*'$/.test(s) || /^"[^"]*"$/.test(s);
}

/** Resolve an element's tag to a Declare tag: a built-in, else a user class,
 *  else null (→ unknown-tag gap). */
function resolveTag(lzxTag: string, naming: Naming): string | null {
  return naming.tagFor(lzxTag) ?? (naming.isUserClass(lzxTag) ? naming.classNameFor(lzxTag) : null);
}

/** Resolve a `<class extends=…>` base: a built-in tag, else a user class, else
 *  the name verbatim (a library base → a `modules` second-order gap). */
function resolveBase(ext: string | undefined, naming: Naming, sink: GapSink, pos: Pos): string {
  if (!ext) return "View"; // LZX default superclass for a UI class
  const builtin = naming.tagFor(ext);
  if (builtin) return builtin;
  if (naming.isUserClass(ext)) return naming.classNameFor(ext);
  sink.add({ kind: `extends unresolved base '${ext}'`, severity: "degraded", s13Ref: "modules", pos, note: "base is a library component not in scope" });
  return ext;
}

function mapElement(el: LzxNode, naming: Naming, sink: GapSink, classes: DClass[]): DNode | null {
  if (el.tag.toLowerCase() === "mixin" || el.attrs.some((a) => a.name.toLowerCase() === "with")) {
    sink.add({ kind: `mixin/with on <${el.tag}>`, severity: "blocking", s13Ref: "mixins", pos: el.pos, note: "no Declare multiple-inheritance surface" });
    return null;
  }
  const special = routeSpecial(el, sink);
  if (special === "handled") return null;
  if (special === "walk") { mapMembers(el, el.tag, naming, sink, classes); return null; }
  const tag = resolveTag(el.tag, naming);
  if (tag === null) {
    sink.add({ kind: `unknown tag <${el.tag}>`, severity: "blocking", s13Ref: "unknown-tag", pos: el.pos, note: `no built-in mapping or user class for <${el.tag}>` });
    // Still walk the subtree for GAPS (nested datapath/state/resource) — the
    // oracle should see the whole tree, not stop at the first unknown parent.
    // The emitted members are discarded (the node itself can't be emitted).
    mapMembers(el, el.tag, naming, sink, classes);
    return null;
  }
  const members = mapMembers(el, tag, naming, sink, classes);
  return { tag, name: null, ...members };
}

/** Map an element's attributes + children into DNode member lists. Structural
 *  LZX children (`<class>`/`<attribute>`/`<method>`/`<handler>`) become
 *  declarations/methods/nested classes rather than child instances. */
function mapMembers(el: LzxNode, tag: string, naming: Naming, sink: GapSink, classes: DClass[]): Pick<DNode, "attrs" | "decls" | "methods" | "children"> {
  const attrs: DAttr[] = [];
  const decls: DDecl[] = [];
  const methods: DMethod[] = [];
  const children: DNode[] = [];

  for (const a of el.attrs) {
    const alow = a.name.toLowerCase();
    if (alow === "id" || alow === "name") continue; // handled by the parent as the child's name
    if (tag === "App" && CANVAS_KNOBS.has(alow)) { sink.add({ kind: `canvas ${alow}`, severity: "info", s13Ref: "unknown-tag", pos: a.pos, note: "canvas-level knob has no App slot" }); continue; }
    if (alow === "datapath") { mapDatapath(a.value, a.pos, attrs, sink); continue; }
    if (/^on[A-Za-z]/.test(a.name)) {
      if (isAttrChangeHandler(a.name, tag, naming)) { sink.add({ kind: `${a.name} change handler`, severity: "degraded", s13Ref: "attr-change-handler", pos: a.pos, note: "LZX attribute-change events map to reactive constraints, not handlers" }); continue; }
      methods.push({ name: onName(a.name, naming), params: [], body: a.value }); continue;
    }
    const name = naming.attrFor(a.name);
    attrs.push({ name, value: mapValue(a.value, naming.attrTypeFor(tag, name), a.pos, sink) });
  }

  if (tag === "Dataset") {
    // A <dataset> body is XML DATA, not components — don't walk its data
    // children (item/day/…). Its own attributes (above) are kept; JSON-body
    // conversion is a deferred follow-up.
    sink.add({ kind: "<dataset> body", severity: "degraded", s13Ref: "dataset-body", pos: el.pos, note: "XML data body not converted to JSON (deferred)" });
    return { attrs, decls, methods, children };
  }

  for (const c of el.children) {
    const low = c.tag.toLowerCase();
    if (low === "class") { const dc = mapClass(c, naming, sink, classes); if (dc) classes.push(dc); continue; }
    if (low === "attribute") { const d = mapAttribute(c, tag, naming, sink); if (d) decls.push(d); continue; }
    if (low === "method" || low === "handler") { const m = mapMethod(c, tag, naming, sink); if (m) methods.push(m); continue; }
    if (low === "state") { mapState(c, sink); continue; }
    if (low === "resource" || low === "font" || low === "face") { sink.add({ kind: `<${low}>`, severity: "degraded", s13Ref: "resources-and-fonts", pos: c.pos, note: "declarative asset/font registration has no settled surface" }); continue; }
    if (low === "datapointer") { sink.add({ kind: "<datapointer>", severity: "degraded", s13Ref: "imperative-data-mutation", pos: c.pos, note: "imperative data cursor has no Declare surface" }); continue; }
    const childName = c.attrs.find((a) => a.name.toLowerCase() === "id" || a.name.toLowerCase() === "name")?.value;
    const mapped = mapElement(c, naming, sink, classes);
    if (mapped) children.push({ ...mapped, name: childName ?? null });
  }

  const text = el.text.trim();
  if (text !== "" && children.length === 0) {
    const slot = naming.contentAttrFor(tag);
    if (slot) attrs.push({ name: slot, value: { kind: "literal", text: JSON.stringify(text) } });
    else sink.add({ kind: `text content on <${el.tag}>`, severity: "info", s13Ref: "unknown-tag", pos: el.pos, note: `${tag} has no content slot` });
  }
  return { attrs, decls, methods, children };
}

function mapClass(el: LzxNode, naming: Naming, sink: GapSink, classes: DClass[]): DClass | null {
  const nameAttr = el.attrs.find((a) => a.name.toLowerCase() === "name")?.value;
  if (!nameAttr) { sink.add({ kind: "<class> without name", severity: "blocking", s13Ref: "unknown-tag", pos: el.pos, note: "class needs a name" }); return null; }
  const name = naming.classNameFor(nameAttr);
  const base = resolveBase(el.attrs.find((a) => a.name.toLowerCase() === "extends")?.value, naming, sink, el.pos);
  // The class body's members come from the class element's own attrs (minus
  // name/extends) + children, mapped against the BASE's schema surface.
  const bodyEl: LzxNode = { ...el, attrs: el.attrs.filter((a) => !["name", "extends"].includes(a.name.toLowerCase())) };
  const members = mapMembers(bodyEl, base, naming, sink, classes);
  return { name, base, body: { tag: name, name: null, ...members } };
}

function mapAttribute(el: LzxNode, enclosingTag: string, naming: Naming, sink: GapSink): DDecl | null {
  const raw = attrMap(el.attrs);
  const lzxName = raw["name"];
  if (!lzxName) { sink.add({ kind: "<attribute> without name", severity: "degraded", s13Ref: "unknown-tag", pos: el.pos, note: "attribute needs a name" }); return null; }
  const name = naming.attrFor(lzxName);
  const type = mapType(raw["type"], name, enclosingTag, raw["value"], naming);
  const kind = declTypeKind(type);
  const def = raw["value"] !== undefined ? mapValue(raw["value"], kind, el.pos, sink) : null;
  return { name, type, def };
}

/** LZX `<method>`/`<handler>` → a Declare method. `args` → params (AS3 `:Type`
 *  stripped). A `<handler reference=…>` with a BARE-ident source → a `<-`
 *  subscription; a path source → subscription-source gap (no `<-`). */
function mapMethod(el: LzxNode, enclosingTag: string, naming: Naming, sink: GapSink): DMethod | null {
  const raw = attrMap(el.attrs);
  const rawName = raw["name"] ?? "onEvent";
  if (isAttrChangeHandler(rawName, enclosingTag, naming)) {
    sink.add({ kind: `${rawName} change handler`, severity: "degraded", s13Ref: "attr-change-handler", pos: el.pos, note: "LZX attribute-change events map to reactive constraints, not handlers" });
    return null;
  }
  const name = onName(rawName, naming);
  // Strip AS3 `:Type` annotations AND LZX `=default` values from each param.
  const params = (raw["args"] ?? "").split(",").map((p) => p.trim().split(/[:=]/)[0].trim()).filter((p) => p !== "");
  if ((raw["args"] ?? "").includes(":")) {
    sink.add({ kind: `typed args on ${rawName}`, severity: "info", s13Ref: "typed-method", pos: el.pos, note: "AS3 :Type annotations dropped (untyped emit)" });
  }
  const body = el.text.trim();
  const ref = raw["reference"];
  if (ref !== undefined) {
    if (/^[A-Za-z_]\w*$/.test(ref)) return { name, params, body, source: ref };
    sink.add({ kind: `path subscription source '${ref}'`, severity: "degraded", s13Ref: "subscription-source", pos: el.pos, note: "<- accepts a bare identifier only" });
  }
  return { name, params, body };
}

const CANVAS_KNOBS = new Set(["debug", "proxied", "history", "compileroptions", "runtime"]);

// LZX DOM-ish events (as opposed to attribute-change events). A handler whose
// suffix is NOT one of these but IS a known attribute is an attribute-change
// handler (no Declare handler surface — a reactive constraint instead).
const DOM_EVENTS = new Set([
  "click", "dblclick", "mousedown", "mouseup", "mouseover", "mouseout", "mousemove",
  "mouseenter", "mouseleave", "init", "focus", "blur", "keydown", "keyup", "keypress",
  "idle", "data", "timer", "contextmenu", "mousewheel", "dragstart", "dragging", "dragstop",
]);

function isAttrChangeHandler(rawName: string, enclosingTag: string, naming: Naming): boolean {
  if (!/^on[a-zA-Z]/.test(rawName)) return false;
  const suffix = rawName.slice(2).toLowerCase();
  if (DOM_EVENTS.has(suffix)) return false;
  return naming.attrTypeFor(enclosingTag, naming.attrFor(suffix)) !== "unknown";
}

/** A trivial LZX datapath (`a/b/@c`) → a `:a.b.c` path attribute. A datapath
 *  carrying XPath (predicates `[1]`, `text()`, functions, dataset qualifiers)
 *  has no `:path` surface → a datapath-xpath gap, and the cursor is dropped. */
function mapDatapath(value: string, pos: Pos, attrs: DAttr[], sink: GapSink): void {
  if (/[[\](:)]|text\(|position\(/.test(value)) {
    sink.add({ kind: `xpath datapath '${value}'`, severity: "degraded", s13Ref: "datapath-xpath", pos, note: "predicate/function/qualified XPath has no :path surface" });
    return;
  }
  const path = value.split("/").map((s) => s.replace(/^@/, "").trim()).filter((s) => s !== "").join(".");
  if (path === "") return;
  attrs.push({ name: "datapath", value: { kind: "path", path, many: false } });
}

/** `<state>` → a `state-form` gap (real translation is Phase 2 — the parser-
 *  accepted state surface is unsettled). An embedded animator adds an
 *  animation-choreography gap. The state is not emitted. */
function mapState(el: LzxNode, sink: GapSink): void {
  sink.add({ kind: "<state>", severity: "degraded", s13Ref: "state-form", pos: el.pos, note: "real state translation deferred to Phase 2" });
  const hasAnimator = (n: LzxNode): boolean => {
    const t = n.tag.toLowerCase();
    return t === "animator" || t === "animatorgroup" || n.children.some(hasAnimator);
  };
  if (hasAnimator(el)) {
    sink.add({ kind: "<animatorgroup> in state", severity: "degraded", s13Ref: "animation-choreography", pos: el.pos, note: "state end-states lose the animation timeline" });
  }
}

/** An `on<event>` name → Declare handler name: a multi-word alias from the
 *  table (onmouseup→onMouseUp), else camelCase the part after `on`
 *  (onidle→onIdle, ontick→onTick). */
function onName(raw: string, naming: Naming): string {
  const aliased = naming.attrFor(raw);
  if (aliased !== raw) return aliased;
  if (/^on[a-z]/.test(raw)) return "on" + raw.charAt(2).toUpperCase() + raw.slice(3);
  return raw;
}

function attrMap(attrs: LzxAttr[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const a of attrs) m[a.name.toLowerCase()] = a.value;
  return m;
}

/** The 4-step type-inference precedence (spec-resolved): LZX type= hint →
 *  built-in schema kind → (in-file decl, folded into the schema path here) →
 *  value literal shape. */
function mapType(lzxType: string | undefined, attrName: string, enclosingTag: string, value: string | undefined, naming: Naming): string {
  const hint: Record<string, string> = { string: "string", number: "number", boolean: "boolean", color: "Color" };
  if (lzxType && hint[lzxType.toLowerCase()]) return hint[lzxType.toLowerCase()];
  const kind = naming.attrTypeFor(enclosingTag, attrName);
  const fromKind: Record<string, string> = { color: "Color", length: "Length", number: "number", boolean: "boolean", string: "string" };
  if (kind !== "unknown") return fromKind[kind];
  return valueShapeType(value);
}

function valueShapeType(value: string | undefined): string {
  if (value === undefined) return "string";
  if (/^-?\d+(\.\d+)?$/.test(value)) return "number";
  if (value === "true" || value === "false") return "boolean";
  if (/^#[0-9A-Fa-f]{3,8}$/.test(value)) return "Color";
  return "string";
}

/** Map a Declare type name back to the coarse literal-form kind for `mapValue`. */
function declTypeKind(type: string): AttrTypeKind {
  switch (type) {
    case "Color": return "color";
    case "Length": return "length";
    case "number": return "number";
    case "boolean": return "boolean";
    default: return "string";
  }
}

/** A raw LZX attribute string → a Declare value, typed by the target slot's
 *  kind (which decides literal form: a Color slot keeps `red`/`#hex` BARE; a
 *  string slot quotes). `${}` → a live constraint. `$once{}`/`$always{}`/
 *  `$immediately` → constraint-timing gap, emitted as a plain constraint.
 *  Known limitation: a value MIXING literal + interpolation (`${a} + ${b}`,
 *  `hi ${n}`) is not handled here (the anchored regex assumes the whole value is
 *  one `${…}`); a mixed-content rule + `dynamic-body` gap is a follow-up. */
function mapValue(raw: string, kind: AttrTypeKind, pos: Pos, sink: GapSink): DValue {
  const live = raw.match(/^\$\{([\s\S]*)\}$/);
  if (live) return { kind: "code", src: live[1].trim() };
  const timed = raw.match(/^\$(once|always|immediately)\{?([\s\S]*?)\}?$/);
  if (timed) {
    sink.add({ kind: `$${timed[1]} constraint`, severity: "degraded", s13Ref: "constraint-timing", pos, note: "LZX constraint-timing prefix has no settled Declare surface" });
    return { kind: "code", src: timed[2].trim() || "undefined" };
  }
  return literal(raw, kind);
}

/** A bare literal in the form the target slot admits. */
function literal(raw: string, kind: AttrTypeKind): DValue {
  switch (kind) {
    case "color":
      if (/^#[0-9A-Fa-f]{3,8}$/.test(raw) || /^[A-Za-z]+$/.test(raw)) return { kind: "literal", text: raw };
      return { kind: "literal", text: JSON.stringify(raw) };
    case "length": case "number":
      return { kind: "literal", text: /^-?\d/.test(raw) ? raw : JSON.stringify(raw) };
    case "boolean":
      return { kind: "literal", text: raw === "true" || raw === "false" ? raw : JSON.stringify(raw) };
    case "string":
      return { kind: "literal", text: JSON.stringify(raw) };
    case "unknown":
      if (/^-?\d+(\.\d+)?%?$/.test(raw) || /^#[0-9A-Fa-f]{3,8}$/.test(raw) || raw === "true" || raw === "false" || raw === "null") {
        return { kind: "literal", text: raw };
      }
      return { kind: "literal", text: JSON.stringify(raw) };
  }
}
