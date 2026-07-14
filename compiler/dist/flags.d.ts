/** The full compile-time option set. Not every entry point honours every flag
 *  (the CLI is always a production build, so its `prod` is implicitly true), but
 *  they all read the SAME names and meanings. */
export interface CompileFlags {
    /** Which RENDERER to bundle / mount (?render=canvas / --render canvas): managed DOM, or one `<canvas>`. */
    render: "dom" | "canvas";
    /** Production build — precompile + bundle the run-path only (declarec), vs a
     *  dev compile that ships the source + compiler. */
    prod: boolean;
    /** Registry slimming: ship only the component classes the app can instantiate
     *  (production only; the escape hatch is the source's `use [ … ]`). */
    slim: boolean;
    /** Drop source-position fields from the shipped program (production; halves its
     *  size). Set false (`?stripPos=0` / `--no-strip-pos`) to keep them for
     *  debugging a precompiled build. */
    stripPos: boolean;
    /** The tsc-over-bodies typecheck pass — ON by default, a phase of THE
     *  compile (compile.ts runs the checker directly; no surface can no-op it).
     *  `?typecheck=0` / `--no-typecheck` is the explicit opt-out for a
     *  latency-critical loop. */
    typecheck: boolean;
    /** Static extraction (design/capabilities.md §5): embed the program's content
     *  as semantic HTML in the run page's host element, for crawlers and AI
     *  readers that don't run the app (`--seo` on declarec bakes it into the
     *  built index.html; `?seo` on a dev-server run URL embeds it server-side).
     *  The block is removed at boot before the app mounts. Distinct from the
     *  `?view=seo` REQUEST TYPE (reqtypes.ts), which returns the extracted
     *  document alone. */
    seo: boolean;
}
/** One spec per flag — the SINGLE source of truth every surface derives from.
 *  `name` is the canonical `CompileFlags` field (also the URL/CLI name, cased per
 *  surface). Add a flag by adding a spec; no parser edits needed. */
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
/** The canonical flag names (docs / help text / validation), from the registry. */
export declare const FLAG_NAMES: readonly (keyof CompileFlags)[];
/** The read surface both a Node `URL`'s searchParams and the browser's
 *  `location.search` params satisfy. */
export interface FlagParams {
    has(name: string): boolean;
    get(name: string): string | null;
}
/** Normalize URL/query flags into the option set, over a base (defaults, or an
 *  entry point's own baseline — e.g. the CLI passes `prod: true`). Unknown query
 *  keys are ignored; a malformed value falls back to the base. Derived entirely
 *  from `FLAG_SPECS`, so a new flag needs no edit here. */
export declare function parseFlags(params: FlagParams, base?: CompileFlags): CompileFlags;
/** Parse the same flags from CLI argv tokens (`--render canvas`, `--no-slim`,
 *  `--strip-pos` / `--no-strip-pos`, `--prod`, `--typecheck`). Returns the flags
 *  plus the leftover positional args (the input path, etc.). Long flags only;
 *  `--no-<name>` negates a boolean. Enum VALUES are accepted as shorthand switches
 *  (`--canvas` ≡ `--render canvas`); `--full` is a kept alias for `--no-slim`. */
export declare function parseArgvFlags(argv: readonly string[], base?: CompileFlags): {
    flags: CompileFlags;
    rest: string[];
};
