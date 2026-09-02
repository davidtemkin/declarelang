// Static `:path` checking against declared schemas (B4 — the second half of
// language §9's promise: "statically check every `:path` against the shape").
// Runs over the RESOLVED program (cursor expressions are explicit
// `this.root.d.value` chains there), so the walk is: find the elements whose
// `datapath = { … }` matches the direct-cursor idiom onto a schema'd
// dataset, then check every path literal in that subtree — cursor
// extensions, replication paths, value reads, `<->` targets — against the
// shape, with the schema's own field lists in the errors.
//
// HONESTY OF SCOPE: this is best-effort by construction. A cursor derived
// through arbitrary code (`datapath = { cond ? a.value : b.value }`) is
// statically unknowable and its subtree is simply UNCHECKED (never refused);
// `{ }`-body islands are unchecked in v1 (the attribute surface is where
// paths concentrate). What IS checked fails loudly with the fields named —
// the typo'd `:labell` dies at compile time, which is the promise.
import { DeclareError } from "../../runtime/dist/errors.js";
import { splitPath } from "../../runtime/dist/datapath.js";
const OPEN = { kind: "open" };
const fieldList = (fields) => fields.map((f) => f.name + (f.array ? "[]" : "")).join(", ");
const describeCtx = (ctx) => ctx.kind === "record" ? "a record" : ctx.kind === "array" ? "an array" : ctx.kind === "scalar" ? `a ${ctx.field.type}` : "unchecked";
/** Walk one plan from a context. Returns the endpoint context (plus whether
 *  a selective segment made it PLURAL — legal ground for `[]`) or an error. */
