import type { Literal } from "../../runtime/dist/parser.js";
/** What the coercions of each literal produced, collected during the check. */
export declare class LiteralValues {
    private readonly seen;
    readonly note: (lit: Literal, value: unknown) => void;
    has(lit: Literal): boolean;
    /** Why `lit` cannot ship as a value: its coercions disagreed, or the value is
     *  not plain data. Null when it can. */
    whyNot(lit: Literal): string | null;
    /** The one value every coercion of `lit` agreed on, if it is plain data. */
    valueOf(lit: Literal): {
        value: unknown;
    } | null;
}
/** Replace every literal in `program` whose value is known with that value, in
 *  place. A literal is replaced whole; a list that is not is walked for items
 *  that are (a bare list's items are coerced one by one); a constructor call
 *  that is not is left whole, since its arguments are its parser's. Returns how
 *  many literals were replaced, and how many the runtime will still coerce from
 *  their written form (coerced during the check, but not to plain data). */
export declare function lowerLiterals(program: object, values: LiteralValues): {
    lowered: number;
    kept: Array<{
        pos: unknown;
        why: string;
    }>;
};
/** `theme = SanFranciscoDark` — a built-in preset named as a literal — ships as
 *  the preset's record. The runtime resolves such a name against the preset
 *  table, which a production build carries only for a program whose bodies name
 *  a preset; resolving it here means the build carries the one record it uses
 *  and no table. A name the program declares itself (`theme Name [ … ]`) is left
 *  as written: the runtime resolves it from the declaration, which ships anyway. */
export declare function lowerThemeNames(program: {
    themes?: ReadonlyArray<{
        name: string;
    }>;
} & object): number;
