# Overlays, layering and the focus ring — design direction

*Drafted 2026-10-08 from a design conversation (David Temkin + Claude). It
revises `docs/system-design/planes.md` (layers, 2026-07-18) and builds on
`docs/system-design/focus-scopes.md` (2026-07-30). Implementation happens in
the plain-copy work tree `~/Code/declare-overlay`, with
`~/Code/declare-overlay-base` as the read-only baseline for a manual
three-way merge into main. No git in either.*

---

## 1. The cases a general solution has to cover

1. An overlay traps Tab order.
2. Tab reaches the subviews of an overlay — and of any view — with no
   developer contortions.
3. An overlay over an overlay: a dialog that opens a menu; a dialog that
   opens another dialog.
4. An overlay that sits above everything but takes no focus: a toast, a
   notification.
5. Windows whose stacking order changes at run time (`apps/desktop` does this
   today with no library support).
6. A view that changes stratum at run time: a minimized window must paint
   above the dock's plate while it is parked, and back among the windows
   when restored. Today it cannot, because nothing can change a view's layer.
7. A window that is transformed (the desktop's tilt and zoom eggs): its own
   menus should turn and scale with it; a system dialog it raises should not.
8. Hierarchical windowing: a window that acts as the "system" for windows
   inside it, including across programs (an `AppIsland` tenant).
9. Floating palettes and inspectors, as in native document apps: a stratum
   above the document windows and below modals, non-modal, that focus can
   enter and leave without trapping.

Constraint, ruled: **no numbered z-order.** Stacking stays implicit —
declaration order and paint order — as it is everywhere else in Declare.

## 2. Four concerns, kept apart

Every overlay API we know tangles four things. Kept separate, each case above
is a combination of small mechanisms instead of a special case.

| Concern | Question it answers |
|---|---|
| **Paint** | Where in the stacking order does it draw, and does it escape its ancestors' clips? |
| **Focus** | Where can focus go — the tab ring, trapping, restoring? |
| **Input** | What happens to presses and scrolling aimed at what is underneath? |
| **Ownership** | Who owns it, how long does it live, how does it close? |

A dialog sets all four; a menu sets all four with different values; a toast
sets only paint; desktop windows set paint and ownership and reorder at run
time; the parked window is purely a paint case.

## 3. Contexts

A **context** is what an operating system calls a screen or a window. It
carries everything the four concerns need:

- its **strata** (the overlay layers it offers its descendants),
- a **focus root** (the scope trap scopes trap within),
- a **modality boundary** ("inert beneath" applies within it),
- a **coordinate frame** (positions and transforms are measured in it).

The **App is the root context.** A library `Window` is a context. Ordinary
programs have only the App and see no change.

**The recursion property:** a context offers its children exactly the
interface the root offers. Then a window inside a window is a context inside
a context, with nothing special at the second level, and a program asks "my
context" without knowing whether that is the App, a window, or a host three
islands up. (Precedent: Plan 9's window system, rio, runs inside one of its
own windows because it serves its windows the interface it gets from the
screen. Also Smalltalk's Morphic, X11's nested windows — whose menus are the
instructive exception, placed at the root — and Windows MDI.)

## 4. Paint

### 4.1 Strata are views; order is declaration order

A context's strata are ordinary views declared in order, e.g. on the App:
`content`, `windows`, `dock`, `overlays`, `notice`. Their stacking is their
declaration order. The App has implicit defaults for the overlay strata
(as `planes.md` §1 has: floating, modal, notice), so ordinary programs
declare none.

### 4.2 `paintsIn` — paint parent separate from logical parent

```
paintsIn = { app.overlays }
```

A view's **logical parent** (where it is declared: whose state it reads, who
owns and discards it) and its **paint parent** (where it draws and is hit)
can differ. The default is the logical parent, so every existing program is
unchanged. The value is a **reference to a view**, never a number, and it is
reactive: changing stratum is an assignment.

The parked window:

```
paintsIn = { this.miniT > 0 ? app.dock.parked : app.wins }
```

where the dock declares `parked: View [ … ]` between its plate and its icons
(free windows < plate < parked windows < badges).

`planes.md` §12 (the parked-window note, 2026-09-23) reached the same
direction independently: "layer membership as a slot … a declared default,
the parent's layer". `travelWith`, which already re-hosts a surface on all
three backends, is an instance of it and is retired into it.

**The portal door.** `planes.md` §3 allowed only `Floating` subclasses to
paint outside their declaration site, so the reader is never misled about
where a box sits. An explicit `paintsIn` meets that concern better: the
deviation is written in the source, at the view. The door opens to this one
explicit, slot-valued spelling; `Floating` becomes a convenience over it.

