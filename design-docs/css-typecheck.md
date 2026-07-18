# Compile-time `css` blocks with a type-checking pass

*Design spec. Status: approved for planning (2026-07-18), revised after a
three-lens review. Builds on the standard-CSS styling channel
(`design-docs/css-engine-and-screen-update.md`;
`css-parse.ts`/`css-match.ts`/`css-coerce.ts`). Origin: the CSS engine parses CSS
from a runtime string and silently skips malformed declarations; this reclaims
the class-dict stylesheet's "fails loudly" for standard CSS. Lands as a follow-up
PR on `feat/css-engine`.*

## Why

The class-dict `stylesheet S [ Chip: [ fill = navy ] ]` is type-checked — each
entry is validated against the class it lands on. Standard CSS enters through a
runtime `buildRuleSet(string)` and its coercers silently drop malformed values.
This adds a compile-time surface — `css Name { … }` — and a checker pass so
`colour: red` (typo) and `font-size: banana` (type error) fail compilation with
positioned errors. It also makes `styleclass`/`id`/`cssRules` usable in `.declare`
source for the first time (today they exist only as runtime attributes, absent
from the checker's `schema.ts`, so a `.declare` that writes them fails to check).

## Decisions (locked)

- **Surface:** a top-level `css Name { …raw CSS… }` declaration, native CSS in a
  brace-matched block. Used by bare name: `cssRules = Dark` (resolved like
  `stylesheet = S`).
- **Strictness:** every Tier-1 problem is a hard `NeoError` that fails
  compilation. Tier-2 (property not applicable to a resolvable tag) is also an
  error but ships without a red-test today (all mappings are on `View`; see M3).
- **The type authority is the real coercer** (`css-coerce.ts` — pure, imports
  only `css-colors.ts`, importable by the checker). Value validation runs the
  actual runtime coercer, so it can't drift.
- **A check-time property table** (`CSS_PROPERTIES` in `schema.ts`) mirrors the
  runtime `css:` mappings, **parity-guarded** against `cssMap(View)`.
- **Tag selectors resolve case-sensitively** against the program's schemas
  (built-ins + user classes), matching the runtime matcher (`tagChain` = actual
  class names): `Card` resolves, lowercase `card`/`view` are "unknown component".
- **Namespace:** `css` names join the one top-level namespace; the dedupe error
  string gains "css block".

## Prerequisite (folded into M1): make the CSS-channel slots checkable

`styleclass`, `id`, `cssRules` exist only in `view.ts`'s `defineAttributes(View,
…)`, **not** in `schema.ts`'s `ViewSchema.attrs`. So `.declare` source that writes
any of them is a `View has no attribute` error today. Add:
- `styleclass: { kind: "string" }`, `id: { kind: "string" }` to `ViewSchema.attrs`.
- `cssRules: { kind: "cssRules" }` — a **new `AttrType` kind** (`value.ts`,
  mirroring `{kind:"stylesheet"}`), listed in `UNSTYLABLE` (a `cssRules` slot
  cannot be set through a class-dict entry, like `stylesheet`).

## Architecture

### A. Parser — `css Name { … }` (tokenizer + `runtime/src/parser.ts`)

The raw CSS body must be captured by a **comment/string-aware brace scanner at the
tokenizer level** — a new raw `cssbody` token, mirroring how the tokenizer already
captures a TS `code` region (`skipBraces`), but with **CSS lexing rules, not TS**:
count `{`/`}` depth; treat `/* … */` comments and `"…"`/`'…'` strings as opaque
(CSS has no `//` line comments and no template literals). This is required because
(a) the existing `{ }` code-token path applies TS-island logic and throws on CSS
that isn't valid TS, and (b) the `Parser` class holds only tokens, no source
handle — so the raw capture must happen where the source is lexed. Emits the raw
text plus its source offset.

