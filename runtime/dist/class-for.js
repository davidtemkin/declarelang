// A class per record (language §9, `classFor = { … }` on a replicated view):
// each record is built as the class the body names from the record — the
// written class is the base, and the answer is it or a subclass (compile.ts
// checks the names and lowers them to strings). A capability of its own
// (compiler/src/capabilities.ts, "class-for"): a program that never writes
// `classFor` builds every record as its template's class and carries none of
// this.
import { Node } from "./node.js";
import { compileExpr } from "./expr.js";
import { DeclareError } from "./errors.js";
import { Replicator } from "./replicate.js";
/** The per-record class of a replicated element's `classFor` body. Evaluated
 *  with `this` a stand-in on the record's cursor: the body reads only `:fields`,
 *  so the choice is the record's own. An empty answer is the element's class. */
export function classOfFor(el, parentView, croot) {
    const a = el.attrs.find((x) => x.name === "classFor");
    if (a === undefined || a.value.kind !== "code")
        return null;
    const c = compileExpr(a.value.src);
    if ("error" in c)
        throw new DeclareError(`classFor = { … } ${c.error}`, a.value.pos);
    const fn = c.fn;
    return (cursor) => {
        const name = fn.call({ datapath: cursor, parent: null, $data: Node.prototype.$data }, parentView, croot);
        return typeof name === "string" && name !== "" ? name : el.tag;
    };
}
/** A block whose records are different classes. Classes are read inside the
 *  match, so a record whose kind changes re-matches — and, since an instance
 *  serves only records of its own class, is rebuilt as its new class in place.
 *  Recycling keeps to classes too: a leaver serves an arriver of its class. */
export class KindedReplicator extends Replicator {
    classOf;
    kinds = new WeakMap();
    templates = new Map();
    constructor(classOf, ...args) {
        super(...args);
        this.classOf = classOf;
    }
    classify(m) {
        const data = m.data;
        if (data !== null)
            m.classes = m.nodes.map((n) => this.classOf(data.$cursorAt(n.path)));
        return m;
    }
    kindAt(m, i) { return m.classes?.[i] ?? this.template.tag; }
    kindOf(v) { return this.kinds.get(v) ?? this.template.tag; }
    build(kind) {
        let t = kind === this.template.tag ? this.template : this.templates.get(kind);
        if (t === undefined)
            this.templates.set(kind, (t = { ...this.template, tag: kind }));
        const made = this.make(t, this.classroot);
        this.kinds.set(made.view, kind);
        return made;
    }
}
//# sourceMappingURL=class-for.js.map