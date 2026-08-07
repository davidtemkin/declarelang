The base of every visual thing in Declare — a rectangular **box** with a position, a
size, and decoration (fill, corner radius, border, shadow). Everything you see
descends from `View`: `Text`, `Image`, your own `class … extends View`. A plain
`View` is a colored box; give it children and it becomes a container.

Its geometry is set two ways that read the same: literal (`width = 200`) or a reactive
`{ }` constraint the runtime keeps true (`width = { parent.width }`). Children nest
inside the brackets, so the source shape mirrors the visual shape; *how* they are
arranged is the `layout` attribute, not the container's type.

```declare
View [ width = 200, height = 120, fill = white, cornerRadius = 8,
    Text [ text = "hello", x = 12, y = 12 ]
    ]
```

## width
The box's width, in **pixels** (`Length`). Defaults to `0`, so a container with no
width set collapses — give it one, a `{ }` constraint, or `100%` (parent-relative).
Set it live and children constrained to it reflow in the same frame; there is no
re-layout call. To size *to* content instead, constrain it: `width = { Math.min(contentWidth, 480) }`.

## height
The box's height in pixels (`Length`), mirroring `width`. `0` by default. A `Text`
left unsized takes its natural measured height, so you usually set `height` only to
clip or to drive a layout.

## fill
What paints the box: a solid `Color` or a `gradient(…)` — the one slot, subsuming a
plain background color. `null` (the default) paints **nothing** — an unfilled box is
invisible but still lays out and still catches clicks. In a `[ ]` literal a color is
`#RRGGBB`; inside a `{ }` body it is `0xRRGGBB` (the one place the spelling differs).

```declare
View [ fill = { gradient("90deg", 0x1E2A36, 0x0B141B) } ]
```

## cornerRadius
Rounds the **painted** box by this many pixels (default `0`, square). It shapes fill,
border, and shadow — but not hit-testing or clipping: the box stays a rectangle for
layout and clicks. To clip children to the rounded shape, set `clip = true` as well.

## stroke
A border drawn **inside** the box (`stroke(width, color)`), so it never enlarges the
layout rectangle — the box stays the one geometry fact. `null` by default. Chosen over
CSS's `border` precisely so a bordered view and an unbordered one occupy the same space.

## shadow
A drop shadow on the box (`shadow(dx, dy, blur, color)`), the CSS box-shadow shape
minus spread. `null` by default. The glyph equivalent on `Text` is `textShadow`.

## opacity
Whole-view alpha, `0`…`1` (default `1`). Applies to the view **and its subtree** as a
group, so a fading panel fades its contents with it. Not `prevailing`: its effect
already composes down the render tree, so a followed copy would apply it twice.

## ignoreLayout
Opt this child out of its parent's `layout` — the arrangement skips it and it owns
its own position on both axes (the decoration/overlay case: a badge floating over
a laid list). Its size still counts toward the parent's auto-extent.

## ignoreClip
Opt this child out of its parent's `clip`: outside the parent's frame it still
paints *and* still hits — frame chrome that straddles the frame (a window's
resize halo; a badge poking out of a clipped card). Parent-scoped — an ancestor's
clip above still applies — and the child is exempt from the parent's auto-extent
(frame geometry derives *from* the bounds, so it cannot also define them).

## visible
Whether the view renders and participates in layout-that-skips-invisibles (default
`true`). A `false` view is fully inert — no paint, no hit-testing — but still
constructed, so toggling it is cheap and keeps its state.

## clip
Clips the subtree to a shape. `clip = true` clips to the view's **own box**
(reactively on width/height) — the common case; a `Shape` value clips to an arbitrary
path. `null`/unset (default) draws children unclipped, even outside the box. Kept
explicit (not implied by `cornerRadius`) so clipping is pay-per-use.

## tip
The tooltip text — the layer system's floor (one attribute at the use site): a non-empty
`tip` makes this view hover-interactive, and after the theme's delay the auto-provided
`Tooltip` singleton shows the text beside it. Placement, delay, and size are theme data
(`tooltipPlacement` below | above | pointer, `tooltipDelay`, `tooltipSize`) — so Cupertino
tips appear near the cursor after ~1s at 11px (the macOS help tag), Redmond's above the
control (WinUI), Mountain View's below at ~500ms (M3) — always flipped and clamped inside
the app. Moving between tip-carrying controls while a tip is up retargets instantly; a
press dismisses. Look comes from `tooltipBg` / `tooltipText` / `tooltipLine`. `""` (the
default) = no tip.