`parser.ts` adds a `css` keyword to the top-level dispatch (`parseTopDecls`,
alongside `stylesheet`/`style`/`font`) and a `parseCssDecl` producing
`CssDecl { name, text, bodyOffset }` (`bodyOffset` = the source offset of the raw
text's first char). Threaded through `parseTopDecls`'s return type, `Program`,
`Library`, and both assembler functions, plus the bare `Program` literal in
`check.ts:77` (add `csses: []`). Edge cases: an **empty** block `css X {}` is
valid (zero rules); an **unterminated** block is a positioned `unterminated css
block` error.

### B. Positions in `css-parse.ts`

`parseCss`/`parseDecls` today discard offsets. Extend the `Rule` and declaration
shapes to carry, **relative to the CSS text**: `selPos` per rule (offset of the
selector), and per declaration `{ namePos, valuePos }`. `parseDecls` rewrites its
`split(";")`/`split(":")` loop to track the running index. `CssUnsupported`
(a plain `Error` today) gains an optional relative `offset`. `buildRuleSet` and
the matcher ignore these fields — no caller breaks.

### C. The checker (`runtime/src/check.ts` + `schema.ts`)

- **`CSS_PROPERTIES` (`schema.ts`)** — the check-time twin of the runtime `css:`
  mappings, importing the pure coercers. Exactly the 12 `css:`-bearing specs on
  `View` (source of truth: `defineAttributes(View, …)`), keyed by **W3C property
  name**, each with a fixed `kind` label for error messages (the coercer can't
  report its own kind):

  | property | attr | coerce | kind |
  |---|---|---|---|
  | `left` | x | coerceLength | length |
  | `top` | y | coerceLength | length |
  | `width` | width | coerceLength | length |
  | `height` | height | coerceLength | length |
  | `background-color` | fill | coerceColor | color |
  | `border-radius` | cornerRadius | coerceLength | length |
  | `opacity` | opacity | coerceNumber | number |
  | `color` | textColor | coerceColor | color |
  | `font-size` | fontSize | coerceLength | length |
  | `font-family` | fontFamily | coerceString | string |
  | `font-weight` | fontWeight | coerceWeight | weight |
  | `letter-spacing` | letterSpacing | coerceLength | length |

- **Parity guard (test):** assert `CSS_PROPERTIES`' key-set AND `attr` values equal
  `cssMap(View)`'s (and, free, that the `coerce` is the same imported symbol) —
  drift fails CI.
- **`checkCss(program, schemas, source): NeoError[]`** — needs the **source
  string** to turn offsets into `Pos` via a `posOf(source, offset)` helper
  (precedent: `compile.ts:376-383`/`559-568`; `NeoError.pos` is
  `{line,col,offset}`, not a bare offset). For each `CssDecl`, `parseCss(text)` in
  try/catch (a `CssUnsupported` → positioned error at `bodyOffset + offset`), then
  per rule:
  1. **Unknown property** → error at the **name** offset: `unknown CSS property 'X'`.
  2. **Malformed/wrong-type value** (`entry.coerce(value) === undefined`) → error
     at the **value** offset: `'value' is not a <kind> for 'X'` (`<kind>` from the
     table). NOTE: `string`/`number`/`weight` are permissive — only
     `length`/`color`/`weight`/`number` reject non-conforming; `font-family:
     banana` legitimately passes.
  3. **Unknown tag selector** — a `tag` condition whose (case-sensitive) name is in
     no schema → error at the **selector** offset: `unknown component 'Tag'`.
  4. **Tier-2 (resolvable tag)** — for a selector whose rightmost simple selector
     has a `tag` resolving to class `C`, a property whose `attr` is not
     `attrType(C_schema, attr)` → `'C' has no styleable 'X'`. (All starter
     mappings are on `View`, and every styleable class descends from `View`, so
     this never false-fires today — ships as code + a positive no-false-fire test;
     the red-test waits for a subclass-scoped mapping.)

  A colon-less fragment (`View { color }`) is a positioned `malformed declaration`
  error (fails loudly, unlike the runtime skip).

- **`cssRules = Name` resolution** — routed in `checkElement` (NOT `checkAttr`),
  mirroring `stylesheet = S` (`check.ts:752-762`): a slot of kind `cssRules` with
  an `ident` value (`!== "null"`) must name a `css` decl in a new
  `StyleEnv.csses` set (populated beside `env.stylesheets`, `check.ts:236-242`);
  else `'X' is not a css block`.

### D. Compile + runtime (`runtime/src/instantiate.ts`)

Emission/registration/bare-name resolution live in `instantiate.ts` (the
compiler `.ts` files carry none of this), mirroring the stylesheet path:
- `buildCsses(program): Map<name, RuleSet>` — `buildRuleSet(text)` per `css` decl
  (mirror `buildStylesheets`, `instantiate.ts:240-290`).
- `registerCsses(root, map)` + `cssByName(root, name)` — a registry mirroring
  `registerStylesheets`/`stylesheetByName` (`stylesheet.ts:185-197`), called at
  `instantiate.ts:167` beside `registerStylesheets`.
- The `cssRules = Dark` bare-ident attribute resolves to `cssByName(root, "Dark")`
  at the instantiate attribute-set site that handles `stylesheet`-kind idents
  (`instantiate.ts:536-547`) — add a `kind === "cssRules"` branch. (Trace that the
  stylesheet-kind ident resolution exists there first; the css branch mirrors it.)

## Modules touched

| File | Change |
|---|---|
| tokenizer (`parser.ts`) | comment/string-aware raw `cssbody` capture |
| `runtime/src/parser.ts` | `css` keyword; `parseCssDecl` → `CssDecl`; `program.csses`; thread through Program/Library/assemblers |
| `runtime/src/css-parse.ts` | `selPos` per rule, `{namePos,valuePos}` per decl; `CssUnsupported` offset |
| `runtime/src/value.ts` | new `AttrType` kind `cssRules`; add to `UNSTYLABLE` |
| `runtime/src/schema.ts` | `styleclass`/`id`/`cssRules` in `ViewSchema.attrs`; `CSS_PROPERTIES` table (+ pure coercer imports) |
| `runtime/src/check.ts` | `StyleEnv.csses` + population; namespace dedupe incl. `css`; `checkCss`; `cssRules` routing in `checkElement`; pass source to `checkCss` |
| `runtime/src/instantiate.ts` | `buildCsses` + `registerCsses`/`cssByName`; `cssRules`-kind ident resolution branch |
| `compiler/src/highlight.ts` | add `css` to the keyword list |
| an example/demo | a `.declare` using a checked `css` block |

## Milestones

- **M1 — parser + schema slots.** The `cssbody` tokenizer capture + `parseCssDecl`
  + `program.csses` + namespace dedupe; add `styleclass`/`id`/`cssRules` to
  `ViewSchema` + the `cssRules` `AttrType` kind. Tests: valid block, nested
  `selector{}` braces, brace-in-comment `/* } */`, empty block, unterminated
  error, duplicate-name error; `styleclass="x"`/`id="y"` now check clean.
- **M2 — positions in css-parse.** `selPos`/`{namePos,valuePos}` + `CssUnsupported`
  offset. Tests: offsets point at the right token.
- **M3 — checker.** `CSS_PROPERTIES` + parity guard; `checkCss` (all error
  classes); `cssRules = Name` resolution + `= <non-css>` rejection. Tests: red per
  class with exact message regex + `{line,col}` (using a user class `Card [ ]` so
  it resolves; `font-size: banana` for the value error; `colour` for unknown-prop;
  `button` lowercase for unknown-tag); valid blocks pass; Tier-2 positive no-false-
  fire; parity guard.
- **M4 — compile + runtime.** `buildCsses`/`registerCsses`/`cssByName` +
  `cssRules = Name` end-to-end (`compile → instantiate → styled`); a migrated
  example.

## Testing

TDD. Each red-test names its input, expected message `/regex/`, and expected
`pos.{line,col}`, following the existing checker-test convention
(`assert.match(err.message, …)` + `errs[i].pos.line`). The parity guard. An
end-to-end `compile(...)`/`build(...)` test asserting a checked `css` block styles
a view.

## Non-goals

- **Selector target existence** — `#id`/`.class` referencing is not checked;
  they're runtime state (`styleclass={…}`).
- **Runtime `buildRuleSet(string)`** — unchanged (still coercer-skips); only the
  compile-time `css` surface is checked.
- Specificity/cascade lint; range checks beyond coercion; `@media`/pseudo-elements
  (already rejected at parse); a `.css` sibling-file surface (later).
