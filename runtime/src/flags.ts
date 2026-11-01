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

/** The modifier set, by canonical name. */
export interface CompileFlags {
  /** Which RENDERER a web host bundles / mounts: managed DOM or one
   *  `<canvas>`. The Mac host renders natively whatever this says. */
  render: "dom" | "canvas";
  /** Static extraction (docs/system-design/capabilities.md §5): embed the
   *  program's content as semantic HTML in the run/build wrapper's host element
   *  (`#declare-static`), for crawlers and AI readers that don't run the app.
   *  Removed before first paint, never CSS-hidden (browser/serve-core.js).
   *  Distinct from the `extract` REQUEST (compiler/src/reqtypes.ts), which
   *  returns that document ALONE. */
  crawler: boolean;
  /** Which reactive KERNEL a build carries: the C kernel compiled to
   *  WebAssembly (the default, the fastest), or the JavaScript kernel — the
   *  same results from a smaller download, with no WebAssembly bytes or loader
   *  in the bundle (docs/system-design/kernel.md). The Mac host always runs its
   *  native kernel. */
  kernel: "wasm" | "js";
  /** Whether the program carries its accessibility layer
   *  (docs/system-design/accessibility.md §4.1): its semantic tree, what each
   *  platform builds from it, the accessibility warnings, and the motion
   *  system's reduced-motion handling. A program whose presentation is all
   *  drawing — an arcade game — leaves it out and pays nothing for it. */
  accessibility: boolean;
  /** Whether the compiler's LINT is reported: advice on readability and idiom
   *  (nested choices, centring by hand, a shadowed name). It changes nothing
   *  that is built; a program that has decided against the advice says so. */
  lint: boolean;
  /** Which devices the program is for. "desk" quiets what matters only on a
   *  phone (a text field under iOS's focus-zoom size); "phone" what matters
   *  only at a desk. "all" (the default) reports both. It changes nothing that
   *  is built. */
  devices: "all" | "desk" | "phone";
}

/** One spec per modifier. */
export type FlagSpec =
  | { readonly name: keyof CompileFlags; readonly kind: "bool"; readonly default: boolean; readonly description: string }
  | { readonly name: keyof CompileFlags; readonly kind: "enum"; readonly values: readonly string[]; readonly default: string; readonly description: string };

export const FLAG_SPECS: readonly FlagSpec[] = [
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
  { name: "devices", kind: "enum", values: ["all", "desk", "phone"], default: "all",
    description: "the devices the program is for: desk quiets what matters only on a phone, phone what matters only at a desk; it changes nothing that is built; unset, the program's flags decide" },
];

/** Defaults, derived from the registry. */
export const DEFAULT_FLAGS: CompileFlags = Object.fromEntries(
  FLAG_SPECS.map((s) => [s.name, s.default])
) as unknown as CompileFlags;

/** The canonical names, from the registry. */
export const FLAG_NAMES: readonly (keyof CompileFlags)[] = FLAG_SPECS.map((s) => s.name);

/** The words a modifier's value may be — the same on every surface. */
export function flagWords(spec: FlagSpec): readonly string[] {
  return spec.kind === "bool" ? ["true", "false"] : spec.values;
}

/** A word as the modifier's value (`"true"` → true), or undefined when the
 *  word is not one of its values. */
export function flagValue(spec: FlagSpec, word: string): boolean | string | undefined {
  if (!flagWords(spec).includes(word)) return undefined;
  return spec.kind === "bool" ? word === "true" : word;
}
