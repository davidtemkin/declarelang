# Chrome standardization — segmented controls, buttons, icons, themes

**Status: BUILT, 2026-08-03.** All four phases landed, plus three things the
assessment did not foresee. The plan below is kept as written — it was accurate
— with what actually happened recorded against it in §8.

Evidence and the decisions taken along the way are in the companion register,
[chrome-divergences.md](chrome-divergences.md).

The trigger was a small question — *can the Calendar's sliding tab highlight
become standard behaviour on `Segmented`?* — and the answer turned out to
reach across four apps, the theme system, and 43 font glyphs used as UI
objects.

---

## 1. What is actually there

Four independent implementations of one pattern:

| | mechanism | keyboard | theme vocabulary |
|---|---|---|---|
| `library/Segmented` | each segment draws its own `bg`; highlight **pops** | full (Control, tab stops, arrows, ring) | standard tokens |
| Calendar `ViewTab` + `TabPill` | one pill **slides** | none (plain Views) | bespoke |
| Viewer `ModeSeg` | per-segment bg; **pops** | none | bespoke |
| Docs `ModeTab` | two gapped tabs; **pops** | none | bespoke |

Plus a second family of the same switch — light/auto/dark — hand-built
*again* in Calendar (`ThemeSeg`), Viewer (`ThemeSeg`), Docs, Sampler and
Tracker.

**The variation is drift, not requirement.** No app needs a different button
or segment *concept*; they need variants. The Calendar's own source already
says so — `DetailSection` hand-styles its `TextInput` because "this app's
palette does not speak" the house role names, with the comment: *"When the
calendar moves onto the component library this goes away and the house
rendition takes over."* The intent to converge was recorded; nobody got to it.

### The Calendar's sliding highlight is the design to generalize

`TabPill` springs a **normalized lane** (a float index), not pixels:
`x = lane * app.tabW`, with `Spring [ attribute = lane, to = { app.tabIndex } ]`.

The consequence is the part worth keeping: because the pill stores an *index*
and multiplies by the current tab width, a window resize recomputes `tabW` and
the pill **snaps**. Had it sprung `x` in pixels, every resize would animate the
pill skating across the bar.

Generalizing to variable-width segments: spring the lane, then derive `x` and
`width` by interpolating between the neighbouring segments' actual offsets and
widths. Same snap-on-resize; now works with label-sized segments.

### Latency is a non-issue by construction

In all four implementations the click writes app state directly and the `on`
fact flips in the same frame — labels, weights and dependent views change
instantly. Only the pill's *geometry* springs. The rule to preserve, stated
plainly: **spring presentation, never the value.**

---

## 2. Themes: two kinds of token, conflated

The library assumes ~50 standard tokens (`surface`, `control`,
`controlActive`, `line`, `text`, `textMuted`, `textFaint`, `accent`, plus
per-component `button*`, `checkbox*`, `menu*`, `field*`, `focus*`), shipped as
four themes × light/dark.

Calendar, Viewer and Docs each build a bespoke record that mixes:

- **chrome tokens** — the same concepts under different names. Calendar's
  `trackBg`/`pillBg`/`textPrimary`/`hairline`/`panelBg` *are*
  `control`/`controlActive`/`text`/`line`/`surface`. Viewer's `track`/`pill`/
  `muted` likewise. Pure naming drift.
- **domain tokens** — `weekendBg`, `outOfMonthBg`, `todayBg`,
  `dropTargetRing`, `holidayText`, `astroBg`, `milestoneText`,
  `miniCurrentBg`. These have no place in a shared theme.

**The rule:** an app theme is the standard record *extended* with its domain
tokens — `{ ...Themes.sanFrancisco(dark), ...calendarTokens() }`. Library
controls then find what they expect; the app keeps every domain name it has.
This is a **rename, not a recolor**: the app supplies its own values under the
standard names, so nothing moves visually.

---

## 3. Buttons: the blocker is over-specification, not a missing variant

`Button` today is exactly one shape: a semibold label, `theme.text` colored,
on a `control` fill, sized to label + 32.

**A subclass cannot fix this**, and the reason is specific. Attributes declared
*on the class* override cleanly (`height`, `fill`, `cornerRadius`, `width`,
`stroke`). But re-opening an inherited **child** fails at runtime:

```
class QuietButton extends Button [ cap: Text [ textColor = … ] ]
→ 'cap' is already a member of the running QuietButton
```