## ignoreScroll
The third member of the opt-out family (`ignoreLayout` — the parent arranges everyone
but me; `ignoreClip` — the parent clips everyone but me): **the scroll carries everyone
but me — I ride the frame.** The child stands still against its nearest enclosing scroll
frame — the window when the page is the regime, the pane's frame inside a `scrolls`
view — and contributes nothing to the scroll range. The fixed header, the pinned
toolbar, and the overlay layer that stages parked furniture are all this one attribute.

## scrolls
Which **axes** of interior overflow this view scrolls — `none` (the default), `y`, `x`,
or `both`. One class overrides that default: an **`App` scrolls `y` by default**, and its
scroller is the page itself (the ruled page shape — see `App`). A scrolling view clips to its box; overflow along a declared axis becomes its
scroll range (live `scrollY`/`scrollX`), and overflow along any other axis is simply out
of frame. The value is a token **string** in a `{ }` body — compare explicitly
(`scrolls == "y"`), never truthily: `"none"` is a truthy string. Fixed chrome comes free — make it a **sibling** of the scroller, or a child that declares `ignoreScroll`.
Both backends present the same model; only the overscroll *feel* differs, where the
platform can do better. On DOM the OS owns the scroll — overlay scrollbar, momentum, and
rubber-band overscroll *contained* to this pane, so it bounces on its own edges and never
chains to the page, and sibling panes overscroll independently. On canvas the runtime
manages the offset (clip+translate+wheel), as a single element must.

## scrollY
The current vertical scroll offset in pixels of a `scrolls` view — **read it** for
scroll-driven effects (a fading header, reveals, parallax): `opacity = { 1 - app.scrollY / 200 }`.

## layout
How this view arranges its children — a reactive `Layout` attribute, not a child and
not the container's type. Defaults to none (absolute `x`/`y`). Swap or animate it and
the arrangement transitions continuously: `layout: SimpleLayout [ axis = y, spacing = 10 ]`.
Set `layout = null` for explicit none.

## datapath
The data cursor (language §9): sets the place in a dataset that this view and its
descendants read relative to. Write it as a `:path` (relative to the inherited
cursor), `:arr[]` to **replicate** this view once per array element, or a `{ }`
expression yielding a place. Descendants read with their own relative `:paths`.

## childViews
This view's child views, as a live collection — reading it re-runs when the child **set**
changes. It carries set membership only, not the children's own attributes: `.length` is
live, but `.map(c => c.width)` would wire half of what it reads, so aggregation over a node
collection is refused rather than answered wrongly.

**On a virtualized block it answers with the instances that exist** — a subset of the
records, and it changes as you scroll. That is a fact about the block, not a trap: check
`virtualized` on this same container and you know which kind of answer you are holding
(the flag is declared on the replicated child, but read on the container — see
`virtualized`). The list also includes instances the recycler has parked
(`visible = false`), because they are children.

**For a count of the collection, count the data.** The records are complete by definition;
the instances never claimed to be.

```declare-fragment
count: number = { (app.d.value.rows).length }
```

If you want the window with its logical indices — an accessibility traversal, a diagnostic
— that is kernel API (`blocksOf`, `realized()`, `materializationInfo`).

## virtualize
Virtualize this replicated collection: build the instances near the viewport and leave the
rest logical, reconstructed indistinguishably as you scroll. **Replication metadata** — it
belongs on the node whose `datapath` matches many, beside that path, and it means nothing
anywhere else (a node that replicates nothing has no collection to describe, and the checker
says so).

**A boolean, off by default.** Below the threshold where construction hurts, materializing
everything is simply faster and keeps `childViews` whole; above it, this is the one word that
changes. There is no automatic mode and no count to tune — a virtualized block costs a flat
~0.06 ms per scroll tick at any size, so there is no cliff a threshold could protect, and
what full materialization actually costs is construction, which depends on how rich a row is
rather than how many there are.

Like any boolean it takes a `{ }`, and the policy is read inside the replication match — so a
collection can start fully materialized and virtualize when it grows, engaging and
disengaging as the answer changes. What you never write is everything *around* the word: no
row heights, no scroll container, no keys, no overscan tuning, no memoization.

