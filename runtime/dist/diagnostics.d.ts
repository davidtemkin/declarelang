import { DeclareError, type Pos } from "./errors.js";
export type Severity = "error" | "warning";
/** The compile phase a diagnostic belongs to — derivable from its code's
 *  leading digit, so a Diagnostic is self-classifying. */
export type DiagPhase = "syntax" | "structure" | "type" | "name" | "module" | "typecheck" | "constraint";
/** A structured compile-time diagnostic — the public shape compile() reports.
 *
 *  Dual form, one record (the Rust model): the STRUCTURE is the truth, and
 *  `rendered` is its formatted form — computed ONCE by the producer
 *  (definitionally `formatDiagnostic(d)`), riding the record so every consumer
 *  prints the same bytes. A dumb consumer shows `rendered` verbatim; a rich one
 *  reads the fields (squiggle by `pos`, chip by `hint`) — and when the record
 *  grows (related positions, fix-its), dumb consumers inherit the improved
 *  rendering with no code change. No information may exist ONLY in the string. */
export interface Diagnostic {
    code: string;
    severity: Severity;
    phase: DiagPhase;
    message: string;
    pos?: Pos;
    hint?: string;
    /** The formatted form — deterministic plain text, no color, spec-voiced. */
    rendered: string;
}
/** The diagnostic-code prefix — ONE symbol, because the prefix is slated for a
 *  repo-wide rename: every code is BUILT (and parsed) through this constant,
 *  so the rename is a single-point change here (tests asserting rendered codes
 *  update with it). */
export declare const CODE_PREFIX = "DECLARE";
/** The phase a code belongs to (its thousands digit, just past the prefix). */
export declare function phaseOfCode(code: string): DiagPhase;
/** The single high-confidence near-miss among `candidates`, or null (no match
 *  in budget, or an ambiguous tie — ambiguity is below suggestion confidence). */
export declare function nearestName(name: string, candidates: readonly string[]): string | null;
export declare const Diag: {
    syntax: (message: string, pos?: Pos) => DeclareError;
    unknownComponent: (tag: string, pos: Pos, candidates?: readonly string[]) => DeclareError;
    duplicateName: (message: string, pos: Pos) => DeclareError;
    misplaced: (message: string, pos: Pos) => DeclareError;
    namespace: (message: string, pos: Pos) => DeclareError;
    structure: (message: string, pos?: Pos) => DeclareError;
    typeMismatch: (message: string, pos: Pos) => DeclareError;
    badPercent: (message: string, pos: Pos) => DeclareError;
    badDatapath: (message: string, pos: Pos) => DeclareError;
    setTwice: (message: string, pos: Pos) => DeclareError;
    type: (message: string, pos?: Pos) => DeclareError;
    unresolved: (name: string, scope: string, pos: Pos) => DeclareError;
    shadowing: (message: string, pos: Pos) => DeclareError;
    classrootOutsideClass: (where: string, pos: Pos) => DeclareError;
    namedColorInExpr: (name: string, hex: string, pos: Pos) => DeclareError;
    includeCollision: (message: string, pos?: Pos) => DeclareError;
    missingInclude: (path: string, pos?: Pos) => DeclareError;
    strayRoot: (message: string, pos: Pos) => DeclareError;
    module: (message: string, pos?: Pos) => DeclareError;
    typeError: (message: string, pos: Pos, tsCode: number) => DeclareError;
    residue: (message: string, pos: Pos) => DeclareError;
    constraint: (message: string, pos?: Pos) => DeclareError;
    /** Escape hatch: a fully custom (code, message) for a site that fits no
     *  family yet. Prefer a named factory. */
    code: (code: string, message: string, pos?: Pos, hint?: string) => DeclareError;
};
/** Turn a collected DeclareError into a Diagnostic. `severity` says which list it
 *  came from (errors vs warnings); the code is the error's own if a catalog
 *  factory set one, else the phase fallback — so an un-migrated `new DeclareError`
 *  still lands with a valid code and phase. */
export declare function toDiagnostic(e: DeclareError, severity: Severity, fallbackPhase: DiagPhase): Diagnostic;
/** The one renderer: "message [CODE] (line L, col C)", with an indented hint
 *  line when present; a warning carries a `warning: ` prefix (an unmarked
 *  diagnostic reads as an error, the compiler convention). Deterministic plain
 *  text — ANSI color is a caller-side decoration, never a second format. */
export declare function formatDiagnostic(d: Omit<Diagnostic, "rendered">): string;
/** The whole compile's rendered form — what a CLI prints verbatim. A one-line
 *  count summary, then each diagnostic's `rendered`. Empty string when there is
 *  nothing to say (deterministic: same diagnostics → same bytes). */
export declare function renderReport(diagnostics: readonly Diagnostic[]): string;
/** The browsable catalog — every code, its phase, and a one-line summary. The
 *  data form of the "set of message templates" (docs / tooling / a future
 *  `Declare explain DECLARE3001`). */
export declare const DIAGNOSTIC_CATALOG: ReadonlyArray<{
    code: string;
    phase: DiagPhase;
    summary: string;
}>;