So an app can restyle a Button's box freely and cannot touch its label's
colour or weight at all, because `Button` pins those inside `cap`.

**The fix is not a `quiet` flag.** Give `Button` a `labelColor` slot
(defaulting to the existing `primary ? accentText : text` logic) and a
`labelWeight`, with `cap` reading them. Then an app writes its own class and
the library never learns the word "quiet":

```
class BarButton extends Button [ height = 34, cornerRadius = 10,
    fill = { down ? theme.controlActive : theme.control },
    labelColor = { hot || down ? theme.text : theme.textMuted } ]
```

Same two slots on `Segment`.

**This also deletes the glyph feature.** A subclass *can* add new children —
that is how Calendar's `NavArrow` adds its `g: Text` today. With an icon set,
an app writes `NavArrow extends Button` with an `Icon` child of its own.
`Button` needs no icon concept.

### Platform bug found while testing this

`declarec check` passes the `cap:` collision above cleanly; it only fails at
instantiate. A statically detectable structural error is escaping to runtime,
and the message ("choose another name for this child") misreads the author's
intent, which was refinement. **Whether a subclass *should* be able to refine
an inherited child is an open language question** — worth ruling separately.

---

## 4. Icons: 43 font glyphs used as UI objects

Ruling (David, 2026-08-01): **fonts are not UI objects.** Icons are drawn
(the idiom `Checkbox`, `Menu`, `Combobox` and `FocusRing` already use —
`draw(d: Draw)`, backend-neutral, crisp at any size).

Inventory across `library/` and `apps/`:

| cluster | sites | where |
|---|---|---|
| **appearance triad** ☀︎ ◐ ☾ | **15** | calendar, viewer, docs, sampler, tracker — five apps each redrew it |
| chevrons / carets ▼ ▾ ▲ ‹ › ▶ | 9 | calendar, desktop, datagrid, tracker |
| close × | 5 | calendar, inspector, tracker |
| plus / minus | 6 | calendar, tracker, tour |
| check ✓ | 1 | tracker (+ two already-drawn private copies) |
| one-offs ♪ ◈ ! | 3 | desktop, inspector, tracker |
| **key legend** ⌫ ↵ ↑ ↓ | 4 | tracker's KEYBOARD rail |

The key legend **stays text** — those are the *names of keys*, not UI objects.
The one-offs stay local (domain marks). Eight drawn shapes cover ~35 of 43
sites; the appearance triad alone justifies the exercise.

**Constraint confirmed: there is no `rotation` attribute.** `setScale` exists
on the surface seam; rotation does not. A chevron therefore cannot be one path
rotated declaratively — direction lives inside the drawing.

### Proposed shape — `library/icons.declare`

```
class Icon extends View [
    width = 16, height = { this.width },
    scale = { this.width / 16 },        // paths authored in a 16-box (Checkbox precedent)
    stroke: number = 1.6,
    ink: color = { textColor },         // follows the PREVAILING text color, like text does
    ]

class ChevronIcon extends Icon [ dir: string = "down", draw(d: Draw) { … } ]
class CloseIcon   extends Icon [ … ]
class PlusIcon    extends Icon [ … ]
class MinusIcon   extends Icon [ … ]
class CheckIcon   extends Icon [ … ]
class SunIcon     extends Icon [ … ]
class MoonIcon    extends Icon [ … ]
class AutoIcon    extends Icon [ … ]    // the half-filled disc
```

Three decisions, each defensible:

- **One class per shape**, not `Icon [ kind = "chevron-left" ]` — a string kind
  is typo-prone with no checker help; a class name is checked. The chevron
  keeps a `dir` slot because it is one shape in four orientations, and with no
  rotation attribute the variants must live in the drawing anyway.
- **`ink` defaults to the prevailing `textColor`**, so an icon inside a muted
  label picks up muted automatically — the inheritance lesson applied from the
  start rather than retrofitted.
- **Subclassing works here** where it failed for Button's label: `draw` is a
  *method*, and overriding methods is fine. The failure was specifically
  re-opening an inherited child.

Open: whether the library's two private checkmarks migrate to `CheckIcon`
(tidier, but churn in working components — do it last, if at all).

---

## 5. Rejected: a `Disclosure` component

Considered and **dropped**. The Calendar's `DetailSection` is the corpus's only
disclosure, and the visual commonality across disclosures (Finder twisty,
settings accordion, inspector section, FAQ expander) is nearly nil — what they
share is about fifteen lines: a boolean, a spring on height, a click.

