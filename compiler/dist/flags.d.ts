/** The compile-time modifier set. Both entry points honour both; the canonical name
 *  is the field (also the URL/CLI name):
 *    • JS   `{ render: "canvas" }`
 *    • URL  `?render=canvas`, `?crawler`
 *    • CLI  `--render canvas` / `--canvas`, `--crawler` */
export interface CompileFlags {
    /** Which RENDERER to bundle / mount (`?render=canvas` / `--render canvas`): managed
     *  DOM, or one `<canvas>`. */
    render: "dom" | "canvas";
    /** Static extraction (design/capabilities.md §5): embed the program's content as
     *  semantic HTML in the run/build wrapper's host element (`#declare-static`), for
     *  crawlers and AI readers that don't run the app. Removed before first paint, never
     *  CSS-hidden (browser/serve-core.js). `--crawler` on declarec bakes it into the built
     *  index.html; `?crawler` on a dev-server run URL embeds it server-side. Distinct from
     *  the `extract` REQUEST (reqtypes.ts REQ.EXTRACT / `?extract`), which returns that
     *  document ALONE. */
    crawler: boolean;
}
/** One spec per modifier — the SINGLE source of truth every surface derives from.
 *  `name` is the canonical `CompileFlags` field (also the URL/CLI name). Add a
 *  modifier by adding a spec; no parser edits needed. */
export type FlagSpec = {
    readonly name: keyof CompileFlags;
    readonly kind: "bool";
    readonly default: boolean;
} | {
    readonly name: keyof CompileFlags;
    readonly kind: "enum";
    readonly values: readonly string[];
    readonly default: string;
};
export declare const FLAG_SPECS: readonly FlagSpec[];
/** Defaults, derived from the registry — never hand-maintained. */
export declare const DEFAULT_FLAGS: CompileFlags;
/** The canonical modifier names (docs / help text / validation), from the registry. */
export declare const FLAG_NAMES: readonly (keyof CompileFlags)[];
/** The read surface both a Node `URL`'s searchParams and the browser's
 *  `location.search` params satisfy. */
export interface FlagParams {
    has(name: string): boolean;
    get(name: string): string | null;
}
/** Normalize URL/query modifiers into the option set, over a base (defaults, or an
 *  entry point's own baseline). Unknown query keys are ignored; a malformed value
 *  falls back to the base. Derived entirely from `FLAG_SPECS`, so a new modifier needs
 *  no edit here. Names are lowercase, so a single lookup suffices. */
export declare function parseFlags(params: FlagParams, base?: CompileFlags): CompileFlags;
/** Parse the same modifiers from CLI argv tokens (`--render canvas` / `--canvas`,
 *  `--crawler`). Returns the modifiers plus the leftover positional args (the input path,
 *  etc.). Long flags only; `--no-<name>` negates a boolean. Enum VALUES are accepted
 *  as shorthand switches (`--canvas` ≡ `--render canvas`). Non-modifier switches the
 *  CLI owns (`--out`, `--debug`, `--extract`, `--highlight`, `--quiet`) pass through in
 *  `rest` for the CLI to handle. */
export declare function parseArgvFlags(argv: readonly string[], base?: CompileFlags): {
    flags: CompileFlags;
    rest: string[];
};
