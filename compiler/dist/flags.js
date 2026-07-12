// flags — the compile-time options, as ONE canonical model shared by all three
// entry points: the `declarec` CLI, the dev server's URL query, and the
// in-browser compile URL. So `?backend=canvas&prod` on the server, `--backend
// canvas --prod` on the CLI, and `?prod` in the browser all mean the same thing.
// A single place defines the flags, their defaults, and how a truthy/falsy
// value is spelled — no per-entry-point drift.
export const DEFAULT_FLAGS = {
    backend: "dom", prod: false, slim: true, stripPos: true, typecheck: false,
};
/** The flag names, for docs / help text / validation — one list, three surfaces.
 *  `bool` flags accept `?f`, `?f=1`, `?f=true` (on) and `?f=0`/`false` (off);
 *  the CLI spells them `--f` / `--no-f`. */
export const FLAG_NAMES = ["backend", "prod", "slim", "keeppos", "typecheck"];
const ON = new Set(["", "1", "true", "yes", "on"]);
const OFF = new Set(["0", "false", "no", "off"]);
/** Normalize URL/query flags into the option set, over a base (defaults, or an
 *  entry point's own baseline — e.g. the CLI passes `prod: true`). Unknown query
 *  keys are ignored; a malformed boolean value falls back to the base. */
export function parseFlags(params, base = DEFAULT_FLAGS) {
    const bool = (name, def) => {
        if (!params.has(name))
            return def;
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
export function parseArgvFlags(argv, base = DEFAULT_FLAGS) {
    const flags = { ...base };
    const rest = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--backend")
            flags.backend = argv[++i] === "canvas" ? "canvas" : "dom";
        else if (a === "--canvas")
            flags.backend = "canvas";
        else if (a === "--dom")
            flags.backend = "dom";
        else if (a === "--prod")
            flags.prod = true;
        else if (a === "--slim")
            flags.slim = true;
        else if (a === "--no-slim" || a === "--full")
            flags.slim = false;
        else if (a === "--keep-pos" || a === "--keeppos")
            flags.stripPos = false;
        else if (a === "--typecheck")
            flags.typecheck = true;
        else
            rest.push(a);
    }
    return { flags, rest };
}
//# sourceMappingURL=flags.js.map