# Layout ownership — who places a child, and how the language knows

**Status: built, 2026-09-22.** Agreed in conversation with DT and implemented the same
day; where the build departed from the design, the text says so and why (§3, §4, §5, §10,
§12). It is written so it can be read cold. The rule itself (§1–§4) is stated as the language's rule and is the text
the guide will teach. §11 is the build order. §12 is background — why the
design has the shape it has — and is the one section allowed to talk about the past.

The one-sentence version: **a layout places its children; what a layout places, a
child does not declare** — and what a layout places is known from the source, never
declared by anyone, so the check happens at compile time and never depends on the
window.

---

## 1. The rule

A view's children sit where the view puts them: each at its own `x` and `y`, absolute
within the parent. `View.layout` is `null` by default — no arrangement, and no owner of
a child's geometry but the child itself.

Give a view a `layout:` and the layout **places** its children. From then on:

- **Position belongs to the layout.** A child under a layout does not declare the
  position the layout places. Where a child sits *across* the flow — the axis the flow
  does not fill — is the layout's `align`.
- **Size belongs to the child**, unless the layout allocates it, and allocation is
  always visible in the source: a `share` naming the child, a child that says
  `flexes = true`, a grid cell.
- **Visibility belongs to the child**, unless the plan drops it (`share: 0`). Laying
  out a set of children includes omitting one; the plan is where that is said.
- A child that must place itself says `ignoreLayout = true`, and the layout leaves it
  entirely alone.

What a given layout places depends on the layout and its configuration (§3), and is
always something a reader can determine from the source.

## 2. Declared vs done

What a view **declares** is standing — `y = 15`, `y = center`, `y = { … }`,
`visible = { parent.width >= 600 }`. It is part of the program's description of that
view, in force the whole time the view exists. What a layout places is standing too.

What a view **does** is momentary — `onClick: { this.visible = false }`. A fact
changing at a moment.

- **Two standing owners of one attribute is an error.** Decidable from the source, so
  it is a compile-time error whenever the layout is one the compiler knows (§5).
- **A momentary write lands if the attribute is free at that moment**, and is refused
  at runtime, naming the layout, if the layout controls it then. A child hiding itself
  on a click under a plan that does not drop it: the write lands, the layout re-places
  around it.

Spelling never matters. `y = 15` and `y = { 15 }` under a layout that places `y` get
the same answer. There is no distinction between a literal and a binding on a laid
slot; both are declarations.

## 3. What a layout places

Nobody declares this. It is *known*, from one of two sources.

**Library layouts — a table, read per instance.** Each layout the library ships has an
entry stating what it can place, as a function of its literal configuration:

| layout | configuration | places |
|---|---|---|
| `SimpleLayout` | `axis = x`, no `align` (or `align = none`) | `x` |
| | `axis = x`, `align` set | `x`, `y` |
| | `axis = y`, no `align` | `y` |
| | `axis = y`, `align` set | `x`, `y` |
| | any, for a child with `flexes = true` | + that child's flow-axis size |
| `WrappingLayout` | any | `x`, `y` (+ flow size for a flexing child) |
| `ResponsiveLayout` | any | `x`, `y` — both axes in every tier (§7) |
| | any, for a child a tier names in `share` | + that child's `width` |
| | any, for a child a tier gives `share: 0` | + that child's `visible` |
| `Grid` | any | `x`, `y`, `width`, `height` |
| `TweenLayout` | `from`, `to` | the union of what `from` and `to` place |

When a configuration attribute is **computed** — `axis = { app.narrow ? "y" : "x" }`, a
`plan` built by an expression, a `layout` slot bound to an expression — the answer is
the **union** over every value the expression could take. A row whose axis might flip
places both `x` and `y`. This is stricter than the runtime would have been at any one
window, deliberately: the verdict must not depend on the window.

