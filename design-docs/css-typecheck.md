# Compile-time `css` blocks with a type-checking pass

*Design spec. Status: approved for planning (2026-07-18). Builds on the
standard-CSS styling channel (`design-docs/css-engine-and-screen-update.md`;
`css-parse.ts`/`css-match.ts`/`css-coerce.ts`/`css-apply.ts`). Origin: the CSS
engine parses CSS from a runtime string and silently skips malformed
declarations; this reclaims the class-dict stylesheet's "fails loudly" for
standard CSS — a typo or type error fails the build. Lands as a follow-up PR on
`feat/css-engine`.*

## Why

The class-dict `stylesheet S [ Chip: [ fill = navy ] ]` is already type-checked —
each entry's fields are validated against the class they land on, so a stale skin
fails loudly. Standard CSS, by contrast, enters through a runtime
`buildRuleSet(string)` and its coercers silently drop malformed values. This adds
a **compile-time CSS surface** — `css Name { … }` — and a checker pass that
validates it, so `colour: red` (typo) and `font-size: banana` (type error) fail
compilation with positioned errors, exactly like a mistyped stylesheet field. It
also closes today's gap: `cssRules` was only settable from a runtime string; now
a checked `css` block is a first-class, named, compile-time source.

## Decisions (locked)

- **Surface:** a top-level `css Name { …raw CSS… }` declaration (native CSS
  inside a brace-matched block), mirroring `stylesheet Name [ … ]`. Used by bare
  name: `cssRules = Dark` (resolved like `stylesheet = S`).
- **Strictness:** every Tier-1 problem is a hard `NeoError` that fails
  compilation (like a mistyped stylesheet field). Tier-2 (property not applicable
  to a resolvable tag) is also an error, scoped to selectors with a resolvable
  tag (see Non-goals for what stays dynamic).
- **The type authority is the real coercer.** `css-coerce.ts` is pure and
  importable by the checker; value validation runs the *actual* runtime coercer,
  so it can't drift.
- **A check-time property table** in `schema.ts` (the checker's twin of the
  runtime `css:` mappings) is guarded against the runtime `cssMap(View)` by a
  parity test — drift fails CI (the codebase's established twin-table + guard
  pattern).
- **Namespace:** `css` names join the one top-level namespace
  (component/stylesheet/style/font); a duplicate is the existing "already a
  component, stylesheet, style, or font named…" error.

## Architecture

### A. Parser — `css Name { … }` (`runtime/src/parser.ts`)

A new top-level keyword `css`, parsed like `stylesheet`/`style` up to the name,
then a **balanced-brace raw capture**: from the opening `{`, scan counting `{`/`}`
to the matching close, taking the enclosed text verbatim (CSS's own `{ }` nest
one level — `selector { … }` — so the counter must handle it). Produces a
`CssDecl { name, text, span, bodySpan }` where `bodySpan.start` is the offset of
the raw text in the source (for positioning downstream errors). Added to a new
`program.csses: CssDecl[]`. `css` joins the top-level-declaration loop alongside
`class`/`stylesheet`/`style`/`font`, and the highlighter keyword list.

### B. Parser positions in `css-parse.ts`

