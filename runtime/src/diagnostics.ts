// Diagnostics — the compiler-wide mechanism and template catalog for EVERY
// compile-time error, across every phase (syntax, structure, type, name
// resolution, module/include, and the tsc typecheck). Not a typecheck-only
// facility: it is the single home for how a Declare compile reports a problem.
//
// A `Diagnostic` is a structured error — a stable CODE (DECLARE####), a severity, a
// phase, the message, a source position, and an optional fix hint — rendered by
// the one formatter here. Codes are grouped by phase so a reader (and tooling)
// can classify at a glance:
//
//   DECLARE1xxx  syntax     — the parser (a token/shape the grammar rejects)
//   DECLARE2xxx  structure  — an element misused: unknown/duplicate name, a member
//                         placed where its node-kind forbids, a bad namespace
//   DECLARE3xxx  type       — a literal/value that doesn't fit its slot (coercion),
//                         a percent with no axis, a malformed datapath
//   DECLARE4xxx  name       — bare-name resolution (unresolved; shadowing = warning)
//   DECLARE5xxx  module     — include resolution (collision, missing, stray root)
//   DECLARE6xxx  typecheck  — a tsc diagnostic over a { } body, mapped to Declare
//   DECLARE7xxx  constraint — a { } constraint the dependency extractor cannot
//                         statically analyze (residue) — a hard error that
//                         names the rewrite that makes it analyzable
//
// Interop: the compiler collects `DeclareError[]` internally (throw + aggregate).
// A DeclareError carries the catalog `code`/`hint` as ADDITIVE metadata (errors.ts)
// — its `.message` is unchanged, so message-asserting tests keep passing. The
// catalog factories below build coded DeclareErrors, so a site migrates by swapping
// `new DeclareError(msg, pos)` → `Diag.<kind>(…)` with NO wording change. compile()
// turns each phase's DeclareError[] into Diagnostic[] at the boundary (toDiagnostic),
// assigning a phase code to any error a site has not yet given a specific one —
// so EVERY compile error flows through this mechanism and carries a code today,
// and the migration to specific codes is incremental.

import { DeclareError, describePos, type Pos } from "./errors.js";

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
  code: string; // DECLARE####
  severity: Severity;
  phase: DiagPhase;
  message: string; // without the "(line …, col …)" suffix — pos carries it
  pos?: Pos;
  hint?: string;
  /** The formatted form — deterministic plain text, no color, spec-voiced. */
  rendered: string;
}

// ── Codes ───────────────────────────────────────────────────────────────────
// The phase base (the "un-migrated" fallback) plus the specific codes the
// recurring families own. `DIAGNOSTIC_CATALOG` (bottom) enumerates them all —
// the browsable "set of templates".

/** The diagnostic-code prefix — ONE symbol, because the prefix is slated for a
 *  repo-wide rename: every code is BUILT (and parsed) through this constant,
 *  so the rename is a single-point change here (tests asserting rendered codes
 *  update with it). */
export const CODE_PREFIX = "DECLARE";
/** Build a full code from its 4-digit number: `code4(2001)` → "DECLARE2001". */
const code4 = (n: number): string => `${CODE_PREFIX}${n}`;

const BASE: Record<DiagPhase, string> = {
  syntax: code4(1000),
  structure: code4(2000),
  type: code4(3000),
  name: code4(4000),
  module: code4(5000),
  typecheck: code4(6000),
  constraint: code4(7000),
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

/** The phase a code belongs to (its thousands digit, just past the prefix). */
export function phaseOfCode(code: string): DiagPhase {
  return PHASE_BY_DIGIT[code[CODE_PREFIX.length]] ?? "structure";
}

// ── The template catalog ─────────────────────────────────────────────────────
// Each factory returns a coded DeclareError (message identical to the hand-written
// wording it replaces). Recurring families get a parameterized template; the
// long tail of one-off messages gets a per-phase FAMILY wrapper (`syntax` /
// `structure` / `type` / `module`) that attaches the family code to a message
// the call site still composes — a near-mechanical migration that still yields
// a code. `code()` is the escape hatch for a fully custom (code, message).

const err = (code: string, message: string, pos?: Pos, hint?: string): DeclareError =>
  new DeclareError(message, pos, { code, hint });

// ── Calibrated near-miss suggestion (diagnostics.md §4 / the LLM-design doc's
// calibration rule): a model applies a "did you mean" LITERALLY, so a wrong
// suggestion derails it far harder than a human — offer one only at high
// confidence, else state the rule and stop. High confidence = the best
// candidate is UNIQUE at its distance and within a length-scaled budget
// (1 edit; 2 for names ≥ 5 chars). Case-insensitive, so `text` finds `Text`
// (pure-casing misses are distance 0 and always suggested). ──

/** Bounded Damerau-Levenshtein (optimal string alignment) — a TRANSPOSITION
 *  counts as ONE edit (`Txet` → `Text`), since swapped letters are the classic
 *  typo. Early-out above the suggestion budget (2). */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      }
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

