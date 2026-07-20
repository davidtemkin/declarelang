// emit — serialize the Declare emission IR to VALID Declare text, then hand to
// the canon formatter for house style. The serializer guarantees bracket/brace
// balance (formatSource throws on structurally invalid input). Classes emit
// base-first so check.ts's base-above-subclass rule holds in the one file.
// @ts-expect-error — tools/format.mjs is plain ESM, no .d.ts.
import { formatSource } from "../../tools/format.mjs";
import type { DProgram, DClass, DNode, DValue, DAttr } from "./ir.js";

function value(v: DValue): string {
  switch (v.kind) {
    case "literal": return v.text;
    case "code": return `{ ${v.src} }`;
    case "path": return `:${v.path}${v.many ? "[]" : ""}`;
  }
}
function attr(a: DAttr): string {
  return `${a.name} ${a.bind === "two" ? "<->" : "="} ${value(a.value)}`;
}
function node(n: DNode, header: string): string {
  const lines: string[] = [];
  for (const a of n.attrs) lines.push(attr(a) + ",");
  for (const d of n.decls) lines.push(`${d.name}: ${d.type}${d.def ? " = " + value(d.def) : ""},`);
  for (const m of n.methods) {
    lines.push(`${m.name}(${m.params.join(", ")})${m.source ? ` <- ${m.source}` : ""} { ${m.body} },`);
  }
  for (const c of n.children) lines.push(node(c, c.name ? `${c.name}: ${c.tag}` : c.tag) + ",");
  const body = lines.map((l) => "    " + l).join("\n");
  return `${header} [\n${body}\n]`;
}
export function emitProgram(p: DProgram): string {
  const ordered = topoSort(p.classes);
  const parts: string[] = [];
  for (const cls of ordered) parts.push(node(cls.body, `class ${cls.name} extends ${cls.base}`));
  parts.push(node(p.root, p.root.tag));
  return formatSource(parts.join("\n\n") + "\n");
}
function topoSort(classes: DClass[]): DClass[] {
  const byName = new Map(classes.map((c) => [c.name, c]));
  const out: DClass[] = [];
  const done = new Set<string>(), visiting = new Set<string>();
  const visit = (c: DClass): void => {
    if (done.has(c.name) || visiting.has(c.name)) return;
    visiting.add(c.name);
    const base = byName.get(c.base);
    if (base) visit(base);
    visiting.delete(c.name);
    done.add(c.name);
    out.push(c);
  };
  for (const c of classes) visit(c);
  return out;
}