**Custom layouts — the compiler reads `place()`.** An author's own `place()` returns
boxes. The compiler collects every attribute a returned box can carry — keys of
returned object literals, `box.w = …` assignments — and, where a box key is chosen by a
conditional whose test is a literal-configured attribute compared to a literal
(`axis == "x" ? { x: pos } : { y: pos }` under `axis = x`), would follow the branch.
**That branch resolution is not built.** Writing the scan showed why it pays nothing
yet: `place()` code written the natural way — the library's own `SimpleLayout`
included — chooses its box keys by computing them (`box[cross] = …`), and a computed
key already sends the layout to the runtime (below), where its verdict is exact for a
layout that keeps the same keys at every size. The resolver would upgrade only a
`place()` built from literal-keyed ternaries, and there is none in the corpus. It is a
checker optimization — it changes no rule and no message — so it can land the day a
layout needs it.

Where the compiler cannot tell — a computed key (`box[axis] = …`), a computed test — the
program **passes**, and the runtime enforces the rule from what `place()` actually
returns. This is the class of thing that is simply a runtime error. It is not a strict
fallback: natural `place()` code uses computed keys, and refusing it would refuse most
custom layouts.

**The discipline for a custom layout:** return the same keys at every size. A layout
that owns an axis in any regime owns it in every regime and says where it is. Then the
runtime's first observation is the truth for all sizes and the verdict is
deterministic. A custom layout that does not follow this keeps a verdict taken at boot
— the one residual the design leaves, confined to that corner and documented as a limit.

**`ignoreLayout` bound to an expression** is undecidable at compile time and falls to
the runtime like a custom layout. It is an ordinary attribute; there is no rule that it
must be a literal.

## 4. Size and the content size

On each axis, a view is either **given** its size or **takes it from its content**. It
is given one by a literal, a percent, a `{ }` binding, or a layout's allocation. Its
content is its own — the text a `Text` lays out, the image an `Image` shows — together
with its children's boxes, plus its padding.

**On a given axis, a child whose size is derived from its parent's size does not count
toward the parent's content size on that axis**, however the derivation is written.
`width = 100%`, `width = { parent.width }` and `width = { parent.contentWidth - 40 }`
are the same kind of statement, and none of them makes the parent wider. Each axis is its
own question: a wrapping `Text` sized from its card's width still gives the card its
height —

```declare
card: View [ width = 320, padding = 20,          // given its width
    body: Text [ width = 100%, wrap = true ] ]     // takes the card's width; its height is its text
```

— width flows down, height flows up, one direction per axis.

A backdrop that matches the width of its siblings, `bg: View [ width = { parent.contentWidth } ]`,
is exactly as wide as the rest of the content. A child that is the parent's only content,
and is sized from the parent on the same axis, has nothing to follow: on that axis its
parent has no size to give.

**A child sized from a parent that has no size to give is reported** when its
arithmetic lands below zero — the parent takes its size from its content, the child does
not count toward it, so the child's size is computed from nothing, in every state. The
message names both views; the fix is to give the parent a size on that axis, or to use
the parent's `padding` instead of arithmetic. **Ordinary arithmetic below zero is not
reported**: a field sized `{ parent.height - 60 }` in an accordion section closed to 46
is −14 exactly while the section hides it, which is what its author meant, and a
negative size draws nothing.

This is §6's principle — information flows down — applied to size: a size may be handed
down or gathered up on an axis, never both.

## 5. Where the check runs

| the layout is | configuration | checked |
|---|---|---|
| in the library | literal | **compile time** |
| in the library | computed | **compile time**, against the union |
| custom, `place()` analyzable | — | **compile time**, from the scan |
| custom, `place()` not analyzable | — | **runtime**, from what `place()` returns |
| any, with `ignoreLayout` bound | — | **runtime** |
| a child's size reads its parent's size directly (§4) | — | **compile time**: the compiler's read-paths mark it, and the content size excludes it |
| a child's size reaches its parent's size through other attributes | — | **not seen** — it counts toward the content size as ordinary arithmetic (§10) |
| a child sized from a parent that has no size to give, landing below zero | — | **runtime**, reported once the program is attached |

