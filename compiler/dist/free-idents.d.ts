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
