# The enum vocabularies

One `## <Name>` section per named token set in the language. The tokens themselves
come from the schema — this file carries only what the token list cannot say: what
the vocabulary selects, and the rule for picking a value. The reference builds a
page per entry (`type/<Name>`); `declare-help <Name>` answers from the same text.

Keep each entry to a paragraph. The attribute that carries the vocabulary already
documents what setting it does; say what is true of the vocabulary itself.

## Axis

Which way an arrangement runs. It is a **bare token, not a string** — `axis = x`
names the axis, and the `x` here is unrelated to the position attribute of the same
name. Every stacking layout takes one, and `y` is the house default, so a column is
what you get by naming no axis at all.

## Backface

What a view shows once a rotation turns it more than 90° about X or Y. `hidden`
takes the turned-away face out of the picture **and out of hit-testing**, so a
pointer passes through to whatever is behind it; `visible` keeps painting the
mirrored face.

## Blend

The W3C blend modes, in camelCase, naming how a view lands against what has
already painted beneath it. The operator is not a filter on the view: it reaches
down to the nearest **isolating** ancestor, so what a `multiply` chip blends with
depends on where the isolation is, not on how deeply it is nested. `normal` is no
blending at all, and the value every view has until one is named.

## ClaimAxis

The axis a declared drag takes for itself. `both` (the default) gives the drag the
whole gesture; `x` or `y` leaves the other axis to the enclosing scroller, so a
horizontal column-drag and a vertical page scroll can share one finger. It
**scopes** a drag that already exists and never creates one — a view with no
pointer handler ignores it.

## RequestCredentials

Whether a request carries cookies, TLS client certificates and authentication
headers. These are the Fetch API's three modes as tokens, so `sameOrigin` is the
camelCase spelling of the wire's `same-origin`. `include` is the only one that
reaches another origin, and it works **only** when that origin's CORS response
names your origin back — a wildcard `*` cannot combine with it.

## CrossAlign

Where a laid child sits across the flow — `y` on a row, `x` on a stack. `none`
leaves the cross placement to the child, which is what lets an ordinary
`y = center` keep working; `start | center | end` place every child for you. Pick
`baseline` only where each child can report one: a `Text` does by itself, and a
composite must **declare** which of its parts carries it.

## JudgeOn

When a field first says what is wrong with its draft (`TextInput.judgeOn`): `edit` at every
edit, `leave` once the field has been left — or `judge()` asked — and at every edit after.

## SafeAreaMode

How an app meets the device's **own** chrome — a notch, a home-indicator bar.
`safe` keeps the app inside the safe region and every `safe*` inset then reads 0,
because there is nothing left to handle. `cover` is the edge-to-edge opt-in: the
box extends under the system chrome and the insets carry real numbers, which is
what pinned chrome needs to place itself.

## FitAlign

Which end of the box an aspect-preserving fit keeps, one axis at a time. It is
read only by `contain` (which letterboxes on one axis) and `cover` (which crops on
one) — under a distorting stretch there is nothing left over to align, and the
value is ignored.

## AccessibilityLive

How a change to a live view is announced. `off`: it is not. `polite`: at the next pause, without
interrupting. `assertive`: at once, interrupting what is being read — for what cannot wait.


## AccessibilitySort
Which way the column a `columnHeader` heads is sorted, as a screen reader says it with the
header's name: `none` (not the sorted column), `ascending` or `descending`.
## AccessibilityRole

What a view is to assistive technology — the closed vocabulary every platform's accessibility
API shares, so a program is written for none of them in particular. Each word is a contract: it
names the facts the role reads and the methods its actions call, and the compiler holds a class
that declares it to them. `none` is transparent — the view is read as part of its parent.

## FocusScope

What Tab does at a view's edge. `none`: its stops are its parent's. `stop`: it is one Tab stop
and the arrows move inside (a radio group, a list). `capture`: Tab walks in and through its
stops (an entry form). `region`: one stop from outside, a cycle of its own inside, left with
F6 (a window, a pane). `modal`: Tab wraps inside and never leaves (a dialog).

## FontLate

The type of `Font.late`: what a font whose files finish loading **after** its
`wait` has run out does to text already on screen. A font's faces load and settle
together. `swap` changes to the font — one redraw, and the usual answer. `keep`
leaves the fallback in place for the rest of the run, which is how a reflow
mid-read is avoided; a font kept this way reports `loaded = false` for the life of
the run.

## FontWeight

The named weights, and a **number from 1 to 1000 is the same attribute** — the
keywords are the names of the hundreds. That is what puts a variable font's weight
axis in reach at any point between the names — `fontWeight = 480` is as legal as
`fontWeight = regular`, and there is no second attribute to learn for it.

## Justify

How a finished row sits along the direction of flow. `start`, `center` and `end`
move the row; `fill` does not — it spreads the row's slack into the gaps between
its children, so every full row ends flush. As in justified text, the **last row
stays at `start`** under `fill`, and a row holding one child has no gap to widen.

## Motion

The shape of an interpolation over its duration: which fraction of the travel has
been covered at each fraction of the time. Read a token as a family plus a
direction — `In` bends at the start, `Out` at the end, `Both` at each end with the
fastest part in the middle.

