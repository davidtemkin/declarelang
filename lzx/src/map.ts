// map — the parser-surface mapping core: LzxDoc → the Declare emission IR,
// recording a Gap for every construct the implemented parser/checker cannot
// express. This core handles canvas→App, type-aware attribute values, the
// constraint-timing prefixes, and unknown-tag / mixin gaps. Elements, classes,
// methods, datapaths, states arrive in later tasks.
import type { LzxDoc, LzxNode } from "./parse.js";
import type { Naming, AttrTypeKind } from "./naming.js";
import type { GapSink } from "./gaps.js";
import type { Pos } from "./pos.js";
import type { DProgram, DNode, DAttr, DValue } from "./ir.js";

export function mapDoc(doc: LzxDoc, naming: Naming, sink: GapSink): DProgram | null {
  if (!doc.root) return null;
  const root = mapElement(doc.root, naming, sink);
  if (!root) return null;
  return { classes: [], root };
}

function mapElement(el: LzxNode, naming: Naming, sink: GapSink): DNode | null {
  if (el.tag.toLowerCase() === "mixin" || el.attrs.some((a) => a.name.toLowerCase() === "with")) {
    sink.add({ kind: `mixin/with on <${el.tag}>`, severity: "blocking", s13Ref: "mixins", pos: el.pos, note: "no Declare multiple-inheritance surface" });
    return null;
  }
  const tag = naming.tagFor(el.tag);
  if (tag === null) {
    sink.add({ kind: `unknown tag <${el.tag}>`, severity: "blocking", s13Ref: "unknown-tag", pos: el.pos, note: `no built-in mapping or user class for <${el.tag}>` });
    return null;
  }
  const methods: DNode["methods"] = [];
  const attrs: DAttr[] = [];
  for (const a of el.attrs) {
    if (/^on[A-Za-z]/.test(a.name)) {           // onclick / onmouseup / onInit …
      methods.push({ name: naming.attrFor(a.name), params: [], body: a.value });
      continue;
    }
    const name = naming.attrFor(a.name);
    attrs.push({ name, value: mapValue(a.value, naming.attrTypeFor(tag, name), a.pos, sink) });
  }
  const children: DNode[] = [];
  for (const c of el.children) {
    const mapped = mapElement(c, naming, sink);
    if (mapped) children.push(mapped);
  }
  const text = el.text.trim();
  if (text !== "" && children.length === 0) {
    const slot = naming.contentAttrFor(tag);
    if (slot) attrs.push({ name: slot, value: { kind: "literal", text: JSON.stringify(text) } });
    else sink.add({ kind: `text content on <${el.tag}>`, severity: "info", s13Ref: "unknown-tag", pos: el.pos, note: `${tag} has no content slot` });
  }
  return { tag, name: null, attrs, decls: [], methods, children };
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