/** Names that EXTEND what was written — `Segment` against `SegmentedItem`.
 *
 *  Edit distance cannot see these: `Segment` → `SegmentedItem` is eight edits, far
 *  outside any sane budget, while `Segment` → `Segmented` is two and wins
 *  confidently. That is the worst shape a suggestion can take, because the close
 *  name is the CONTAINER and the far one is the member — an author who follows it
 *  nests a Segmented inside a Segmented and lands somewhere stranger than they
 *  started. Prefixes are checked first, and all of them are offered rather than
 *  one being picked, because choosing between `Segmented` and `SegmentedItem`
 *  requires knowing what the author meant. */
export function extensionsOf(name: string, candidates: readonly string[]): readonly string[] {
  const lower = name.toLowerCase();
  return candidates.filter((c) => c.toLowerCase() !== lower && c.toLowerCase().startsWith(lower));
}

/** The single high-confidence near-miss among `candidates`, or null (no match
 *  in budget, or an ambiguous tie — ambiguity is below suggestion confidence). */
export function nearestName(name: string, candidates: readonly string[], budget?: number): string | null {
  const lower = name.toLowerCase();
  let best: string | null = null;
  let bestD = budget === undefined ? 3 : budget + 1;
  let tie = false;
  for (const c of candidates) {
    const d = editDistance(lower, c.toLowerCase());
    if (d < bestD) {
      best = c;
      bestD = d;
      tie = false;
    } else if (d === bestD) tie = true;
  }
  const cap = budget ?? (name.length >= 5 ? 2 : 1);
  return best !== null && !tie && bestD <= cap ? best : null;
}


