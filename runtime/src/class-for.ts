// A class per record (language §9, `classFor = { … }` on a replicated view):
// each record is built as the class the body names from the record — the
// written class is the base, and the answer is it or a subclass (compile.ts
// checks the names and lowers them to strings). A capability of its own
// (compiler/src/capabilities.ts, "class-for"): a program that never writes
// `classFor` builds every record as its template's class and carries none of
// this.

import type { Element } from "./parser.js";
import type { Cursor } from "./data.js";
import type { View } from "./view.js";
import { Node } from "./node.js";
import { compileExpr } from "./expr.js";
import { DeclareError } from "./errors.js";
import { Replicator, type Match, type Materialize } from "./replicate.js";

/** The class a record is built as, read from the record at its cursor. */
export type ClassOf = (cursor: Cursor) => string;

/** The per-record class of a replicated element's `classFor` body. Evaluated
 *  with `this` a stand-in on the record's cursor: the body reads only `:fields`,
 *  so the choice is the record's own. An empty answer is the element's class. */
export function classOfFor(el: Element, parentView: View, croot: View): ClassOf | null {
  const a = el.attrs.find((x) => x.name === "classFor");
  if (a === undefined || a.value.kind !== "code") return null;
  const c = compileExpr(a.value.src);
  if ("error" in c) throw new DeclareError(`classFor = { … } ${c.error}`, a.value.pos);
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
  private readonly kinds = new WeakMap<View, string>();
  private readonly templates = new Map<string, Element>();

  constructor(private readonly classOf: ClassOf, ...args: ConstructorParameters<typeof Replicator>) {
    super(...args);
  }

  protected override classify(m: Match): Match {
    const data = m.data;
    if (data !== null) m.classes = m.nodes.map((n) => this.classOf(data.cursorAt(n.path)));
    return m;
  }

  protected override kindAt(m: Match, i: number): string { return m.classes?.[i] ?? this.template.tag; }

  protected override kindOf(v: View): string { return this.kinds.get(v) ?? this.template.tag; }

  protected override build(kind: string): ReturnType<Materialize> {
    let t = kind === this.template.tag ? this.template : this.templates.get(kind);
    if (t === undefined) this.templates.set(kind, (t = { ...this.template, tag: kind }));
    const made = this.make(t, this.classroot);
    this.kinds.set(made.view, kind);
    return made;
  }
}
