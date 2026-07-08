import { type AttrType } from "./value.js";
export interface ComponentSchema {
    readonly name: string;
    readonly base: ComponentSchema | null;
    readonly attrs: Readonly<Record<string, AttrType>>;
    /** Which of this schema's OWN attrs are `prevailing` (styling rung): an
     *  unset slot follows the nearest providing ancestor's value, live. Being
     *  prevailing is declared once, with the slot — part of its identity, like
     *  its type (a subclass can neither redeclare nor change it). Absent =
     *  none of its own. */
    readonly prevailing?: readonly string[];
    /** Events this component itself fires — a handler member `on<Event>` must
     *  answer one (language §8: a class *declares* the events it fires, and
     *  the checker verifies against the declaration, so a typo'd handler is a
     *  compile error, not a silent no-op). Inherited events come from the
     *  `base` chain; absent = declares none of its own. */
    readonly events?: readonly string[];
}
/** Tag → schema: the checker's component registry. Must stay in step with
 *  instantiate.ts's tag → class table (layout strategies with its layout
 *  table, data nodes with its data table, animators with its animator table);
 *  R6 registers user classes into both. */
export declare const SCHEMAS: Readonly<Record<string, ComponentSchema>>;
/** Does `schema`'s inheritance chain pass through a component named
 *  `ancestor`? The checker's kind test — "is this tag a Layout?", "may a
 *  class extend this base?" — kept name-based so per-program schema copies
 *  need no object identity discipline (names are unique per program). */
export declare function descendsFrom(schema: ComponentSchema, ancestor: string): boolean;
/** The declared type of `name` on `schema`, walking the inheritance chain;
 *  null when no ancestor declares it. Own-key lookups, so an attribute named
 *  `toString` can't resolve through Object.prototype. */
export declare function attrType(schema: ComponentSchema, name: string): AttrType | null;
/** Is `name` a prevailing attribute on `schema` (or its chain)? Asked of the
 *  schema that DECLARES the name — being prevailing is part of the slot's
 *  identity, so the declaring schema's word is the whole answer. */
export declare function isPrevailing(schema: ComponentSchema, name: string): boolean;
/** The handler member name for an event: click → onClick (language §8's
 *  `on` prefix — the one naming rule, shared by the checker and dispatch). */
export declare const handlerName: (event: string) => string;
/** The event a handler-shaped name answers (onClick → click), or null when
 *  the name is not handler-shaped. Handler-shaped is exactly `on` + a
 *  capital (the doc's rule — what keeps handlers out of the plain-method
 *  namespace), so `once` or `onward` are plain method names. */
export declare function eventOfHandler(name: string): string | null;
/** Every event `schema` answers, base-first — the inheritance walk of
 *  attrType, over the events half of the declaration. */
export declare function eventsOf(schema: ComponentSchema): string[];
