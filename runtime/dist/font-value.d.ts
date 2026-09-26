/** The CSS family a font names right now (its registered name, or a system family). */
export declare const FONT_CSS: unique symbol;
/** Whether a font is still inside its wait for faces it has not received. */
export declare const FONT_PENDING: unique symbol;
/** Ask a font for its faces: text has reached it. A declared font loads nothing
 *  until then — a font no text reaches costs nothing. */
export declare const FONT_DEMAND: unique symbol;
/** What a Font presents to the text machinery. */
export interface FontValue {
    readonly [FONT_CSS]: string;
    readonly [FONT_PENDING]: boolean;
    [FONT_DEMAND]?(): void;
}
/** Everything a family slot may hold. */
export type FamilyValue = string | FontValue | readonly (string | FontValue)[] | null | undefined;
export declare function isFontValue(v: unknown): v is FontValue;
interface FontDemand {
    /** Demand the font text reaches in this family list. */
    reached(v: readonly unknown[]): void;
    /** Resolve every family a tree's text starts with (fontsReady, below). */
    touch(root: object): void;
}
/** font.ts installs the demand machinery. */
export declare function provideFontDemand(h: FontDemand): void;
/** The CSS family list a value names: a string as written, a font's current
 *  family, a list joined in order. Tracked when a font is read. Resolving it is
 *  also what demands the font text reaches (above). */
export declare function familyCss(v: unknown): string;
/** Whether any font in the value is still waiting for its faces. */
export declare function familyPending(v: unknown): boolean;
/** A Font as the start-up gate and the tree walk see it — recognized by its
 *  symbol, so the production floor (boot.ts, instantiate.ts) never imports the
 *  Font class: font.ts ships only when a program declares a Font. */
export interface FontNode extends FontValue {
    autoStart(): void;
    ready(): Promise<void>;
}
export declare function isFontNode(v: unknown): v is FontNode;
/** THE START-UP GATE: resolves once every font the tree starts with has settled —
 *  its faces arrived, one failed, or its `wait` ran out. A first paint awaits this,
 *  so text measures in real faces when they come in time and never waits longer
 *  than the slowest font says it is worth. */
export declare function fontsReady(root: object): Promise<void>;
/** The fix for a font NAME written where a family goes (`fontFamily = Serif`,
 *  or a retired top-level `font Serif [ … ]`): name the object form. */
export declare function fontObjectHint(name: string): string;
/** Mark a text view as one that keeps its current look while a font loads. */
export declare function holdsFamily(host: object): void;
/** The family `host` should measure and paint `slot` in now. */
export declare function heldFamily(host: object, slot: string, v: unknown): string;
/** The family a style measures in: held for a text view, current for anything
 *  else (a style record handed to measureText or a drawing — those measure what
 *  is available right now). */
export declare function familyOf(style: {
    fontFamily?: unknown;
}): string;
export {};
