// Diagnostics — the compiler-wide mechanism and template catalog for EVERY
// compile-time error, across every phase (syntax, structure, type, name
// resolution, module/include, and the tsc typecheck). Not a typecheck-only
// facility: it is the single home for how a Declare compile reports a problem.
//
// A `Diagnostic` is a structured error — a stable CODE (NEO####), a severity, a
// phase, the message, a source position, and an optional fix hint — rendered by
// the one formatter here. Codes are grouped by phase so a reader (and tooling)
// can classify at a glance:
//
//   NEO1xxx  syntax     — the parser (a token/shape the grammar rejects)
//   NEO2xxx  structure  — an element misused: unknown/duplicate name, a member
//                         placed where its node-kind forbids, a bad namespace
//   NEO3xxx  type       — a literal/value that doesn't fit its slot (coercion),
//                         a percent with no axis, a malformed datapath
//   NEO4xxx  name       — bare-name resolution (unresolved; shadowing = warning)
//   NEO5xxx  module     — include resolution (collision, missing, stray root)
//   NEO6xxx  typecheck  — a tsc diagnostic over a { } body, mapped to neo
//   NEO7xxx  constraint — a { } constraint the dependency extractor cannot
//                         statically analyze (residue) — a hard error that
//                         names the rewrite that makes it analyzable
//
// Interop: the compiler collects `NeoError[]` internally (throw + aggregate).
// A NeoError carries the catalog `code`/`hint` as ADDITIVE metadata (errors.ts)
// — its `.message` is unchanged, so message-asserting tests keep passing. The
// catalog factories below build coded NeoErrors, so a site migrates by swapping
// `new NeoError(msg, pos)` → `Diag.<kind>(…)` with NO wording change. compile()
// turns each phase's NeoError[] into Diagnostic[] at the boundary (toDiagnostic),
// assigning a phase code to any error a site has not yet given a specific one —
// so EVERY compile error flows through this mechanism and carries a code today,
// and the migration to specific codes is incremental.

import { NeoError, type Pos } from "./errors.js";

export type Severity = "error" | "warning";

/** The compile phase a diagnostic belongs to — derivable from its code's
 *  leading digit, so a Diagnostic is self-classifying. */
export type DiagPhase = "syntax" | "structure" | "type" | "name" | "module" | "typecheck" | "constraint";

/** A structured compile-time diagnostic — the public shape compile() reports. */
export interface Diagnostic {
  code: string; // NEO####
  severity: Severity;
  phase: DiagPhase;
  message: string; // without the "(line …, col …)" suffix — pos carries it
  pos?: Pos;
  hint?: string;
}

// ── Codes ───────────────────────────────────────────────────────────────────
// The phase base (the "un-migrated" fallback) plus the specific codes the
// recurring families own. `DIAGNOSTIC_CATALOG` (bottom) enumerates them all —
// the browsable "set of templates".

const BASE: Record<DiagPhase, string> = {
  syntax: "NEO1000",
  structure: "NEO2000",
  type: "NEO3000",
  name: "NEO4000",
  module: "NEO5000",
  typecheck: "NEO6000",
  constraint: "NEO7000",
};

const PHASE_BY_DIGIT: Record<string, DiagPhase> = {
  "1": "syntax",
  "2": "structure",
  "3": "type",
  "4": "name",
  "5": "module",
  "6": "typecheck",
  "7": "constraint",
};

/** The phase a code belongs to (its 4th char, i.e. the thousands digit). */
export function phaseOfCode(code: string): DiagPhase {
  return PHASE_BY_DIGIT[code[3]] ?? "structure";
}

// ── The template catalog ─────────────────────────────────────────────────────
// Each factory returns a coded NeoError (message identical to the hand-written
// wording it replaces). Recurring families get a parameterized template; the
// long tail of one-off messages gets a per-phase FAMILY wrapper (`syntax` /
// `structure` / `type` / `module`) that attaches the family code to a message
// the call site still composes — a near-mechanical migration that still yields
// a code. `code()` is the escape hatch for a fully custom (code, message).

const err = (code: string, message: string, pos?: Pos, hint?: string): NeoError =>
  new NeoError(message, pos, { code, hint });

