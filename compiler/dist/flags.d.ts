/** The full compile-time option set. Not every entry point honours every flag
 *  (the CLI is always a production build, so its `prod` is implicitly true), but
 *  they all read the SAME names and meanings. */
export interface CompileFlags {
    /** Which render backend to bundle / mount: managed DOM, or one `<canvas>`. */
    backend: "dom" | "canvas";
    /** Production build — precompile + bundle the run-path only (declarec), vs a
     *  dev compile that ships the source + compiler. */
    prod: boolean;
    /** Registry slimming: ship only the component classes the app can instantiate
     *  (production only; the escape hatch is the source's `use [ … ]`). */
    slim: boolean;
    /** Drop source-position fields from the shipped program (production; halves
     *  its size). `keeppos` turns this off for debugging a precompiled build. */
    stripPos: boolean;
    /** Run the advisory tsc-over-bodies typecheck pass (off by default — the
     *  runtime schema check is the real gate). */
    typecheck: boolean;
}
export declare const DEFAULT_FLAGS: CompileFlags;
/** The flag names, for docs / help text / validation — one list, three surfaces.
 *  `bool` flags accept `?f`, `?f=1`, `?f=true` (on) and `?f=0`/`false` (off);
 *  the CLI spells them `--f` / `--no-f`. */
export declare const FLAG_NAMES: readonly ["backend", "prod", "slim", "keeppos", "typecheck"];
/** The read surface both a Node `URL`'s searchParams and the browser's
 *  `location.search` params satisfy. */
export interface FlagParams {
    has(name: string): boolean;
    get(name: string): string | null;
}
/** Normalize URL/query flags into the option set, over a base (defaults, or an
 *  entry point's own baseline — e.g. the CLI passes `prod: true`). Unknown query
 *  keys are ignored; a malformed boolean value falls back to the base. */
export declare function parseFlags(params: FlagParams, base?: CompileFlags): CompileFlags;
/** Parse the same flags from CLI argv tokens (`--backend canvas`, `--no-slim`,
 *  `--keep-pos`, `--prod`). Returns the flags plus the leftover positional args
 *  (the input path, etc.). Long flags only; `--no-X` negates a boolean. */
export declare function parseArgvFlags(argv: readonly string[], base?: CompileFlags): {
    flags: CompileFlags;
    rest: string[];
};
