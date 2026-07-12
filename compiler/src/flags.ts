// flags — the compile-time options, as ONE canonical model shared by all three
// entry points: the `declarec` CLI, the dev server's URL query, and the
// in-browser compile URL. So `?backend=canvas&prod` on the server, `--backend
// canvas --prod` on the CLI, and `?prod` in the browser all mean the same thing.
// A single place defines the flags, their defaults, and how a truthy/falsy
// value is spelled — no per-entry-point drift.

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

export const DEFAULT_FLAGS: CompileFlags = {
  backend: "dom", prod: false, slim: true, stripPos: true, typecheck: false,
};

/** The flag names, for docs / help text / validation — one list, three surfaces.
 *  `bool` flags accept `?f`, `?f=1`, `?f=true` (on) and `?f=0`/`false` (off);
 *  the CLI spells them `--f` / `--no-f`. */
export const FLAG_NAMES = ["backend", "prod", "slim", "keeppos", "typecheck"] as const;

const ON = new Set(["", "1", "true", "yes", "on"]);
const OFF = new Set(["0", "false", "no", "off"]);

/** The read surface both a Node `URL`'s searchParams and the browser's
 *  `location.search` params satisfy. */
export interface FlagParams {
  has(name: string): boolean;
  get(name: string): string | null;
}

/** Normalize URL/query flags into the option set, over a base (defaults, or an
 *  entry point's own baseline — e.g. the CLI passes `prod: true`). Unknown query
 *  keys are ignored; a malformed boolean value falls back to the base. */
export function parseFlags(params: FlagParams, base: CompileFlags = DEFAULT_FLAGS): CompileFlags {
  const bool = (name: string, def: boolean): boolean => {
    if (!params.has(name)) return def;
    const v = (params.get(name) ?? "").toLowerCase();
    return OFF.has(v) ? false : ON.has(v) ? true : def;
  };
  const backendRaw = params.get("backend");
  const keepPos = bool("keeppos", !base.stripPos);
  return {
    backend: backendRaw === "canvas" ? "canvas" : backendRaw === "dom" ? "dom" : base.backend,
    prod: bool("prod", base.prod),
    slim: bool("slim", base.slim),
    stripPos: !keepPos,
    typecheck: bool("typecheck", base.typecheck),
  };
}

/** Parse the same flags from CLI argv tokens (`--backend canvas`, `--no-slim`,
 *  `--keep-pos`, `--prod`). Returns the flags plus the leftover positional args
 *  (the input path, etc.). Long flags only; `--no-X` negates a boolean. */
export function parseArgvFlags(argv: readonly string[], base: CompileFlags = DEFAULT_FLAGS): { flags: CompileFlags; rest: string[] } {
  const flags: CompileFlags = { ...base };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--backend") flags.backend = argv[++i] === "canvas" ? "canvas" : "dom";
    else if (a === "--canvas") flags.backend = "canvas";
    else if (a === "--dom") flags.backend = "dom";
    else if (a === "--prod") flags.prod = true;
    else if (a === "--slim") flags.slim = true;
    else if (a === "--no-slim" || a === "--full") flags.slim = false;
    else if (a === "--keep-pos" || a === "--keeppos") flags.stripPos = false;
    else if (a === "--typecheck") flags.typecheck = true;
    else rest.push(a);
  }
  return { flags, rest };
}
