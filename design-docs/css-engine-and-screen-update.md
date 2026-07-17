# A standard-CSS styling channel, and a named screen-update seam

*Design spec. Status: approved for planning (2026-07-17). Origin: porting the
OpenLaszlo 5 CSS engine — selector matching, specificity, cascade — onto
declarelang's reactive spine, plus formalizing the frame-flush seam the runtime
already has. Revised after a three-lens review (codebase-reality, architecture,
completeness) — see "Review resolutions" for what changed and why.*

## Why

declarelang styles views through one deliberately narrow channel: the
class-keyed `stylesheet` (`runtime/src/stylesheet.ts`) — a dictionary lookup on
a typed class name, *no selectors, no specificity, no structural matching*,
schema-validated at check time so a stale skin **fails loudly**. That was a
considered choice, and it stays.

But standard CSS — `selector { property: value }`, cascade, specificity — is the
one styling language every human and every LLM already knows. Making declarelang
honor real CSS lowers the cost of reading, writing, and reasoning about a
program's look, for people and models alike. OpenLaszlo 5 already shipped a
proven CSS engine (authored by this project's owner): `compiler/src/css.ts`
(parse + specificity + value normalization) and `LzCSSStyle.lzs`
(`getPropertyCache` cascade + selector matching), with per-attribute W3C-property
mapping declared at each attribute (`<attribute name="bgcolor"
style="background-color"/>`, `__LZCSSProp`/`__LZCSSType`/`__LZCSSFallback`) and
value coercion by attribute type.

This spec brings that engine's *logic* over as an **additional, parallel**
styling channel — nothing removed — adapted to declarelang's reactive
`Constraint` system, and, as a small standalone first step, gives declarelang's
existing frame-batching an explicit named seam.

## Decisions (locked)

- **Standard CSS the runtime honors** — real selectors/specificity/cascade,
  accepting CSS's silent-failure nature (with partial fail-loud reclaimed at
  check time; see M5).
- **Additional parallel channel** — CSS offers at its own rank in
  `attributes.ts`, alongside the class-dict `stylesheet`; neither replaces the
  other.
- **W3C property names + translation map** — authors write
  `background-color: #2d7; color: white; font-size: 14px; left: 10px`. A
  per-attribute mapping (OL5's model) translates to declarelang attributes; **all
  value interpretation lives in per-attribute coercers**, not the parser.
- **Reactive-native port (Approach A)** — reuse OL5's parser/specificity/cascade
  *logic*; drive dynamic re-matching through declarelang's existing
  `Constraint`/`settle` system rather than OL5's manual `__LZCSSDependencies` +
  delegate + idle-reapply machinery. One reactivity system, not two.
- **Per-view matching; inheritance via prevailing-follow** — a rule affects a
  view **iff its selector matches that view**. There is **no** OL5-style
  parent-cache. Inherited CSS properties (`color`, `font-*`) propagate through
  declarelang's existing `prevailing`-follow: a CSS offer on a `prevailing` slot
  makes that view a provider, and descendants inherit by the normal follow.
  "CSS inheritance" ≡ declarelang `prevailing`. (Resolves the double-inheritance
  hazard; one inheritance mechanism.)
- **Compound selectors in scope** — `.red.green`, `view.red`, `#x.y` (multiple
  conditions on one simple selector). The parser emits a condition chain; the
  matcher tests all conditions; specificity **sums** per selector.
- **Subclass-aware `tag`** — a rule `view { … }` matches every `View` subclass.
  The matcher tests tag against the view's class chain (as `stylesheet.ts`
  `chainOf` already walks constructors), not an exact name.
- **Specificity tie-break = source order** — matched rules sort by
  `(specificity, sourceIndex)`; each parsed rule carries a monotonic source
  index. (Standard-CSS behavior; OL5's extra subclass tie-break comparator is
  intentionally **dropped** as non-standard.)
- **Precedence:** author `$set`/binding **>** class-dict stylesheet (rank-2)
  **>** CSS (rank-2b) **>** prevailing follow **>** declaration default —
  enforced by explicit cross-channel eviction, not by settle run-order (see M3).
