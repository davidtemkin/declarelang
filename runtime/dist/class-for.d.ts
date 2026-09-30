import type { Element } from "./parser.js";
import type { Cursor } from "./data.js";
import type { View } from "./view.js";
import { Replicator, type Match, type Materialize } from "./replicate.js";
/** The class a record is built as, read from the record at its cursor. */
export type ClassOf = (cursor: Cursor) => string;
/** The per-record class of a replicated element's `classFor` body. Evaluated
 *  with `this` a stand-in on the record's cursor: the body reads only `:fields`,
 *  so the choice is the record's own. An empty answer is the element's class. */
export declare function classOfFor(el: Element, parentView: View, croot: View): ClassOf | null;
/** A block whose records are different classes. Classes are read inside the
 *  match, so a record whose kind changes re-matches — and, since an instance
 *  serves only records of its own class, is rebuilt as its new class in place.
 *  Recycling keeps to classes too: a leaver serves an arriver of its class. */
export declare class KindedReplicator extends Replicator {
    private readonly classOf;
    private readonly kinds;
    private readonly templates;
    constructor(classOf: ClassOf, ...args: ConstructorParameters<typeof Replicator>);
    protected classify(m: Match): Match;
    protected kindAt(m: Match, i: number): string;
    protected kindOf(v: View): string;
    protected build(kind: string): ReturnType<Materialize>;
}
