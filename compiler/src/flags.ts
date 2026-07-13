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
  /** Drop source-position fields from the shipped program (production; halves its
   *  size). Set false (`?stripPos=0` / `--no-strip-pos`) to keep them for
   *  debugging a precompiled build. */
  stripPos: boolean;
  /** The tsc-over-bodies typecheck pass — ON by default, a phase of THE
   *  compile (compile.ts runs the checker directly; no surface can no-op it).
   *  `?typecheck=0` / `--no-typecheck` is the explicit opt-out for a
   *  latency-critical loop. */
  typecheck: boolean;
}

/** One spec per flag — the SINGLE source of truth every surface derives from.
 *  `name` is the canonical `CompileFlags` field (also the URL/CLI name, cased per
 *  surface). Add a flag by adding a spec; no parser edits needed. */
export type FlagSpec =
  | { readonly name: keyof CompileFlags; readonly kind: "bool"; readonly default: boolean }
  | { readonly name: keyof CompileFlags; readonly kind: "enum"; readonly values: readonly string[]; readonly default: string };

export const FLAG_SPECS: readonly FlagSpec[] = [
  { name: "backend", kind: "enum", values: ["dom", "canvas"], default: "dom" },
  { name: "prod", kind: "bool", default: false },
  { name: "slim", kind: "bool", default: true },
  { name: "stripPos", kind: "bool", default: true },
  { name: "typecheck", kind: "bool", default: true },
];

/** Defaults, derived from the registry — never hand-maintained. */
export const DEFAULT_FLAGS: CompileFlags = Object.fromEntries(
  FLAG_SPECS.map((s) => [s.name, s.default])
) as unknown as CompileFlags;

/** The canonical flag names (docs / help text / validation), from the registry. */
export const FLAG_NAMES: readonly (keyof CompileFlags)[] = FLAG_SPECS.map((s) => s.name);

/** camelCase → kebab-case, for the CLI spelling (`stripPos` → `strip-pos`). */
const kebab = (s: string): string => s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

const ON = new Set(["", "1", "true", "yes", "on"]);
const OFF = new Set(["0", "false", "no", "off"]);

const coerceBool = (value: string | null, def: boolean): boolean => {
  const v = (value ?? "").toLowerCase();
  return OFF.has(v) ? false : ON.has(v) ? true : def;
};

/** The read surface both a Node `URL`'s searchParams and the browser's
 *  `location.search` params satisfy. */
export interface FlagParams {
  has(name: string): boolean;
  get(name: string): string | null;
}

/** Try the canonical name then its all-lowercase form, so both `?stripPos` and
 *  `?strippos` match the `stripPos` flag (camelCase names have no other casing). */
function lookup(params: FlagParams, name: string): { present: boolean; value: string | null } {
  for (const key of name === name.toLowerCase() ? [name] : [name, name.toLowerCase()]) {
    if (params.has(key)) return { present: true, value: params.get(key) };
  }
  return { present: false, value: null };
}

/** Normalize URL/query flags into the option set, over a base (defaults, or an
 *  entry point's own baseline — e.g. the CLI passes `prod: true`). Unknown query
 *  keys are ignored; a malformed value falls back to the base. Derived entirely
 *  from `FLAG_SPECS`, so a new flag needs no edit here. */
export function parseFlags(params: FlagParams, base: CompileFlags = DEFAULT_FLAGS): CompileFlags {
  const out: Record<string, unknown> = { ...base };
  for (const spec of FLAG_SPECS) {
    const { present, value } = lookup(params, spec.name);
    if (!present) continue;
    if (spec.kind === "bool") out[spec.name] = coerceBool(value, base[spec.name] as boolean);
    else out[spec.name] = value !== null && spec.values.includes(value) ? value : base[spec.name];
  }
  return out as unknown as CompileFlags;
}

/** Parse the same flags from CLI argv tokens (`--backend canvas`, `--no-slim`,
 *  `--strip-pos` / `--no-strip-pos`, `--prod`, `--typecheck`). Returns the flags
 *  plus the leftover positional args (the input path, etc.). Long flags only;
 *  `--no-<name>` negates a boolean. Enum VALUES are accepted as shorthand switches
 *  (`--canvas` ≡ `--backend canvas`); `--full` is a kept alias for `--no-slim`. */
export function parseArgvFlags(
  argv: readonly string[],
  base: CompileFlags = DEFAULT_FLAGS
): { flags: CompileFlags; rest: string[] } {
  const flags: Record<string, unknown> = { ...base };
  const rest: string[] = [];
  const bySwitch = new Map<string, FlagSpec>();
  const enumValueAlias = new Map<string, keyof CompileFlags>();
  for (const spec of FLAG_SPECS) {
    bySwitch.set(kebab(spec.name), spec);
    if (spec.kind === "enum") for (const v of spec.values) enumValueAlias.set(v, spec.name);
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { rest.push(a); continue; }
    let tok = a.slice(2);
    let negate = false;
    if (tok.startsWith("no-")) { negate = true; tok = tok.slice(3); }
    if (!negate && enumValueAlias.has(tok)) { flags[enumValueAlias.get(tok)!] = tok; continue; }
    if (tok === "full") { flags.slim = false; continue; } // kept alias for --no-slim
    const spec = bySwitch.get(tok);
    if (spec === undefined) { rest.push(a); continue; }
    if (spec.kind === "bool") { flags[spec.name] = !negate; continue; }
    const val = argv[i + 1]; // enum needs a value: `--backend canvas`
    if (val !== undefined && spec.values.includes(val)) { flags[spec.name] = val; i++; }
  }
  return { flags: flags as unknown as CompileFlags, rest };
}