export const Diag = {
  // 1xxx syntax — the parser throws one at a time; a single family code, the
  // grammar message carrying the specifics.
  syntax: (message: string, pos?: Pos): DeclareError => err(code4(1001), message, pos),

  // 2xxx structure. `unknownComponent` takes the known-component names and
  // appends a calibrated near-miss ("did you mean 'Text'?") — the fix, named
  // (diagnostics.md §4); the rule rides the hint.
  unknownComponent: (tag: string, pos: Pos, candidates: readonly string[] = []): DeclareError => {
    // A name that other names EXTEND is offered whole — see extensionsOf. This
    // replaces a table of former spellings: the language ships one current
    // surface, so a diagnostic states what IS, never what a name used to be.
    // A ONE-EDIT miss is a typo, and a typo wants the correction, not a menu:
    // `Tex` extends both `Text` and `TextInput`, but it is a single keystroke
    // from `Text` and nobody meant the other. Only past that budget does the
    // extension rule take over, which is where `Segment` lives — two edits from
    // its own container, and not a typo at all.
    const typo = nearestName(tag, candidates, 1);
    const ext = typo === null ? extensionsOf(tag, candidates) : [];
    if (ext.length > 0) {
      const list = ext.length === 1 ? `'${ext[0]}'` : ext.map((e) => `'${e}'`).join(" or ");
      return err(code4(2001), `unknown component '${tag}' — did you mean ${list}?`, pos);
    }
    const near = nearestName(tag, candidates);
    return near === null
      ? err(code4(2001), `unknown component '${tag}'`, pos)
      : err(
          code4(2001),
          `unknown component '${tag}' — did you mean '${near}'?`,
          pos,
          `a tag names a built-in component or a class declared in the program`
        );
  },
  duplicateName: (message: string, pos: Pos): DeclareError => err(code4(2002), message, pos),
  misplaced: (message: string, pos: Pos): DeclareError => err(code4(2003), message, pos),
  namespace: (message: string, pos: Pos): DeclareError => err(code4(2004), message, pos),
  structure: (message: string, pos?: Pos): DeclareError => err(code4(2000), message, pos),

  // 3xxx type / value
  typeMismatch: (message: string, pos: Pos): DeclareError => err(code4(3001), message, pos),
  badPercent: (message: string, pos: Pos): DeclareError => err(code4(3002), message, pos),
  badDatapath: (message: string, pos: Pos): DeclareError => err(code4(3003), message, pos),
  setTwice: (message: string, pos: Pos): DeclareError => err(code4(3004), message, pos),
  // A text field whose written size sits under iOS's 16px focus-zoom line
  // (a WARNING — compile.ts smallFieldWarnings; the composed message names
  // the behavior and the fix, diagnostics.md §4).
  smallField: (message: string, pos: Pos, hint?: string): DeclareError => err(code4(3005), message, pos, hint),
  type: (message: string, pos?: Pos): DeclareError => err(code4(3000), message, pos),

  // 4xxx name resolution
  unresolved: (name: string, scope: string, pos: Pos): DeclareError =>
    err(code4(4001), `cannot resolve '${name}' — not a member of ${scope}, a parameter, or one of the globals a body may use (fetch, URL, setTimeout, console, Math, JSON, …)`, pos),
  shadowing: (message: string, pos: Pos): DeclareError => err(code4(4002), message, pos),
  // A body assigns a `let`/`var` a script { } block declared. Each body gets
  // its own const copy of every script binding, so the write throws at runtime
  // and no reader could ever have seen it — state that changes lives on a node.
  // A body names a host global (document, window, process, …). Refused by name,
  // with the Declare way beside it (teach.ts HOST_GLOBAL_HINTS).
  hostGlobal: (name: string, hint: string, pos: Pos): DeclareError =>
    err(code4(4004), `'${name}' is the host's, not Declare's — a program runs on three renderers and names none of their globals. ${hint.charAt(0).toUpperCase()}${hint.slice(1)}`, pos),
  // A bare enum token inside a { } body (`{ active ? semibold : regular }`):
  // the slot's own word, which is a string inside an expression.
  enumTokenInExpr: (token: string, slot: string, pos: Pos, quoted = false): DeclareError =>
    quoted
      // an AUTHORED literal union: the member is quoted EVERYWHERE — there is
      // no bare slot form to point at (DT's spelling ruling, 2026-09-05)
      ? err(code4(4005), `'${token}' is one of ${slot}'s values — a literal union's member is written in quotes, in a slot as in { }: "${token}"`, pos)
      : err(code4(4005), `'${token}' is one of ${slot}'s values — bare only as the whole slot (${slot} = ${token}); inside { } write it as a string: "${token}"`, pos),
  // A WARNING: a per-frame onTick that never reads its dt is not integrating —
  // it is polling, the one imperative habit the language exists to retire
  // (declare.md §1, "nothing waits").
  timePolls: (param: string, pos: Pos): DeclareError =>
    err(code4(4006), `this onTick never reads '${param}' — a per-frame Time that does not integrate is polling. Nothing waits in Declare: what is this handler waiting for? A fetch landing is 'data.loaded' (constrain on it, or onLoad); a view existing or settling is onInit / onReady / afterSettle / onArrive; a value changing is a constraint on it; a value that is a function of the current time derives from the Time's facts (now, second, minute, …); one that should advance over time is an Animator, one that should reach a target a Spring; something to do when the minute turns is onTick on tick = minute. Keep the per-frame onTick only if the next value is computed from the last, each frame`, pos),
  // A WARNING: a { } that reads the host's clock has no cell behind the read —
  // it evaluates once and never again (the stopped clock, open-items L-25).
  ambientRead: (what: string, pos: Pos): DeclareError =>
    err(code4(4007), `this { } reads ${what} — the ambient world, not the tree: a constraint re-runs when something it READ changes, and nothing here can change, so this evaluates once and never again. The current time is a Time member's facts (time.now, time.minute, …), which a { } derives from like any attribute; Date.now() belongs in a handler`, pos),

  /** A `shows` name that no initial `location` can ever equal — the screen is
   *  born hidden and nothing says so (field report 2026-09-04: `location = ""`
   *  with `shows = "home"` rendered display:none, silently, forever). */
  showsUnreachable: (name: string, initial: string, names: readonly string[], pos: Pos): DeclareError =>
    err(code4(4008), `shows = ${JSON.stringify(name)}, but this program's initial location is ${initial === "" ? "empty" : JSON.stringify(initial)} — a 'shows' name IS the visibility gate (it lowers to app.destinationOf(app.location) == the name), so nothing here is visible on a cold load. Set App's location to one of ${names.map((n) => JSON.stringify(n)).join(" | ")}, or give this view its own 'visible'`, pos),  scriptWrite: (name: string, pos: Pos): DeclareError =>
    err(code4(4003), `'${name}' is a script { } variable — a { } body holds a copy of it, so a write lands nowhere (and throws at runtime). State that changes is an attribute: declare it on the app or the class (${name}: <type> = …) and write that; a script { } holds constants and functions`, pos),
  // `classroot` reaches the root of the component (class) you are defining, so it
  // is meaningful ONLY inside a class body. `where` names the non-class body the
  // code is actually in ("the App", "a stylesheet", "a style bundle").
  classrootOutsideClass: (where: string, pos: Pos): DeclareError =>
    err(code4(4003), `'classroot' is the root of a component you define — valid only inside a class body. This code is in ${where}, not a class. Reach values here by a bare name, 'this', or 'app'.`, pos),
  // A CSS color NAME resolved as a bare identifier inside { } — the name form is
  // a bare-slot literal, not an identifier the { } world knows, so name the 0x form.
  namedColorInExpr: (name: string, hex: string, pos: Pos): DeclareError =>
    err(code4(4004), `'${name}' is a named color — the name form works only in a bare slot; inside { } write it as ${hex}.`, pos),

  // 5xxx module / include
  includeCollision: (message: string, pos?: Pos): DeclareError => err(code4(5001), message, pos),
  missingInclude: (path: string, pos?: Pos): DeclareError => err(code4(5002), `cannot find include "${path}"`, pos),
  strayRoot: (message: string, pos: Pos): DeclareError => err(code4(5003), message, pos),
  module: (message: string, pos?: Pos): DeclareError => err(code4(5000), message, pos),

  // 6xxx typecheck (tsc over a { } body). `tsCode` (e.g. 2322) rides in the
  // hint so the Declare message stays clean but the TS origin is recoverable.
  typeError: (message: string, pos: Pos, tsCode: number): DeclareError =>
    err(code4(6001), message, pos, `TypeScript ${tsCode}`),

  // 7xxx constraint — the dependency extractor met a { } constraint it cannot
  // statically analyze (a dynamic target/cardinality, or an unresolved call).
  // The message is composed at the call site and NAMES the rewrite that makes it
  // analyzable (diagnostics.md §4), so it rides the family code with the
  // specifics in `message`.
  residue: (message: string, pos: Pos): DeclareError => err(code4(7001), message, pos),
  constraint: (message: string, pos?: Pos): DeclareError => err(code4(7000), message, pos),

  /** Escape hatch: a fully custom (code, message) for a site that fits no
   *  family yet. Prefer a named factory. */
  code: (code: string, message: string, pos?: Pos, hint?: string): DeclareError => err(code, message, pos, hint),
};

