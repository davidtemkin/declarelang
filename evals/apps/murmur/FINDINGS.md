# Murmur eval — actionable findings

**Run:** `declare-1` · Opus · 2026-08-10 · 88.4 min · 274,144 output tokens
**Artifact:** 1,675 lines of Declare across 5 files, clean through R4 (104 nodes,
43.4 ms settle, 418 constraints). Sandbox: `~/Code/OpenLaszlo/run-murmur-declare-1`.

The app is good. These are the things worth fixing, ranked by what they cost the
next person. Each says who owns it: only one is a platform defect outright, and
most are documentation or ergonomics — which is itself the pattern worth naming:
**the capability is nearly always present; the path to it is what fails.**

---

## 1. The asynchronous scroll contract is documented nowhere · PLATFORM DOCS · HIGH

**The visible symptom.** Scrolling a long conversation drifts: content under the
reader moves further than the scroll accounts for. Measured in the delivered
app, Trail crew (305 messages), one steady one-way scroll:

| | |
|---|---|
| visual jumps (residual > 1.5 px in a frame) | **36 in 234 frames** |
| worst single jump | **241 px** |
| app's own `land` re-assertion active | **0 frames** |
| rows entering/leaving materialization | **0** |
| content height change per frame | **±145 px, oscillating** |

Residual = `Δ(node screen y) + Δ(scrollY)`, which is 0 when the view is stable.

**Not virtualization.** A controlled minimal case — 300 variable-height wrapping
text rows, no images — is stable to **0 px**, with `virtualize = true` and with
it off. Virtualization is exonerated.

**What it actually is.** Native scroll position is reported asynchronously and
guaranteed synchronously nowhere. Anything that reads it, computes against it,
and writes back is racing a value that has already moved. Content resizing under
the reader — a photograph learning its proportions — is the trigger, not the
cause.

**Why this is a documentation bug and not a code bug.** The agent's *entire*
scroll-related input before it hit this, out of 36 `declare-help` queries and a
careful reading pass, was:

- `docs/guide/05-space.md` — covers scroll *ownership* (which thing scrolls,
  `ignoreScroll`, page vs pane) thoroughly, and scroll *timing* not at all
- one question, `View.scrollIntoView`, whose full prose is:
  > Scrolls this view into the visible region of its nearest `scrolls` ancestor
  > (or the page), aligning its top to the viewport top… Both backends realize
  > it natively… A no-op if nothing above it scrolls.

That reads as settled and synchronous. Nothing warns that the range may move, or
that a request made while content is still sizing needs anything further.

Grepping the authored prose, the guide, and `declare-model.json` for any
description of scroll asynchrony, re-assertion, or anchoring returns **nothing**.
Two independent readers hunting specifically for the correct mechanism (the
agent, and this reviewer) failed to find it.

So a careful agent invented one: a `Heartbeat` re-asserting `scrollTo` for up to
44 frames whenever the range moves (`murmur.declare:568–594`). Its `DESIGN.md`
names this as its only infrastructure, with an accurate diagnosis — *"a
photograph learns its proportions only after it loads"* — and no idea a known
contract existed behind it.

**Fix.** State the contract where someone hits it: in `View.scrollIntoView` and
`View.scrollTo` prose, and in `05-space.md` §Scrolling. Say that the scroll
range is not settled at call time, what moves it, and what the correct response
is. If a supported mechanism exists, name it there — it is currently reachable
only by already knowing it.

---

## 2. Photograph arrival: a design choice, and one worth revisiting · APP DESIGN · JUDGMENT CALL

**Not a defect.** The aspect handling is right (see calibration). This is a
disagreement about a deliberate decision, recorded because the decision has a
cost that does not stay local to the photograph.

**What it does.** A photograph's box is derived from its natural proportions, so
it occupies no height until the bytes land; the bitmap then fades in, sprung on
`Image.loaded`, in all three places one appears:

```
Spring [ attribute = opacity, to = { classroot.frame.img.loaded ? 1 : 0 }, … ]
```

That is a continuity treatment, chosen on purpose and applied consistently —
the arrival is animated rather than hidden. It is the grain of the language used
as intended.

**The disagreement.** The alternative is reserve-then-reveal: hold the space
first so nothing moves when the image lands. Two shapes of it —

1. **A fixed-aspect slot** (say 4:3) with `contain`; `stretches` already carries
   `contain` and `cover`. No reflow at any point, at the cost of some empty box.
2. **Dimensions in the payload**, so the real box is reservable before the bytes
   arrive. Unavailable here — the fixture withholds them deliberately, as real
   services often do.

Note what does *not* help: waiting for `loaded` and only then sizing the box.
That is the current behaviour, and it is the reflow.

**Why it is more than taste.** The growing box is what moves content under the
reader, which is the trigger for finding 1's drift. The choice is defensible in
isolation and expensive in combination. Whoever settles it should settle it
knowing that.

**A small documentation note, not a blame.** `Image.loaded`'s prose demonstrates
one pattern — `spinner: View [ visible = { !pic.loaded } ]` — a placeholder for
the *pixels*. Nothing discusses the *geometry*: that a size derived from
`naturalWidth`/`naturalHeight` is 0 until load, and that reserving beats
deriving when reflow matters. Both approaches are legitimate; only one is shown.

---

## 3. No settle-completion hook · PLATFORM · HIGH

