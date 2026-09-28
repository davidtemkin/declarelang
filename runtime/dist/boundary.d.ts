/** The host values an App starts with: `seed` is build's `provides` (view.ts
 *  withHostProvides), so the app's very first evaluation already reads them. */
export declare function hostValuesFor(seed: Readonly<Record<string, unknown>> | null): BoundaryValues;
/** A set of named reactive values crossing a boundary — what a host provides
 *  to an app (App.hostValues), what a hosted side exposes to its island
 *  (Island.exposedValues). Each name owns a cell, created on first read, so a
 *  write wakes exactly its readers; a write from outside a settle schedules
 *  one (reactive.ts touchCell), which is how a page or foreign code drives it. */
export declare class BoundaryValues {
    private readonly what;
    private readonly m;
    private readonly warned;
    constructor(what: "hostProvided" | "exposed");
    private entry;
    write(name: string, v: unknown): void;
    clear(name: string): void;
    names(): string[];
    /** The tracked read. With a default: an absent value, or one of a different
     *  kind than the default, answers the default (the latter with a warning,
     *  once per name). With none: an absent value throws, naming it. */
    read(name: string, hasDefault: boolean, dflt: unknown): unknown;
}