- **M0 (batching seam) first**, then the CSS engine.
- **Runtime-built `RuleSet`** to start (parsed from CSS text at boot/instantiate,
  interned); compile-time parsing arrives in M5.
- **`#id` identity resolved before M3** — see the gate in M3.
- **Incremental** — six milestones; M0/M1/M2 are independently shippable, M3
  establishes dynamic correctness, M4 hardens, M5 formalizes.

## The reactive fit — and its one sharp edge

OpenLaszlo had no dependency-tracking runtime, so it hand-rolled dynamic CSS
re-matching: `__LZCSSDependencies` recorded which attributes on which nodes a
rule's applicability depended on, delegates re-registered on every change, and
`__reapplyCSS` recomputed on the idle loop. declarelang already has this
machinery — `reactive.ts`'s `Cell`/`Constraint`/`settle`. So the OL5 dependency
layer collapses into **ordinary tracked reads** inside one per-view applier
`Constraint`. `stylesheet.ts` already demonstrates the shape.

**The sharp edge (from review C1):** OL5 got away with reading ancestor
tag/id/class *untracked* because LZX classes were immutable and it re-cascaded
the whole subtree on idle regardless. declarelang has no idle re-cascade — a
re-cascade fires **only** on tracked-read invalidation. Therefore:

1. When the CSS applier's `compute()` matches selectors, **every attribute it
   reads on the view and on ancestors** (`styleclass`, `id`, any `[attr]` a
   selector tests) must be read **through the view's tracked accessors**, so a
   change to any of them wakes the applier. `tag`/class-chain is immutable, so it
   needs no tracking. Cross-object tracking already works this way — the getter
   installed by `defineAttributes` (`attributes.ts:127`) calls
   `cellFor(self, name).track()` on **whichever object** is read, exactly as
   `followRead` (`attributes.ts:242`) walks and tracks each ancestor. So reading
   `ancestor.styleclass` inside `compute()` registers the applier as a subscriber
   of that ancestor's cell. (Verified in review round 2.)
2. `parent` is **not** a reactive slot — reparenting doesn't invalidate reads of
   ancestor state, because no tracked cell changed. declarelang already has the
   hook: `childrenMutated()` (`view.ts:288`), which auto-extent and layout re-arm
   from — but it re-arms only **that one node**, not descendants. A reparent
   changes the ancestor chain of the moved node **and its whole subtree**, so the
   CSS re-cascade needs a **subtree walk keyed on the moved node**, re-running the
   CSS applier on it and every descendant — mirroring `stylesheetArrived`'s walk
   (`stylesheet.ts:162`). M3 defines this walk (`cssReparent`) and wires it to
   `childrenMutated` (the replication path); binding it to the manual
   `appendChild`/`removeChild` reparent path + the reparent test land in M4
   (`childrenMutated` does not fire on plain `appendChild`).
3. **Offer-channel marks must be reactive on membership.** `$stylesheetMarks` /
   `$cssMarks` are plain `Set`s mutated imperatively; a bare `provided()` read
   (`attributes.ts:190`) is **untracked**. So the arbitration re-offer (below)
   cannot rely on "the applier tracked the class-dict mark" unless we make mark
   membership fire a cell. The mechanism: `stylesheetWrite`/`stylesheetClear` and
   `cssWrite`/`cssClear` call `cellFor(self, name).changed()` on **every mark
   add/remove** (not only on value change), and the CSS applier performs a
   **tracked provision probe** — `cellFor(view, name).track()` — so a class-dict
   install/clear wakes it to withdraw/re-offer. (Round-2 finding: without this the
   eviction re-offer silently never fires — the same class of bug as point 1.)

These points are not "hardening" — they are the load-bearing conditions for
Approach A to work at all, and they land in **M3** (not deferred to M4), so M3's
descendant-combinator and arbitration tests are genuinely dynamically correct,
not false-green.

## Architecture

