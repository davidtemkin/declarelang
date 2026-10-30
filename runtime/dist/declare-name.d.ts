/** The registry's tables, to be read when a name is first asked. */
export declare function nameClassesFrom(f: () => readonly Readonly<Record<string, unknown>>[]): void;
/** The class of `n` as the program names it: stamped, else registered, else its JavaScript name. */
export declare function declareName(n: object): string;