function walkPlan(start, plan, spelled) {
    let ctx = start;
    let plural = false;
    const enter = (f) => f.fields !== undefined ? { kind: "record", fields: f.fields }
        : f.type === "any" ? OPEN
            : { kind: "scalar", field: f };
    for (const seg of plan) {
        if (ctx.kind === "open")
            return { ctx: OPEN, plural };
        if (typeof seg === "string") {
            if (ctx.kind === "scalar") {
                return { error: `':${spelled}' — '${ctx.field.name}' is a ${ctx.field.type}, not a structure` };
            }
            if (ctx.kind === "array") {
                return { error: `':${spelled}' — '${ctx.field.name}[]' is an array; select an element ([0], [*], a slice) before '.${seg}'` };
            }
            const f = ctx.fields.find((x) => x.name === seg);
            if (f === undefined) {
                return { error: `':${spelled}' — '${seg}' is not in the schema here; fields: ${fieldList(ctx.fields)}` };
            }
            ctx = f.array ? { kind: "array", field: f } : enter(f);
        }
        else if ("i" in seg) {
            if (ctx.kind !== "array") {
                return { error: `':${spelled}' — [${seg.i}] indexes an array, and the schema says this is ${describeCtx(ctx)}` };
            }
            ctx = enter(ctx.field);
        }
        else {
            // Slice / wildcard — a selection over the array's elements; further
            // names apply per element (RFC nodelist semantics).
            if (ctx.kind !== "array") {
                if ("w" in seg && ctx.kind === "record") {
                    ctx = OPEN;
                    plural = true;
                    continue;
                } // [*] over a record's values — mixed shapes, unchecked
                return { error: `':${spelled}' — a ${"w" in seg ? "wildcard" : "slice"} selects from an array, and the schema says this is ${describeCtx(ctx)}` };
            }
            ctx = enter(ctx.field);
            plural = true;
        }
    }
    return { ctx, plural };
}
/** Check a program's path literals against its datasets' schemas. */
export function schemaCheck(program) {
    const errors = [];
    const walkRoot = (root, nouns) => {
        // The root's named schema'd datasets — the resolvable cursor targets.
        // The stored value is the document's starting CONTEXT: a record document
        // stands at its fields; an array-root document (`schema = Task[]`, typed
        // data) stands AT the array, so `:​[]` on the value replicates elements.
        const datasets = new Map();
        for (const c of root.children) {
            if (c.name !== null && (c.tag === "Dataset" || c.tag === "DataSource")) {
                const sa = c.attrs.find((a) => a.name === "schema" && a.value.kind === "schema");
                if (sa !== undefined && sa.value.kind === "schema") {
                    const v = sa.value;
                    datasets.set(c.name, v.arrayRoot === true
                        ? { kind: "array", field: { name: "(document)", array: true, optional: false, type: null, fields: [...v.shape] } }
                        : { kind: "record", fields: v.shape });
                }
            }
        }
        if (datasets.size === 0)
            return;
        const idiom = new RegExp(`^\\s*(?:${nouns.join("|")})\\.([A-Za-z_$][\\w$]*)\\.value\\s*$`);
        const visit = (el, ctx) => {
            let here = ctx;
            const dp = el.attrs.find((a) => a.name === "datapath");
            if (dp !== undefined) {
                if (dp.value.kind === "code") {
                    const m = dp.value.src.match(idiom);
                    const ctx2 = m !== null ? datasets.get(m[1]) : undefined;
                    here = ctx2 ?? OPEN;
                }
                else if (dp.value.kind === "path") {
                    const v = dp.value;
                    const r = walkPlan(here, v.plan ?? splitPath(v.path), v.path);
                    if ("error" in r) {
                        errors.push(new DeclareError(r.error, v.pos));
                        here = OPEN;
                    }
                    else if (v.many) {
                        if (r.ctx.kind === "record" && !r.plural) {
                            errors.push(new DeclareError(`':${v.path}[]' replicates an ARRAY, and the schema says '${v.path}' is a record`, v.pos));
                            here = OPEN;
                        }
                        else if (r.ctx.kind === "scalar" && !r.plural) {
                            errors.push(new DeclareError(`':${v.path}[]' replicates an ARRAY, and the schema says '${v.path}' is a ${r.ctx.field.type}`, v.pos));
                            here = OPEN;
                        }
                        else if (r.ctx.kind === "array") {
                            // Replicating the array: each instance's cursor is an ELEMENT.
                            here = r.ctx.field.fields !== undefined ? { kind: "record", fields: r.ctx.field.fields } : OPEN;
                        }
                        else {
                            // A selective plan already stands at the elements.
                            here = r.ctx;
                        }
                    }
                    else {
                        here = r.ctx;
                    }
                }
                else {
                    here = OPEN;
                }
            }
            // Every other path-valued attribute reads (or two-way binds) at `here`
            // — `key = :field` included: after the many branch, `here` IS the
            // element shape, so a typo'd key field dies here too.
            for (const a of el.attrs) {
                if (a === dp || a.value.kind !== "path")
                    continue;
                const v = a.value;
                const r = walkPlan(here, v.plan ?? splitPath(v.path), v.path);
                if ("error" in r) {
                    errors.push(new DeclareError(r.error, v.pos));
                    continue;
                }
                // A `<->` edge's TYPE (typed data, 2026-09-02): a text editor's
                // session can commit a string, a number, or a union member (the
                // schema floor, editor.ts) — it cannot edit a boolean, a record, or
                // an array. Refuse at compile, naming the right tool, instead of a
                // session that can never validate.
                if (a.bind === "two") {
                    const ctx = r.ctx;
                    if (ctx.kind === "scalar" && ctx.field.type === "boolean" && ctx.field.tokens === undefined) {
                        errors.push(new DeclareError(`'${a.name} <-> :${v.path}' — the schema says '${ctx.field.name}' is a boolean, and a text editor cannot edit one; a Checkbox writes immediately through the value pattern (guide: editing)`, v.pos));
                    }
                    else if (ctx.kind === "record" || ctx.kind === "array") {
                        errors.push(new DeclareError(`'${a.name} <-> :${v.path}' — the schema says this is ${ctx.kind === "array" ? "an array" : "a record"}; a two-way binding edits a LEAF value — bind a field inside it, or edit a working copy (guide: forms)`, v.pos));
                    }
                }
            }
            for (const child of el.children)
                visit(child, here);
        };
        visit(root, OPEN);
    };
    walkRoot(program.root, ["this\\.root", "this", "app"]);
    for (const cls of program.classes)
        walkRoot(cls.body, ["classroot", "this"]);
    return errors;
}
//# sourceMappingURL=schema-check.js.map