Read resolution today (highest → lowest), from `attributes.ts`:

```
author $set / owning binding
  → class-dict stylesheet offer   (rank-2, $stylesheetMarks)
  → prevailing follow             (nearest providing ancestor)
  → declaration default           (rank-1)
```

`provided()` (`attributes.ts:186`) is a flat OR of author `$set`/`$owners` and
`$stylesheetMarks` — it does **not** rank the offer channels internally; each
applier enforces "author outranks me" by checking `isSet`/`ownerOf` before
offering (`stylesheet.ts:136`). The CSS channel adds a sibling offer tier:

```
author $set / owning binding
  → class-dict stylesheet offer   (rank-2,  $stylesheetMarks)
  → CSS offer                     (rank-2b, $cssMarks)          ← new
  → prevailing follow
  → declaration default
```

**Arbitration (from review I1) — precedence is enforced, not emergent.** Two
independent mark-sets + FIFO settle would make "class-dict > CSS" depend on which
applier ran last — non-deterministic thrash. Instead:

- The **CSS applier** checks `isSet`/`ownerOf` **and** `$stylesheetMarks` before
  offering a slot (via a **tracked** provision probe, `cellFor(view,
  name).track()`, per Reactive-fit point 3); if the class-dict provides it, CSS
  withdraws (`cssClear`).
- `stylesheetWrite`/`stylesheetClear` gain a symmetric duty (all inside
  `attributes.ts`, which already owns `$stylesheetMarks` and will own `$cssMarks`
  — **no cross-module cycle**): when the class-dict claims a slot it **evicts**
  any `$cssMarks` entry (higher rank wins); every mark add/remove calls
  `cellFor(self, name).changed()`, so the applier's tracked probe re-runs it and
  CSS re-offers on class-dict release.
- Both `cssWrite`/`cssClear` and `stylesheetWrite`/`stylesheetClear` perform the
  prevailing-wake — reuse **`wakeIfPrevailing(self, name)`** (`attributes.ts:456`,
  the real helper; `becameProvider` is only an inline `const` at
  `attributes.ts:160`/`305`, not an API) — so followers re-root on install/clear.
- **Test discipline:** run the two appliers in *both* orders and assert an
  identical final **stored slot value** (not merely mark presence).
- *Simpler alternative, parked as an open knob:* a single ranked-offer table in
  `provided()` keyed by rank would collapse eviction to "highest rank installed
  wins" with one enforcement site, removing the dual-enforcement fragility. Not
  adopted for v1 to stay close to the existing two-Set `stylesheet` mechanism.

### Modules

| Module | Role | Purity |
|---|---|---|
| `runtime/src/css-parse.ts` | Port of `css.ts`: CSS text → `Rule[]` (selector AST w/ condition chains + summed specificity + `sourceIndex` + `Map<cssProp, string>` decls). **No value interpretation.** | pure |
| `runtime/src/css-match.ts` | Port of `LzCSSStyle` matching: `RuleSet` (**linear scan for v1** — no bucketing; compound selectors don't fit disjoint buckets, and corpora are tiny) + `matched(view, ruleSet): Map<string, RawValue>` → specificity-sorted matched decls for **this view only** (no parent-cache), plus `buildRuleSet(cssText): RuleSet` | pure (over a structural view interface) |
| `runtime/src/css-coerce.ts` | Value coercers: `color` (hex/`rgb()`/named→int), `length` (`10px`→10), `number`, `string`, `weight`. Failure → `undefined`. | pure |
| `runtime/src/attributes.ts` | `+ $cssMarks`, `cssWrite`/`cssClear`/`cssMarks`; `provided()` counts a CSS mark; cross-channel eviction; `AttrSpec += css?, coerce?` | — |
| `runtime/src/css-apply.ts` | Per-view CSS applier `Constraint` (sibling of the stylesheet applier); tracked ancestor reads; `childrenMutated` re-arm; dispose in `discard` | runtime-graph |
| `runtime/src/view.ts` | `+ styleclass`, `+ id` (pending §27 gate), `+ cssRules` (prevailing) slots; starter `css:`/coerce on styling attrs; CSS-applier re-arm in `childrenMutated`; dispose in `discard` | — |
| `runtime/src/screen-update.ts` (M0) | Named multi-subscriber `onScreenUpdate` seam fired once on clean `settle` completion | — |

## Milestones

### M0 — Batching audit + named screen-update seam (standalone)

declarelang already batches: `reactive.ts`'s two-phase microtask `settle` (phase
0 values, phase 1 draw re-records) coalesces constraint work; the canvas
compositor's `invalidate()` (`canvas-backend.ts:178`) schedules exactly one rAF;
the DOM backend's per-attribute `style.*` writes ride the browser's own frame
coalescing (no forced synchronous layout reads on the write path). This is the
modern descendant of the dreem/dreem2 screen-update model, and it is correct.

