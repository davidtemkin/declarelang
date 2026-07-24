export interface PropEntry {
    attr: string;
    coerce: (raw: string) => unknown;
}
export declare const PROP_MAP: Record<string, PropEntry>;
/** PURE: matched declarations → coerced (attr → value) offers. Unmapped
 *  properties and malformed values are dropped. */
export declare function coerceDecls(decls: Map<string, string>, map?: Record<string, PropEntry>): Map<string, unknown>;
