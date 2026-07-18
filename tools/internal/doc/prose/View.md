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

## scrolls
Makes the view scroll its overflowing content: it clips to its box and scrolls the
vertical overflow, exposing `scrollY`. Fixed chrome comes free — make it a **sibling**
of the scroller, not a child. Default `false`. Both backends realize it natively and
present the same model (`scrollY` updates the same way either way); only the overscroll
*feel* differs, where the platform can do better. On DOM the OS owns the scroll — overlay
scrollbar, momentum, and rubber-band overscroll *contained* to this pane, so it bounces on
its own edges and never chains to the page, and sibling panes overscroll independently. On
canvas the runtime manages the offset (clip+translate+wheel), as a single element must.

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

## textColor
The glyph color `Text` renders with — a `prevailing` styling slot declared on `View`
so **any** container can provide it and the whole subtree inherits, live. Unset, it
follows the nearest ancestor that sets it (default `0x000000`). Set it on a panel to
retint all text beneath without touching each `Text`.

## fontSize
Prevailing font size in pixels (default `16`), inherited by descendant `Text` exactly
like `textColor`. Set once on a container to size a whole region's text.

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
`mouseDown`/`mouseUp`/`mouseMove` are there when you need the raw phases.

```declare
View [ width = 80, height = 44, cornerRadius = 6, fill = gainsboro, onClick() { fill = 0x4169E1 } ]
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
colours when you don't want a full `stylesheet`.

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

## focustrap
Marks a self-contained focus group: Tab cycles within it and escapes at the boundary
(firing `escapeFocus`). For a modal or menu whose focus must not leak to the page behind.

## onMouseDown
The pointer pressed on the view — the raw press phase. Prefer `click` (press **and**
release on the same view) unless you need the phases apart, e.g. to begin a drag.

## onMouseUp
The pointer released. While a press is captured (it began on this view) `mouseUp` still
fires **here even if the release lands off the box** — the drag-release guarantee, so a
slider freezes its value wherever the finger lifts.

## onMouseMove
The pointer moved over the view — and, once pressed on it, every move **while captured**
(even outside the box), so a drag handler keeps getting positions. The event carries the
pointer in this view's own coordinates.

## onMouseOver
The pointer entered the view (retained enter tracking) — the hover-in half. Set a
`hovered` flag here and read it in a `fill`/`textColor` constraint.

## onMouseOut
The pointer left the view — the hover-out half; also fires when a press is abandoned off
the box, so clear both `hovered` and `pressed` here.

## onFocus
The view gained keyboard focus (it is `focusable` and was tabbed or clicked to). Drive a
focus ring off it.

## onBlur
The view lost keyboard focus — the partner of `focus`.

## onEscapeFocus
Fired on a `focustrap` when Tab reaches its boundary — your cue to move focus out (close
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

## scale
A uniform **paint** transform — the view's subtree renders scaled about its pivot, never
re-laid-out (like `opacity`, it changes pixels, not geometry), and hit-testing follows the
visible result. Pair with `pivotX`/`pivotY` to choose the center; `1` is unscaled.

## pivotX
The horizontal center of `scale`, in the view's own coordinates. Defaults to the origin; set
both `pivotX`/`pivotY` to scale about the middle rather than the top-left.

## pivotY
The vertical pivot — the twin of `pivotX`.

## scrollsX
Like `scrolls`, but for **horizontal** overflow: the view clips to its box and scrolls content
wider than it, exposing the offset. Use it for a paging strip; `scrolls` is the vertical case.

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
(`#guide/22-reach@intro` scrolls to the view with `anchor = "intro"`). The `<a name>`
lineage, reborn reactive: the anchor namespace is named views (this attribute) plus
heading slugs inside rendered rich text — a heading needs nothing from you. Resolution
prefers views over slugs, preorder-first.
