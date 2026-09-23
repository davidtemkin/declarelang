import type { Closure } from "./closure.js";
import type { Compiled } from "./compile.js";
import { type Program } from "../../runtime/dist/parser.js";
import { type Diagnostic } from "../../runtime/dist/diagnostics.js";
import type { DeclareError } from "../../runtime/dist/errors.js";
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
 *  (`new Markdown()`, scanned via free-idents) ∪ the classes a LITERAL rich-text
 *  document names as inline-view tags ∪ the explicit `use [ … ]` keep-list.
 *  Sound because Declare has no reflective new-by-value: every construction path
 *  is a compile-time literal, so this set is complete (create-by-STRING — an
 *  `iconLeft = "TrashIcon"`, a fetched document — is what `use` covers). The
 *  scan vocabulary is the built-in registry plus the program's own class names,
 *  so only real component identifiers count — `Math`, `console`, locals, etc.
 *  are ignored, and a name shadowed by a local is (correctly) not free. */
export declare function usedComponentNames(program: Program): string[];
/** Recursively delete position keys. Mutates in place and returns the value. */
export declare function stripPos<T>(node: T): T;
/** The program-shaped tail of a compile: parse the resolved source into the
 *  program the runtime's `renderProgram` consumes, check what will ship, zip
 *  the extracted deps on, compute the used set, stamp it trusted, and (by
 *  default) strip positions. `c` is the ONE compile result (compileTracked,
 *  on either host); on any error `program` is null and `errors` carries every
 *  diagnostic (nothing is emitted). */
export declare function programFromCompiled(c: Compiled & {
    closure: Closure;
}, opts?: {
    stripPos?: boolean;
}): Promise<ProgramBuild>;