Virtualization needs a scrolling ancestor (`scrolls = y`, or `both`) and — if the block's
parent runs a layout — that layout must stack on `y`. A wrapping gallery, a horizontal strip,
a scatter of pins: those fully materialize instead, deliberately, with an inspectable reason.
Read `virtualized` on the container to see whether it engaged.

```declare-fragment
Row [ datapath = :rows[], virtualize = true ]
```

## virtualized
Whether **this view's replicated content** is virtualized right now — a content intrinsic,
like `contentWidth` and `contentHeight`, and read-only. `false` unless this view is the
container of a virtualized block, which is every view in a program that never asks for
virtualization.

**Read it on the CONTAINER, not the template.** `virtualize` is declared on the replicated
child — beside its `datapath = :rows[]`, where `key` lives too — but the block belongs to
the *parent* that holds the instances, so the parent is what answers. A row instance reports
`false`, and that is the honest answer: an instance has no replicated content of its own. In
ordinary speech the list is virtualized, not the row.

```declare-fragment
list: View [ datapath = { app.d.value },                  // ← ask THIS one
    Row [ datapath = :rows[], virtualize = true ]         // ← declared HERE
    ]
```

It is **tracked**, so a constraint reading it follows a block engaging or disengaging —
which can happen mid-run, since the policy accepts a `{ }`. And it is what makes
`childViews` legible on a virtualized block: the list is a subset, and this is how you know.

## textColor
The glyph color `Text` renders with — a `prevailing` styling slot declared on `View`
so **any** container can provide it and the whole subtree inherits, live. Unset, it
follows the nearest ancestor that sets it (default `0x000000`). Set it on a panel to
retint all text beneath without touching each `Text`.

## fontSize
Prevailing font size in pixels (default `16`), inherited by descendant `Text` exactly
like `textColor`. Set once on a container to size a whole region's text.

## iconSize
Prevailing icon size in pixels (default `16`), inherited exactly like `fontSize` and
`textColor`. A drawn icon takes its box from this, so setting it once on a container
sizes every mark in a region — a menu row asks for 16, a button for 18 — without each
icon carrying a number of its own.

It sizes the BOX, not the stroke: an icon's `weight` is in final pixels, so the same
mark at a larger `iconSize` reads proportionally lighter rather than simply scaling up.
That is deliberate — a hairline should stay a hairline — but it means a set drawn for
16 will not hold its density at 32 without redrawing.

## contentWidth
**Read-only** intrinsic: the width of this view's visible children's bounding box —
the auto-extent, surfaced. A constraint may read it (`width = { Math.min(contentWidth, 480) }`)
to size to content with a cap; assigning it is a compile error.

## contentHeight
**Read-only** intrinsic mirroring `contentWidth` on the vertical axis — the measured
extent of the subtree, for sizing a container to its content.

## onClick
Fires when the pointer presses **and** releases on the same view (a true click, not a
stray press) — answered by an `onClick()` handler. The primary interaction event;
`pointerDown`/`pointerUp`/`pointerMove` are there when you need the raw phases.

```declare
View [ width = 80, height = 40, cornerRadius = 10, fill = gainsboro,
    onClick() { fill = 0x4169E1 }
    ]
```

## onInit
Fires once when the view has finished constructing and its subtree exists — the place
for setup that needs the built tree. Answered by `onInit()`.

## x
The horizontal offset within the parent, in pixels. Honoured only while the parent
imposes no `layout` — **a layout overwrites `x` every pass**, so use it for absolute
placement (the layout-none default) and switch to `layout` for arrangement; don't fight
one with the other.

## y
The vertical offset within the parent — the twin of `x`, and likewise overwritten by a
parent `layout`.

## fontFamily
The prevailing font **fallback list**, read at each descendant `Text` — `[Brand, "system-ui", "sans-serif"]`.
A bare name resolves to a declared `font`; the first entry that resolves wins, so end
with a generic. Prevailing, so setting it on a container refaces the whole region.

## fontWeight
The prevailing weight — one of the `thin`…`black` tokens (`normal`/`bold` alias 400/700).
The token also **picks the matching face** when a `font` declares several, so weight and
face never drift apart.

## letterSpacing
Prevailing tracking, in **px** (not em) — `0` is the font's natural advances. Prevailing,
so a heading container can loosen all its text at once.