The polynomial families bend progressively harder in this order: `sine`, `quad`,
`cubic`, `quart`, `quint`, `expo`, `circ` — so `quadOut` is a gentle settle and
`expoOut` a sharp one. `easeIn`, `easeOut` and `easeBoth` are the `quad` family
under an older set of names, and `ease` on its own is the CSS default curve, not a
member of any family. `back` overshoots the target and comes back, which reads as
weight. `laszlo` is the one curve that reads how far the animator is actually
travelling, so its bend adapts to the distance rather than being fixed by the
token. `linear` is no easing at all.

## Numerals

The **shape** of the digits in a face that carries more than one set. `normal` is
whatever the face does by itself, and faces differ on that, so it is worth naming
the one you want rather than relying on the default. A face with a single set
ignores the value, silently and correctly.

## NumeralWidth

The **advance** of the digits, which is a different question from their shape.
`tabular` gives every digit the same width, so a column of figures lines up and a
counter does not jitter as it counts; `proportional` lets each digit take its
natural width and reads better in prose. `normal` defers to the face, and faces
disagree about which of the two that is.

## InputPurpose

What a text field holds — an email address, a password, a card number, a line of an
address — said once on `TextInput.purpose`, so the platform can help: autofill and
password managers recognise the field, a phone brings up the keyboard that suits it,
and a password is hidden. `text`, the default, says nothing.

## AnimatorOrder

Whether the members of an `AnimatorGroup` run one after another or all at once. It
is the group's own control — nothing else in the language reads it — and it is
what makes a group more than a list of animators started together.

## OutsidePress

What a press aimed past an open overlay does: `dismiss` (the overlay closes; the press goes
no further — a menu), `dismissAndDeliver` (it closes; the press goes on — a popover), `block`
(the press goes nowhere; the overlay stays — a dialog), `ignore` (the press goes on as if the
overlay were not there — a toast). `none` is every ordinary view.

## ImageRendering

How a view's images and drawings look when they are shown larger or smaller. `smooth`
blends neighbouring pixels, which suits photographs and an ordinary interface under a
zoom. `pixelated` shows every pixel as a solid block, so pixel art stays sharp. A view's
whole subtree follows its setting.

## ScrollBelow

What a scroll aimed past an open overlay does: `block` (nothing behind it scrolls — a menu,
a dialog), `allow` (it goes on — a popover, a toast), `dismiss` (the overlay closes and the
scroll goes on — a tooltip). `none` is every ordinary view.

## ScrollAnchor

What a scroller keeps still while its content changes size. `content` keeps the
reader's place: the view at the top edge stays where it is, and a pane at its very
start stays at its start. `end` is for a pane read from the bottom, such as a
terminal or a build's output: at its end it stays at the end as content grows, and away
from the end it keeps the reader's place. `none` leaves the offset alone.

## Scrolls

Which axes of interior overflow a view scrolls. Overflow along a declared axis
becomes scroll range; overflow along any other axis is simply out of frame,
because a scroller clips to its box either way. The value is a token **string** in
a `{ }` body, so compare it explicitly — `"none"` is truthy, and a bare truth test
says every view scrolls.

## StreamStatus

A live connection's lifecycle as one read-only fact, the same shape a `DataSource`'s `loaded` / `loading` / `failed` facts
has for a fetch. `retrying` is the one worth planning for: it covers both the
platform's own recovery and a declared retry waiting to re-dial, and it is the
difference between a stream that is coming back and `failed`, which is not.

## ImageFit

The type of `stretches` on Image and Video: how a picture (a bitmap, or a video's
frame) fills a box whose size differs from its natural size. The axis values
— `width`, `height`, `both` — **distort by design**; the aspect-preserving fits
never do: `contain` puts the whole picture in the box and letterboxes the
remainder, `cover` fills the box and crops the overflow. `none` paints at natural
size. Both fits center the picture until `FitAlign` says otherwise.

## TextDirection

The direction a view's text runs in, and what it holds: `ltr`, `rtl`, or `auto` (from the
first strong letter of the text); `inherit`, the default, takes the nearest ancestor's.
A right-to-left paragraph is laid out from the right — its lines start there unless its
`textAlign` says otherwise — and a field types from the right.

## TextAlign

Horizontal alignment of wrapped lines inside the run's own width. It only means
anything once the run **has** a width to align within — a `Text` that sizes itself
to its content is already exactly as wide as its longest line, so every value
looks the same.

## TextTransform

Reshapes the painted glyphs **without changing `text`**: selection, find-in-page
and `$data` all see the original string, exactly as CSS `text-transform` behaves.
The measurer shapes the transformed glyphs, so an `uppercase` run still wraps
correctly at its real width on every renderer.

## UnsupportedTags

The type of `HTMLText.unsupported`: what a tag outside HTMLText's whitelist does. `strip`
(the default) unwraps it — the tag goes, its text stays, and `<script>` / `<style>` go
whole — so loaded markup renders what it safely can. `error` throws on the first one,
naming it, for content where unexpected markup should be a hard failure.

## ClockTick

How often a `Time` fires, from the display's own rate up to a calendar boundary.
The calendar tiers aim at the **boundary** — aligned and drift-free, so an
hour-ticking clock changes on the hour rather than an hour after it started —
while `frame` follows the display and is the one to reach for when something is
being animated rather than counted. A number instead of a token is a period in
milliseconds — `tick = 30000` — counted from when the `Time` starts, for a repeating
job that is not about the time of day.