`parseCss` today returns `Rule[]` with no source offsets. Extend it to carry, per
rule and per declaration, a `pos` (character offset **relative to the CSS text**).
`buildRuleSet` is unaffected (positions are ignore-able). The checker adds
`bodySpan.start` to turn a relative offset into a source position. `CssUnsupported`
(the parser's existing reject for `>`/`+`/`~`/pseudo/`!important`) gains the same
relative offset.

### C. The checker (`runtime/src/check.ts` + `schema.ts`)

- **Check-time property table** (`schema.ts`): `CSS_PROPERTIES: Record<string,
  { attr: string; coerce: (raw: string) => unknown }>` mirroring the `css:`
  declarations on `View` — `"background-color" → {attr:"fill", coerce:coerceColor}`,
  etc. Imports the pure coercers from `css-coerce.ts`.
- **Parity guard** (test): assert `CSS_PROPERTIES` keys/attrs equal the runtime
  `cssMap(View)` keys/attrs (built via `defineAttributes`), so the twin tables
  can't drift.
- **`checkCss(program, schemas): NeoError[]`** — for each `CssDecl`:
  1. `parseCss(text)` inside try/catch → a `CssUnsupported` becomes a positioned
     error (offset + `bodySpan.start`).
  2. For each parsed rule:
     - **Unknown property:** a declaration whose property isn't in
       `CSS_PROPERTIES` → error `unknown CSS property 'X'`.
     - **Malformed/wrong-type value:** `entry.coerce(value) === undefined` →
       error `'value' is not a <kind> for 'X'`.
     - **Unknown tag selector:** any `tag` condition whose name resolves to no
       schema (built-in or user class) → error `unknown component 'Tag'`.
     - **Tier-2 (resolvable tag):** for a selector whose rightmost simple selector
       has a `tag` condition resolving to class `C`, a property mapped to an attr
       that `C`'s schema doesn't accept → error `'C' has no styleable 'X'`. (All
       starter mappings are on `View`, so this only fires for future
       subclass-scoped mappings; scoped to avoid false positives on
       `.class`/`#id` selectors, which match any class.)
- **`cssRules = Name` resolution:** `checkAttr` for the `cssRules` slot accepts a
  bare identifier that names a `css` declaration; a non-`css` name is an error
  (`'X' is not a css block`). Mirrors how `stylesheet = S` resolves a stylesheet
  name.

### D. Compile + runtime (`compiler/src/compile.ts`, runtime registry)

Each `css` block compiles to a `RuleSet` registered by name at the tree root —
mirroring the stylesheet registry (`registerStylesheets`/`stylesheetByName`): a
`registerCsses(root, Map<name, RuleSet>)` + `cssByName(root, name)`. A
`cssRules = Dark` assignment compiles to the registry lookup (the same shape as
`stylesheet = S`). The `RuleSet` is built once via `buildRuleSet(text)` at boot
(interned; a re-assign of the same name is an equality-gated no-op).

## Modules touched

| File | Change |
|---|---|
| `runtime/src/parser.ts` | `css` keyword + balanced-brace raw capture → `CssDecl`; `program.csses`; namespace registration |
| `runtime/src/css-parse.ts` | per-rule/decl `pos` (relative offset); `CssUnsupported` carries offset |
| `runtime/src/schema.ts` | `CSS_PROPERTIES` check-time table (imports `css-coerce`) |
| `runtime/src/check.ts` | `checkCss`; `cssRules = Name` resolution; namespace dedupe includes `css` |
| `compiler/src/compile.ts` | emit `css` blocks as registered `RuleSet`s; resolve `cssRules = Name` |
| runtime registry | `registerCsses` / `cssByName` (mirror the stylesheet registry) |
| `compiler/src/highlight.ts` | add `css` to the keyword list |
| an example/demo | a `.declare` using a checked `css` block |

## Milestones

- **M1 — parser.** `css Name { }` raw-brace capture → `CssDecl` + `program.csses`
  + namespace dedupe. Tests: valid block, nested `selector { }` braces, unbalanced
  brace error, duplicate-name error.
- **M2 — positions in css-parse.** `pos` per rule/decl + on `CssUnsupported`.
  Tests: offsets point at the right token.
- **M3 — checker.** `CSS_PROPERTIES` + parity guard; `checkCss` (all five error
  classes); `cssRules = Name` resolution. Tests: one red per error class, valid
  passes, positions asserted, the parity guard, `cssRules = <non-css>` rejected.
- **M4 — compile + runtime.** Emit `RuleSet`s + registry; `cssRules = Name`
  end-to-end (compile → instantiate → styled). A migrated example.

## Testing

TDD (red → green). Parser tests (brace capture, nesting, errors). A checker
corpus: `css X { Card { colour: red } }` → unknown-property error at the right
offset; `{ font-size: banana }` → type error; `{ Buttn { … } }` → unknown tag;
plus valid blocks that pass clean. The parity guard test. An end-to-end
`compile(...)` test asserting a checked `css` block styles a view. Positions
asserted against `NeoError` spans, as the existing checker tests do.

## Non-goals

- **Selector target existence** — `#id`/`.class` referencing is NOT checked;
  `styleclass`/`id` are set at runtime (`styleclass={sel ? …}`), so "no view has
  class card" is not an error. This is the deliberate line where standard CSS
  stays dynamic.
- **Runtime `buildRuleSet(string)`** — dynamically-supplied CSS is unchanged
  (still coercer-skips at runtime); only the compile-time `css` surface is
  checked. (A dev-mode `console.warn` on runtime coercion failure is a possible
  later add.)
- Specificity/cascade "conflict" lint; value range checks beyond coercion; `@media`
  / pseudo-elements (already rejected at parse).

## Open knobs (deferred)

- `.css` sibling-file surface (`css Dark from "theme.css"`) as an alternative to
  the inline block — later, if wanted.
- Vendor/forward-compat property allowlist — not needed while the vocabulary is
  closed.