## theme
A prevailing record of design tokens, read inside `{ }` as `theme.accent`, `theme.muted`,
etc. Provide it on a container and the subtree styles off it — the escape from hard-coded
colors when you don't want a full `stylesheet`.

## styles
An ordered list of `style` bundles applied at **construction** — **static in v1**: unlike
`stylesheet`, reassigning `styles` after build does nothing. For a reskin that changes
live, use `stylesheet` instead.

## stylesheet
The prevailing stylesheet: provide one anywhere and that whole subtree reskins; swap it
and the subtree re-styles in a single settle. The reactive counterpart to the static
`styles` list.

## focusable
Makes the view a keyboard **tab stop**. Traversal order is the view tree — there is no
numeric tabindex; override `tabOrder()` to reorder within a container.

## focusTrap
Marks a self-contained focus group: Tab cycles within it and escapes at the boundary
(firing `escapeFocus`). For a modal or menu whose focus must not leak to the page behind.

## onPointerDown
The pointer pressed on the view — the raw press phase. Prefer `click` (press **and**
release on the same view) unless you need the phases apart, e.g. to begin a drag.

## onPointerUp
The pointer released. While a press is captured (it began on this view) `pointerUp` still
fires **here even if the release lands off the box** — the drag-release guarantee, so a
slider freezes its value wherever the finger lifts.

## onPointerMove
The pointer moved over the view — and, once pressed on it, every move **while captured**
(even outside the box), so a drag handler keeps getting positions. The event carries the
pointer in this view's own coordinates.

## onPointerOver
The pointer entered the view (retained enter tracking) — the hover-in half. Set a
`hovered` flag here and read it in a `fill`/`textColor` constraint.

## onPointerOut
The pointer left the view — the hover-out half; also fires when a press is abandoned off
the box, so clear both `hovered` and `pressed` here.

## onHold
A press held in place for half a second — the tap-hold, equally available to a mouse.
It does **not** consume the gesture: the raw stream continues and the eventual click
still fires unless the pointer wanders, so a hold can open a menu, start a pick-up, or
be ignored. Declared **alongside the drag handlers** it changes who owns a touch
finger: the drag's claim engages *at the hold* instead of at touchdown, so a quick
swipe still scrolls the surface underneath and a held finger picks the thing up — the
hold-to-drag idiom for draggables on scrolling surfaces.

## onWheel
The wheel turned over the view — mouse wheel, trackpad scroll, or trackpad pinch, which
arrives on the same stream with `e.pinch` true (a ctrl+wheel zoom reports identically).
The event carries the point in this view's coordinates plus `deltaX`/`deltaY`. Declaring
it **claims the wheel** over this view and its subtree — the browser stops scrolling or
zooming the page with it — except over a nested `scrolls` pane, which keeps its own
wheel. ⌘ +/− dispatches no event and stays out of reach.

## onFocus
The view gained keyboard focus (it is `focusable` and was tabbed or clicked to). Drive a
focus ring off it.

## onBlur
The view lost keyboard focus — the partner of `focus`.

## onEscapeFocus
Fired on a `focusTrap` when Tab reaches its boundary — your cue to move focus out (close
the modal, advance to the next group).

## onKeyDown
A key was pressed while the view holds focus; the event carries the key. For app-wide
shortcuts use a `Keys` subscription instead — this is for the focused view only.

## onKeyUp
A key was released while the view holds focus — the partner of `keyDown`.

## scrollIntoView()
Scrolls this view into the visible region of its nearest `scrolls` ancestor (or the page),
aligning its top to the viewport top — the imperative partner of the declarative jump-index
pattern. Both backends realize it natively (DOM `scrollIntoView`, canvas clamps the scroll
ancestor's `scrollOffset`). A no-op if nothing above it scrolls.

## rootOrigin()
This view's origin in **root space** (the root's content coordinates — the same space
`viewAt` takes and drag events carry), computed by the one scroll-aware walk the pointer
itself is routed by: translate per level, minus every intermediate scroller's offset, the
root's own scroll back at the boundary. The anchor primitive for overlays — a menu opening
at a pointer, a popover dropping under a control — so they land where the view is *seen*,
at any scroll. Hand-accumulating ancestor `x`/`y` is scroll-blind; call this instead.