### 4.3 Order within a stratum

- Tree order for things that are always there; **entry order** for things
  that come and go (a menu opened from a dialog lands above the dialog
  because it opened later — the browser's top layer works the same way).
- Explicit reordering is a verb (`raise()`) or data order (the desktop's
  window records, whose order is their paint order).

### 4.4 Coordinates and transforms

- A view's position is in its **paint host's frame** (what `travelWith`
  already does).
- **The rule for transforms: an overlay lives in the frame of the stratum it
  paints in, and its ownership decides which stratum that is.**
  - Something that belongs to a window — its menu, a popover, a sheet —
    paints in that window's own stratum: it turns and scales with the window,
    and escapes the window's *clip*.
  - Something that belongs to the app or the system — an app-modal dialog, a
    toast — paints in a root stratum, in screen space.
- **Finding the stratum is a provided-value lookup:** the App provides
  `overlays`; a `Window` provides its own; a `Menu` paints into
  `provided("overlays")` and lands in its window's with no code. A system
  dialog names the root explicitly.
- Precedents: Unity's UI canvases (Screen Space vs World Space — diegetic vs
  non-diegetic UI); macOS sheets (attached to and moving with their window)
  vs app-modal alerts (centered on screen); zoomable canvases (selection
  handles in canvas space, context menus in screen space). The web arrived at
  "overlays ignore transforms" by accident — portalling to `<body>` was the
  only way to escape clipping — not by design.

### 4.5 A real `Window`

The window does not clip itself; its content pane does, and the overlay
stratum is a sibling after the pane:

```
Window [ content: View [ clip = true, … ], overlays: … ]
```

A menu hanging past the window's edge is then a view in an unclipped part of
the window — no `ignoreClip`, nothing implicit. (Today the desktop's `Window`
clips itself and puts its resize halo outside with `ignoreClip`.)

## 5. Focus

From `focus-scopes.md`, which this adopts:

- **Tab order is a walk of the logical tree** (depth-first over focusable
  views, skipping invisible and inert ones), never paint order and never
  per-container bookkeeping. A class nested anywhere joins the order without
  doing anything — the answer to "tabbing into subviews without
  contortions", overlays or not.
- **Focus is a tree of scopes:**
  - `focusScope = stop` — one tab stop, arrows inside (Segmented,
    RadioGroup, menus, toolbars, browse lists). Closes the parked
    focus-and-selection follow-up (Segmented / RadioGroup one-stop).
  - `focusScope = capture` — Tab descends and walks the inner stops (entry
    grids, forms).
  - **Trap** (modal) — a scope Tab cannot leave. Opening it records where
    focus was; closing restores it. Traps form a stack, so dialog → dialog →
    menu unwinds correctly.
- **Esc goes up one level**, at every level.
- A trap traps **within its context**.

## 6. Input, modality and dismissal

- **Modality:** the topmost modal scope makes everything beneath it in paint
  order inert — to pointer and to focus — **within its context**. A dialog
  modal to the outer window makes that window inert, inner windows included;
  a sheet modal to an inner window leaves the outer one live.
- **Light dismiss** walks the same stack: a press outside the top
  dismissible scope closes it.
- **The notice stratum** (toasts) is exempt from inertness: it stays
  interactive above a modal, takes the pointer only over its own content,
  takes no focus, and announces politely to assistive technology.

### 6.1 Policy per kind, overridable

