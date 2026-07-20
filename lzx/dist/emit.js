// emit — serialize the Declare emission IR to VALID Declare text, then hand to
// the canon formatter for house style. The serializer guarantees bracket/brace
// balance (formatSource throws on structurally invalid input). Classes emit
// base-first so check.ts's base-above-subclass rule holds in the one file.
// @ts-expect-error — tools/format.mjs is plain ESM, no .d.ts.
import { formatSource } from "../../tools/format.mjs";
function value(v) {
    switch (v.kind) {
        case "literal": return v.text;
        case "code": return `{ ${v.src} }`;
        case "path": return `:${v.path}${v.many ? "[]" : ""}`;
    }
}
function attr(a) {
    return `${a.name} ${a.bind === "two" ? "<->" : "="} ${value(a.value)}`;
}
function node(n, header) {
    const lines = [];
    for (const a of n.attrs)
        lines.push(attr(a) + ",");
    for (const d of n.decls)
        lines.push(`${d.name}: ${d.type}${d.def ? " = " + value(d.def) : ""},`);
    for (const m of n.methods) {
        lines.push(`${m.name}(${m.params.join(", ")})${m.source ? ` <- ${m.source}` : ""} { ${m.body} },`);
    }
    for (const c of n.children)
        lines.push(node(c, c.name ? `${c.name}: ${c.tag}` : c.tag) + ",");
    const body = lines.map((l) => "    " + l).join("\n");
    return `${header} [\n${body}\n]`;
}
export function emitProgram(p) {
    const ordered = topoSort(p.classes);
    const parts = [];
    for (const cls of ordered)
        parts.push(node(cls.body, `class ${cls.name} extends ${cls.base}`));
    parts.push(node(p.root, p.root.tag));
    return formatSource(parts.join("\n\n") + "\n");
}
function topoSort(classes) {
    const byName = new Map(classes.map((c) => [c.name, c]));
    const out = [];
    const done = new Set(), visiting = new Set();
    const visit = (c) => {
        if (done.has(c.name) || visiting.has(c.name))
            return;
        visiting.add(c.name);
        const base = byName.get(c.base);
        if (base)
            visit(base);
        visiting.delete(c.name);
        done.add(c.name);
        out.push(c);
    };
    for (const c of classes)
        visit(c);
    return out;
}
//# sourceMappingURL=emit.js.map