## scale
A uniform **paint** transform — the view's subtree renders scaled about its pivot, never
re-laid-out (like `opacity`, it changes pixels, not geometry), and hit-testing follows the
visible result. Pair with `pivotX`/`pivotY` to choose the center; `1` is unscaled.

## pivotX
The horizontal center of `scale`, in the view's own coordinates. Defaults to the origin; set
both `pivotX`/`pivotY` to scale about the middle rather than the top-left.

## pivotY
The vertical pivot — the twin of `pivotX`.

## blend
The **compositing operator** this view lands with against what has already painted
beneath it — `normal` (the default), or one of the W3C blend modes in camelCase
(`multiply`, `screen`, `overlay`, `darken`, `lighten`, `colorDodge`, `colorBurn`,
`hardLight`, `softLight`, `difference`, `exclusion`, `hue`, `saturation`, `color`,
`luminosity`, `plusLighter`). Declaration order — the z-order you already have — is
the blending order, and blending reaches down to the nearest **isolating** ancestor:
the `App` root, an `opacity < 1` group, a scrolling view's content, an island
boundary. A plain container is transparent to blending, so a `multiply` chip inside
nested layout Views blends against the card under them — which is what you meant.
A blending view blends **as a unit**, children included; compositing is paint, never
input — hit-testing and focus are unchanged. A token string in a `{ }` body, like
`scrolls` — so a blend can be state: `blend = { active ? "multiply" : "normal" }`.

## scrollX
**Read it, don't set it** in practice: the live horizontal offset of a `scrolls = x`
(or `both`) view, mirrored from the native scroll — `scrollY`'s twin. Use it for a
paging strip's position, scroll-driven effects, or restoring a strip's place.

## selectable
**Prevailing.** `selectable = true` on a container makes all its `Text` — including a
`Markdown`'s rendered runs — selectable and copyable; **off by default**, so UI chrome never
becomes accidentally selectable. Set it once high over a region of prose.

## headingColor
**Prevailing.** The color of `Markdown`/`RichText` headings, overriding `textColor` for heading
runs only; absent, headings follow `textColor`.

## headingWeight
**Prevailing.** The font weight for rich-text headings — the heading-specific counterpart to
`fontWeight`.

## linkColor
**Prevailing.** The color of links in rich text; absent, links use the theme's accent.

## codeColor
**Prevailing.** The text color of inline and fenced code in rich text.

## codeSize
**Prevailing.** The font size for code regions — one value driving inline code, fenced blocks,
and `<pre>` alike, so a document's monospace stays uniform.

## codeFamily
**Prevailing.** The monospace family for code regions — a fallback list, like `fontFamily`.

## codeBackground
**Prevailing.** The fill behind fenced code blocks; absent, code carries no box.

## codeRule
**Prevailing.** The color of a fenced code block's left accent rule.

## richTextLayout
**Prevailing.** A per-block-type geometry map for `RichText`/`Markdown` — caller-controlled
measure and spacing per block kind (prose narrower than code, say), so one base renders both
tight code and wide prose.

## anchor
Names this view as a **reveal target** for a location's `@name` suffix
(`#guide/04-tree@intro` scrolls to the view with `anchor = "intro"`). The `<a name>`
lineage, reborn reactive: the anchor namespace is named views (this attribute) plus
heading slugs inside rendered rich text — a heading needs nothing from you. Resolution
prefers views over slugs, preorder-first.

## selectable
Opt this run back into native text selection / copy (default `false`). Off by default
so an app doesn't feel like a document; turn it on for content a user should be able to
select and copy.

## claim
The axis a declared drag claims (`claim = x | y | both`, default `both`): `x` keeps
vertical pan with the enclosing scroll regime while the drag owns horizontal — a grid
column's header drag or edge-resize on touch. Scopes an existing drag declaration
(`onPointerMove`); it never creates one. See claim-surface.md for the arbitration.

## onRetire
The departure hook — fires once when this view's PRESENCE ends (its record leaves the
replicated match, or the subtree is discarded), children before parents, with everything
still alive. The exact symmetric of `onInit`'s membership rule: a windowed row's
dematerialization is NOT a departure and never fires it.

## hovered
True while the pointer is over this view — read-only, maintained by the same hit walk that
routes presses, so it agrees with what a click would reach. Read it in a constraint rather
than tracking enter/leave by hand: `fill = { hovered ? theme.control : null }`. On a touch
device there is no hovering, so gate mouse-only affordances on `app.touchDevice`.