// ── Conversion + formatting ──────────────────────────────────────────────────

/** Turn a collected DeclareError into a Diagnostic. `severity` says which list it
 *  came from (errors vs warnings); the code is the error's own if a catalog
 *  factory set one, else the phase fallback — so an un-migrated `new DeclareError`
 *  still lands with a valid code and phase. */
export function toDiagnostic(e: DeclareError, severity: Severity, fallbackPhase: DiagPhase): Diagnostic {
  const code = e.code ?? BASE[fallbackPhase];
  const d = {
    code,
    severity,
    phase: phaseOfCode(code),
    message: e.rawMessage,
    pos: e.pos,
    hint: e.hint,
  };
  return { ...d, rendered: formatDiagnostic(d) };
}

/** The one renderer: "message [CODE] (line L, col C)", with an indented hint
 *  line when present; a warning carries a `warning: ` prefix (an unmarked
 *  diagnostic reads as an error, the compiler convention). Deterministic plain
 *  text — ANSI color is a caller-side decoration, never a second format. */
export function formatDiagnostic(d: Omit<Diagnostic, "rendered">): string {
  const sev = d.severity === "warning" ? "warning: " : "";
  const at = d.pos ? ` ${describePos(d.pos)}` : "";
  const hint = d.hint ? `\n  hint: ${d.hint}` : "";
  return `${sev}${d.message} [${d.code}]${at}${hint}`;
}

