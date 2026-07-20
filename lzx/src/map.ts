// map — the parser-surface mapping core: LzxDoc → the Declare emission IR,
// recording a Gap for every construct the implemented parser/checker cannot
// express. Handles canvas→App, classes/attributes/methods/handlers, type-aware
// attribute values, the constraint-timing prefixes, and unknown-tag/mixin gaps.
import type { LzxDoc, LzxNode, LzxAttr } from "./parse.js";
import type { Naming, AttrTypeKind } from "./naming.js";
import type { GapSink } from "./gaps.js";
import type { Pos } from "./pos.js";
import type { DProgram, DClass, DNode, DAttr, DDecl, DMethod, DValue } from "./ir.js";

export function mapDoc(doc: LzxDoc, naming: Naming, sink: GapSink): DProgram | null {
  if (!doc.root) return null;
  const classes: DClass[] = [];
  const root = mapElement(doc.root, naming, sink, classes);
  if (!root) return null;
  return { classes, root };
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
  const tag = resolveTag(el.tag, naming);
  if (tag === null) {
    sink.add({ kind: `unknown tag <${el.tag}>`, severity: "blocking", s13Ref: "unknown-tag", pos: el.pos, note: `no built-in mapping or user class for <${el.tag}>` });
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
    if (a.name.toLowerCase() === "id" || a.name.toLowerCase() === "name") continue; // handled by the parent as the child's name
    if (/^on[A-Za-z]/.test(a.name)) { methods.push({ name: onName(a.name, naming), params: [], body: a.value }); continue; }
    const name = naming.attrFor(a.name);
    attrs.push({ name, value: mapValue(a.value, naming.attrTypeFor(tag, name), a.pos, sink) });
  }

  for (const c of el.children) {
    const low = c.tag.toLowerCase();
    if (low === "class") { const dc = mapClass(c, naming, sink, classes); if (dc) classes.push(dc); continue; }
    if (low === "attribute") { const d = mapAttribute(c, tag, naming, sink); if (d) decls.push(d); continue; }
    if (low === "method" || low === "handler") { const m = mapMethod(c, naming, sink); if (m) methods.push(m); continue; }
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
function mapMethod(el: LzxNode, naming: Naming, sink: GapSink): DMethod | null {
  const raw = attrMap(el.attrs);
  const rawName = raw["name"] ?? "onEvent";
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