The value of the compile-time check is not earliness. It is determinism: the error is
the same at every window, and a reader can find it by reading.

## 6. Information flows down

A layout knows its children. **A child never asks about its layout** — which tier is
active, which axis is being placed, what flow it is in. Everything an arrangement needs
to know about a child is either

- a **fact about the child** — its size, its declared `baseline`, that it `flexes`,
  (in future) that it is optional — which the layout reads; or
- **stated in the arrangement** — a `share`, an `align`, an `offset` — which the
  layout applies.

There is no third category in which a child adapts itself to what the layout decided.
That loop was built as a spike and found to be bistable (§12).

A consequence: a cross-axis *nudge* — an icon sitting three pixels below its text
neighbours — is a fact about the row, not about the icon. It exists only while the row
does. So it is stated where the row is stated (§7), and the icon declares nothing.

## 7. `ResponsiveLayout`

`ResponsiveLayout` is one arrangement with a direction switch inside `place()`, read
from the view's width: one `place()`, one claim set, two flows. That is what lets a
plan be a promise about one arrangement — a tier changes the numbers, never the
machinery — and it is why it is one layout rather than two that take turns (§12).

Because its axis comes from the window, it cannot leave an axis to its children the
way a `SimpleLayout` with `align = none` can: an axis it leaves alone in one flow it
writes in the other. So:

- **`ResponsiveLayout` places both axes in both flows.** In row flow it places `y`; in
  stack flow it places `x`. *Controlled and unplaced is 0*: a child the plan says
  nothing about sits at the leading edge across the flow.
- **`align` is per tier**, a string, overriding the layout's own `align` exactly as a
  tier's `gap` overrides the layout's `gap`. Values: `start` (default), `center`,
  `end`, `baseline`. There is no `none` — a dual-flow layout has no axis it can promise
  to leave alone. `baseline` on a `"stack"` tier is refused when the layout arranges —
  at run time; the checker does not read a plan's per-tier `align` yet.
- **`offset` is per child, by name**, a signed number, exactly the shape of `share`:
  across the flow, added to where `align` put the child. `+3` in a row is three pixels
  down; in a stack, three pixels right. It composes with the anchor: `align: "center"`
  with `offset: { icon: 3 }` is the centred position plus three.

A plan entry, in full:

```
{ from: 600, flow: "row", gap: 16, align: "center", offset: { icon: 3 },
                                   share: { logo: "auto", nav: 60, actions: 40 } }
{ from: 0,   flow: "stack", gap: 8 }
```

| field | shape | meaning |
|---|---|---|
| `from` | number | this tier applies when the view is at least this wide |
| `flow` | `"row"` \| `"stack"` | the direction |
| `gap` | number | space between consecutive *visible* children along the flow; not padding; comes off before shares are cut |
| `align` | `"start"` \| `"center"` \| `"end"` \| `"baseline"` | where children sit across the flow |
| `share` | `{ name: number \| "auto" }` | a child's width; `0` drops the child |
| `offset` | `{ name: number }` | a child's shift across the flow, from its aligned position |

Every field is one of two shapes the plan already has — a tier-wide scalar, or a
by-name map of numbers. `align` and `offset` are two fields, not one compound value,
so that stays true.

Where a plan cannot say what is needed, the answer is **nesting**: an ordinary inline
child carries its own `layout:` and arranges itself inside the room this plan hands it.
No class is needed. A child nested this way answers to its allocation, not the window,
and reads correctly wherever it is put. The parent's plan must actually give it a width
in every tier (`share: { it: 100 }` in the stack tier, or `width = 100%`); a tier that
allocates it nothing leaves it at its content width, and a content-sized child is
measuring what it is trying to arrange.

## 8. What the rule narrows