export const Diag = {
  // NEO1xxx syntax — the parser throws one at a time; a single family code, the
  // grammar message carrying the specifics.
  syntax: (message: string, pos?: Pos): NeoError => err("NEO1001", message, pos),

  // NEO2xxx structure
  unknownComponent: (tag: string, pos: Pos): NeoError => err("NEO2001", `unknown component '${tag}'`, pos),
  duplicateName: (message: string, pos: Pos): NeoError => err("NEO2002", message, pos),
  misplaced: (message: string, pos: Pos): NeoError => err("NEO2003", message, pos),
  namespace: (message: string, pos: Pos): NeoError => err("NEO2004", message, pos),
  structure: (message: string, pos?: Pos): NeoError => err("NEO2000", message, pos),

  // NEO3xxx type / value
  typeMismatch: (message: string, pos: Pos): NeoError => err("NEO3001", message, pos),
  badPercent: (message: string, pos: Pos): NeoError => err("NEO3002", message, pos),
  badDatapath: (message: string, pos: Pos): NeoError => err("NEO3003", message, pos),
  setTwice: (message: string, pos: Pos): NeoError => err("NEO3004", message, pos),
  type: (message: string, pos?: Pos): NeoError => err("NEO3000", message, pos),

  // NEO4xxx name resolution
  unresolved: (name: string, scope: string, pos: Pos): NeoError =>
    err("NEO4001", `cannot resolve '${name}' — not a member of ${scope}, a parameter, or a global`, pos),
  shadowing: (message: string, pos: Pos): NeoError => err("NEO4002", message, pos),

  // NEO5xxx module / include
  includeCollision: (message: string, pos?: Pos): NeoError => err("NEO5001", message, pos),
  missingInclude: (path: string, pos?: Pos): NeoError => err("NEO5002", `cannot find include "${path}"`, pos),
  strayRoot: (message: string, pos: Pos): NeoError => err("NEO5003", message, pos),
  module: (message: string, pos?: Pos): NeoError => err("NEO5000", message, pos),

  // NEO6xxx typecheck (tsc over a { } body). `tsCode` (e.g. 2322) rides in the
  // hint so the neo message stays clean but the TS origin is recoverable.
  typeError: (message: string, pos: Pos, tsCode: number): NeoError =>
    err("NEO6001", message, pos, `TypeScript ${tsCode}`),

  // NEO7xxx constraint — the dependency extractor met a { } constraint it cannot
  // statically analyze (a dynamic target/cardinality, or an unresolved call).
  // The message is composed at the call site and NAMES the rewrite that makes it
  // analyzable (diagnostics.md §4), so it rides the family code with the
  // specifics in `message`.
  residue: (message: string, pos: Pos): NeoError => err("NEO7001", message, pos),
  constraint: (message: string, pos?: Pos): NeoError => err("NEO7000", message, pos),

  /** Escape hatch: a fully custom (code, message) for a site that fits no
   *  family yet. Prefer a named factory. */
  code: (code: string, message: string, pos?: Pos, hint?: string): NeoError => err(code, message, pos, hint),
};

// ── Conversion + formatting ──────────────────────────────────────────────────

/** Turn a collected NeoError into a Diagnostic. `severity` says which list it
 *  came from (errors vs warnings); the code is the error's own if a catalog
 *  factory set one, else the phase fallback — so an un-migrated `new NeoError`
 *  still lands with a valid code and phase. */
export function toDiagnostic(e: NeoError, severity: Severity, fallbackPhase: DiagPhase): Diagnostic {
  const code = e.code ?? BASE[fallbackPhase];
  return {
    code,
    severity,
    phase: phaseOfCode(code),
    message: e.rawMessage,
    pos: e.pos,
    hint: e.hint,
  };
}

/** The one renderer: "message [CODE] (line L, col C)", with an indented hint
 *  line when present. */
export function formatDiagnostic(d: Diagnostic): string {
  const at = d.pos ? ` (line ${d.pos.line}, col ${d.pos.col})` : "";
  const hint = d.hint ? `\n  hint: ${d.hint}` : "";
  return `${d.message} [${d.code}]${at}${hint}`;
}

/** The browsable catalog — every code, its phase, and a one-line summary. The
 *  data form of the "set of message templates" (docs / tooling / a future
 *  `neo explain NEO3001`). */
export const DIAGNOSTIC_CATALOG: ReadonlyArray<{ code: string; phase: DiagPhase; summary: string }> = [
  { code: "NEO1001", phase: "syntax", summary: "the parser rejected a token or shape" },
  { code: "NEO2000", phase: "structure", summary: "structural error (unclassified)" },
  { code: "NEO2001", phase: "structure", summary: "unknown component tag" },
  { code: "NEO2002", phase: "structure", summary: "a name is declared more than once" },
  { code: "NEO2003", phase: "structure", summary: "a member is placed where its node-kind forbids it" },
  { code: "NEO2004", phase: "structure", summary: "a name violates the member namespace" },
  { code: "NEO3000", phase: "type", summary: "type/value error (unclassified)" },
  { code: "NEO3001", phase: "type", summary: "a value does not fit its slot's type" },
  { code: "NEO3002", phase: "type", summary: "a percent with no axis to resolve against" },
  { code: "NEO3003", phase: "type", summary: "a malformed datapath" },
  { code: "NEO3004", phase: "type", summary: "an attribute is set twice" },
  { code: "NEO4000", phase: "name", summary: "name-resolution error (unclassified)" },
  { code: "NEO4001", phase: "name", summary: "a bare name resolves to nothing in scope" },
  { code: "NEO4002", phase: "name", summary: "a bare name shadows an outer member (warning)" },
  { code: "NEO5000", phase: "module", summary: "include/module error (unclassified)" },
  { code: "NEO5001", phase: "module", summary: "two included files declare the same class" },
  { code: "NEO5002", phase: "module", summary: "an include path cannot be found" },
  { code: "NEO5003", phase: "module", summary: "an included library has a tree root" },
  { code: "NEO6000", phase: "typecheck", summary: "typecheck error (unclassified)" },
  { code: "NEO6001", phase: "typecheck", summary: "a { } body fails the TypeScript typecheck" },
  { code: "NEO7000", phase: "constraint", summary: "constraint dependency error (unclassified)" },
  { code: "NEO7001", phase: "constraint", summary: "a { } constraint cannot be statically analyzed (residue)" },
];