What's missing is a *named* anchor. M0 adds `onScreenUpdate` — a **named,
multi-subscriber observation point** fired **once on clean completion of a
top-level `settle`**. It changes nothing about *when* the frame paints: the
canvas compositor already schedules its rAF from every Surface write, so the seam
is observational, not a wiring change (no consumer subscribes yet — M0 ships the
seam + tests). Its value is one place that means "everything this frame's settle
changed has landed."

API (new `screen-update.ts`):

```ts
function onScreenUpdate(fn: () => void): () => void;  // subscribe; returns unsubscribe
function fireScreenUpdate(): void;                    // called by settle's clean tail
```

**Firing site (precise, against `reactive.ts:243`):** `settle()` early-returns on
re-entrancy (`if (flushing) return`) and its `finally` runs on **both** clean and
thrown exit — so a naive fire in `finally` would wrongly fire on throw (breaking
the test below). Add a `clean` local set true only after the `for(;;)` loop
drains, and call `fireScreenUpdate()` after `flushing` is reset, **guarded by
`clean`**. There is a single driver — `settle()` (which tests call directly) — so
there is no second entry point to wire.

- Audit + document the settle → pusher → paint path (module header + a short
  note in `docs/guide`). Document that the compositor rAF and the animation
  `Clock` rAF (`animate.ts:199`) both fold into the browser frame *after* the
  microtask seam, so ordering is: settle phases → `onScreenUpdate` → browser rAF
  paint.
- Tests: seam fires once per top-level settle; does **not** fire on a settle that
  throws; ordering (phase 0 before phase 1 before seam); idle-zero preserved (no
  seam churn when nothing changed); multiple subscribers all invoked; unsubscribe
  works.

### M1 — Engine core (pure)

`css-parse.ts` (port of `compiler/src/css.ts`, extended for compound conditions):
strip comments; split `selector { body }`; parse selectors — `tag`, `*`, `#id`,
`.class`, `[attr]`, `[attr=v]`, `[attr~=v]`, `[attr|=v]`, **compound conditions
on one simple selector** (`.red.green`, `view.red` → a condition chain), and the
descendant combinator (whitespace → ancestor-ordered array). Compute
**specificity by summing** conditions (`#id` 100, `.class`/`[attr]` 10, element
1, `*` 0; `.red.green` = 20, `view.red` = 11), and stamp each rule with a
monotonic **`sourceIndex`**. Declarations parse to `Map<cssProp, string>` — the
value is the **raw trimmed token string** (`"#2d7"`, `"10px"`, `"white"`,
`"rgb(1,2,3)"`, `"A, B, sans-serif"`); the parser does **no** hex/unit/color
interpretation. Reject cleanly (for the M5 checker): `!important`, `>`/`+`/`~`,
pseudo-classes.

**Port hazard:** OL5's `css.ts` (`cssValueToJs`) folds hex/`rgb()`→`0x…` at parse
time and emits an *untyped* JS object literal per simple selector (`{s,t,i,a,v,m}`,
one condition only). M1 does **neither**: it produces the typed AST below with
condition *chains*, and defers **all** value folding to coercers. Use `css.ts` as
a reference for selector tokenizing and specificity, not for value handling or
the emit shape.

