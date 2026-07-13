import { NeoError } from "../../runtime/dist/errors.js";
import { type IncludeHost } from "../../runtime/dist/include.js";
import { type Diagnostic } from "../../runtime/dist/diagnostics.js";
/** A compile result. `source` is the resolved program (null when there are
 *  errors); `deps` is the extracted `{ }`-constraint dependency list (walk-order
 *  read-paths, design/constraints.md §5), present exactly when `source` is — so
 *  the ONE result carries everything a renderer needs and no caller re-derives
 *  or forgets it. `warnings` (shadowing) never block. `diagnostics` is the
 *  unified, coded view of everything reported (errors + warnings, every phase —
 *  the one structured surface, diagnostics.ts); `errors`/`warnings` remain the
 *  raw NeoError lists for existing callers. */
export interface Compiled {
    source: string | null;
    deps?: readonly (readonly string[])[];
    errors: NeoError[];
    warnings: NeoError[];
    diagnostics: Diagnostic[];
    /** The whole compile RENDERED (renderReport): a count summary + each
     *  diagnostic's `rendered`, one per line; "" when there is nothing to say.
     *  A CLI prints it verbatim; a rich consumer reads `diagnostics` instead —
     *  the same dual-form rule each Diagnostic itself follows. */
    report: string;
}
/** Options for compile(): the file-access host `include` resolution rides and
 *  the main file's directory. The host defaults to the Node filesystem (this
 *  is the Node-side front-end) and originDir to the process cwd — includes
 *  resolve relative to the compiling file's dir when the caller supplies it. */
export interface CompileOptions {
    host?: IncludeHost;
    originDir?: string;
    /** The tsc-over-`{ }`-bodies typecheck (typecheck.ts) — ON BY DEFAULT, part
     *  of THE compile like every other phase: the checker is imported directly
     *  (never injected), so no front-end can exist where this flag silently
     *  no-ops. A type error blocks emission like any other, reported as an
     *  NEO6001 diagnostic mapped to its `.declare` line. `typecheck: false`
     *  (URL `?typecheck=0`, CLI `--no-typecheck`) is the EXPLICIT opt-out for a
     *  latency-critical loop (a debounced per-keystroke compile) — a visible,
     *  greppable choice, never a wiring accident. */
    typecheck?: boolean;
}
/** Compile a Declare source: full diagnostics (include resolve + check + scope
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
