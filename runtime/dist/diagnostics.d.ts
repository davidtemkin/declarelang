import { NeoError, type Pos } from "./errors.js";
export type Severity = "error" | "warning";
/** The compile phase a diagnostic belongs to — derivable from its code's
 *  leading digit, so a Diagnostic is self-classifying. */
export type DiagPhase = "syntax" | "structure" | "type" | "name" | "module" | "typecheck" | "constraint";
/** A structured compile-time diagnostic — the public shape compile() reports. */
export interface Diagnostic {
    code: string;
    severity: Severity;
    phase: DiagPhase;
    message: string;
    pos?: Pos;
    hint?: string;
}
/** The diagnostic-code prefix — ONE symbol, because the prefix is slated for a
 *  repo-wide rename: every code is BUILT (and parsed) through this constant,
 *  so the rename is a single-point change here (tests asserting rendered codes
 *  update with it). */
export declare const CODE_PREFIX = "NEO";
/** The phase a code belongs to (its thousands digit, just past the prefix). */
export declare function phaseOfCode(code: string): DiagPhase;
/** The single high-confidence near-miss among `candidates`, or null (no match
 *  in budget, or an ambiguous tie — ambiguity is below suggestion confidence). */
export declare function nearestName(name: string, candidates: readonly string[]): string | null;
export declare const Diag: {
    syntax: (message: string, pos?: Pos) => NeoError;
    unknownComponent: (tag: string, pos: Pos, candidates?: readonly string[]) => NeoError;
    duplicateName: (message: string, pos: Pos) => NeoError;
    misplaced: (message: string, pos: Pos) => NeoError;
    namespace: (message: string, pos: Pos) => NeoError;
    structure: (message: string, pos?: Pos) => NeoError;
    typeMismatch: (message: string, pos: Pos) => NeoError;
    badPercent: (message: string, pos: Pos) => NeoError;
    badDatapath: (message: string, pos: Pos) => NeoError;
    setTwice: (message: string, pos: Pos) => NeoError;
    type: (message: string, pos?: Pos) => NeoError;
    unresolved: (name: string, scope: string, pos: Pos) => NeoError;
    shadowing: (message: string, pos: Pos) => NeoError;
    includeCollision: (message: string, pos?: Pos) => NeoError;
    missingInclude: (path: string, pos?: Pos) => NeoError;
    strayRoot: (message: string, pos: Pos) => NeoError;
    module: (message: string, pos?: Pos) => NeoError;
    typeError: (message: string, pos: Pos, tsCode: number) => NeoError;
    residue: (message: string, pos: Pos) => NeoError;
    constraint: (message: string, pos?: Pos) => NeoError;
    /** Escape hatch: a fully custom (code, message) for a site that fits no
     *  family yet. Prefer a named factory. */
    code: (code: string, message: string, pos?: Pos, hint?: string) => NeoError;
};
/** Turn a collected NeoError into a Diagnostic. `severity` says which list it
 *  came from (errors vs warnings); the code is the error's own if a catalog
 *  factory set one, else the phase fallback — so an un-migrated `new NeoError`
 *  still lands with a valid code and phase. */
export declare function toDiagnostic(e: NeoError, severity: Severity, fallbackPhase: DiagPhase): Diagnostic;
/** The one renderer: "message [CODE] (line L, col C)", with an indented hint
 *  line when present. */
export declare function formatDiagnostic(d: Diagnostic): string;
/** The browsable catalog — every code, its phase, and a one-line summary. The
 *  data form of the "set of message templates" (docs / tooling / a future
 *  `neo explain NEO3001`). */
export declare const DIAGNOSTIC_CATALOG: ReadonlyArray<{
    code: string;
    phase: DiagPhase;
    summary: string;
}>;