The test that matters for a library component is not "do these share a shape?"
but **how much invisible correctness it carries that a hand-rolled version
gets wrong.** `Segmented` scores high: four implementations exist, visually
near-identical, and every hand-rolled copy in the corpus gets the keyboard
wrong. `Disclosure` scores low. Abstracting from a single example is how you
get a superclass that is wrong for instance number two.

`DetailSection` stays the Calendar's own class — and still benefits: after the
theme split its hand-styled `TextInput` reverts to the house rendition, and its
`+`/`–` becomes the shared chevron.

## 6. Rejected for now: reduced motion

Not a component feature — a **platform-wide policy**. Honouring it in
`Segmented` while the Calendar's month→year zoom, the Desktop's dock swell and
the Tracker's row expansion keep animating would imply a guarantee the platform
does not keep. Either every spring and animator consults it, or none should
pretend to. A deliberate ruling for when it matters, not a checkbox to tick
while doing something else.

---

## 7. The plan

**Phase 0 — theme split.** App themes become the standard record extended with
domain tokens. Calendar/Viewer/Docs rename chrome tokens to house role names,
keeping their own values; nothing moves visually. Retires the Calendar's
hand-styled `TextInput` workaround.

**Phase 1 — `Segmented` enhancement.** Sliding pill as default, lane-normalized
and generalized to variable widths so resize still snaps. Colour slots
defaulting to standard tokens. Click never waits on the animation.

**Phase 2 — `Button`/`Segment` slots + `icons.declare`.** `labelColor` and
`labelWeight`; the eight drawn shapes.

**Phase 3 — migrate the switches.** Calendar view tabs + theme switch, Viewer
mode switch + theme switch, Docs Guide/Reference, Sampler duplicates. Keyboard
access arrives with them (approved).

No new components, no new abstractions.

**Risks.** The Calendar is the flagship — every pixel is visible, and there are
**no perceptual baselines covering these four apps**, so verification is the
`verify-apps` tier plus screenshot comparison before/after. Tracker and Sampler
already use `Segmented`, so the sliding highlight changes their look too —
intended, but worth naming.

---

## 8. What actually happened

The four phases landed as planned. Three things the assessment did not foresee
changed the shape of the work.

**`Segmented` had to become data-driven.** The sliding pill needs to know which
choice is selected and how wide each is, and a constraint may not ask the view
tree that — `childViews` is set-membership only, and the compiler names the
alternative outright: *"a data-dependent number of slots; derive from data."*
So `choices` is an array and the `Segment` child class is gone. That turned out
to be the mainstream shape anyway (UIKit takes titles, SwiftUI a `ForEach`, Ant
`options`), and it dissolved a name collision: two apps had taken `Segment` for
a paragraph of prose, now `Block`.

**The interaction ladder was incoherent, not just unnamed.** Three components
tinted four states with four borrowed tokens, and two of them were inverted:
`control` was `Segment`'s hover and `TableRow`'s SELECTED; `surface` was the
reverse. `Button` could not tell hover from press at all. Fixed by naming all
four rungs — `control` / `controlHover` / `controlPressed` / `controlSelected`.

**The pixel baselines had to be built first, and they kept being wrong.** The
corpus had one instrumented app; it now has seven, 27 states. Three times the
instrument was green while something was broken — a `Segmented` rewrite that
silently dropped `focusShape` and keyboard activation, a menu API change that
moved a member, and a desktop state that clicked a path which did not exist and
photographed a plain desk for several passes. Every one was caught by
`components.test.mjs`, not by pixels. **Baselines do not photograph behaviour.**

### Beyond the plan

- The appearance triad, the checkmark and the chevron are drawn once each
  (`library/icons/`), replacing six chevron renderings and two checkmarks — three
  of which shipped inside the library itself.
- `Menu`'s three icon mechanisms collapsed to one.
- Calendar lost `ViewTab`, `TabPill` and `ThemeSeg`; viewer lost `ModeSeg` and
  `ThemeSeg`; docs lost `ModeTab` and `ThemeBtn`.
- Palette drift fixed: one hex digit in the docs accent, and a teal that was two
  names and four values.

### Not done, deliberately

- **`Button.labelColor` / `labelWeight`** — superseded. `inkColor` does the job
  for both the label and the icon, which was the actual requirement.
- **`Disclosure`, reduced motion** — rejected in the assessment, still rejected.
- **F1, the dock's NaN springs** — a defect the instrument found, left for the
  dock's owner. See the register.
