/** Set the base that relative sources resolve against; returns the previous
 *  one, so a scoped caller can restore it — the provideTransport contract. */
export declare function provideAssetBase(base: string | null): string | null;
/** State the directory ONE app's relative assets live in (its program's own).
 *  The embedding host calls it before mount — the child never states its own
 *  base, exactly as it never states its own transport. */
export declare function setAppAssetBase(root: object, base: string | null): void;
/** The base in force for `root` — its own if it has one, else the page's. */
export declare function assetBaseFor(root?: object | null): string | null;
/** Resolve one relative source against a stated base. Absolute,
 *  protocol-relative, root-relative and data: sources pass through untouched. */
export declare function rebaseAsset(source: string, base: string | null): string;
/** Resolve a source for the app `root` belongs to. */
export declare function resolveAsset(source: string, root?: object | null): string;
