# Declare — capability gaps and defects, rated by value to the language

**Supersedes `declare-bugs-2026-08-06.md`.** Same evidence base — seven cold-agent
builds across three briefs plus a pixel-level replication of a production site —
re-judged on one axis: **what each change is worth to the language**, not how loud the
defect is. Verified against `640d8dd`; every *Confirmed* item was reproduced here or
read at the cited source line.

**The finding behind the findings.** The most serious gaps below went undetected for
weeks because nothing exercised them: the eval fixtures were data-only, the flagship
apps draw their imagery, and the guide's examples barely touch photographs or
typographic leading. It took a replication mission against a real production site —
photography, real type, rotated ephemera — to surface in one afternoon what five
greenfield evals never touched. The corpus tests what the briefs demand. §6 draws the
consequence.

---

## Tier 1 — Foundational. The language is incomplete for its stated domain without these.

The domain is "interactive applications with dynamic data and substantial visual
dynamism." Each of these is table stakes for that domain, present in every peer
system, and currently absent.

### 1.1 Image sizing — object-fit and natural dimensions · ESSENTIAL

`Image` today is four attributes: `source`, `stretches`, `loaded`, `failed`
(Confirmed). There is no cover/contain, and a loaded bitmap's natural size is not
readable — `loaded` is a reactive fact while the dimensions behind it are not, which
breaks the language's own "everything is a readable fact" posture in the one place
photography needs it.

**What it costs:** every image-led layout — a hero crop, a card thumbnail, a portrait
grid — is currently unbuildable without out-of-band data. The replication agent's
solution is the receipt: a bytes-range request and a hand-written JPEG/PNG/WebP header
parser in a relay, to learn what the runtime already knows. No competent evaluation of
"can this language build real apps" survives that sentence.

**Why it's cheap relative to its value:** the loader holds the decoded bitmap; exposing
`naturalWidth`/`naturalHeight` as read-only reactive attributes (the `loaded`/
`statusCode` pattern, already established twice) plus a `fit = cover | contain |
stretch` enum is contained work with a worked precedent for every part.

### 1.2 `Text.lineHeight` · ESSENTIAL

The most common measured fact in any real page is font-size over line-height, and the
language's text primitive cannot express the second half (Confirmed absent). The knob
exists — `Markdown` has `lineHeight` in its schema (`schema.ts:534`) with the layout
math behind it — it simply was never plumbed to `Text`. One agent routed plain prose
through Markdown *solely for the leading*. Typography is the core of UI design; the
design briefs said "type carries the design" and the language agreed with everything
except the leading. Smallest effort-to-value ratio on this list.

### 1.3 Rotation · HIGH, and cheaper than it looks

`View.rotation` doesn't exist — but **`View.scale` does** (Confirmed:
`schema.ts:108` — painted-only, never layout, pivot-point machinery, hit-testing
follows the visible thing, realized as CSS transform / ctx.scale per backend). The
transform surface is half-built; every hard decision rotation needs — painted vs
layout, pivots, hit-testing through a transform — is already made, shipped, and
documented for scale. Rotation completes an existing surface rather than opening a
new one.

**What it costs:** the entire expressive register the project's own doctrine calls
"steering past the median." The replication target rotates nearly every decorative
element 1–7°; the agent could rotate drawn content through `draw()` but a rotated
`Image` or `Text` is unreachable from either direction. A language that claims
better-than-median visual ambition cannot lack the one transform every design tool,
CSS, and SwiftUI treat as primitive.

### 1.4 Inline emphasis in labels · HIGH — partly a findability failure

"FEAT: **bold rest**" — one bold word inside a wrapped label — cannot be expressed on
`Text`, and the replication dropped the site's inline emphasis. The nuance: the
machinery exists. `RichText` is a shipped abstract family for flowing styled text
(Confirmed, `schema.ts:520`), and Markdown composes rich runs internally. What's
missing is either the *label-scale* entry point (runs on `Text`, or a lightweight
concrete RichText for a one-line label) — or possibly only the documentation, since a
capable agent searched and concluded the capability didn't exist. First step is a
ruling: what is the intended answer for a styled run inside a label? Then either build
it or document it loudly.

---

## Tier 2 — Integrity. Bugs that attack the language's central claim.

The pitch is that Declare converts silent runtime wrongness into loud compile-time
refusal. Every item here is a **silent** wrongness that the full static ladder
blesses. They read as ordinary bugs; they are brand damage. Value of fixing = the
credibility of the differentiator itself.

