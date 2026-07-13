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
import { NeoError } from "./errors.js";
// ── Codes ───────────────────────────────────────────────────────────────────
// The phase base (the "un-migrated" fallback) plus the specific codes the
// recurring families own. `DIAGNOSTIC_CATALOG` (bottom) enumerates them all —
// the browsable "set of templates".
/** The diagnostic-code prefix — ONE symbol, because the prefix is slated for a
 *  repo-wide rename: every code is BUILT (and parsed) through this constant,
 *  so the rename is a single-point change here (tests asserting rendered codes
 *  update with it). */
export const CODE_PREFIX = "NEO";
/** Build a full code from its 4-digit number: `code4(2001)` → "NEO2001". */
const code4 = (n) => `${CODE_PREFIX}${n}`;
const BASE = {
    syntax: code4(1000),
    structure: code4(2000),
    type: code4(3000),
    name: code4(4000),
    module: code4(5000),
    typecheck: code4(6000),
    constraint: code4(7000),
};
const PHASE_BY_DIGIT = {
    "1": "syntax",
    "2": "structure",
    "3": "type",
    "4": "name",
    "5": "module",
    "6": "typecheck",
    "7": "constraint",
};
/** The phase a code belongs to (its thousands digit, just past the prefix). */
export function phaseOfCode(code) {
    return PHASE_BY_DIGIT[code[CODE_PREFIX.length]] ?? "structure";
}
// ── The template catalog ─────────────────────────────────────────────────────
// Each factory returns a coded NeoError (message identical to the hand-written
// wording it replaces). Recurring families get a parameterized template; the
// long tail of one-off messages gets a per-phase FAMILY wrapper (`syntax` /
// `structure` / `type` / `module`) that attaches the family code to a message
// the call site still composes — a near-mechanical migration that still yields
// a code. `code()` is the escape hatch for a fully custom (code, message).
const err = (code, message, pos, hint) => new NeoError(message, pos, { code, hint });
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
function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > 2)
        return 3;
    let prev2 = [];
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
/** The single high-confidence near-miss among `candidates`, or null (no match
 *  in budget, or an ambiguous tie — ambiguity is below suggestion confidence). */
export function nearestName(name, candidates) {
    const lower = name.toLowerCase();
    let best = null;
    let bestD = 3;
    let tie = false;
    for (const c of candidates) {
        const d = editDistance(lower, c.toLowerCase());
        if (d < bestD) {
            best = c;
            bestD = d;
            tie = false;
        }
        else if (d === bestD)
            tie = true;
    }
    return best !== null && !tie && bestD <= (name.length >= 5 ? 2 : 1) ? best : null;
}
export const Diag = {
    // 1xxx syntax — the parser throws one at a time; a single family code, the
    // grammar message carrying the specifics.
    syntax: (message, pos) => err(code4(1001), message, pos),
    // 2xxx structure. `unknownComponent` takes the known-component names and
    // appends a calibrated near-miss ("did you mean 'Text'?") — the fix, named
    // (diagnostics.md §4); the rule rides the hint.
    unknownComponent: (tag, pos, candidates = []) => {
        const near = nearestName(tag, candidates);
        return near === null
            ? err(code4(2001), `unknown component '${tag}'`, pos)
            : err(code4(2001), `unknown component '${tag}' — did you mean '${near}'?`, pos, `a tag names a built-in component or a class declared in the program`);
    },
    duplicateName: (message, pos) => err(code4(2002), message, pos),
    misplaced: (message, pos) => err(code4(2003), message, pos),
    namespace: (message, pos) => err(code4(2004), message, pos),
    structure: (message, pos) => err(code4(2000), message, pos),
    // 3xxx type / value
    typeMismatch: (message, pos) => err(code4(3001), message, pos),
    badPercent: (message, pos) => err(code4(3002), message, pos),
    badDatapath: (message, pos) => err(code4(3003), message, pos),
    setTwice: (message, pos) => err(code4(3004), message, pos),
    type: (message, pos) => err(code4(3000), message, pos),
    // 4xxx name resolution
    unresolved: (name, scope, pos) => err(code4(4001), `cannot resolve '${name}' — not a member of ${scope}, a parameter, or a global`, pos),
    shadowing: (message, pos) => err(code4(4002), message, pos),
    // 5xxx module / include
    includeCollision: (message, pos) => err(code4(5001), message, pos),
    missingInclude: (path, pos) => err(code4(5002), `cannot find include "${path}"`, pos),
    strayRoot: (message, pos) => err(code4(5003), message, pos),
    module: (message, pos) => err(code4(5000), message, pos),
    // 6xxx typecheck (tsc over a { } body). `tsCode` (e.g. 2322) rides in the
    // hint so the neo message stays clean but the TS origin is recoverable.
    typeError: (message, pos, tsCode) => err(code4(6001), message, pos, `TypeScript ${tsCode}`),
    // 7xxx constraint — the dependency extractor met a { } constraint it cannot
    // statically analyze (a dynamic target/cardinality, or an unresolved call).
    // The message is composed at the call site and NAMES the rewrite that makes it
    // analyzable (diagnostics.md §4), so it rides the family code with the
    // specifics in `message`.
    residue: (message, pos) => err(code4(7001), message, pos),
    constraint: (message, pos) => err(code4(7000), message, pos),
    /** Escape hatch: a fully custom (code, message) for a site that fits no
     *  family yet. Prefer a named factory. */
    code: (code, message, pos, hint) => err(code, message, pos, hint),
};
// ── Conversion + formatting ──────────────────────────────────────────────────
/** Turn a collected NeoError into a Diagnostic. `severity` says which list it
 *  came from (errors vs warnings); the code is the error's own if a catalog
 *  factory set one, else the phase fallback — so an un-migrated `new NeoError`
 *  still lands with a valid code and phase. */
export function toDiagnostic(e, severity, fallbackPhase) {
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
export function formatDiagnostic(d) {
    const sev = d.severity === "warning" ? "warning: " : "";
    const at = d.pos ? ` (line ${d.pos.line}, col ${d.pos.col})` : "";
    const hint = d.hint ? `\n  hint: ${d.hint}` : "";
    return `${sev}${d.message} [${d.code}]${at}${hint}`;
}
/** The whole compile's rendered form — what a CLI prints verbatim. A one-line
 *  count summary, then each diagnostic's `rendered`. Empty string when there is
 *  nothing to say (deterministic: same diagnostics → same bytes). */
export function renderReport(diagnostics) {
    if (diagnostics.length === 0)
        return "";
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
 *  `neo explain NEO3001`). */
export const DIAGNOSTIC_CATALOG = [
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
    { code: code4(4000), phase: "name", summary: "name-resolution error (unclassified)" },
    { code: code4(4001), phase: "name", summary: "a bare name resolves to nothing in scope" },
    { code: code4(4002), phase: "name", summary: "a bare name shadows an outer member (warning)" },
    { code: code4(5000), phase: "module", summary: "include/module error (unclassified)" },
    { code: code4(5001), phase: "module", summary: "two included files declare the same class" },
    { code: code4(5002), phase: "module", summary: "an include path cannot be found" },
    { code: code4(5003), phase: "module", summary: "an included library has a tree root" },
    { code: code4(6000), phase: "typecheck", summary: "typecheck error (unclassified)" },
    { code: code4(6001), phase: "typecheck", summary: "a { } body fails the TypeScript typecheck" },
    { code: code4(7000), phase: "constraint", summary: "constraint dependency error (unclassified)" },
    { code: code4(7001), phase: "constraint", summary: "a { } constraint cannot be statically analyzed (residue)" },
];
//# sourceMappingURL=diagnostics.js.map