/** The whole compile's rendered form — what a CLI prints verbatim. A one-line
 *  count summary, then each diagnostic's `rendered`. Empty string when there is
 *  nothing to say (deterministic: same diagnostics → same bytes). */
export function renderReport(diagnostics: readonly Diagnostic[]): string {
  if (diagnostics.length === 0) return "";
  const errs = diagnostics.filter((d) => d.severity === "error").length;
  const warns = diagnostics.length - errs;
  const counts = [
    errs > 0 ? `${errs} error${errs === 1 ? "" : "s"}` : "",
    warns > 0 ? `${warns} warning${warns === 1 ? "" : "s"}` : "",
  ].filter((s) => s.length > 0).join(", ");
  return [counts, ...diagnostics.map((d) => d.rendered)].join("\n");
}

/** The browsable catalog — every code, its phase, and a one-line summary. The
 *  data form of the "set of message templates" (docs / tooling / a future
 *  `Declare explain DECLARE3001`). */
export const DIAGNOSTIC_CATALOG: ReadonlyArray<{ code: string; phase: DiagPhase; summary: string }> = [
  { code: code4(1001), phase: "syntax", summary: "the parser rejected a token or shape" },
  { code: code4(2000), phase: "structure", summary: "structural error (unclassified)" },
  { code: code4(2001), phase: "structure", summary: "unknown component tag" },
  { code: code4(2002), phase: "structure", summary: "a name is declared more than once" },
  { code: code4(2003), phase: "structure", summary: "a member is placed where its node-kind forbids it" },
  { code: code4(2004), phase: "structure", summary: "a name violates the member namespace" },
  { code: code4(3000), phase: "type", summary: "type/value error (unclassified)" },
  { code: code4(3001), phase: "type", summary: "a value does not fit its slot's type" },
  { code: code4(3002), phase: "type", summary: "a percent with no axis to resolve against" },
  { code: code4(3003), phase: "type", summary: "a malformed datapath" },
  { code: code4(3004), phase: "type", summary: "an attribute is set twice" },
  { code: code4(3005), phase: "type", summary: "a text field's size sits under the iOS focus-zoom line (warning)" },
  { code: code4(4000), phase: "name", summary: "name-resolution error (unclassified)" },
  { code: code4(4001), phase: "name", summary: "a bare name resolves to nothing in scope" },
  { code: code4(4002), phase: "name", summary: "a bare name shadows an outer member (warning)" },
  { code: code4(4003), phase: "name", summary: "a body writes a script { } variable (a body holds a copy — state lives on a node)" },
  { code: code4(4004), phase: "name", summary: "a body names a host global (document, window, process, …) — the Declare way is named" },
  { code: code4(4005), phase: "name", summary: "a bare enum token inside { } — the quoted form is named" },
  { code: code4(4006), phase: "name", summary: "a per-frame Time's onTick ignores dt — polling, not integration (warning)" },
  { code: code4(4007), phase: "name", summary: "a { } reads the ambient clock (Date.now(), new Date()) — a stopped clock (warning)" },
  { code: code4(4008), phase: "name", summary: "no 'shows' name matches the initial location — every screen starts hidden (warning)" },
  { code: code4(5000), phase: "module", summary: "include/module error (unclassified)" },
  { code: code4(5001), phase: "module", summary: "two included files declare the same class" },
  { code: code4(5002), phase: "module", summary: "an include path cannot be found" },
  { code: code4(5003), phase: "module", summary: "an included library has a tree root" },
  { code: code4(6000), phase: "typecheck", summary: "typecheck error (unclassified)" },
  { code: code4(6001), phase: "typecheck", summary: "a { } body fails the TypeScript typecheck" },
  { code: code4(7000), phase: "constraint", summary: "constraint dependency error (unclassified)" },
  { code: code4(7001), phase: "constraint", summary: "a { } constraint cannot be statically analyzed (residue)" },
];