| # | Defect | Status | Why it matters at the language level |
|---|---|---|---|
| 2.1 | **Multi-touch finger leak** — simultaneous release strikes only one finger off (`input.ts` ~350); every pinch poisons the next tap until reload | Confirmed (source) | Breaks exactly the apps the gestures chapter teaches. One shipped app carries a 40-line census to compensate — a workaround that will be copied forever if it lands in a sample before the runtime is fixed. Fix before any curation of gesture-heavy exemplars. |
| 2.2 | **`DataSource.auto` memo** — `A → "" → A` never re-fetches; returning to a screen shows the previous visit's data | Confirmed (source + agent assert) | Silent stale data on the most ordinary navigation shape there is. Contradicts the attribute's own reference sentence. |
| 2.3 | **Use-site override of a formula-defaulted attribute silently ignored in-class** | Confirmed (probe) | The most likely way to author a broken reusable component, at the exact moment the library story asks users to author components. No diagnostic at any rung. |
| 2.4 | **`listenTo` on a reserved event name delivers the literal string `"undefined"`** | Confirmed (source) | A declared contract (`listenTo` names what you hear) with an undocumented reserved-word trapdoor. Compile-time refusal is feasible — the list is usually a bare literal. |
| 2.5 | **`pointerEvents = "none"` doesn't cover the subtree; `at()` ignores it entirely** | Confirmed (source) + Reported (measured) | The reference promises the subtree. The hit-test oracle disagreeing with the documented promise means the introspection surface — the model's act of looking — lies. |
| 2.6 | **`Heartbeat` negative `dt` across clock handover** (~−0.72s first frame under `settleMotion`) | Reported ×1, specific | Any app that integrates motion, driven at rung 5, can run backwards. Docs promise clamping; it's top-only. |

---

## Tier 3 — The loop. Verify is the second product; holes here devalue the differentiator.

The ladder is what makes the language's whole authoring story different. Where its
answers are false or its vocabulary missing, the strategic asset erodes.

- **3.1 · Rung-5 host page lacks a viewport meta — every phone assertion silently
  measures a desktop at 980px** (Confirmed by measurement). One line in
  `verify-behave.mjs`. Until it lands, the mobile half of every design brief is
  unverifiable through the supported path — which quietly falsified parts of two
  runs' own multi-viewport claims. **Highest value-per-line on this entire document.**
- **3.2 · `settleMotion` vs deliberately perpetual motion.** A pulsing live-indicator
  means `motionBusy` never falls, so the one determinism primitive is unusable and
  agents regress to `wait()`. This is structural: the house style says "spring
  everything," the design briefs demand ambient life, and the harness demands
  eventual silence. Needs a design answer (e.g., settle-except, or ambient motion
  declared as such), not a patch.
- **3.3 · A `Spring` doesn't move on the first `clock.step()` after a target change**
  (Reported ×2 independently). Reads exactly as "the animation never ran." One
  sentence of doc, or arm on the step.
- **3.4 · Assert vocabulary gaps**: `expect.attr` compares by identity (failure
  prints two identical arrays — Confirmed); no `expect.equal`; no `expect.value`
  for formula attributes (`inspect().attrs` carries only written slots — silent
  false negatives); no `drive.set`; `evaluate()` returns an Inspector transcript
  object that serializes to `{}` (three agents built workarounds; `find(path).attr`
  is the real read and nothing says so).
- **3.5 · `--states` contract undocumented** — the real shape (`viewport`, `clock`,
  `scheme`, `dpr`, **`mask`**, `route`) lives in a JSDoc; unknown keys are silently
  ignored (an agent got 1024×768 baselines from `width`/`height` with no warning).
  `mask` is what makes rung 6 possible over live data at all and is mentioned
  nowhere.
- **3.6 · `drive.page.evaluate` returning `undefined` fails the rung as an anonymous
  `page error`** — indistinguishable from a real crash; `return null` is the
  unguessable fix.

---

## Tier 4 — Expressive range. Real, deferrable, but only if named.

Each is a legitimate v-next deferral — provided the negative-knowledge doctrine is
honored: an undocumented absence is re-discovered (expensively) by every agent, and
three of these were.

- **4.1 · Blend modes** (`multiply`, `soft-light`) and backdrop blur — the paper
  texture and scrim of the replication target could only be alpha-approximated.
- **4.2 · `Image` tint** — one mask asset became two pre-recolored PNGs.
- **4.3 · `draw()` image sources** — already a documented deferral, but note the
  compounding with 1.3: today the drawn path rotates but can't hold a photo, the
  image path holds a photo but can't rotate. Fixing rotation (1.3) dissolves the
  most common want here.