For every library layout with literal configuration, the rule catches at compile time
what is already an error or a warning at runtime. Two behaviours change:

- **A literal on a placed slot is refused, not shadowed.** Today it is overridden with
  a warning; under the rule the line is an error and must be deleted. Nothing
  functional is lost — the literal was already doing nothing.
- **Two working-but-fragile usages become impossible**: a child declaring the cross
  axis under a `ResponsiveLayout` with both flows, or under a `SimpleLayout` whose axis
  is computed. Today the value holds in one regime and silently vanishes in the other.
  The replacement is `align` on the layout, or an `offset` in the tier, or nesting.

The census (§12) found the corpus pays nothing for either.

## 9. Error vocabulary

Errors are written in the rule's words. There is no "slot", "claim", "owner", "tier"
or "at boot" in a message an author sees. The shape:

> `Icon.y` — the row places its children, so `Icon` does not declare `y`. To sit
> across the row, use the row's `align`; to shift from there, give the tier an
> `offset` for `Icon`; to place `Icon` yourself, set `ignoreLayout = true`.

A runtime refusal of a momentary write says the same thing in the present tense: what
placed it, and the ways out.

A child sized from a parent with no size to give (§4) says what it was sized from and why
that has nothing to give:

> `View.width is -40 (line 2, col 50) — it is sized from its parent (View), which takes
> its width from its content, and this child is the only content it has; a child sized
> from its parent does not count toward that content, so on this axis the parent has no
> size to give. Give View a width, or use its padding instead of arithmetic.`

## 10. What the runtime does

The design expected three pieces of runtime machinery to retire: the shape watcher's
role in deriving ownership from `place()`'s output, the base save-and-restore on claim
and unclaim, and the report of shadowed literals. **They stay**, because the build showed
what still varies at run time. A plan's `share` and drop are per tier — a child a wide
tier sizes, a narrow one does not — so the attributes a `ResponsiveLayout` places for
one child still change with the room, and the rearm and restore are what hand them back
cleanly. An author's layout whose `place()` builds boxes with computed keys, and a bound
`ignoreLayout`, are judged only at run time. What changed is their standing: position
no longer varies by tier in any library layout, so the verdict the viewport used to
decide is gone; the literal report is an **error** in the same words as a binding, not a
warning; and every message speaks the rule's words (§9), a handler's write in the
momentary form.

One runtime rule **widens**: the content-size measurement excludes a child whose size is
derived from the parent's on that axis. It excluded percent-bound and `center`-bound
children; it now excludes any `{ }` that reads the parent's size on the same axis,
decided from the compiler's read-paths (present in every build; a dev re-parse asks the
source text the same question). A derivation routed through another attribute
(`gutter = { parent.contentWidth }`, then `width = { gutter - 40 }`) is **not** seen: the
design proposed a runtime question one dependency deep, but such a derivation is already
two deep — width reads `gutter`, `gutter` reads the parent — so one deep catches nothing
the read-paths do not, and the full closure is a cost nobody has measured. It stays
ordinary arithmetic, and the residual is documented here rather than papered over.

The negative-size report is judged once the program is ATTACHED (App.attach, the join
point `onReady` uses): a program settles once before its host has reported its size,
and every size computed from the App's is provisional then — `app.width - 48` is −48
for a moment in every browser.

## 11. Build order

All six steps landed together, 2026-09-22.

1. `align` on `ResponsiveLayout`, per tier; `offset` by name; rewrite `place()` to
   return both axes in both flows. The library obeys the rule before anyone is held to
   it. **Done** — `align` is a `CrossAlign`, and `none` is refused (at compile time on
   the layout, at run time in a tier).
2. The library table; the checker: standing-vs-standing refusal, per instance from
   literal configuration, union for computed; the `place()` scan. **Done**, except the
   scan's literal-config branch resolution (§3).
