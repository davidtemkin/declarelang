import type { Closure } from "./closure.js";
import type { Compiled } from "./compile.js";
import { type Program } from "../../runtime/dist/parser.js";
import { type ProgramFacts } from "./capabilities.js";
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
    /** The built-in class NAMES this app can instantiate — the used-set a
     *  production build keeps (∩ the runtime registry), dropping every other
     *  class module (rich-text, etc.). Empty when the source did not compile. */
    usedClasses: readonly string[];
    /** What the program reaches, read from it AS WRITTEN (capabilities.ts
     *  programFacts), before its literals become values — present when asked for
     *  (a production build decides what it carries from these). */
    facts?: ProgramFacts;
    /** Literals shipped as written because the compile could not ship their value
     *  (lower-literals.ts), with why — each keeps the runtime's parsers aboard. */
    unlowered?: ReadonlyArray<{
        pos: unknown;
        why: string;
    }>;
}
/** The class NAMES a program may instantiate: its STATIC tree references
 *  (tags + class bases) ∪ any class a `{ }` body constructs BY NAME
 *  (`new Markdown()`, scanned via free-idents) ∪ the classes a LITERAL rich-text
 *  document names as inline-view tags ∪ the explicit `use [ … ]` keep-list.
 *  Sound because Declare has no reflective new-by-value: every construction path
 *  is a compile-time literal, so this set is complete (create-by-STRING — an
 *  `iconLeft = "TrashIcon"`, a fetched document — is what `use` covers). The
 *  scan vocabulary is the built-in registry plus the program's own class names,
 *  so only real class identifiers count — `Math`, `console`, locals, etc.
 *  are ignored, and a name shadowed by a local is (correctly) not free. */
export declare function usedClassNames(program: Program): string[];
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
    facts?: boolean;
}): Promise<ProgramBuild>;