- **4.4 · Pinch on a sub-surface inside a scrolling page** — `View.claim` scopes a
  pointer claim that's unavailable once the fingers are taken for pinch. Two design
  runs independently dissolved it by going single-screen; the gestures ladder
  implies an answer exists. Needs a ruling more than code.

---

## Tier 5 — Diagnostics and documentation. Small, cheap, all confirmed unless noted.

The compiler-as-teacher is a stated pillar; each of these is a lesson taught wrong.

1. **`DECLARE7001` names an impossible fix for primitive parameters** — "read through
   the parameter directly (`s.someAttr`)" on a *string*. Real triggers (probed):
   closure capture and opaque callees (`regex.test`); plain property reads are fine.
   Say so, and say plainly that the identical code as a method is accepted.
2. **Alpha in `{ }` bodies: three sources contradict; the working spelling
   (`0xRRGGBBAA`, probed clean) is documented nowhere**; `colorWithAlpha` is in the
   spine yet unresolvable when called. Also: one measured `rgba()` fact requires
   three spellings across bare slot / body / `draw()` — worth one table.
3. **`fontFamily` in braces takes a CSS string**; the type error omits the form while
   `coerceFont`'s own failure text states it perfectly. Move the sentence.
4. **A `class` after `App`** → `expected end of input, got 'class'` — ordering rule
   stated nowhere, message names nothing.
5. **`y = center` on `Text` centers the ink; the obvious brace rewrite centers the
   box** — one sentence, since any responsive `y` forces the rewrite.
6. `onWheel` is view-local while touch is root-space (chapter says "root-space
   throughout"); `View.claim` missing from the ownership table; touch payload shapes
   (`e.changed`) absent from the reference; `App.scrolls` default (`y`) absent from
   the schema; `Markdown.lineHeight` in the schema but missing from the generated
   reference (doc-gen gap).
7. **`Markdown` on a null `:path`** — reported browser crash (`.replace` on null);
   did **not** reproduce headless. Needs the original structure; a null should fall
   back to the default regardless.

---

## §6 — The coverage lesson, and what it buys the next round

These gaps survived five app-scale evals because **the briefs never demanded them**:

| Surface | Why it stayed dark | What exposed it |
|---|---|---|
| Photography (fit, natural size, tint) | Fixtures were JSON; flagships draw their imagery | Replication of a photo-led site |
| Typographic leading | No brief measured prose density | Pixel-matching real paragraphs |
| Rotation / blend / texture | Greenfield agents design *within* the language's reach — they don't attempt what it can't do | A target that had already decided |
| Multi-touch arbitration | Emulation-only testing, single-finger asserts | An agent driving real CDP multi-touch |
| Second-visit data staleness | Every test visited each screen once | An assert that mutated the world between visits |

Two consequences worth acting on:

1. **Replication belongs in the standing eval repertoire.** One replication found more
   Tier-1 gaps in 53 minutes than five greenfield builds found in three days —
   because a fixed external target is the only brief an agent can't quietly
   design around the language's holes. (This inverts the earlier ruling that
   translation tasks are low-value: *code-to-code* translation is; *pixel-target*
   replication is the opposite.)
2. **The next briefs should demand the dark surface**: an image-led brief (gallery,
   editorial page), a typography brief with measured leading, and fixtures that
   serve real images. Cheap additions to the harness: every `Image` in an eval
   gets at least one non-square source; the readable-surface sweep could flag
   schema attributes exercised by zero examples.

## §7 — Already fixed in this window; do not re-fix

`d.w`/`d.h` (Draw now constructed with its box); `input(v)` on an `Editor` → compile
error naming `onInput` and the controls/editors split; `:path` in `Spring`/`State` →
names the real rule; refusal bodies (`statusCode`/`errorBody`); fetch-URL
misreporting; `export` in `script{}`; `<->` on `{ }` slots; `rootY` under scroll;
controlled `TextInput`; library reference 0→166 attributes; theme tokens in the
model; `draw()` worked example.

## §8 — Checked and not defects / not reproduced; do not chase

Broad claim "any script function reading a parameter property is refused" —
overstated (property reads are clean; see 5.1 for the real trigger). Markdown
null-`:path` headless — clean (see 5.7). "Button unpressable by synthetic input" —
harness arithmetic. Unfilled full-frame `View` absorbing clicks — documented
press-catcher behavior. The replication app's R5-clean claim — did not reproduce
(10s wait timeout, live-timing suspected); its R1–R4 and pixel-parity claims verified.