```ts
type RawValue = string;                          // raw declaration text, verbatim
type Condition =
  | { kind: "tag";   name: string }              // spec +1, tagChain membership
  | { kind: "id";    name: string }              // spec +100
  | { kind: "class"; name: string }              // spec +10, styleclass ~= membership
  | { kind: "attr";  name: string; op?: "=" | "~=" | "|="; value?: string }; // +10
interface SimpleSelector { conditions: Condition[] }   // ALL must match (compound = AND)
type SelectorAST = SimpleSelector[];                    // ancestor-ordered (descendant combinator)
interface Rule { selector: SelectorAST; specificity: number; sourceIndex: number;
                 decls: Map<string, RawValue> }
```

Specificity = **sum** over every `Condition` in every `SimpleSelector`
(`.red.green` → 20, `view.red` → 11, `view button.active` → 1 + 11 = 12).

`css-match.ts` (port of `LzCSSStyle` matching, **without** `getPropertyCache`'s
parent-cache): a `RuleSet` is just the ordered `Rule[]` (v1 does a **linear
scan** — bucketing is deferred; compound selectors like `#x.y` span multiple
buckets, and corpora are tiny). `matched(view, ruleSet): Map<string, RawValue>`
returns the decls of rules whose selector matches **this view**, folded in
ascending `(specificity, sourceIndex)` order so a later rule overrides **only the
properties it declares** (per-property last-wins, mirroring `stylesheet.ts`'s
`mergedFor` fold). Selector matching runs against a structural **view
interface**:

```ts
interface MatchView {
  tagChain: readonly string[];   // this class + ancestors (subclass-aware tag)
  id: string;
  styleclass: string;            // space-tokenized for .class (~=) membership
  attr(name: string): unknown;   // for [attr] / [attr=v] / [attr~=v] / [attr|=v]
  parent: MatchView | null;      // for descendant combinators
}
```

`.class` matches by whitespace-tokenized membership on `styleclass` (OL5's `~=`
model); `tag` matches by membership in `tagChain`. The matcher is View-free and
unit-tested with fakes. **The applier (M3), not the matcher, is responsible for
making these reads tracked** — the matcher just reads the interface.

- Tests: an **explicitly authored** input→expected corpus (net-new; not a lift —
  OL5 ships no liftable `.css` fixture). Concrete cases with expected specificity
  numbers and cascade outputs: `.red`/`.green`/`.red.green` precedence
  (10/10/20); `view.red` (11) vs `.red` (10); descendant `view button`;
  `[attr]`/`=`/`~=`/`|=`; universal `*` (0); subclass tag match; `(specificity,
  sourceIndex)` tie-break. No runtime wiring in this milestone.

### M2 — Mapping layer

`AttrSpec` gains:

```ts
css?: string;                              // W3C property feeding this attr
coerce?: (raw: RawValue) => unknown;       // "10px"→10, "#2d7"/"white"/"rgb(..)"→int; undefined = malformed
```

