// flags — the platform's compile-time MODIFIERS, defined ONCE. Every surface
// that names one reads this registry and nothing else, and spells it the same
// way, `name=value`, with the same names and the same values:
//
//   a program    defaultFlags [ render = canvas, crawler = true ]   (parser.ts)
//   a URL        ?render=canvas&crawler=true                      (compiler/src/flags.ts)
//   declarec     --render=canvas --crawler=true                   (compiler/src/flags.ts)
//
// A boolean's values are the words `true` and `false`. Adding a modifier is one
// entry below; every surface, and the generated docs table, picks it up.
//
// It lives in the runtime because the program parser reads it, and the parser
// ships only in the compiler bundle, so no app pays for it.
export const FLAG_SPECS = [
    { name: "render", kind: "enum", values: ["dom", "canvas"], default: "dom",
        description: "render through managed DOM or a single <canvas>; unset, the program's flags decide" },
    { name: "crawler", kind: "bool", default: false,
        description: "embed the crawled document in the host page, for crawlers; unset, the program's flags decide" },
    { name: "kernel", kind: "enum", values: ["wasm", "js"], default: "wasm",
        description: "the reactive kernel a build carries: the C kernel as WebAssembly, or the JavaScript one (a smaller download); unset, the program's flags decide" },
    { name: "accessibility", kind: "bool", default: true,
        description: "carry the accessibility layer: what screen readers and the platform's accessibility API are given, the accessibility warnings, and the accessibility settings an app can read; unset, the program's flags decide" },
    { name: "lint", kind: "bool", default: true,
        description: "report the compiler's lint: advice on readability and idiom; it changes nothing that is built; unset, the program's flags decide" },
    { name: "devices", kind: "enum", values: ["all", "desktop", "mobile"], default: "all",
        description: "the devices the program is for: desktop quiets what matters only on a phone, mobile what matters only on a desktop; it changes nothing that is built; unset, the program's flags decide" },
];
/** Defaults, derived from the registry. */
export const DEFAULT_FLAGS = Object.fromEntries(FLAG_SPECS.map((s) => [s.name, s.default]));
/** The canonical names, from the registry. */
export const FLAG_NAMES = FLAG_SPECS.map((s) => s.name);
/** The words a modifier's value may be — the same on every surface. */
export function flagWords(spec) {
    return spec.kind === "bool" ? ["true", "false"] : spec.values;
}
/** A word as the modifier's value (`"true"` → true), or undefined when the
 *  word is not one of its values. */
export function flagValue(spec, word) {
    if (!flagWords(spec).includes(word))
        return undefined;
    return spec.kind === "bool" ? word === "true" : word;
}
//# sourceMappingURL=flags.js.map