3. Runtime: reword the momentary refusal; widen the content-size exclusion (§4) and
   report a child sized from a parent with no size to give. **Done** — the machinery
   §10 expected to retire stays, for the reasons given there.
4. The guide — **targeted edits, not a rewrite**; layouts are taught in ch. 5, "Space",
   whose structure already fits. `align` taught as a first-class concept; nesting as the
   first answer to "the plan cannot say this". Where each part lands:
   - **ch. 1, "Thinking in Declare"** — the paragraph "Layouts are classes, and one owns
     what it places" states the rule as *"a layout owns the slots it sets, so a child
     cannot also set its own `width` there"*: runtime vocabulary and the wrong example.
     Replaced by §1's two sentences.
   - **ch. 5, "A view's size, per axis"** — already per axis, three states; §4 lands
     here. "Unset" gains a view's own content (a `Text`'s run, an `Image`'s bitmap)
     alongside its children, and the section gains §4's rule. The following paragraph
     on `100%` vs `{ parent.width }` stays: different values, both derived.
   - **ch. 5, the layout table and the `ResponsiveLayout` section** — the table row
     gains `align`; the section gains `align` and `offset` per tier. It already
     teaches nesting and does not teach a cross-axis child.
   - **ch. 5, the opt-out paragraph** (`ignoreLayout`, `ignoreClip`) — consistent; the
     placement rule (§1) goes just ahead of it, since `ignoreLayout` is the rule's
     exception. "Declared vs done" (§2) is a sentence there at most — authors meet it
     through the error messages (§9).
5. Five sites that flip a `SimpleLayout`'s axis and duplicate the breakpoint in each
   child's width — `apps/textsampler/textsampler.declare` at 183, 252, 338, 388 and
   `apps/sampler/sampler.declare` at 316 — rewritten to a plan with shares. The axis
   flip itself is legitimate (only direction changes); the per-child width arithmetic
   is what a plan replaces. The guide states when each is right: *flip the axis when
   only direction changes; use a plan when the children's room changes too.* **Done** —
   each plan's `from` is the room the columns had at the old breakpoint (844, 876),
   so a plan now switches by the columns' room and not the window's: textsampler at
   a 876 window instead of 900, sampler at 908 instead of 940.
6. Guide and reference sweep. **Done** — the guide (ch. 1, ch. 5), `docs/declare.md`,
   and the `ResponsiveLayout` reference.

**Presentation constraint, from DT.** Everything user-facing — the docs, the guide, the
reference, and every comment in every `.declare` source — describes the language as it
is. No "fixed", no "used to", no reference to the old way. The distro reads as one
self-consistent thing. Internals (compiler, runtime, tooling) may carry history where
it helps a future reader.

---

## 12. Background — how the design got this shape

This section is allowed to talk about the past; nothing above it is.

**The problem.** Which of `x`, `y`, `width`, `height` a layout wrote was discovered by
the runtime, per probe, from what `place()` returned — never written down. For
`ResponsiveLayout` that set changed with the window, and a browser reports the App's
size after instantiate, so every percent width was 0 at the first probe, the `from: 0`
stack tier matched, it claimed `y`, and a child's `y = center` was refused at boot
against a claim the real tier never made. A literal `y = 15` survived by being shadowed
and restored. Two console warnings on the homepage were this. A commit that stopped
reporting shadowed literals (e55d7abb, "a literal is a base, a binding is a claim")
silenced the symptom; it was reverted on DT's call because it was a language change —
making spelling matter — adopted to hide a timing defect. An instantiate-order fix
(the layout's arm installs after the view's own attributes) removed the homepage
warnings on its own.

**Why not a declaration.** "Layouts declare what they control" was rejected twice: it
is a second description of the layout that can drift from the first, and an author who
gets it wrong has a new class of bug. The table (§3) is not a declaration — it is a
fact the library author writes once and the compiler checks against; the acid test
below is what keeps it honest.