The web has no single convention (native menus swallow; Radix and Material
dropdowns block; the browser's popover API delivers). macOS distinguishes
**menus**, which are modal while open — they take all of the app's input,
scrolling included, and an outside press only closes them — from
**popovers**, which close on outside interaction while the app keeps working
(AppKit's "transient" popovers; the share sheet is one). Inferred from
AppKit's settings; to be confirmed by testing before it is cited as
precedent.

So the default is stated per kind of overlay, by each class, and overridable
at the instance as two ordinary attributes:

- `outsidePress`: `dismiss` (swallowed) · `dismissAndDeliver` · `block` · `ignore`
- `scrollBelow`: `block` · `allow` · `dismiss`

| Kind | outsidePress | scrollBelow |
|---|---|---|
| Menu, context menu | `dismiss` | `block` |
| Popover (share-style, picker, info) | `dismissAndDeliver` | `allow` (follows its anchor, or closes if the anchor leaves) |
| Dialog | `block` (closes by its own buttons or Esc) | `block` |
| Toast | `ignore` (passes through) | `allow` |
| Tooltip | `dismissAndDeliver` | `dismiss` |

This settles `planes.md` open ruling §12.1 and fills §12.5 (policy
attributes on layers).

## 7. Ownership and the library

Kept from `planes.md` §3–§4: the `Floating` contract — dormant when closed,
built into its stratum on open and torn down on close, live anchoring,
dismissal and focus policy defaulted per subclass, theme-token materials;
components that arrange things take records. The library classes (`Menu`,
`Dialog`, `Tooltip`, `Toast`, `Window`) become well-chosen defaults over the
primitives of §4–§6, not special cases in the runtime.

Today none of the layer system exists: `Menu`, `Dialog` and `Tooltip` are
App-level children that `raise()` themselves and lay a full-app press
catcher.

## 8. Islands and hierarchical windowing across programs

How tenants mount today (read 2026-10-08):

- **Canvas and Mac:** `mountEmbeddedApp` attaches the tenant's App to the
  **host's backend**, with the island's surface as its parent. The tenant's
  views are a subtree of the host's display tree; one hit walk; each surface
  carries its own app's input sink.
- **DOM:** each tenant gets its **own `DomBackend` instance**, rendering into
  the island's element (`overflow: auto` — the clip, and panning for a tenant
  that holds a minimum size). Each app's router owns the events inside its
  root element; the outer router stops at an embedded root
  (`data-declare-app`).

**Direction:** a small default protocol — the island provides the host's
strata; the tenant's "nearest stratum" lookup falls through its own root to
them, the way `hostProvided` already crosses for values. A tenant view stays
in the tenant's program (state, constraints, owner, lifetime) and paints in
the host's stratum, its coordinates mapped through the island's frame.

What it takes:

1. **Coordinates** — map the tenant view's frame into the stratum's through
   the island's transform chain (canvas and Mac).
2. **Input on the DOM** — routers must find an event's owning app from the
   element itself rather than its DOM ancestry; **or the DOM mounts tenants
   on the host's backend**, as canvas and Mac do. The second is the bigger
   decision and probably the better one ("a tenant is a subtree" everywhere).
   Its two DOM reasons to solve: `linkBase = ""` (a tenant's `#fragment`
   links must not become false native anchors) and panning an oversized
   tenant.
3. **Lifetime** — a host discarding its stratum, or the island unmounting,
   withdraws every foreign view painted there.
4. **Modality policy** — whether a tenant's modal dialog in the host's
   stratum also makes the host inert (modal to the island's window, or to the
   whole host). Stated by the protocol.

`DOMIsland` (foreign DOM, not views) stays outside this: there a cross-
boundary overlay is a **service** — the tenant asks with data, the host
builds and owns the dialog, the choice comes back (the island bridge's
`post` / exposed methods). Precedent: a web page cannot draw over the
browser's chrome and calls `alert()` or a file picker; a sandboxed Mac app's
open panel is drawn by a separate system process.

## 9. Differences from `planes.md`

1. **Layers belong to contexts, not to the App alone.** The App is the root
   context; a `Window` is one. A class still elects a layer kind; which
   instance it lands in is the nearest context's.
2. **The portal door opens to explicit `paintsIn`** for any view, default the
   parent. `Floating` and `travelWith` become instances of it. The FocusRing
   acceptance test (§12 of `planes.md`: the ring should need no special
   privilege) is met by it.
3. **Islands:** context lookup falls through to the host (§8), instead of
   each island App owning a layer tree clipped to its box.
4. **Coordinates:** in the paint host's frame; anchoring maps from the owner
   within its context.
5. **Dismissal and scroll policy** per kind, overridable (§6.1).

Kept: no numbers; order as a slot with `raise()`; layers as presentation,
not ownership ("one scope space, one reactive graph"); the `Floating`
contract; records for component-arranged content; input strata in the
router; layers absent from the crawled document.

## 10. The focus ring

The ring work follows the overlay work: four of its six problems rest on what
the overlay work defines. Its needs are written into the overlay design now,
as acceptance tests (§11), so the design does not box it in.

### 10.1 The problems

1. **Jitter during a host scroll.** The browser and the Mac scroll
   asynchronously; the ring is positioned by the runtime from geometry it
   hears about afterwards, so it is pulled along and snaps back.
2. **Animating inside a scrolling pane.** Two motions — the host's scroll
   and the ring's spring — combined in different frames of reference.
3. **A clip with no room for the ring.** The ring is drawn outside the
   control; a clipping ancestor cuts it off. Sharpest case: a scroller with
   nothing to scroll still clips (the tracker's filter chips: `scrolls = x,
   clip = true`, `height = 28`, everything fits — top and bottom of the ring
   cut off).
4. **Tab order.**
5. **Tabbing to something scrolled off** must scroll it into view.
6. **The ring's shape** must follow the focused view's corners (the docs
   search: the ring is a small-radius rectangle inside a capsule).

### 10.2 Root causes and rules

**Ride the scroll, never chase it (1, 2).** Anything that must stay attached
to scrolled content is composited by the host as part of that content. The
ring paints inside the focused view's **nearest scroller**, with its position
and spring target in that scroller's **content coordinates** — so a user
scroll moves it in the same frame as the control, and an animation never
fights a scroll. To design: handing the ring between scrollers in mid-flight;
the chain of nested scrollers (innermost hosts, outer ones carry it). This is
`paintsIn` with scrollers counted as paint hosts.

**Room at the clip (3).** Layout must not change. Options, combinable:

- **Expand the clip outward** (David's proposal): the clipping element grows
  outward by the ring's width, its content offset back so nothing moves; the
  margin band lets the pointer through to neighbours. Free of side effects on
  edges *across* the scroll direction. On edges *along* it, the shared clip
  would also show scrolled content a few pixels past the pane's edge.
- **Reveal with margin** on the edges along the scroll direction: scroll the
  focused control in by the ring's width. At the far end the scroll range can
  grow by that width without moving anything; at the start it cannot, and
  that one spot draws the ring inside the control.
- **Inset style** where nothing else gives room.
- On canvas and Mac the runtime composites, so it can clip the ring's layer
  more loosely than the content's; only the DOM forces one clip on both.
- **Probe:** CSS scroll-driven animations (`animation-timeline: scroll()`)
  move an element in step with a scroller on the browser's compositor. The
  ring could then live outside the scroller with its own expanded clip and
  still move in the same frame — removing problems 1 and 3 on the DOM at
  once. Safari support and nested-scroller behavior unverified.

**Focus makes itself visible (4, 5).** Tab order is §5. Revealing is the
inverse of jitter — the runtime asks the host to scroll: when focus moves,
each scroller from the innermost outwards scrolls the least amount that shows
the target with its ring, then the ring moves (in content coordinates, so the
two do not fight). **Contexts bound the chain:** focus in a dialog scrolls
the dialog's panes, not the page behind it. **Virtualized lists:** the list
is a `stop` scope; moving to a row reveals and builds it.

**The ring frames the focused view, with its shape (6).** It takes the
focused view's `cornerRadius`, four-corner form included, grown by the ring's
offset so the curves stay concentric. If the result looks wrong, the
structure is wrong: the thing a person sees as the control should be the
thing that takes focus. No "frame something else" mechanism.
**App fix:** the docs search and the desktop's Help search become a
`TextInput` that is itself the capsule (per-side padding leaves room for the
magnifier, which becomes a child of the field), not a wrapper around a
rectangular field. The desktop's comment justifying the wrapper ("padding is
one number") is out of date.

## 11. Acceptance tests

In `apps/desktop`, all real:

1. Minimized windows paint above the dock's plate (a change of `paintsIn`
   at the start of the minimize journey, and back on restore).
2. A window-local context menu (in a Files window) escapes the window's clip
   and turns with it under the tilt egg.
3. Dialog → menu, and dialog → second dialog: Tab stays inside the top
   scope; Esc pops one level; focus returns correctly at each step.
4. A toast above everything, taking no focus, still clickable while a modal
   is up.
5. Tab through a Files window's columns and rows with nothing written for it.
6. Later, canvas first: a hosted app raising a system dialog that paints in
   the desktop's root stratum.
6a. A palette window above the document windows: it stays above them as
   windows are raised, sits below a modal, and Tab can enter and leave it.

For the focus ring:

7. A user scroll never makes the ring jitter (browser and Mac).
8. The ring handed between two panes in mid-flight.
9. Tab revealing a scrolled-off control, including while a scroll is in
   progress.
10. Focus inside a dialog does not scroll the page behind it.
11. Tab into a virtualized list; arrows reveal and build rows.
12. The tracker's filter chips: the ring is not clipped.
13. The docs search: the ring is a capsule.

## 12. Open questions

1. **Declaration site.** Is an overlay declared where it is used
   (portal-style) or on the App? `paintsIn` allows both; which should the
   library teach?
2. **The DOM mount.** Route by element ownership, or mount tenants on the
   host's backend? (§8)
3. **Tenant modality** across the island (§8.4).
4. **Light dismiss and the crawl:** unchanged from `planes.md` — layers are
   absent from the crawled document.
5. **`opener` typing** (`planes.md` §12.3).
6. **The ring's clip policy** — which combination of §10.2's options is the
   default.
7. **Confirm the macOS popover behavior** before citing it.