`defineAttributes` builds a per-class reverse map `cssProp → { attr, coerce }`
(declarelang's `__LZCSSProp`/`__LZCSSType`). Starter mappings on `View`:

| W3C property | attr | coercer | note |
|---|---|---|---|
| `background-color`, `background` | `fill` | color | `fill` is a `Fill` union (Color\|Gradient\|null); coercer yields a color **int** or drops. Gradients not reachable from `background-color`. |
| `color` | `textColor` | color | prevailing → inherits via follow |
| `font-size` | `fontSize` | length | prevailing |
| `font-family` | `fontFamily` | string | prevailing |
| `font-weight` | `fontWeight` | weight | prevailing |
| `border-radius` | `cornerRadius` | length | |
| `opacity` | `opacity` | number | |
| `left` | `x` | length | |
| `top` | `y` | length | |
| `width` | `width` | length | |
| `height` | `height` | length | |
| `letter-spacing` | `letterSpacing` | length | prevailing |

`css-coerce.ts` owns **all** value parsing (the parser is structural). The
`color` coercer is **net-new** work: `css-colors.ts` is *only* the 148-name
lookup table — it parses neither hex nor `rgb()`. The coercer supplies
hex-string and `rgb()` parsing itself and uses `css-colors.ts` for names.
**Malformed value → coercer returns `undefined` → the applier skips that
declaration** (no `cssWrite`; the M5 checker flags it). Unknown/unmapped
properties are likewise ignored at runtime.

- Tests: each coercer, incl. failure paths (`font-size: banana` → `undefined`,
  `color: notacolor` → `undefined`); `background-color`→`fill` yields a valid
  `Fill`; the reverse-map build over a fake class.

### M3 — Runtime wiring (end-to-end, dynamically correct)

**Gate (resolve first):** decide whether CSS `#id` matches a new `id` attribute
or declarelang's §27 scope-noun identity. If scope-noun wins, no `id` attribute
is added and the applier reads scope identity instead. This is decided **before**
M3 wiring lands (it churns `view.ts` and the tests otherwise).

- `attributes.ts`: add `$cssMarks` + `cssWrite`/`cssClear`/`cssMarks`; extend
  `provided()` to count a CSS mark; wire the cross-channel **eviction**, the
  reactive-mark `cellFor(self, name).changed()` on every mark add/remove, and the
  `wakeIfPrevailing` prevailing-wake (see Arbitration). Install rank-2b below the
  class-dict.
- `css-apply.ts`: the per-view CSS applier `Constraint` (shape of the stylesheet
  applier). `compute()` reads (tracked) the prevailing `cssRules` slot, the
  view's `styleclass`/`id`, **each ancestor's `styleclass`/`id`** and any `[attr]`
  a candidate selector tests — all through tracked accessors; runs
  `matched(view, cssRules)`; maps `cssProp → attr`, coerces (skip on `undefined`),
  and,
  gated on `isSet`/`ownerOf`/`$stylesheetMarks`, installs via `cssWrite` /
  withdraws via `cssClear`. Pay-per-use: `cssRules === null` → no applier.
- `view.ts`: add `styleclass` + (conditional on the gate) `id` attributes and a
  prevailing `cssRules` slot holding a **pre-built `RuleSet`** (mirrors the
  `stylesheet` slot: set on the app root, flows down by follow, a swap re-runs
  appliers in one settle; the pusher mirrors `stylesheetArrived`,
  `view.ts:534`). Add a `cssReparent(node)` subtree walk (mirroring
  `stylesheetArrived`'s walk, `stylesheet.ts:162`) that re-runs the CSS applier on
  the moved node **and every descendant**; invoke it from the reparent path
  (`childrenMutated` re-arms only its own node, so the subtree walk is keyed on
  the moved node). Dispose the applier in `discard` (symmetric to the stylesheet
  applier).
- `styleclass` tokenization lives in the **matcher's `MatchView` adapter**, not a
  setter — declarelang attributes have no write-time coerce hook (`AttrSpec` has
  no `set`/`normalize`; `write()` stores verbatim, `attributes.ts:260`). The
  adapter reads raw `styleclass` and splits on `/\s+/` for `.class` (`~=`)
  membership at match time (which is what OL5's space-padded `~=` did anyway).
- CSS source (interim): a program (or test) supplies CSS **text** and assigns
  `root.cssRules = buildRuleSet(text)` — `buildRuleSet(cssText: string): RuleSet`
  (in `css-match.ts`, calling `css-parse.ts`) mirrors `buildStylesheet`
  (`stylesheet.ts:58`). "Interned" = one `RuleSet` per text so re-assigning
  identical text is an equality-gated no-op (`write()`'s `===` gate).
- **Cost note:** each view reads its full ancestor chain's `styleclass`/`id` —
  O(depth) tracked cells per view, and an ancestor `styleclass` swap wakes every
  descendant applier. This is correct CSS semantics (what OL5 did on idle) and
  heavier than the stylesheet applier's single-slot read; acceptable, but real.
- Tests (dynamically correct, not just initial-cascade): `.class`/`#id`/tag/
  descendant rules style views end-to-end; **author `$set` outranks CSS**;
  **class-dict outranks CSS in both applier run-orders** (identical result); CSS
  outranks prevailing follow and default; a prevailing CSS prop on an ancestor
  inherits to descendants via follow.

### M4 — Dynamic semantics hardening

With tracked ancestor reads already established in M3, M4 exercises and hardens
the remaining dynamics: attribute selectors (`[selected]`) re-cascade on the
attribute's change; `styleclass` swaps (`styleclass={sel ? 'on' : ''}`) re-match;
**reparenting** (`childrenMutated`) re-cascades against new ancestors; compound
selectors under change; specificity ties resolve by `sourceIndex`; a `cssRules`
swap re-runs every applier in one settle.

- Tests: toggle `[selected]`; swap `styleclass`; move a node between parents and
  assert re-cascade; compound `.red.green` toggle; specificity tie-break; ruleset
  hot-swap — each in one settle / one frame.

### M5 — Formalize

- **Compile-time parse:** parse `<stylesheet>`/`.css` in the `.declare` pipeline
  (mirroring OL5's `css.ts` emit-to-JS), so shipped programs carry a prebuilt
  `RuleSet`.
- **Partial fail-loud (checker):** warn where CSS *can* fail loudly without
  contradicting CSS semantics — unknown/misspelled W3C properties; malformed
  values (now well-defined: any value whose coercer returns `undefined`); and,
  **for selectors with a resolvable tag** (`tag` / `tag.class`), a property with
  no attribute mapping on that class. (A bare `.class`/`#id` can match any class,
  so the no-mapping check is scoped to resolvable-tag selectors.)
- **Docs + examples:** a teachable styling-flow model in `docs/guide`
  (author → class-dict → CSS → prevailing-follow → default; "CSS inheritance ≡
  prevailing"), the ruled shape written down, and one example migrated to
  demonstrate CSS alongside the class-dict.

## Testing & execution

TDD throughout (red → green → commit per task); `css-parse.ts`, `css-match.ts`,
and `css-coerce.ts` are pure and tested standalone against the M1/M2 corpora;
wiring is tested via the existing runtime harness (add `test/css.test.mjs`,
following `test/unit.test.mjs` conventions). Work proceeds in an isolated git
worktree, per the project's standard milestone rigor.

## Review resolutions

### Round 1 (three-lens: codebase-reality, architecture, completeness)

- **C1 (tracked ancestor reads + `childrenMutated`):** made a first-class
  condition of Approach A; landed in M3, not M4. Without it descendant
  combinators and reparenting silently fail.
- **I1 (arbitration):** class-dict > CSS is now enforced by explicit
  cross-channel eviction + a both-orders test, not by settle run-order.
- **B1 (compound selectors):** in scope; parser extended beyond css.ts to emit
  condition chains; specificity sums.
- **B2 (subclass-aware tag):** `tagChain` membership, not exact name.
- **B3 (tie-break):** per-rule `sourceIndex`; sort `(specificity, sourceIndex)`;
  OL5's subclass tie-break dropped as non-standard.
- **B4 (`RawValue`):** defined as the raw declaration string; the parser does no
  value interpretation — coercers own hex/`rgb()`/named/px. Boundary is now
  unambiguous.
- **B5 (malformed values):** coercer returns `undefined` → applier skips the
  declaration → M5 checker flags.
- **B6 (inheritance):** per-view matching, no parent-cache; inheritance rides
  `prevailing`-follow.
- **B7 (`cssRules` lifecycle):** `cssRules` holds a pre-built, interned
  `RuleSet`; text→`RuleSet` happens once at boot/instantiate; swap = assign a new
  `RuleSet`; pusher mirrors `stylesheetArrived`.
- **B8 (`styleclass`):** whitespace-tokenized `~=` membership (tokenization in
  the matcher adapter — superseded the initial "setter" idea in round 2, since no
  write-time coerce hook exists).
- **css-colors correction:** the `color` coercer is net-new parsing (hex +
  `rgb()`); `css-colors.ts` supplies names only.
- **`fill` type:** a `Fill` union; the coercer yields a color int or drops;
  gradients out of reach from `background-color`.
- **Applier lifecycle:** disposal added to `View.discard`; O(depth) fan-out
  acknowledged.
- **`#id` gate:** pulled forward to a hard gate before M3.

### Round 2 (mechanism-correctness + residual gaps)

- **Reactive marks (crux):** `$stylesheetMarks`/`$cssMarks` are imperative Sets
  with untracked reads — the eviction re-offer needed a tracked probe. Fixed:
  mark add/remove fires `cellFor(self, name).changed()`, and the applier does a
  tracked provision probe. Without this the class-dict-release re-offer silently
  never fired (a second instance of the C1 bug class). **Self-wake note:** the
  applier both probes `cellFor(view, name)` and, via `cssWrite`, fires that same
  cell — a self-invalidation. It is a **bounded fixpoint**, not a loop: `write()`
  is `===`-gated (`attributes.ts:264`), so once the coerced value is stable the
  re-run produces no `changed()`; and `settle`'s cycle guard (`reactive.ts:194`)
  turns any true cycle into a named throw, not a hang. M3 includes an explicit
  no-thrash / fixpoint test.
- **`wakeIfPrevailing`:** corrected the API reference — `becameProvider` is an
  inline `const`, not a callable; the reusable helper is `wakeIfPrevailing`
  (`attributes.ts:456`).
- **`cssReparent` subtree walk:** `childrenMutated` re-arms only its own node;
  reparent re-cascade needs a subtree walk keyed on the moved node
  (mirroring `stylesheetArrived`).
- **`SelectorAST` typed:** concrete `Condition`/`SimpleSelector`/`SelectorAST`
  (condition chains) — net-new beyond css.ts's untyped one-condition emit.
- **`RuleSet` = linear scan for v1:** dropped bucketing (compound selectors span
  buckets); bucketing is a later optimization.
- **`styleclass` tokenization in the matcher adapter,** not a setter — no
  write-time coerce hook exists on `AttrSpec`.
- **`onScreenUpdate` firing site:** explicit `clean` flag so it fires only on
  clean settle completion (settle's `finally` runs on throw too); typed
  subscribe/unsubscribe; fires from the single `settle()` driver.
- **Signatures pinned:** `matched(...): Map<string, RawValue>`,
  `buildRuleSet(cssText): RuleSet`, `onScreenUpdate(fn): () => void`.
- **Port hazard noted:** M1 must not copy OL5's parse-time hex folding
  (`cssValueToJs`); all folding is coercer-side.
- **Cross-object tracking verified:** reading `ancestor.styleclass` in a
  `Constraint.compute()` does register a dep (the getter tracks the read
  receiver, as `followRead` already relies on) — the C1 fix's core holds.

## Non-goals

- Removing or deprecating the class-dict `stylesheet` — it stays as the
  fail-loud primary skin.
- OL5's parent-cache cascade and its subclass specificity tie-break —
  intentionally not ported (prevailing-follow + source-order replace them).
- Full W3C CSS coverage — supported surface matches OL5's proven subset plus
  compound conditions, and grows on demand.
- `>`/`+`/`~` combinators, pseudo-classes, `!important`, `@media` — rejected
  cleanly at parse; candidates for later.
- A second reactivity mechanism — dynamic re-matching rides `reactive.ts`.

## Open knobs (deferred, not blocking)

- CSS-vs-class-dict precedence is a localized change if it should invert (the
  eviction direction + the applier's mark check).
- `.css` sibling-file loading (fetch/resolve) is a later alternative to the
  runtime-text source.
- Additional coercers/properties (`padding`/`margin` → layout insets, shorthand
  expansion) as the attribute vocabulary and layout model warrant.
