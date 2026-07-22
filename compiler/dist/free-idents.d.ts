/** One free value-position identifier occurrence, offsets in body-source
 *  coordinates. `shorthand` marks `{ count }` — its rewrite must become
 *  `count: <target>`, not a bare replacement, to stay an object literal. */
export interface FreeIdent {
    name: string;
    start: number;
    end: number;
    shorthand: boolean;
    /** The occurrence is a call's callee (`stroke(…)`) — what lets the compile
     *  layer keep the value CONSTRUCTORS (styling rung) out of member
     *  resolution: `stroke` alone is the slot, `stroke(…)` the constructor. */
    callee: boolean;
}
/** All free value-position identifiers of a body, in source order — or null
 *  when the body does not parse (the checker's compileExpr gate owns
 *  reporting syntax errors; resolution has nothing sound to say about a
 *  broken tree). `expression` bodies are parsed parenthesized, exactly as
 *  expr.ts evaluates them. `bound` seeds the outermost scope: the scope nouns,
 *  and a method's parameters. */
export declare function freeIdentifiers(src: string, opts: {
    expression: boolean;
    bound: readonly string[];
}): FreeIdent[] | null;
/** Every `0xRRGGBBAA` (8-hex) numeric literal in a body, in source order — the
 *  `0x` twin of the `#RRGGBBAA` literal. compile.ts lowers each to a
 *  `colorWithAlpha(rgb, a)` call so it rides the same translucent Color
 *  encoding and typechecks as `Color`; a color written where a number is
 *  expected then fails on `Color`'s nullability. A genuine large integer uses
 *  decimal (an 8-hex `0x` is reserved for color). Positions are relative to
 *  `src`, matching freeIdentifiers; a body that does not parse yields none. */
export declare function hexColor8Literals(src: string, expression: boolean): {
    start: number;
    end: number;
    rgb: number;
    a: number;
}[];
