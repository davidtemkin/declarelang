/** What an absent export is. For a function: what it returns (`noop` returns
 *  undefined). For a constant: its value. For a class: an empty class. */
export type Inert = "noop" | "null" | "false" | "true" | "zero" | "empty-string" | "array" | "set" | "map" | "object" | "identity" | "unsubscribe" | "class" | "rejects" | {
    returns: Inert;
} | {
    resolves: Inert;
} | {
    wrap: string;
} | {
    members: Record<string, Inert>;
};
/** Which "not aboard" sentence a refusal speaks (errors.ts notAboard). */
export type Refusal = "unused" | "checker" | "inspector" | "bridge" | "selectors";
/** A construct the walk marks: a replicating datapath (`:items[]`), `<->`, a
 *  selector segment in a path, a data shape, any read of data at all (a
 *  `:path`, a datapath, `$data`), a literal the compile could not turn into
 *  its value (program-build.ts, lower-literals.ts), and an attribute whose
 *  wiring the compile could not decide (runtime/src/route.ts). */
export type Construct = "replication" | "two-way" | "selector-path" | "schema" | "data-read" | "raw-literal" | "unrouted";
/** One way a program reaches a capability. A capability is needed when ANY of
 *  its triggers matches; a trigger matches when ANY of its conditions does. */
export interface Trigger {
    /** the program constructs one, or one descending from it (tags, `extends`
     *  bases, `new X()`, `use [ … ]`, and each built-in's own bases) */
    classes?: readonly string[];
    /** the program constructs this class itself — a built-in that descends from
     *  it (Spring from Animator) does not count */
    ownClasses?: readonly string[];
    /** an element declares a method of this name — a handler, `draw` */
    methods?: readonly string[];
    /** an element sets it, or a body writes it */
    attributes?: readonly string[];
    /** literal values that do NOT count for an attribute (`focusable = false`) */
    attributesUnless?: Readonly<Record<string, string>>;
    /** a body names it: as an identifier, a property, or a callee */
    mentions?: readonly string[];
    /** a body calls it, or a slot's literal value constructs it */
    calls?: readonly string[];
    /** a body assigns this property */
    writes?: readonly string[];
    /** a slot of this name is set to a value the build cannot read (a `{ }` body, a `:path`) */
    dynamicSlots?: readonly string[];
    /** a slot of this name is set at all */
    slots?: readonly string[];
    /** an attribute that counts only on these classes: an element descending from
     *  one of `on` sets it, or the program constructs one of `on` and a body names
     *  or writes it (a body's receiver cannot be seen, so any mention counts) */
    scoped?: {
        attributes: readonly string[];
        on: readonly string[];
    };
    syntax?: readonly Construct[];
    /** the build itself: its renderer, and what it was asked to carry */
    build?: {
        render?: "dom" | "canvas";
        debug?: true;
        inspector?: true;
        compiler?: true;
        bridge?: true;
    };
}
export interface Capability {
    id: string;
    /** what it is, for `--why` and BUILD.json */
    describe: string;
    /** the files it replaces when absent: runtime/dist/<m>.js, or browser/<m>.js with the `browser/` prefix */
    modules: readonly string[];
    /** needed when any of these matches; none at all means needed only through `requires` */
    when: readonly Trigger[];
    requires?: readonly string[];
    /** a page that HOSTS programs (islands) keeps it: a hosted program may need what the page never names */
    hostsKeep?: boolean;
    /** exports the core calls whether or not the capability is used */
    inert?: Readonly<Record<string, Inert>>;
    refusal: Refusal;
    /** a `--debug` build keeps every capability except those whose absence is the
     *  build's own shape — another renderer, or a compiler the program never asked for */
    debugKeeps?: false;
    /** A TABLE a program reaches only by name: when the capability is not needed
     *  whole, its module ships as itself with this export's object literal cut to
     *  the entries the program names (subsetModule), instead of a stand-in — and
     *  whatever only the cut entries referenced is left for the bundler to drop.
     *  `keys` says which names: `classes`, what it constructs, closed over bases. */
    subset?: {
        export: string;
        keys: "classes";
    };
}
export declare const CAPABILITIES: readonly Capability[];
/** What the build reads off one program — once, for every capability. */
export interface ProgramFacts {
    /** what the program constructs, closed over each built-in's bases */
    classes: Set<string>;
    /** what the program constructs, as written */
    ownClasses: Set<string>;
    methods: Set<string>;
    /** attribute name → the literal values it was set to ("" for a value the build cannot read) */
    attributes: Map<string, Set<string>>;
    mentions: Set<string>;
    calls: Set<string>;
    writes: Set<string>;
    dynamicSlots: Set<string>;
    syntax: Set<Construct>;
    /** attribute name → the built-in classes of the elements that set it (a
     *  program class resolved through its `extends` chain, with each built-in's bases) */
    attributeOn: Map<string, Set<string>>;
}
export interface BuildContext {
    render: "dom" | "canvas";
    debug: boolean;
    inspector: boolean;
    compiler: boolean;
    /** the page hosts other programs (islands) */
    hosts: boolean;
    /** the build carries the `__declare` bridge and nothing else the debug shape
     *  would — how the corpus gate drives a slimmed build through verify's rungs */
    bridge?: boolean;
}
interface Val {
    kind?: string;
    src?: string;
    name?: string;
    plan?: unknown[];
    value?: unknown;
    args?: unknown[];
}
interface El {
    tag?: string;
    attrs?: Array<{
        name: string;
        value?: Val;
        bind?: string;
    }>;
    decls?: Array<{
        name: string;
        def?: Val | null;
    }>;
    methods?: Array<{
        name: string;
        body?: string;
    }>;
    children?: El[];
}
interface ProgramLike {
    root: El;
    classes: Array<{
        name?: string;
        base?: string | null;
        body: El;
    }>;
}
/** ONE walk over the program — its tree, its classes, every `{ }` body. */
export declare function programFacts(program: ProgramLike, usedClasses: Iterable<string>): ProgramFacts;
/** The capabilities a program needs, closed over `requires`, each with why. */
export declare function neededCapabilities(f: ProgramFacts, b: BuildContext, manifest?: readonly Capability[]): Map<string, string>;
/** A module's exports, read with TypeScript's parser from its built JavaScript. */
export interface ModuleExport {
    name: string;
    kind: "function" | "class" | "const" | "reexport";
    local?: string;
    from?: string;
}
export declare function exportsOf(source: string): ModuleExport[];
/** The module a SUBSET capability ships when it is not needed whole: the
 *  module's own source, its table export's object literal holding only the
 *  entries `facts` names. */
export declare function subsetModule(cap: Capability, moduleName: string, source: string, facts: ProgramFacts): string;
/** The stand-in for one module of an absent capability. `helpersFrom` is the
 *  import specifier for runtime/dist/stand-in.js as seen from the module's folder. */
export declare function standIn(cap: Capability, moduleName: string, source: string, helpersFrom: string): string;
export {};