## pressed
True while the pointer is down *and* this view was on the chain captured at pointer-down —
read-only. It stays true if the finger slides off and comes back, which is what makes a
button feel like a button; `hovered` alone flickers. The pair is the whole of press
styling: `fill = { pressed ? theme.line : hovered ? theme.control : null }`.

## cursor
The pointer cursor shown over this view, as a CSS cursor keyword (`"col-resize"`,
`"grab"`); `""` inherits. This is how a resize edge or a drag handle announces itself
before anything is pressed. Meaningful on views that take input — the cursor follows the
hit target, so a view with `pointerEvents = "none"` never shows its own.

## pointerEvents
Whether this view and its subtree take pointer events: `"auto"` (the default) or `"none"`.
`"none"` is for a view that is pure decoration over live content — a highlight rectangle,
a full-viewport chrome overlay — so presses reach what is beneath it. It is the fix for
the invisible-lid bug: an overlay sized to the frame that silently swallows every click.

## raise()
Moves this view to the **top of its parent's children**, so it paints over its siblings —
stacking is declaration order, and this is the runtime verb for changing it. **The
primitive every overlay needs**: a menu, a popover, or a dialog raises itself on open so
it is not occluded by whatever was declared after it. Pass a sibling to be raised *below*
that view instead, which is how chrome stays above content while staying under an even
higher layer.

```declare-fragment
onPointerDown() { this.raise() }        // click-to-front, e.g. a window in a desktop
```

## rootOrigin()
This view's origin in **root space**, as `{ x, y }` — the one scroll-aware walk up the
parent chain. Reach for it when positioning something in a different coordinate system
from the thing that anchored it: an overlay declared at the App that must appear beside a
control nested inside a scrolled pane. **The scroll-awareness is the point** — a naive sum
of `x`/`y` anchors where the view *would* be if nothing had scrolled.

## travelWith()
Re-hosts this view's surface inside `scroller`'s scrolling content, so the **platform**
carries the two together with no per-scroll re-derive — and returns `false` on a backend
that cannot. The view tree does not move: hit testing and layout see nothing change, only
the surface is re-homed. This is a specialist tool for chrome that must track scrolled
content exactly (the focus ring following a control inside a pane); pass `null` to return
it to the root.

## $data()
Reads the datum at a path **relative to this view's cursor** — the compiled form every
`:path` lowers to, callable by hand. `$data("")` is the whole record at the cursor, which
is what a replicated row calls to hand its own record to a method. Reach for the `:path`
spelling in ordinary code; reach for this when the path is computed, or when you need the
record itself rather than a field of it.

```declare-fragment
member() -> object { return this.datapath != null ? this.$data("") : this }
```

## $setData()
Writes a value at a path relative to this view's cursor — **the write half of `$data`**,
and how a replicated row edits its own record without knowing where in the dataset it
sits. The write wakes exactly the bindings that read the changed region, so a grid cell
committing an edit re-derives everything downstream and nothing else.

## insertChild()
Inserts a view you already hold as a child at `index` — the placement half of
`app.createView`. Prefer replication over data for collections; this is for genuinely
imperative structure.

## removeChild()
Detaches a child from this view. The child is **not** torn down — use `discard()` for
that; a removed view you keep a reference to can be inserted somewhere else.

## discard()
Tears a view down for good: unwires its constraints and drops its surface. **The pair of
`app.createView`** — a view you built imperatively is yours to destroy, while a replicated
instance is the runtime's and leaves when its record does.

## tabOrder()
The members keyboard traversal descends into from this view. **Override it to gate
traversal** — a closed `Accordion` pane returns none, which is what stops Tab from
reaching content the user cannot see, since a closed pane is clip-occluded rather than
hidden. Compose with `tabDefault()` rather than rebuilding the list.

```declare-fragment
tabOrder() { return open ? this.tabDefault() : [] }
```

## tabDefault()
The default traversal list — visible children in source order. **The thing a `tabOrder()`
override calls** when it wants the ordinary answer under a condition of its own.

## lookupStylesheet()
Resolves a stylesheet by name to the handle the `stylesheet` slot accepts — for choosing a
skin whose name is computed at runtime. A `stylesheet = Dark` literal needs none of this.
