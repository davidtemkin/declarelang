export interface Collision {
    canonical: string;
    lzxNames: string[];
}
export type AttrTypeKind = "color" | "length" | "number" | "boolean" | "string" | "unknown";
export interface Naming {
    tagFor(lzxTag: string): string | null;
    isBuiltinTag(lzxTag: string): boolean;
    attrFor(lzxAttr: string): string;
    attrTypeFor(declareTag: string, declareAttr: string): AttrTypeKind;
    contentAttrFor(declareTag: string): string | null;
    classNameFor(lzxName: string): string;
    isUserClass(lzxName: string): boolean;
}
export declare function buildNaming(userClassNames: string[]): {
    naming: Naming;
    collisions: Collision[];
};