**Why not let a child read its tier.** Exposing the active plan as a readable slot
(`parent.layout.flow`) was built as a spike. With an authored width it converged and
flipped correctly. With a content-sized container it was **bistable** — two
self-consistent answers, boot picking one by evaluation order, silently — and a child
that could swing a stack's width tripped the runtime's cycle guard. Hierarchy has no
path back up, so no cycle is constructible. Reverted; §6 is the rule that came out of
it.

**The acid test.** Could a user write `ResponsiveLayout`? Yes — it is already written
in Declare with nothing a subclass does not get. Written as it was (`stack ? { y } :
{ x }`) a user's copy reproduces the boot bug exactly, which is the finding: the
library's own layout violated the discipline in §3 and is rewritten first (§11, step
1). The table is a compile-time shortcut that must agree with what observation would
find, never extra truth.

**The census, 2026-09-22.** Every child in `apps/` and `library/` declaring `x` or
`y` under a parent with a layout: 30 sites in 11 files. Every one is the cross axis of
a `SimpleLayout` with no `align` — 19 `y` in a row, 11 `x` in a column; 20 literal
nudges (`y = 1`, `3`, `4`, `6`; `x = 8`, `15`, `24`), 7 `center`, 3 bindings. 18 of the
30 were written after `align` shipped (2026-09-11), so they are not a pre-`align`
habit: 23 of them express what `align` has no word for — a per-child shift from the
aligned position — which is where `offset` comes from. Under the per-instance rule
the cost is zero; a strict "layout owns both axes" rule would have cost all 30. Zero
sites declare the cross axis under a `ResponsiveLayout` (the homepage's two were
resolved by removing one and accepting the other), and zero under a computed-axis
`SimpleLayout`.

**Why §4.** An agent eval (the Cadence runs) reported a card with no width whose only
child was `Text [ width = { parent.contentWidth - 40 } ]`. The card's width came from the
text and the text's width came from the card; the pair has no positive fixed point, so
the values walked down to 0 and −40, stopped changing, and the settle closed normally —
the cycle guard fires only on values that keep changing, so a cycle that converges to
garbage was silent. The `width = 100%` spelling of the same relationship never formed the
cycle, because the runtime excluded percent-bound children from the content size. One
intent, two answers by spelling; §4 gives it one. The general problem — a converging cycle
anywhere is silent — is broader than layout and is its own item.

**Why the negative-size report is narrow.** §4 first reported every size below zero,
on the premise that one "almost always means" the self-sizing case. Swept across every
app at desktop and phone size, the premise was wrong: no app had the self-sizing case,
and three had ordinary arithmetic below zero in a collapsed state — calendar's closed
accordion section (`{ parent.height - 60 }` in a 46px section), an architecture label,
and the minimised windows of the lzx-dashboard port. Each hid the view that went
negative, as its author meant. Reporting those would have made `Math.max(0, …)`
ceremony in every collapsible layout, so DT narrowed the report to the case that is
actually a mistake.

**Where the rule found real code.** The checker's first run over the corpus refused
five declarations on the homepage, all `y` under a `ResponsiveLayout`: the header
bar's four items, hand-centred on its 56px height (the wordmark at 18, one below its
centre of 17; the three 33px controls at 11, the centre being 11.5), and the source link
beside the calendar's run button. They became `align = center` on the bar with
`offset: { brand: 1 }` in its tiers, and `align: "center"` in the actions row's row
tier — the controls now at their true centre, half a pixel lower. The hero's dot between
the two links was removed (DT), and the links' row gap widened to 32 in its place.

**Why one layout that changes direction.** `SimpleLayout` with a computed axis and
`ResponsiveLayout` with two flows are each one arrangement that re-places its children;
two layouts swapped by width would introduce the swap — ownership in transit — which is
the seam the timing defect lived in. Splitting `SimpleLayout` into a row and a stack
class would give the same union at compile time and add that seam at runtime.
