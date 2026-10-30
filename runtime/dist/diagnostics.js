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
import { DeclareError, describePos } from "./errors.js";
import { memberHint } from "./teach.js";
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
// Each factory returns a coded DeclareError (message identical to the hand-written
// wording it replaces). Recurring families get a parameterized template; the
// long tail of one-off messages gets a per-phase FAMILY wrapper (`syntax` /
// `structure` / `type` / `module`) that attaches the family code to a message
// the call site still composes — a near-mechanical migration that still yields
// a code. `code()` is the escape hatch for a fully custom (code, message).
const err = (code, message, pos, hint) => new DeclareError(message, pos, { code, hint });
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
export function extensionsOf(name, candidates) {
    const lower = name.toLowerCase();
    return candidates.filter((c) => c.toLowerCase() !== lower && c.toLowerCase().startsWith(lower));
}
/** The single high-confidence near-miss among `candidates`, or null (no match
 *  in budget, or an ambiguous tie — ambiguity is below suggestion confidence). */
export function nearestName(name, candidates, budget) {
    const lower = name.toLowerCase();
    let best = null;
    let bestD = budget === undefined ? 3 : budget + 1;
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
    const cap = budget ?? (name.length >= 5 ? 2 : 1);
    return best !== null && !tie && bestD <= cap ? best : null;
}
export const Diag = {
    // 1xxx syntax — the parser throws one at a time; a single family code, the
    // grammar message carrying the specifics.
    syntax: (message, pos) => err(code4(1001), message, pos),
    // A value body wrapped ENTIRELY in parentheses — the constraint's own { }
    // already delimits the expression, so `{ (expr) }` and `{ ({ … }) }` add a
    // layer that does nothing. A hint naming the paren-free form (`{ expr }`,
    // `{ { … } }`), never an error: a body is TypeScript, which allows them.
    redundantParens: (inner, pos) => err(code4(1002), `redundant parentheses — the { } already delimits the expression, so the outer ( ) do nothing here; { ${inner} } says the same`, pos),
    // 2xxx structure. `unknownClass` takes the known-class names and
    // appends a calibrated near-miss ("did you mean 'Text'?") — the fix, named
    // (diagnostics.md §4); the rule rides the hint.
    unknownClass: (tag, pos, candidates = []) => {
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
            return err(code4(2001), `unknown class '${tag}' — did you mean ${list}?`, pos);
        }
        const near = nearestName(tag, candidates);
        return near === null
            ? err(code4(2001), `unknown class '${tag}'`, pos)
            : err(code4(2001), `unknown class '${tag}' — did you mean '${near}'?`, pos, `a tag names a library class or one declared in the program`);
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
    // A text field whose written size sits under iOS's 16px focus-zoom line
    // (a WARNING — compile.ts smallFieldWarnings; the composed message names
    // the behavior and the fix, diagnostics.md §4).
    smallField: (message, pos, hint) => err(code4(3005), message, pos, hint),
    type: (message, pos) => err(code4(3000), message, pos),
    // 4xxx name resolution
    unresolved: (name, scope, pos, sizing = false) => err(code4(4001), `cannot resolve '${name}' — not a member of ${scope}, a parameter, or one of the globals a body may use (Math, JSON, Date, URL, console, …)` +
        // In a size slot the missing name is often a child the USE SITE supplied,
        // which the class cannot name because it does not own it. It can measure
        // it: that is what the content intrinsics are for, and nothing else in the
        // message points at them.
        (sizing ? `. To size to children the use site handed this class, read 'contentWidth' / 'contentHeight'` : ``), pos),
    shadowing: (message, pos) => err(code4(4002), message, pos),
    // A body assigns a `let`/`var` a script { } block declared. Each body gets
    // its own const copy of every script binding, so the write throws at runtime
    // and no reader could ever have seen it — state that changes lives on a node.
    // A body names a host global (document, window, process, …). Refused by name,
    // with the Declare way beside it (teach.ts HOST_GLOBAL_HINTS).
    hostGlobal: (name, hint, pos) => err(code4(4004), `'${name}' is the host's, not Declare's — a program runs on three renderers and names none of their globals. ${hint.charAt(0).toUpperCase()}${hint.slice(1)}`, pos),
    // A bare enum token inside a { } body (`{ active ? semibold : regular }`):
    // the slot's own word, which is a string inside an expression.
    enumTokenInExpr: (token, slot, pos, quoted = false) => quoted
        // an AUTHORED literal union: the member is quoted EVERYWHERE — there is
        // no bare slot form to point at (DT's spelling ruling, 2026-09-05)
        ? err(code4(4005), `'${token}' is one of ${slot}'s values — a literal union's member is written in quotes, as a bare value as in { }: "${token}"`, pos)
        : err(code4(4005), `'${token}' is one of ${slot}'s values — bare only as the whole value (${slot} = ${token}); inside { } write it as a string: "${token}"`, pos),
    // A WARNING: a per-frame onTick that never reads its dt is not integrating —
    // it is polling, the one imperative habit the language exists to retire
    // (declare.md §1, "nothing waits").
    timePolls: (param, pos) => err(code4(4006), `this onTick never reads '${param}' — a per-frame Time that does not integrate is polling. Nothing waits in Declare: what is this handler waiting for? A fetch landing is 'data.loaded' (constrain on it, or onLoad); a view existing or settling is onInit / onReady / afterSettle / onArrive; a value changing is a constraint on it, and a value CROSSING into a state you must act on once is trackChanges + onChange; a value that is a function of the current time derives from the Time's facts (now, second, minute, …); one that should advance over time is an Animator, one that should reach a target a Spring; something to do when the minute turns is onTick on tick = minute. Keep the per-frame onTick only if the next value is computed from the last, each frame`, pos),
    // A WARNING: a { } that reads the host's clock has no cell behind the read —
    // it evaluates once and never again (the stopped clock, open-items L-25).
    ambientRead: (what, pos) => err(code4(4007), `this { } reads ${what} — the ambient world, not the tree: a constraint re-runs when something it READ changes, and nothing here can change, so this evaluates once and never again. The current time is a Time member's facts (time.now, time.minute, …), which a { } derives from like any attribute; Date.now() belongs in a handler`, pos),
    /** A `shows` name that no initial `location` can ever equal — the screen is
     *  born hidden and nothing says so (field report 2026-09-04: `location = ""`
     *  with `shows = "home"` rendered display:none, silently, forever). */
    showsUnreachable: (name, initial, names, pos) => err(code4(4008), `shows = ${JSON.stringify(name)}, but this program's initial location is ${initial === "" ? "empty" : JSON.stringify(initial)} — a 'shows' name IS the visibility gate (it lowers to app.destinationOf(app.location) == the name), so nothing here is visible on a cold load. Set App's location to one of ${names.map((n) => JSON.stringify(n)).join(" | ")}, or give this view its own 'visible'`, pos),
    // A WARNING: a program overrides a runtime method the reference documents
    // no contract for. A method is a method, so the override stands — but the
    // runtime calls this one on its own schedule, with its own arguments.
    // A datapath { } that is a literal: a cursor is a place IN declared data, and
    // a literal array or object is a fresh value no Dataset holds — the boot
    // refuses it ("belongs to no Dataset") every time.
    literalDatapath: (pos) => err(code4(3006), `a datapath is a place in declared data, and a literal is in none — the value is fresh, so no Dataset holds it and the cursor has nowhere to point. Declare the records as data and point there: 'items: Dataset { { "rows": [ … ] } }' for fixed records, or 'items: Dataset [ contents = { … } ]' for records you compute, then 'datapath = { app.items.value }' and replicate with ':rows[]'`, pos),
    // A declared type name that TypeScript's standard library already declares
    // globally (Pick, Map, Record, …): every { } body typechecks against that
    // library, where the name already means the built-in — so a reference in a
    // body reaches the wrong thing, and TypeScript's errors blame the use.
    shadowsTsGlobal: (kind, name, lib, pos) => err(code4(4015), `${kind} ${name} takes a name TypeScript's standard library already declares (${lib}) — the { } bodies typecheck against that library, where '${name}' means the built-in, so a use of yours there reaches the wrong thing. Choose another name`, pos),
    // The same, for a name Declare's own types already hold — a value type
    // (Backdrop, Color, Filter, Outline, …), a word list (Process, Tick, …) or a
    // preset theme (Cupertino, …): the bodies typecheck with Declare's type under
    // that name, so `this` inside a class of that name is the value type — the
    // errors would say "'root' is not a member of Backdrop" at every use, or
    // nothing at all where TypeScript merges the two.
    shadowsDeclareType: (kind, name, rename, pos) => err(code4(4015), `${kind} ${name} takes the name of one of Declare's own types (npx declare-help ${name} says what it is) — the { } bodies typecheck with that type under the name, so inside yours '${name}' would mean Declare's, not your ${kind}. Rename yours, as '${rename}'`, pos),
    // A Spring owns its slot for as long as it lives — it never finishes — so a
    // slot its view also binds ({ }, :path or a percent) has two owners, and the
    // boot refuses it. (An Animator may drive a bound slot: it takes the slot for
    // its run and the constraint takes it back — the LZX slide.) Always wrong for
    // a Spring, so an error, and the message gives the form that works.
    springsBoundSlot: (owner, slot, spring, pos) => err(code4(2005), `${owner}.${slot} is bound by a constraint, so this ${spring} cannot drive it — a spring owns the attribute it drives for as long as it lives, and a bound attribute belongs to its constraint. Put the target in the spring and leave ${slot} unbound: ${spring} [ attribute = ${slot}, to = { … } ]`, pos),
    // A WARNING: a class named exactly like a tag the rich-text whitelist owns.
    // Inside `Markdown`/`HTMLText` content a tag is resolved against the program's
    // classes BEFORE the whitelist, so the class takes the tag over — defined
    // behaviour, and a legal class, which is why this is a warning and not an
    // error. Only raised when the program actually renders rich text.
    shadowsRichTextTag: (name, pos) => err(code4(4010), `class ${name} hides the rich-text tag <${name}> — inside Markdown or HTMLText content a tag is resolved against this program's own classes before the HTML whitelist, so every <${name}> in a document builds one ${name} view, not the tag. Rename the class if the content means the tag`, pos),
    // A HINT: a constraint that centers a box by hand. `x = center` is the
    // position literal for exactly this, and it re-resolves when either width
    // changes. Style, not a defect — the author may want the arithmetic — so it
    // rides the third severity tier and never blocks.
    centersByHand: (axis, pos) => err(code4(4011), `this is ${axis} = center — the position literal centers the box inside its parent, and re-resolves when either ${axis === "x" ? "width" : "height"} changes`, pos),
    // A WARNING: an Animator (or AnimatorGroup) the program never starts.
    // `started` is the request and start() is the verb; with neither, the element
    // declares a motion that never runs. A Spring is excluded — it follows a
    // reactive `to` and is never start()-triggered.
    animatorNeverStarts: (tag, name, pos) => err(code4(4012), `nothing starts this ${tag} — 'started' is never set on it${name === null ? `, and an anonymous member has no name to call start() on` : `, and no body calls ${name}.start()`}, so it declares a motion that never runs. 'started' is the request: started = true runs it once the tree stands, and started = { … } binds it to the fact that should drive it; a handler runs it moment to moment with ${name === null ? `a name and name.start()` : `${name}.start()`}. A Spring needs neither — it follows its 'to'`, pos),
    // A WARNING: a press() override on a Button. Every other control routes the
    // pointer through press(); Button inverts that, so an override here is the
    // keyboard's path only and the click lands in the untouched onClick.
    buttonPressOverride: (owner, pos) => err(code4(4013), `press() on ${owner} replaces Button's activation path — every other control routes the pointer through press(), and Button inverts that: its own press() delivers to onClick, which is the use site's action slot. An override here answers Space and Enter, and a click still runs the untouched onClick — so the action never fires from the pointer. Put the action in onClick()`, pos),
    // A WARNING: a method named like a handler that answers no event of its
    // class. The prefix is a convention, so the method works; a misspelt
    // handler (onPointerdown) never fires, which is what this catches.
    unknownHandler: (owner, name, known, pos, near = known.find((h) => h.toLowerCase() === name.toLowerCase() || editDistance(h, name) <= 2) ?? null) => err(code4(4019), near !== null
        ? `${owner} has no '${name}' event — '${near}' is the handler, so '${name}' never fires; as written it is an ordinary method`
        : memberHint(name) !== ""
            ? `${owner} has no '${name}' event, so '${name}' never runs as one — ${memberHint(name)}`
            : `${owner} has no '${name}' event, so '${name}' is an ordinary method; a method that answers no event reads best without the 'on' prefix`, pos),
    // Accessibility (docs/system-design/accessibility.md §3.7). A role is a
    // contract: the class that declares it must set what the role reads and have
    // the methods its actions call — an error, since a slider with no value is a
    // broken class. A role is a word, fixed for the view's life, never a formula.
    // The rest are warnings: what a person using a screen reader would miss.
    accessibilityContract: (message, pos) => err(code4(2006), message, pos),
    accessibilityRoleComputed: (pos) => err(code4(2007), `accessibilityRole is a word, fixed for the view's life — write it as one (accessibilityRole = button), not as a { } value. A view whose role would change is two views, or two classes picked by classFor`, pos),
    // `labelled`: the class shows a `label` of its own, which is the first fix
    accessibilityNoName: (owner, role, pos, labelled = false) => err(code4(4017), `${owner} is ${/^[aeiou]/i.test(role) ? "an" : "a"} ${role} with no name: it sets no accessibilityLabel${["slider", "progress", "textField", "dialog", "alertDialog", "region"].includes(role) ? "" : ` and holds no text, tip or named mark to take one from${labelled ? " (its label is empty)" : ""}`}, so a screen reader announces only "${role}". ${labelled
        ? `Give it a label ("Mute"), or, where the words that name it are shown apart from it (a Text beside it in a row), set accessibilityLabel to them (accessibilityLabel = :title)`
        : `Set accessibilityLabel to what it is called ("Volume", "Close")`}`, pos),
    accessibilityControlInControl: (inner, innerRole, outer, outerRole, pos) => err(code4(4020), `${inner} (${/^[aeiou]/i.test(innerRole) ? "an" : "a"} ${innerRole}) is inside ${outer} (${/^[aeiou]/i.test(outerRole) ? "an" : "a"} ${outerRole}): the inner is read as part of the outer's name, and a screen reader that takes the outer as one element (VoiceOver does) never reaches it. Make them siblings in a plain View, or, if only ${inner} is meant to be pressed, make ${outer} a plain View`, pos),
    accessibilityCollapsedRead: (owner, axis, pos) => err(code4(4021), `${owner} hides what it holds by clipping it to a ${axis} of 0, but a screen reader still reads it and Tab still reaches it: absence is visible, not geometry. Add visible = { this.${axis} > 0 }, or the condition that collapses it`, pos),
    accessibilityUnreportedChoice: (owner, flag, pos) => err(code4(4022), `${owner} shows whether it is the one chosen ('${flag}'), but tells a screen reader nothing — a row of them reads as plain buttons, none of them picked. For one of many, use Segmented (or a RadioGroup of Radios): it reports the choice, and the arrows move between the options. Keeping your own, set accessibilityPressed = { ${flag} }: a pressed control is the one that is in`, pos),
    // A WARNING: toggles used as one of several — sibling controls of one class,
    // each "on" when the same value equals its own literal (Cadence run 17's
    // sport, day and range choices). Each reports pressed, so 4022 is quiet, but
    // a screen reader hears separate toggles, not one choice among them.
    accessibilityTogglesAsOneOf: (count, cls, flag, subject, pos) => err(code4(4026), `these ${count} ${cls}s are one choice among several — each is '${flag}' when ${subject} equals its own value — but a screen reader hears ${count} separate toggles, not one choice of ${count}, and the arrows do not move between them. For one of several, use Segmented (or a RadioGroup of Radios): it holds the choice, reports it as one of ${count}, and the arrows move between the options`, pos),
    // A WARNING: a control hidden from a screen reader. aria-hidden hides what a
    // view says, not where the keyboard goes: Tab still lands on it, and there it
    // says nothing.
    accessibilityHiddenControl: (owner, control, role, pos) => err(code4(4027), `${owner} is hidden from a screen reader (accessibilityHidden), but ${control === owner ? "it is" : `it holds ${control}, which is`} a ${role} — Tab still reaches it, and there it says nothing. accessibilityHidden is for what is seen and already said by the words around it (an icon beside a word that says the same thing). To take a control away, hide it (visible = false) or disable it`, pos),
    // A State's override value runs on the VIEW (its `this`), so the State's own
    // members are not in reach there: a bare one would resolve outward, to
    // whatever else carries that name.
    stateMemberInOverride: (name, slot, state, pos) => err(code4(4028), `'${name}' is ${state}'s own, but '${slot} = { … }' is an override: it is the enclosing view's value, computed on the view, where ${state}'s members are not in reach. Read what the view has, or give the view the attribute and constrain it there`, pos),
    // A method written in a State lands on the State, not on the view — a State
    // overrides attributes and adds children, and has no way to change a method.
    methodInState: (name, state, pos) => err(code4(4029), `${state} has no '${name}' — a method written in a State is the State's own, never the view's: a State overrides the view's attributes and adds children while it applies, but cannot change what a method does. Let the method read a condition instead (the same one 'applied' reads)`, pos),
    rowIndexUnreplicated: (owner, pos) => err(code4(4023), `${owner} reads rowIndex, but ${owner} is not replicated — that is its own rowIndex, never the row's, because a built-in never resolves outward. The index of the row it sits in is that view's: parent.rowIndex (one level up), or classroot.rowIndex inside a class whose instances are the rows`, pos),
    writeToComputedDataset: (name, verb, pos) => err(code4(4024), `${name} computes its value with contents, so it refuses writes — ${name}.${verb}(…) will be refused when it runs, and what it meant to keep is lost. A dataset that is written holds its records as data: ${name}: Dataset { { … } } (its first value), and a list derived from it is a second dataset with contents`, pos),
    // A WARNING: a constraint body whose decisions nest three `? :` deep, or one
    // `&&`/`||` condition with four or more parts. It works; it is hard to read,
    // to change and to inspect, because the facts it decides on have no names.
    // Two levels (`pressed ? a : hovered ? b : c`) and three-part conditions stay
    // quiet: the guide teaches both, and both read at a glance.
    tangledConstraint: (attr, depth, parts, pos) => err(code4(4025), `${attr} decides ${depth >= 3 ? "through " + depth + " nested ? : choices" : "on one condition of " + parts + " parts"} — give the facts it decides on names of their own (an attribute with a { } default: open: boolean = { … }), and the constraint reads them; a choice keyed by a value (an id, a kind, a mode) is a lookup in data or a theme list, and a look a view takes in some state is a State. A named value costs nothing: it is worked out once and kept`, pos),
    // A range bounds a size a layout gives; beside a size the view states itself
    // it bounds nothing, and the cap the author meant is ordinary arithmetic.
    rangeWithoutEffect: (owner, range, size, pos) => err(code4(4030), `${owner}.${range} has no effect here — a range bounds the ${size} ${owner === "App" ? "the host gives an app" : "a layout gives a view (a share, a shrink, a stretch)"}, and ${owner} states its own ${size}. To cap a stated ${size}, write it: ${size} = { Math.${range.startsWith("max") ? "min" : "max"}(900, parent.${size}) }`, pos),
    // A WARNING: an onKeyDown on a Control that never hands on to the control's
    // own. A handler replaces the base's, so the keys it does not take stop working.
    keyDownWithoutSuper: (owner, pos) => err(code4(4031), `onKeyDown on ${owner} replaces Control's own — Space and Enter no longer press it, and the arrows no longer move in its group. Hand on the keys you do not take: else super.onKeyDown(e)`, pos),
    accessibilityDrawnFocusable: (owner, pos) => err(code4(4018), `${owner} draws itself and takes the focus, but has no accessibilityRole — what it draws is pixels, not anything a screen reader can read. Give it the role it plays and the facts that role reads, or make it a Control`, pos),
    afterInValue: (pos) => err(code4(4014), `afterDelay() waits, and a { } value computes — it runs whenever what it reads changes, so a wait here would be scheduled again on every change. Call afterDelay(ms, fn) from a handler or a method; a value that should change over time derives from a Time's facts or moves with a Spring or an Animator`, pos),
    scriptWrite: (name, pos) => err(code4(4003), `'${name}' is a script { } variable — a { } body holds a copy of it, so a write lands nowhere (and throws at runtime). State that changes is an attribute: declare it on the app or the class (${name}: <type> = …) and write that; a script { } holds constants and functions`, pos),
    // `classroot` reaches the root of the class (class) you are defining, so it
    // is meaningful ONLY inside a class body. `where` names the non-class body the
    // code is actually in ("the App", "a style bundle").
    classrootOutsideClass: (where, pos) => err(code4(4003), `'classroot' is the root of a class you define — valid only inside a class body. This code is in ${where}, not a class. Reach values here by a bare name, 'this', or 'app'.`, pos),
    // A CSS color NAME resolved as a bare identifier inside { } — the name form is
    // a bare-slot literal, not an identifier the { } world knows, so name the 0x form.
    namedColorInExpr: (name, hex, pos) => err(code4(4004), `'${name}' is a named color — the name form works only as a bare value; inside { } write it as ${hex}.`, pos),
    // 5xxx module / include
    includeCollision: (message, pos) => err(code4(5001), message, pos),
    missingInclude: (path, pos) => err(code4(5002), `cannot find include "${path}"`, pos),
    strayRoot: (message, pos) => err(code4(5003), message, pos),
    module: (message, pos) => err(code4(5000), message, pos),
    // 6xxx typecheck (tsc over a { } body). `tsCode` (e.g. 2322) rides in the
    // hint so the Declare message stays clean but the TS origin is recoverable.
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
/** Turn a collected DeclareError into a Diagnostic. `severity` says which list it
 *  came from (errors vs warnings); the code is the error's own if a catalog
 *  factory set one, else the phase fallback — so an un-migrated `new DeclareError`
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
 *  line when present; a warning carries a `warning: ` prefix and a hint a
 *  `hint: ` one (an unmarked diagnostic reads as an error, the compiler
 *  convention). Deterministic plain text — ANSI color is a caller-side
 *  decoration, never a second format. */
export function formatDiagnostic(d) {
    const sev = d.severity === "error" ? "" : `${d.severity}: `;
    const at = d.pos ? ` ${describePos(d.pos)}` : "";
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
    const warns = diagnostics.filter((d) => d.severity === "warning").length;
    const hints = diagnostics.filter((d) => d.severity === "hint").length;
    const counts = [
        errs > 0 ? `${errs} error${errs === 1 ? "" : "s"}` : "",
        warns > 0 ? `${warns} warning${warns === 1 ? "" : "s"}` : "",
        hints > 0 ? `${hints} hint${hints === 1 ? "" : "s"}` : "",
    ].filter((s) => s.length > 0).join(", ");
    // ADVICE ONCE. A warning is mostly "<what, here> — <what to do about it>", and
    // one code's advice is the same sentence at every site (a program with six
    // tangled conditions read the same paragraph six times, and missed the line
    // that mattered). After its first full telling, a warning whose advice repeats
    // keeps what is particular to it and points back. The diagnostics themselves
    // are untouched: this is how the text reads, not what a tool receives.
    const told = new Set();
    const lines = diagnostics.map((d) => {
        const cut = d.severity === "error" ? -1 : d.message.indexOf(" — ");
        if (cut < 0)
            return d.rendered;
        // a collapsed entry's site count rides after the advice: kept with the point
        const rest = d.message.slice(cut + 3), sites = / — (\d+ sites.*)$/.exec(rest);
        const advice = sites === null ? rest : rest.slice(0, sites.index);
        const key = `${d.code}\u0000${advice}`;
        if (!told.has(key)) {
            told.add(key);
            return d.rendered;
        }
        return formatDiagnostic({ ...d, message: `${d.message.slice(0, cut)} — the same advice as above${sites === null ? "" : ` — ${sites[1]}`}`, hint: undefined });
    });
    return [counts, ...lines].join("\n");
}
/** The browsable catalog — every code, its phase, and a one-line summary. The
 *  data form of the "set of message templates" (docs / tooling / a future
 *  `Declare explain DECLARE3001`). */
export const DIAGNOSTIC_CATALOG = [
    { code: code4(1001), phase: "syntax", summary: "the parser rejected a token or shape" },
    { code: code4(1002), phase: "syntax", summary: "a value body wrapped whole in parentheses — { expr } says it (hint)" },
    { code: code4(2000), phase: "structure", summary: "structural error (unclassified)" },
    { code: code4(2001), phase: "structure", summary: "unknown class tag" },
    { code: code4(2002), phase: "structure", summary: "a name is declared more than once" },
    { code: code4(2003), phase: "structure", summary: "a member is placed where its node-kind forbids it" },
    { code: code4(2004), phase: "structure", summary: "a name violates the member namespace" },
    { code: code4(2005), phase: "structure", summary: "a Spring drives an attribute its view also binds — the target belongs in the Spring's to" },
    { code: code4(2006), phase: "structure", summary: "a class declares an accessibilityRole whose contract it does not meet" },
    { code: code4(2007), phase: "structure", summary: "accessibilityRole written as a { } value — a role is a word, fixed for the view's life" },
    { code: code4(3000), phase: "type", summary: "type/value error (unclassified)" },
    { code: code4(3001), phase: "type", summary: "a value does not fit its attribute's type" },
    { code: code4(3002), phase: "type", summary: "a percent with no axis to resolve against" },
    { code: code4(3003), phase: "type", summary: "a malformed datapath" },
    { code: code4(3004), phase: "type", summary: "an attribute is set twice" },
    { code: code4(3005), phase: "type", summary: "a text field's size sits under the iOS focus-zoom line (warning)" },
    { code: code4(3006), phase: "type", summary: "a datapath { } is a literal — a fresh value no Dataset holds" },
    { code: code4(4000), phase: "name", summary: "name-resolution error (unclassified)" },
    { code: code4(4001), phase: "name", summary: "a bare name resolves to nothing in scope" },
    { code: code4(4002), phase: "name", summary: "a bare name shadows an outer member (warning)" },
    { code: code4(4003), phase: "name", summary: "a body writes a script { } variable (a body holds a copy — state lives on a node)" },
    { code: code4(4004), phase: "name", summary: "a body names a host global (document, window, process, …) — the Declare way is named" },
    { code: code4(4005), phase: "name", summary: "a bare enum token inside { } — the quoted form is named" },
    { code: code4(4006), phase: "name", summary: "a per-frame Time's onTick ignores dt — polling, not integration (warning)" },
    { code: code4(4007), phase: "name", summary: "a { } reads the ambient clock (Date.now(), new Date()) — a stopped clock (warning)" },
    { code: code4(4008), phase: "name", summary: "no 'shows' name matches the initial location — every screen starts hidden (warning)" },
    { code: code4(4010), phase: "name", summary: "a class is named like a rich-text tag — that tag builds this class inside content (warning)" },
    { code: code4(4011), phase: "name", summary: "a constraint centers a box by hand — x = center says it (hint)" },
    { code: code4(4012), phase: "name", summary: "an Animator nothing ever starts — no 'started', no start() call (warning)" },
    { code: code4(4013), phase: "name", summary: "a press() override on a Button — the click runs onClick, not this (warning)" },
    { code: code4(4019), phase: "name", summary: "a method named on… that answers no event of its class — an ordinary method (warning)" },
    { code: code4(4016), phase: "name", summary: "a Control with no accessibilityRole (warning)" },
    { code: code4(4017), phase: "name", summary: "a view whose role needs a name has none (warning)" },
    { code: code4(4018), phase: "name", summary: "a drawn, focusable view with no accessibilityRole (warning)" },
    { code: code4(4020), phase: "name", summary: "a control inside a control — interactive inside interactive (warning)" },
    { code: code4(4021), phase: "name", summary: "a view clipped to zero size to hide what a screen reader still reads (warning)" },
    { code: code4(4022), phase: "name", summary: "a control that shows it is chosen and reports no state (warning)" },
    { code: code4(4023), phase: "name", summary: "rowIndex read on a view that is not replicated — its own, never the row's (warning)" },
    { code: code4(4024), phase: "name", summary: "a write to a dataset that computes its value with contents (warning)" },
    { code: code4(4026), phase: "name", summary: "sibling toggles that each turn on for one value of the same thing — one of several, said as separate toggles (warning)" },
    { code: code4(4028), phase: "name", summary: "a State's own member read bare in an override value, which runs on the view" },
    { code: code4(4029), phase: "name", summary: "a method in a State that the State does not have — a State cannot change the view's methods" },
    { code: code4(4030), phase: "name", summary: "a size range beside a size the view states itself, where it bounds nothing (warning)" },
    { code: code4(4031), phase: "name", summary: "an onKeyDown on a Control that never calls super.onKeyDown — Space, Enter and the arrows stop (warning)" },
    { code: code4(4027), phase: "name", summary: "a control hidden from a screen reader that the keyboard still reaches (warning)" },
    { code: code4(4025), phase: "name", summary: "a constraint whose decisions are nested three deep, or one condition with four or more parts (warning)" },
    { code: code4(4014), phase: "name", summary: "afterDelay() in a { } value — a value computes and never waits" },
    { code: code4(4015), phase: "name", summary: "a class, schema, theme or style takes a name TypeScript's standard library or Declare's own types declare" },
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