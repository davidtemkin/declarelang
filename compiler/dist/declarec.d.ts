import type { Closure } from "./closure.js";
import type { CompileOptions } from "./compile.js";
import { type Program } from "../../runtime/dist/parser.js";
import { type Diagnostic } from "../../runtime/dist/diagnostics.js";
import type { DeclareError } from "../../runtime/dist/errors.js";
export interface DeclarecOptions extends CompileOptions {
    /** Drop `pos` source-offset fields from the shipped program. They exist only
     *  for error messages, which a precompiled (already-checked) app never emits
     *  at runtime — stripping them roughly halves the program's raw size and cuts
     *  its gzip near in half. Default true. */
    stripPos?: boolean;
    /** The main source's own path — recorded in the build's closure so an edit
     *  to the app file itself invalidates a cached artifact. */
    mainId?: string;
    /** Build properties frozen into the closure (backend, slim, the toolchain
     *  fingerprint, …) — isUpToDate compares them, so a flag or toolchain change
     *  invalidates like a file change. */
    props?: Record<string, string>;
}
export interface ProgramBuild {
    /** The instantiate-ready program, or null when the source did not compile. */
    program: Program | null;
    errors: readonly DeclareError[];
    warnings: readonly DeclareError[];
    /** The unified structured view + its rendered form, threaded VERBATIM from
     *  the one compile() result (Compiled.diagnostics/report) — the CLI prints
     *  `report`; nothing here re-renders. */
    diagnostics: readonly Diagnostic[];
    report: string;
    /** The compile's dependency closure (closure.ts): the main file, every
     *  include, every auto-included library file, plus the frozen build props —
     *  THE freshness fact a cache checks (isUpToDate) to decide whether this
     *  build is still current. Present even on failure (a failed compile's
     *  closure says what to watch to retry). */
    closure: Closure;
    /** The built-in component NAMES this app can instantiate — the used-set a
     *  production build keeps (∩ the runtime registry), dropping every other
     *  component module (rich-text, etc.). Empty when the source did not compile. */
    usedComponents: readonly string[];
}
/** The component NAMES a program may instantiate: its STATIC tree references
 *  (tags + class bases) ∪ any component a `{ }` body constructs BY NAME
 *  (`new Markdown()`, scanned via free-idents) ∪ the explicit `use [ … ]`
 *  keep-list. Sound because Declare has no reflective new-by-value: every
 *  construction path is a compile-time literal, so this set is complete (a
 *  future create-by-STRING is what `use` covers). The scan vocabulary is the
 *  built-in registry plus the program's own class names, so only real component
 *  identifiers count — `Math`, `console`, locals, etc. are ignored, and a name
 *  shadowed by a local is (correctly) not free. */
export declare function usedComponentNames(program: Program): string[];
/** Compile a Declare source into a serializable, instantiate-ready program:
 *  resolve bare names + includes + typecheck (all the compiler's work), then
 *  parse the resolved source into the program the runtime's `renderProgram`
 *  consumes. On any error, `program` is null and `errors` carries every
 *  diagnostic (nothing is emitted). */
export declare function compileProgram(source: string, opts?: DeclarecOptions): ProgramBuild;