The app needs to change paint order *after* a settle and has no seam for it, so
it defers with `setTimeout(…, 0)` — the only timer in 1,675 lines, and the only
place the program repeats itself (`murmur.declare:474–482`):

```
raiseRow(tid: string) {
    // after the settle: the reconciler re-links the stack in data order, and
    // this is a statement about paint, not about order in the data
    setTimeout(() => { … row.raise() … }, 0)
}
```

**This independently reproduces Max Carlson's PR #2** (settle-completion event,
accepted in principle post-launch). A clean-room agent hit the same missing seam
from a different direction and reached for the same workaround. Strongest
corroboration a feature request can get.

Related ergonomics: stacking is declaration order, and the only escape is an
imperative `raise()` that must be timed by hand. See finding 4, which is what
that costs in practice.

---

## 4. Reaction chip is painted over by its own message · APP (murmur) · MEDIUM

Reported by hand, then measured. Book club, first visible chip:

| chip top | chip bottom | bubble bottom | overlap |
|---|---|---|---|
| y 644 | y 666 | y 650 | **6 px vertical × 41 px horizontal** |

The chip is tucked under the bubble's bottom edge — a normal design — but the
bubble paints over it, so the top 6 px of the chip is hidden.

This is murmur's bug, not the platform's. It is listed here because the *reason*
it is easy to hit is finding 3: paint order is declaration order, and raising a
view means an imperative call that has to be sequenced by hand after a settle.
An app that wants a chip above a bubble has no declarative way to say so.

---

## 5. Right-click: the platform is correct, the app never asks · APP + DOCS · LOW

The runtime already suppresses the browser menu, gated on a declared handler
(`runtime/src/input.ts:264–271`):

> The platform's CONTEXT gesture (right-click / two-finger tap)… delivered — and
> the browser's own menu suppressed — exactly where an `onContextMenu` handler
> is declared.

Murmur declares no `onContextMenu`. Measured on a message: `defaultPrevented =
false`, `pickOpen = false` — the native menu appears and the picker does not
open, which is the documented contract behaving correctly. **I could not
reproduce a reaction popup opening on right-click.**

So: not a defect. But an app whose central verb is "attach a reaction" left the
desktop gesture for that verb to the browser, which suggests `onContextMenu` is
not surfacing where an author looks. Worth checking whether it appears anywhere
in the interaction guide's path.

---

## 6. Audio playback confusion · UNREPRODUCED · MEDIUM

Reported by hand ("able to confuse it"), not reproducible on demand, and not
reproduced here. Recording what is known so a later attempt has somewhere to start:

- The clips load and play correctly cross-origin (verified: `duration = 20.43`,
  seek to 66% lands and plays on).
- `REQFAIL` lines on the voice clips in capture logs are an artifact of
  puppeteer tearing the browser down mid-load, not an app fault.
- **Best hypothesis:** `Media.duration` is `0` until metadata lands (its prose
  says so explicitly). A scrubber that computes a position or a fraction against
  `duration` before the metadata arrives divides by zero — one interaction early
  in a clip's life would produce exactly "confused, then fine afterwards."
- To reproduce: tap play and scrub within the first ~300 ms, before
  `loadedmetadata`, ideally on a cold cache.

---

## 7. Two 404s on every app load · PLATFORM POLISH · LOW

Every program load in the dev server emits:

```
HTTP404 /bundles/cache/<hash>.json
HTTP404 /my-apps/demos.json
```

Both benign — the prewarm cache miss is self-validating, and the demo index is
optional. But they are the first thing an author sees in the console, and they
train people to ignore console noise in a platform whose diagnostics are a
selling point.

---

## 8. Unknown-attribute diagnostic has no did-you-mean · PLATFORM DIAGNOSTICS · LOW

Writing a probe by hand, `Image [ src = … ]` produced:

```
Image has no attribute 'src' [DECLARE2000] (line 47, col 27)
```

The correct name is `source`, and `declare-help` *does* do did-you-mean for
exactly this class of miss. The compiler diagnostic does not. Given the stated
principle that every diagnostic names its rewrite, an unknown-attribute error is
the single best place for a nearest-name suggestion — the candidate set is the
class's own attribute list, already in hand.

(Contrast with the color diagnostics in the same run, which were exemplary:
*"expects a Fill (a Color, gradient(…), or null), got the string "#1b2028""* —
named the fix precisely enough to apply without reading anything.)

---

## What went right, for calibration

Not findings, but they bound how much the above matters:

- **Photos are correct.** Reads `naturalWidth`/`naturalHeight`, caps height,
  derives width — aspect preserved to three decimals across 0.56 and 0.67
  sources, found via a `declare-help Image.naturalWidth` query. Tier-1 gap 1.1,
  solved. (How the photograph *arrives* is a separate design call, finding 2 —
  a disagreement, not a fault.)
- **Idiom is clean.** 18 `Spring`s, 1 `Animator`, zero timers driving motion,
  one tree with `narrow: boolean = { app.width < 760 }` as the only switch.
- **`declare-help` is a working habit** — 36 calls, 29 distinct queries, aimed at
  exactly the right surfaces (`Image.stretches`, `Media.position`,
  `Socket.send`, `Animator.repeat`, `View.claim`).
- **The design statement mechanism works.** Six checkable claims in `DESIGN.md`,
  all six verified against the artifact — including a group-vs-pair gutter rule
  this reviewer had noticed and mistaken for inconsistency.
