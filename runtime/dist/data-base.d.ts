export declare function setAppDataBase(root: object, base: string | null): void;
/** Resolve a source's url through its app's base (identity when none). */
export declare function appResolve(root: object, url: string): string;
