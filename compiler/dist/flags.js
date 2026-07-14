// flags — the compile-time MODIFIERS, as ONE canonical model shared by all three
// entry points: the `declarec` CLI, the dev server's URL query, and the in-browser
// compile URL. A single REGISTRY (`FLAG_SPECS`) defines each modifier once — its
// canonical name, kind, and default — and all three parsers DERIVE from it, so the
// surfaces name every one the SAME way and cannot drift. `?render=canvas` on the
// server, `--render canvas` (or `--canvas`) on the CLI, and `{ render: "canvas" }` in
// a JS `compile()` call all mean the same thing; adding a modifier is a single entry
// below, picked up by every surface.
//
// There are exactly TWO modifiers — `render` and `seo` — and they compose onto the
// app-producing REQUESTS (`run`, `build`; see reqtypes.ts and design/requests.md).
// The request TYPE (what artifact a URL returns) is orthogonal and lives in
// reqtypes.ts. Everything is lowercase — no camelCase in the URL/CLI surface.
//
// Deliberately NOT flags (see design/requests.md §"Removed knobs"):
//   • `prod` is a REQUEST (`?build`, reqtypes.ts REQ.BUILD), not a modifier.
//   • `slim` / `stripPos` are what a build IS (always slimmed + position-stripped);
//     the one caller wanting an un-stripped build to debug the emitter uses
//     `declarec --debug`, not a public flag.
//   • `typecheck` is a mandatory phase of the one compile — always on, no opt-out.
// The compiler's INTERNAL options still carry stripPos/typecheck (the build act sets
// them); only this externally-named FLAG surface is the two modifiers.
export const FLAG_SPECS = [
    { name: "render", kind: "enum", values: ["dom", "canvas"], default: "dom" },
    { name: "seo", kind: "bool", default: false },
];
/** Defaults, derived from the registry — never hand-maintained. */
export const DEFAULT_FLAGS = Object.fromEntries(FLAG_SPECS.map((s) => [s.name, s.default]));
/** The canonical modifier names (docs / help text / validation), from the registry. */
export const FLAG_NAMES = FLAG_SPECS.map((s) => s.name);
const ON = new Set(["", "1", "true", "yes", "on"]);
const OFF = new Set(["0", "false", "no", "off"]);
const coerceBool = (value, def) => {
    const v = (value ?? "").toLowerCase();
    return OFF.has(v) ? false : ON.has(v) ? true : def;
};
/** Normalize URL/query modifiers into the option set, over a base (defaults, or an
 *  entry point's own baseline). Unknown query keys are ignored; a malformed value
 *  falls back to the base. Derived entirely from `FLAG_SPECS`, so a new modifier needs
 *  no edit here. Names are lowercase, so a single lookup suffices. */
export function parseFlags(params, base = DEFAULT_FLAGS) {
    const out = { ...base };
    for (const spec of FLAG_SPECS) {
        if (!params.has(spec.name))
            continue;
        const value = params.get(spec.name);
        if (spec.kind === "bool")
            out[spec.name] = coerceBool(value, base[spec.name]);
        else
            out[spec.name] = value !== null && spec.values.includes(value) ? value : base[spec.name];
    }
    return out;
}
/** Parse the same modifiers from CLI argv tokens (`--render canvas` / `--canvas`,
 *  `--seo`). Returns the modifiers plus the leftover positional args (the input path,
 *  etc.). Long flags only; `--no-<name>` negates a boolean. Enum VALUES are accepted
 *  as shorthand switches (`--canvas` ≡ `--render canvas`). Non-modifier switches the
 *  CLI owns (`--out`, `--debug`, `--extract`, `--highlight`, `--quiet`) pass through in
 *  `rest` for the CLI to handle. */
export function parseArgvFlags(argv, base = DEFAULT_FLAGS) {
    const flags = { ...base };
    const rest = [];
    const bySwitch = new Map();
    const enumValueAlias = new Map();
    for (const spec of FLAG_SPECS) {
        bySwitch.set(spec.name, spec);
        if (spec.kind === "enum")
            for (const v of spec.values)
                enumValueAlias.set(v, spec.name);
    }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith("--")) {
            rest.push(a);
            continue;
        }
        let tok = a.slice(2);
        let negate = false;
        if (tok.startsWith("no-")) {
            negate = true;
            tok = tok.slice(3);
        }
        if (!negate && enumValueAlias.has(tok)) {
            flags[enumValueAlias.get(tok)] = tok;
            continue;
        }
        const spec = bySwitch.get(tok);
        if (spec === undefined) {
            rest.push(a);
            continue;
        }
        if (spec.kind === "bool") {
            flags[spec.name] = !negate;
            continue;
        }
        const val = argv[i + 1]; // enum needs a value: `--render canvas`
        if (val !== undefined && spec.values.includes(val)) {
            flags[spec.name] = val;
            i++;
        }
    }
    return { flags: flags, rest };
}
//# sourceMappingURL=flags.js.map