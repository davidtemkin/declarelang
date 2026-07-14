// flags — the compile-time options, as ONE canonical model shared by all three
// entry points: the `declarec` CLI, the dev server's URL query, and the in-browser
// compile URL. A single REGISTRY (`FLAG_SPECS`) defines each flag once — its
// canonical name, kind, and default — and all three parsers DERIVE from it, so the
// surfaces name every flag the SAME way and cannot drift. `?prod` on the server,
// `--prod` on the CLI, and `{ prod: true }` in a JS `compile()` call all mean the
// same thing; adding a flag is a single entry below, picked up by every surface.
//
// Naming is uniform across surfaces — the canonical name is the `CompileFlags`
// field (camelCase):
//   • JS     `{ stripPos: false }`
//   • URL    `?stripPos=0`   (or its all-lowercase form `?strippos=0`)
//   • CLI    `--no-strip-pos`  (kebab-cased; `--strip-pos` sets it true)
export const FLAG_SPECS = [
    { name: "render", kind: "enum", values: ["dom", "canvas"], default: "dom" },
    { name: "prod", kind: "bool", default: false },
    { name: "slim", kind: "bool", default: true },
    { name: "stripPos", kind: "bool", default: true },
    { name: "typecheck", kind: "bool", default: true },
];
/** Defaults, derived from the registry — never hand-maintained. */
export const DEFAULT_FLAGS = Object.fromEntries(FLAG_SPECS.map((s) => [s.name, s.default]));
/** The canonical flag names (docs / help text / validation), from the registry. */
export const FLAG_NAMES = FLAG_SPECS.map((s) => s.name);
/** camelCase → kebab-case, for the CLI spelling (`stripPos` → `strip-pos`). */
const kebab = (s) => s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
const ON = new Set(["", "1", "true", "yes", "on"]);
const OFF = new Set(["0", "false", "no", "off"]);
const coerceBool = (value, def) => {
    const v = (value ?? "").toLowerCase();
    return OFF.has(v) ? false : ON.has(v) ? true : def;
};
/** Try the canonical name then its all-lowercase form, so both `?stripPos` and
 *  `?strippos` match the `stripPos` flag (camelCase names have no other casing). */
function lookup(params, name) {
    for (const key of name === name.toLowerCase() ? [name] : [name, name.toLowerCase()]) {
        if (params.has(key))
            return { present: true, value: params.get(key) };
    }
    return { present: false, value: null };
}
/** Normalize URL/query flags into the option set, over a base (defaults, or an
 *  entry point's own baseline — e.g. the CLI passes `prod: true`). Unknown query
 *  keys are ignored; a malformed value falls back to the base. Derived entirely
 *  from `FLAG_SPECS`, so a new flag needs no edit here. */
export function parseFlags(params, base = DEFAULT_FLAGS) {
    const out = { ...base };
    for (const spec of FLAG_SPECS) {
        const { present, value } = lookup(params, spec.name);
        if (!present)
            continue;
        if (spec.kind === "bool")
            out[spec.name] = coerceBool(value, base[spec.name]);
        else
            out[spec.name] = value !== null && spec.values.includes(value) ? value : base[spec.name];
    }
    return out;
}
/** Parse the same flags from CLI argv tokens (`--render canvas`, `--no-slim`,
 *  `--strip-pos` / `--no-strip-pos`, `--prod`, `--typecheck`). Returns the flags
 *  plus the leftover positional args (the input path, etc.). Long flags only;
 *  `--no-<name>` negates a boolean. Enum VALUES are accepted as shorthand switches
 *  (`--canvas` ≡ `--render canvas`); `--full` is a kept alias for `--no-slim`. */
export function parseArgvFlags(argv, base = DEFAULT_FLAGS) {
    const flags = { ...base };
    const rest = [];
    const bySwitch = new Map();
    const enumValueAlias = new Map();
    for (const spec of FLAG_SPECS) {
        bySwitch.set(kebab(spec.name), spec);
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
        if (tok === "full") {
            flags.slim = false;
            continue;
        } // kept alias for --no-slim
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