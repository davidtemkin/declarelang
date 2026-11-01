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
export type FlagSpec = {
    readonly name: keyof CompileFlags;
    readonly kind: "bool";
    readonly default: boolean;
    readonly description: string;
} | {
    readonly name: keyof CompileFlags;
    readonly kind: "enum";
    readonly values: readonly string[];
    readonly default: string;
    readonly description: string;
};
export declare const FLAG_SPECS: readonly FlagSpec[];
/** Defaults, derived from the registry. */
export declare const DEFAULT_FLAGS: CompileFlags;
/** The canonical names, from the registry. */
export declare const FLAG_NAMES: readonly (keyof CompileFlags)[];
/** The words a modifier's value may be — the same on every surface. */
export declare function flagWords(spec: FlagSpec): readonly string[];
/** A word as the modifier's value (`"true"` → true), or undefined when the
 *  word is not one of its values. */
export declare function flagValue(spec: FlagSpec, word: string): boolean | string | undefined;
