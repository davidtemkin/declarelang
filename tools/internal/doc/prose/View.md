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

Every attribute below can be asked about in a **running** program:
`window.__declare.explain(path, attr)` returns the live value *and* its provenance
(the owning constraint, its source, its reads); `__declare.help()` lists the calls.
See `docs/operational/introspection.md`.

**Text styling is not here.** The font, color, weight, and `theme` a region of text
renders with are **provided values**, not `View` slots — they live on the text leaves
(`Text`, `RichText`, `TextInput`) and `Control`, each declared `= provided("name", default)`.
A `View` draws no glyphs, so it carries none of them; writing `fontFamily`, `textColor`, or
`theme` on a container **provides** the value, and the nearest descendant leaf **reads** it
(nearest-wins, live). See `Text`/`RichText` for the slots and `provided(…)` for the
mechanism. The geometry and paint slots below are the ones a `View` actually owns.

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
App [
    View [ x = 20, y = 20, width = 260, height = 80, cornerRadius = 8, fill = { gradient("90deg", 0x1E2A36, 0x0B141B) } ]
    ]
```

## cornerRadius
Rounds the **painted** box (default `0`, square). One number rounds all four corners;
four — `[topLeft, topRight, bottomRight, bottomLeft]`, clockwise from the top-left as
CSS orders them — round each on its own, and a corner given `0` stays square:
`cornerRadius = [0, 8, 0, 8]` rounds only the top-right and bottom-left, `[8, 8, 0, 0]`
is a tab that joins the pane below it. Radii that would overlap along an edge shrink
together, so a radius past half the box is a pill, never a fold. It shapes fill, border,
and shadow — but not hit-testing or clipping: the box stays a rectangle for layout and
clicks. To clip children to the rounded shape, set `clip = true` as well. A `Spring` on
this slot animates the number form.

## stroke
A border drawn **inside** the box (`stroke(width, color)`), so it never enlarges the
layout rectangle — the box stays the one geometry fact. `null` by default. Unlike
CSS's `border`, a bordered view and an unbordered one occupy the same space.

## shadow
A drop shadow on the box (`shadow(dx, dy, blur, color)`), the CSS box-shadow shape
minus spread. `null` by default. The same value shadows glyphs as `Text.textShadow`,
and the painted **alpha** of any subtree inside a `filter` list — one `shadow(…)`, three
sites, one look (its `blur` is the box-shadow radius everywhere).

## filter
The view's own painted subtree, filtered as a **group** — children included — before
`opacity` and `blend` land. One function or a bare list:
`filter = blur(3)`, `filter = [blur(2), brightness(0.8)]`, `filter = { [blur(k), saturate(1.4)] }`.
The functions are `blur(radius)`, `brightness(k)`, `contrast(k)`, `saturate(k)`,
`grayscale(k)`, `invert(k)`, `sepia(k)`, `hueRotate(deg)`, `colorize(color)` — the group's
alpha in one colour, what `Image.tint` is sugar for — and `shadow(dx, dy, blur, color)`, which
here shadows the painted **alpha** (a badge with a transparent background casts its own
outline) where the box `shadow` slot casts the rectangle. Lengths are **view units** and
scale with the view's transform; the output may bleed past the box (a blur's 3σ, a shadow's
reach) and layout ignores the bleed. A filtered view isolates blending and backdrops inside
it. Paint only, never input — a blurred button is still its box. `null` (the default) is none.
The same vocabulary, sampled **beneath** the view, is `backdrop`.

## mask
A soft alpha mask over the view's painted (clipped) subtree, applied before `opacity`:
a gradient's **alpha** over the box — `mask = gradient("180deg",
#00000000, #000000FF)` fades the top out; `radialGradient(…)` vignettes — or a **stencil**,
another view whose painted alpha, placed by its own `x`/`y` inside this box, is the mask:
`mask = { stencil }` with `stencil: Image [ visible = false, … ]` as a child is the idiom.
A masked view isolates. Paint only. `null` (the default) is none. On the DOM renderer a
stencil must be an `Image` or a view with `draw()` (its alpha is what CSS `mask-image`
can take); the canvas and Mac renderers take any view.

## opacity
Whole-view alpha, `0`…`1` (default `1`). Applies to the view **and its subtree** as a
group, so a fading panel fades its contents with it. It is not inherited by descendants —
its effect already composes down the render tree, so a per-descendant copy would apply it twice.

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
tips appear near the cursor after ~1s at 11px (the Cupertino help tag), Redmond's above the
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
scroller is the page itself (see `App`). A scrolling view clips to its box; overflow along a declared axis becomes its
scroll range (live `scrollY`/`scrollX`), and overflow along any other axis is simply out
of frame. The value is a token **string** in a `{ }` body — compare explicitly
(`scrolls == "y"`), never truthily: `"none"` is a truthy string. Fixed chrome comes free — make it a **sibling** of the scroller, or a child that declares `ignoreScroll`.
**A scroller takes the pointer.** Declaring an axis says this view answers drags and wheels
over its box, so it is an input participant whether or not it declares a handler, and content
declared *behind* it is not reachable through it — a press on its empty area does not fall
through to whatever sits underneath. Something that must stay clickable belongs in front of
the scroller (later in the body), or outside it.

Both backends present the same model; only the overscroll *feel* differs, where the
platform can do better. On DOM the OS owns the scroll — overlay scrollbar, momentum, and
rubber-band overscroll *contained* to this pane, so it bounces on its own edges and never
chains to the page, and sibling panes overscroll independently. On canvas the runtime
manages the offset (clip+translate+wheel), as a single element must.

## scrollY
**A fact, not a slot.** The current vertical scroll offset in pixels of a `scrolls` view —
the **platform writes it** as the user scrolls (and as a glide moves); **read it** for
scroll-driven effects (a fading header, reveals, parallax): `opacity = { 1 - app.scrollY / 200 }`.
Nothing may set it: an assignment and an `Animator [ attribute = scrollY ]` are both
compile errors, each naming the verb. To move the pane, **call `scrollTo(y)`** — a
request the platform clamps to the real range and holds for a pane that cannot take it
yet; add a glide (`scrollTo(y, { duration, motion })`) for the platform's own motion. A
starting offset is declared with `scrollStartY`. The offset is sampled once per settle,
like the pointer: your view of it may trail the pixels by a frame, and the pixels never
wait on you. To reveal a particular view, `scrollIntoView()` on the target already does
the walk.

## scrollStartY
The vertical offset a `scrolls` view **starts at** — applied once, at first layout, the
declared twin of a `scrollTo(y)` on arrival (`scrollStartX` for the other axis). The
`scrollY` fact then reports where the platform actually put it. A test fixture that must
be shot mid-scroll declares this rather than gesturing.

## scrolling
**A fact, not a slot.** True while this scroller is in motion — a wheel or trackpad
stream, its momentum, a scrollbar drag, or a glide — and false once it settles. Read it
in a constraint to hold work off until the user is done, or to keep a heavy effect cheap
mid-gesture. Read it, rather than acting on its edges: a trackpad's momentum pauses and a
mouse wheel's notches make this fact flicker by nature. Written by the platform's scroll process; never assigned.

## layout
How this view arranges its children — a reactive `Layout` attribute, not a child and
not the container's type. Defaults to none (absolute `x`/`y`). Swap or animate it and
the arrangement transitions continuously: `layout: SimpleLayout [ axis = y, spacing = 10 ]`.
Set `layout = null` for explicit none.

## datapath
The data cursor: sets the place in a dataset that this view and its
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

**A boolean, off by default.** Full materialization keeps `childViews` whole and browser
find-in-page working over every record, and below the size where construction hurts it is
simply faster; above it, this is the one word that changes. There is no automatic mode and
no count to tune: what full materialization costs is construction, which depends on how
rich a row is rather than how many there are.

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

**Read it on the container, not the template.** `virtualize` is declared on the replicated
child — beside its `datapath = :rows[]`, where `key` lives too — but the block belongs to
the *parent* that holds the instances, so the parent is what answers. A row instance reports
`false`, and that is the honest answer: an instance has no replicated content of its own. In
ordinary speech the list is virtualized, not the row.

```declare-fragment
list: View [ datapath = { app.d.value },                  // ← ask this one
    Row [ datapath = :rows[], virtualize = true ]         // ← declared here
    ]
```

It is **tracked**, so a constraint reading it follows a block engaging or disengaging —
which can happen mid-run, since the policy accepts a `{ }`. And it is what makes
`childViews` legible on a virtualized block: the list is a subset, and this is how you know.

## contentWidth
**Read-only** intrinsic: the width of this view's visible children's bounding box —
the auto-extent, surfaced. A constraint may read it (`width = { Math.min(contentWidth, 480) }`)
to size to content with a cap; assigning it is a compile error.

Its other use is a component that takes content. A class whose instances receive children
from the use site sizes itself to what it was handed with `width = { contentWidth }` — the
children are not the class's own, so nothing else knows their extent.

## contentHeight
**Read-only** intrinsic mirroring `contentWidth` on the vertical axis — the measured
extent of the subtree, for sizing a container to its content, including content the use
site supplied (`height = { contentHeight }` on a class that takes children).


## draw()
Custom drawing: define `draw(d: Draw) { … }` on any view, and it paints into its box with
the Canvas2D vocabulary (`d.fillStyle`, `d.beginPath()`, `d.arc(…)`, `d.fill()` — the
`Draw` interface, on the Types page). It is **an ordinary method**, overridable like any
other; what makes it paint is who calls it. `View` holds a standing constraint of its own,
`drawing = { record(draw) }`, which runs your method through a recorder when the view
attaches and again whenever something the body read changes — a read of `hovered` or a
data field redraws, nothing else does, and nothing runs per frame. That is the same rule
every method has when a constraint calls it; `draw` is only unusual in that the constraint
is View's rather than yours. A view with no `draw` carries no drawing machinery at all.
Reach for it for graphs, iconography, and treatments the tree cannot style; measure frame
rate as drawn surfaces grow large or change every frame. Bitmaps come in through an
`Image` view: `d.drawImage(pic, …)` takes the view (Canvas2D's three argument shapes),
paints nothing until `pic.loaded`, and that read is what re-records the drawing when the
bitmap arrives — a hidden `Image [ visible = false, source = … ]` is the holder idiom.

```declare-fragment
gauge: View [ width = 80, height = 80,
    level: number = 0.6,
    draw(d: Draw) { d.strokeStyle = 0x2E6FE0; d.lineWidth = 6
                    d.beginPath(); d.arc(40, 40, 32, -Math.PI / 2, -Math.PI / 2 + level * 2 * Math.PI); d.stroke() }
    ]
```

## bounds()
This view's **transformed box in the parent's coordinates** — the bounding box of the
frame under scale-then-rotate about the pivot. The footprint: what a layout packs and
what the parent's auto-size measures, and the exterior twin of the local
`width`/`height` (which never change under transform — they are the view's interior
coordinate space). Identity when `scale = 1` and `rotation = 0`. Every read is live, so
a constraint like `width = { this.chip.bounds().width + 20 }` follows a springing
scale.

## footprint()
`bounds()` minus the position: the same transformed box **relative to this view's own
origin** — `x`/`y` are the lead offsets the transform introduces (0 untransformed),
`width`/`height` the footprint extents. It never reads the view's `x`/`y`, which is why
a layout's `place()` consumes this form: a strategy must never read the slots it
writes. A view tipped in 3D (`rotateX`, `rotateY`, `translateZ`) is measured as if the
vanishing point sat at its own pivot — the exact projection depends on where the view
lands in its parent and on the parent's size, which the layout is deciding — so an
auto-sized reel of flipping digits sizes without a cycle; the hit walk uses the exact
projection. Reach for `bounds()` everywhere else.

## rootBounds()
This view's transformed box in **root-content space** — every ancestor's position,
scale, rotation, and scroll composed (the hit walk's own math). A one-shot query for
handlers, deliberately not a reactive fact: absolute geometry depends on every
ancestor, and a live slot would re-derive on each scrolled pixel. For the reactive
question — "am I visible?" — bind `onScreen` or `visibleRect` instead.

## rootTransform()
The composed similarity from this view's frame to root space — `{x, y, scale,
rotation}`. The method tier's exact transform; the visibility facts are its coarse,
at-rest companions.

## onScreen
Is this view **on screen** — inside the viewport, not scrolled away, not in a hidden
subtree? A coarse reactive fact that flips at threshold crossings, so a binding
re-derives only when the answer changes: the gate for ambient work
(`running = { classroot.onScreen && app.pageVisible }`) and for load culling. Fed
lazily at the first read — a program that never binds it pays nothing. On the DOM the
feed sees the whole page, so an embedded app's box scrolled off its **host** page
reads `false` too. Read-only.

## visibleRect
What of this view is visible, **in its own coordinates** — `{x, y, width, height}`,
all zeros when nothing shows. Updates **at rest** (when motion settles and scrolling
quiets), never per frame of a glide — a tile or rung decision wants the flight's end.
Cull margins are your arithmetic on the truth, not a platform knob. Read-only.

## apparentScale
The composed scale from this view's units to **device pixels** — ancestor scales ×
devicePixelRatio. The raster-rung fact: an image pyramid picks its tier from it, a
drawn view its backing density, with no reimplemented transform math and no host
globals. Exact under Declare's own transforms (rotation does not participate); under
a non-similar host transform it is the largest axis ratio — the rasterization
convention. Same at-rest delivery as `visibleRect`. Read-only.

**The phase these facts have — and the one they don't.** All three answer *what is*,
at arrival: a camera flight lands, then a fact-bound tier re-derives, once. They never
answer *what will be* — the platform cannot know where a spring is headed, but **your
app can**, because the camera's target is your own attribute. A prefetch keyed on the
destination (`tierFor(cardH * app.camTarget)`) fires at departure and overlaps the
glide; a tier keyed on `apparentScale` asks on arrival and may land soft, then
sharpen. Those are opposite ends of the same flight, both legitimate: departure-phase
policy is written against your target state, arrival-phase truth against these facts,
and the two compose.

## onClick
Fires when the pointer presses **and** releases on the same view (a true click, not a
stray press) — answered by an `onClick()` handler. The primary interaction event;
`pointerDown`/`pointerUp`/`pointerMove` are there when you need the raw phases.

```declare
App [
    View [ x = 20, y = 20, width = 120, height = 40, cornerRadius = 10, fill = gainsboro,
        onClick() { fill = 0x4169E1 },
        TextLabel [ x = 12, fontSize = 13, text = "click me" ]
        ]
    ]
```

## x
The horizontal offset within the parent, in pixels. Honoured only while the parent
imposes no `layout` — **a layout overwrites `x` every pass**, so use it for absolute
placement (the layout-none default) and switch to `layout` for arrangement; don't fight
one with the other.

## y
The vertical offset within the parent — the twin of `x`, and likewise overwritten by a
parent `layout`.

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

## onDblClick
The **resolved** pair: a second click on this same view inside the double-click interval
(and, on touch, within a few pixels of the first tap). The desktop rule holds — a third
click starts a fresh cycle, so triple is a double plus a single, not two doubles.

Declaring it changes when `click` arrives, which is the part to know: a view that answers
both **withholds** the first click for the length of the interval, so a single click fires
late and a pair fires `click` then `dblClick` together. If a single click must feel
immediate, keep the two handlers on different views.

## onTouchStart
The **raw** multi-finger stream, and the layer below the recognized gestures: a finger
landed. `e.touches` is every live finger in this view's coordinates, `e.changed` the ones
this event is about. Reach for it when no recognized gesture fits — two-finger gestures
are `onPinch*`, a tap is `onClick`, a drag is the claim family — because the raw stream
means doing the finger arithmetic yourself.

Declaring any of the touch family **claims** from the browser exactly what that handler
needs to fire, and nothing more.

## onTouchMove
A finger moved. Same payload shape: every live finger, and the ones that moved.

## onTouchEnd
A finger lifted. `e.touches` is what remains down, so the last finger's lift is the one
that leaves it empty.

## onTouchCancel
The system took a finger away — a call arrived, the browser reclaimed the gesture, the
finger left the surface. It is not a lift: nothing was completed, and a gesture in
progress should be abandoned rather than finished. Pair it with `onTouchEnd` in any
handler that holds state across a touch.

## onContextMenu
The platform's context gesture — a right-click, or a two-finger tap on a trackpad —
carrying the point in this view's coordinates. Declaring it **suppresses the browser's own
menu**, and exactly where it is declared: elsewhere on the page the native menu still
opens. A touch long-press does not arrive here; that is `onHold`, which is the gate touch
context rides.

## onWheel
The wheel turned over the view — mouse wheel, trackpad scroll, or trackpad pinch, which
arrives on the same stream with `e.pinch` true (a ctrl+wheel zoom reports identically).
The event carries the point in this view's coordinates plus `deltaX`/`deltaY`. Declaring
it **claims the wheel** over this view and its subtree — the browser stops scrolling or
zooming the page with it — except over a nested `scrolls` pane, which keeps its own
wheel. ⌘ +/− dispatches no event and stays out of reach.

## onPinchStart
Two fingers landed over this view's subtree — the **recognized** two-finger gesture,
so you never do the finger arithmetic (that is what the raw `onTouch*` family is for).
Declaring any of the pinch family **claims the two-finger gesture** from the browser
over this subtree; single-finger pan stays the enclosing regime's — the same
narrowing `claim = x` performs for drags. The event carries `scale` (`1` at the
start) and `center`, the midpoint of the two fingers in root space. A pinch nearly
always drives `scale`/`rotation` of a sub-surface, which is why they ship together.

## onPinch
The fingers moved: `e.scale` is **cumulative** — the spread now over the spread at
`pinchStart` — and `e.center` tracks the midpoint in root space. Typical use:
`onPinch(e) { zoom = anchor * e.scale }`, anchoring on the value at `pinchStart`
rather than integrating deltas.

## onPinchEnd
Either finger lifted (or the browser reclaimed the gesture); `e.scale` is the final
cumulative scale. Latch your anchor here for the next pinch.

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

## scrollTo()
Ask **this scroller** to go to offset `y` — a **request, not an assignment**: the platform
clamps it to the real scroll range, and a pane that cannot take it yet (hidden, or not yet
laid out) holds the request and applies it the moment it can — so `scrollTo(0)` before
showing a pane simply works. **`scrollTo(Infinity)` means the far end** — "scroll to the
bottom" with no magic number; the clamp resolves it against the range the pane has when it
can finally take it. The `scrollY` fact follows the platform's answer. Call it on the
`scrolls` view itself; to reveal a particular *view*, `scrollIntoView()` on the target
finds the scroller for you. A no-op before the view is attached.

**The user may be scrolling the same pane.** Scrolling is a process the platform owns, driven
by a hand that does not pause for the program, so a request can arrive mid-gesture and lose —
overridden by momentum, or worse, fighting it. Two habits keep the two from contending. Ask
because something *changed by this much* rather than because the offset is near some value:
a reader who is following the end of a list wants the new content, and a reader who scrolled
up wants to be left alone, and only the first is expressible as growth. And read `scrolling`
before asking, so a request waits for a hand that is still moving. What does not work is
re-asserting a position every frame; the gesture will win, and the program will spend the
whole gesture losing.

**With a glide** — `scrollTo(y, { duration, motion })` — the request moves the pane over
`duration` milliseconds on the platform's own motion: the browser's smooth scroll, the
native host's tween, the canvas runtime's loop. `motion` names a Declare curve
(`"cubicOut"`, the default; any family token) where the provider can honor one. This is
not an Animator: no Animator semantics, no slot — the scroller glides, `scrollY` reports
as it goes, and a **gesture cancels it** (the user always wins). A request that arrives
while a gesture or its momentum owns the pane is dropped.

## scrollToX()
The horizontal twin of `scrollTo()` — the same clamped, held request against `scrollX`,
for a `scrolls = x` (or `both`) view, with the same optional glide.

## scrollBy()
A **relative** request — `scrollBy(dx, dy)`, or `scrollBy(dx, dy, { duration, motion })`
— measured from the current facts: `scrollBy(0, -pane.height)` pages up. The same
clamp, hold and glide contract as `scrollTo()`/`scrollToX()`, on both axes at once.

## rootOrigin()
This view's origin in **root space** (the root's content coordinates — the same space
`viewAt` takes and drag events carry), computed by the one scroll-aware walk the pointer
itself is routed by: translate per level, minus every intermediate scroller's offset, the
root's own scroll back at the boundary. The anchor primitive for overlays — a menu opening
at a pointer, a popover dropping under a control — so they land where the view is *seen*,
at any scroll. Hand-accumulating ancestor `x`/`y` is scroll-blind; call this instead.

## scale
A uniform transform — the view's subtree renders scaled about its pivot, and **every
reader agrees on the one geometry**: paint, hit-testing, `rootOrigin`, the parent's
auto-size, and layouts all compose the same transform, so a `scale = 0.5` child really
occupies half its slot (the fractal idiom) — where CSS makes transform paint-only and
lets layout disagree with what you see. The view's **own** `width`/`height` stay local
(its interior world is untouched — that is what makes scale mean "the same world,
smaller"); the parent packs the transformed **footprint** (`bounds()`). Pair with
`pivotX`/`pivotY` to choose the center; `1` is unscaled; spring it for zoom effects.

## scaleX
Per-axis scale, multiplied with the uniform `scale` — `scaleY = 0.2` squashes a card to a
sliver without changing its width (the frame of a flip). Same pivot, same one-geometry
rule: paint, the hit walk's inverse, `rootTransform()` and the footprint share one matrix.
`1` is unscaled.

## scaleY
The vertical twin of `scaleX`.

## skewX
A shear in **degrees**: `skewX = 20` slants the view's vertical edges by 20°, about the
pivot, composing with scale and rotation in one matrix. `0` is unsheared.

## skewY
The vertical twin of `skewX`.

## rotateX
A rotation about the view's **horizontal axis**, in degrees, about the pivot — the third
dimension, seen through the parent's `perspective`. A card tipped
away foreshortens; past 90° its back shows (`backface`). Hit-testing unprojects, so
`hovered`, `pressed` and `viewAt` name the view where it is drawn. `0` is flat.

## rotateY
A rotation about the view's **vertical axis**, in degrees — the twin of `rotateX`.

## translateZ
A push along the depth axis, in px, positive toward the viewer — under the parent's
`perspective` the view grows as it comes closer. `0` is in the plane.

## perspective
Sets this view as the **eye** for its children's `rotateX`/`rotateY`/`translateZ`: the
distance, in px, from the viewer to the plane, with the vanishing point at this box's
centre — CSS's model (`perspective: 700px`). `0` (the default) projects orthographically,
so a rotated child simply foreshortens.

## backface
`visible` (the default) or `hidden`: whether a view turned past 90° about X or Y still
shows (and hits) from behind.

## pivotX
The horizontal center of `scale` and `rotation`, in the view's own coordinates. Defaults
to the origin; set both `pivotX`/`pivotY` to transform about the middle rather than the
top-left.

## pivotY
The vertical pivot — the twin of `pivotX`.

## rotation
Rotation in **degrees**, clockwise, about the same (`pivotX`, `pivotY`) pivot `scale`
uses — and the same one-geometry rule: hit-testing follows the *visible* geometry
through the inverse transform (`hovered`, `pressed`, and `viewAt` all agree with what
you see), and layout and auto-size reserve the rotated frame's bounding box
(`bounds()`), so a rotated card takes the room it visibly covers. Composes with `scale`
in one documented order — scale, then rotate, about the shared pivot. `0` (the default)
is unrotated; spring it for turn effects.

## backdrop
The **frost** — `frost(radius)` or `frost(radius, saturation)`; `null` (the default) =
none. What has already painted beneath this view is sampled within the view's **own
painted shape** (its box, rounded by `cornerRadius`, or its `clip` shape), blurred by
`radius`, saturation-scaled, and the view's own `fill` then paints **over** the frosted
sample — a translucent wash over a blurred backdrop, which is how every platform's
material works. Content moving beneath re-frosts; that is the point. Samples reach the
same isolating ancestor `blend` does, and like `blend` it is paint only — input never
changes. `saturation` defaults to `1`; frosted materials read best around `1.4`–`1.8`.

```declare
App [ fill = #F6F8FA,
    art: View [ x = 10, y = 10, width = 220, height = 120, cornerRadius = 8, fill = { gradient("90deg", 0xC93B47, 0x2E6FE0) } ],
    panel: View [ x = 70, y = 40, width = 240, height = 70, backdrop = frost(20), fill = #F9F9FBDB, cornerRadius = 12,
        Text [ x = 14, y = 24, text = "frosted over the art behind it" ]
        ]
    ]
```

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
**A fact, not a slot.** The live horizontal offset of a `scrolls = x` (or `both`) view,
mirrored from the platform's scroll — `scrollY`'s twin, with the same enforcement: the
platform owns it, and an assignment or an Animator aimed at it is a compile error.
**`scrollToX(x)` is the verb** — a clamped, held request, with an optional glide
(`scrollToX(x, { duration: 260, motion: "cubicOut" })` is how the desktop's Files strip
slides a fresh column into view). `scrollStartX` declares a starting offset. Read it for
a paging strip's position or scroll-driven effects.

## anchor
Names this view as a **reveal target** for a location's `@name` suffix
(`#guide/04-tree@intro` scrolls to the view with `anchor = "intro"`).
The anchor namespace is named views (this attribute) plus heading slugs inside
rendered rich text, so a heading needs nothing from you. Resolution prefers views over
slugs, preorder-first.

## claim
The axis a declared drag claims (`claim = x | y | both`, default `both`): `x` keeps
vertical pan with the enclosing scroll regime while the drag owns horizontal — a grid
column's header drag or edge-resize on touch. Scopes an existing drag declaration
(`onPointerMove`); it never creates one. The guide's Gestures chapter has the arbitration.

## onRetire
The departure hook — fires once when this view's **presence** ends (its record leaves the
replicated match, or the subtree is discarded), children before parents, with everything
still alive. The exact symmetric of `onInit`'s membership rule: a windowed row's
dematerialization is **not** a departure and never fires it.

## hovered
True while the pointer is over this view — read-only, maintained by the same hit walk that
routes presses, so it agrees with what a click would reach. Read it in a constraint rather
than tracking enter/leave by hand: `fill = { hovered ? provided("theme").control : null }`. On a touch
device there is no hovering, so gate mouse-only affordances on `app.touchDevice`.

## pressed
True while the pointer is down *and* this view was on the chain captured at pointer-down —
read-only. It stays true if the finger slides off and comes back, which is what makes a
button feel like a button; `hovered` alone flickers. The pair is the whole of press
styling: `fill = { pressed ? provided("theme").line : hovered ? provided("theme").control : null }`.

## cursor
The pointer cursor shown over this view, as a CSS cursor keyword (`"col-resize"`,
`"grab"`); `""` inherits. This is how a resize edge or a drag handle announces itself
before anything is pressed. Meaningful on views that take input — the cursor follows the
hit target, so a view with `pointerEvents = "none"` never shows its own.

## pointerEvents
Whether **this view** takes pointer events: `"auto"` (the default) or `"none"`.
`"none"` is for a view that is pure decoration over live content — a highlight rectangle,
a full-viewport chrome overlay — so presses reach what is beneath it. It is the fix for
the invisible-lid bug: an overlay sized to the frame that silently swallows every click.

It makes the view a **corridor, not a lid**: the press passes through this view, and each
child still answers for itself. A child carrying a handler keeps taking its own presses,
and a child may state `"auto"` outright — which is what lets a chrome overlay hold a real
panel (the Inspector's own window is exactly that) while the rest of it stays transparent.
So `"none"` on a container is not a way to disable a subtree; put it where the decoration
is, or gate the handlers.

## viewAt()
The tree answers **what is under a root-space point** — the deepest visible view,
by the same scroll-aware, clip-aware, transform-aware walk that routes the pointer
itself, so what a handler computes and what a press would hit can never disagree.
This is the language's hit-testing: never measure geometry by hand, ask.
Its defining use is **drag and drop** — the dragger asks, one reactive slot fans
out, every target derives:

```declare-fragment
// on the dragger
onPointerMove(e: PointerEvent) { app.dropTarget = app.viewAt(e.x, e.y) },
onPointerUp(e: PointerUpEvent) { if (!e.canceled && app.dropTarget != null) app.dropTarget.accept(this) },
// on each target — no handlers, just a standing relationship
hot = { app.dropTarget == this }
```

The answer is the *deepest* view; when the dragger needs "the card, not its
label," walk `.parent` up to the view carrying the marker attribute it declared.
Coordinates are root-space — exactly what `onPointerMove`/`onPointerUp` carry.
Because the walk is the honest one, the **drag ghost counts**: give it — and any
container it sits in — `pointerEvents = "none"`, or it is the answer. A sizeless
container around a pointer-following ghost auto-extends *with* the pointer, so it
becomes an invisible box over the very targets being dragged onto;
`explainHit(x, y)` names what really takes the press. The full pattern is the
guide's Interaction chapter ("Finding what is under the pointer").

## containsPoint()
One view's own membership test — `v.containsPoint(x, y)` asks whether the
root-space point lands in `v`, by the same honest walk `viewAt` runs (clip
shapes, scale, rotation, scroll and `pointerEvents` all count). Reach for it
when you already hold the candidate; reach for `viewAt` when you are asking
the whole tree.

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

## travelWith()
Re-hosts this view's surface inside `scroller`'s scrolling content, so the **platform**
carries the two together with no per-scroll re-derive — and returns `false` on a backend
that cannot. The view tree does not move: hit testing and layout see nothing change, only
the surface is re-homed. This is a specialist tool for chrome that must track scrolled
content exactly (the focus ring following a control inside a pane); pass `null` to return
it to the root.

## $setData()
Writes a value at a path relative to this view's cursor — **the write half of `$data`**,
and how a replicated row edits its own record without knowing where in the dataset it
sits. The write wakes exactly the bindings that read the changed region, so a grid cell
committing an edit re-derives everything downstream and nothing else.

## createView()
Instantiates a component **by tag name** into this view — the receiver is the parent, and
with it the new instance's scope and data anchor. Returns the created view, a full
citizen: bindings installed, `onInit` fired, and the parent's arrangement and auto-size
take it in on arrival. The imperative door, for structure that genuinely cannot be
declared; reach for replication over a datapath first — it reconciles, keys, and tears
down for you.

**The build drops components nothing statically references**, so a component you only
ever name as a *string* needs `use [ Name ]` at the top level to survive. That is the one
non-obvious requirement, and forgetting it fails at runtime, not compile time. The
returned view is yours: `discard()` it when done.

```declare-fragment
use [ Menu ]
…
onInit() { this.list = app.createView("Menu", ({ })) }
```

The library builds its own overlays exactly this way — a `Menu` cannot declare a `Menu`
child without recursing, so the cascade is created by name at first use (parented to the
`app` root plane, which is why the receiver there is `app` itself).

## insertChild()
Inserts a view you already hold as a child at `index` — the placement primitive beneath
`createView`. Prefer replication over data for collections; this is for genuinely
imperative structure. A primitive, not a verb: it does not notify the arrangement — after
imperative re-ordering, the layout re-packs on the next arrival or removal.

## removeChild()
Detaches a child from this view. The child is **not** torn down — use `discard()` for
that; a removed view you keep a reference to can be inserted somewhere else.

## discard()
Tears a view down for good, in one verb: unlinks it from its parent, retires its whole
subtree (constraints unwired, surfaces dropped, `onRetire` fired while everything is
still alive), and re-packs what it leaves behind — the parent's arrangement closes the
gap and its auto-size shrinks. **The pair of `createView`** — a view you built
imperatively is yours to destroy, while a replicated instance is the runtime's and
leaves when its record does.

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

## scrollStartX
The horizontal offset a `scrolls` view **starts at** — applied once, at
first layout, the declared twin of a `scrollTo` on arrival and the other axis of
`scrollStartY`. The `scrollX` fact then reports where the platform actually put it. A
test fixture that must be shot mid-scroll declares this rather than gesturing.

## link
Makes this view a **link**: one reference string, the same one an authored
Markdown href carries. `"#why"` names a destination or an anchor in this app, an absolute
URL leaves it. The view realizes a real `<a href>`, so ⌘-click, copy-link and the build's
crawler all work, and every literal reference is checked at build against the registry — a
typo is a compile error naming the real names. `link = ""` is not a link at all, which is
how a row turns its own linkage off. A data-driven reference (`link = { :to }`) is checked
when the crawl evaluates it.

## replace
Beside a `link`, **overwrites** the current history entry instead of pushing a
new one. For fine-grained movement inside one place — a deck's arrows, a wizard's steps —
where every step pushing an entry would bury the Back button under motion the reader does
not think of as navigation.

## shows
Declares that this view **manifests a location**: when the app's location names
this string, the view is shown, and the visibility comes with it — there is no second
`visible` to keep in step. It is also what puts the name in the compiler's registry, so a
link to it is checked at build and the crawler knows to visit it. Two views may declare the
same name and choose between themselves on a condition, which is how a signed-out reader
gets the sign-in screen at the same address.
