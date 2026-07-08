import { NeoError } from "../../runtime/dist/errors.js";
import { type IncludeHost } from "../../runtime/dist/include.js";
import { type Diagnostic } from "../../runtime/dist/diagnostics.js";
/** A compile result. `source` is the resolved program (null when there are
 *  errors); `warnings` (shadowing) never block. `diagnostics` is the unified,
 *  coded view of everything reported (errors + warnings, every phase — the one
 *  structured surface, diagnostics.ts); `errors`/`warnings` remain the raw
 *  NeoError lists for existing callers. */
export interface Compiled {
    source: string | null;
    errors: NeoError[];
    warnings: NeoError[];
    diagnostics: Diagnostic[];
}
/** Options for compile(): the file-access host `include` resolution rides and
 *  the main file's directory. The host defaults to the Node filesystem (this
 *  is the Node-side front-end) and originDir to the process cwd — includes
 *  resolve relative to the compiling file's dir when the caller supplies it. */
export interface CompileOptions {
    host?: IncludeHost;
    originDir?: string;
    /** Run the tsc-over-`{ }`-bodies typecheck (typecheck.ts) as a final phase —
     *  opt-in because it loads the TypeScript compiler and the lib.d.ts from
     *  disk (Node-only). A type error blocks emission like any other, reported
     *  as an NEO6001 diagnostic mapped to its `.neolzx` line. */
    typecheck?: boolean;
}
/** Compile a neo-LZX source: full diagnostics (include resolve + check + scope
 *  resolution), and a SELF-CONTAINED resolved source the zero-dependency
 *  runtime consumes with NO include host. Included libraries are spliced in
 *  (each with its own `include` directives excised, dependency-first so a base
 *  is declared above its subclass) ahead of the main file (its directives
 *  excised too), producing ONE merged source: parse → check → scope-resolve →
 *  emit all run over its identical offsets, so the output contains every
 *  included class/stylesheet/style, carries no `include` directive, and has
 *  every body — the main file's AND the included files' — bare-name-resolved.
 *
 *  Diagnostics trade-off (composition.md §1): the file-named collision /
 *  missing-file / stray-root reports come from the include walk (before the
 *  merge). Everything after — check and scope-resolution — runs on the merged
 *  source, so a type error inside an INCLUDED file is positioned within the
 *  merged text, not its own file. This is the v1 reading §1 already defers
 *  (multi-file `Pos`); it keeps the emit path drift-free — one source feeds
 *  check, the Resolver, and the output, so their offsets cannot disagree. */
export declare function compile(source: string, opts?: CompileOptions): Compiled;
