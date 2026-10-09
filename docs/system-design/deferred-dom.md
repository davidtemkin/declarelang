# Deferred DOM for views not shown

**Status:** built (`runtime/src/deferred-surface.ts`, `view.ts` `$attach` /
`$materialize`); `test/deferred-dom.test.mjs`.

## The problem

A view with `visible = false` is a whole view: its attributes hold values, its
constraints run, its data is bound, its children exist. On the DOM renderer it was
also a whole DOM subtree, kept under `display: none`. Programs hide a great deal
this way — a loading placeholder, a panel that opens later, the header and composer
of a pane with nothing selected, the variant of a row that its record is not — and
every one of those subtrees was DOM the browser held and styles.

Measured on the Murmur 8 eval app (1440×900, at rest): 360 elements, 229 of them
hidden. The Svelte build of the same app holds about 120 elements: `{#if}` creates
nothing for a branch not taken.

## The design

**A view not shown gets no DOM until it is first shown.** The view is built in full
— attributes, constraints, data, children, the model's geometry and measurement —
and only the DOM renderer's elements wait.

- **The stand-in.** On a renderer that opts in (`RenderBackend.defersHidden`, the
  DOM's), such a view attaches to a `DeferredSurface`, and so does everything under
  it. Its required members drop what they are told (the view's own state is the
  record); its optional members are absent, so a capability query
  (`s.richMetrics?.()`, `s.setScroll?.(…)`) finds none — what a `display: none`
  element reports anyway. A few calls carry state no flush repeats — a list row's
  place (`setRowIndex`, `setRowCount`), a list's extent (`setVirtualExtent`), a
  scroll request (`scrollToY`, `scrollToX`): the stand-in keeps the latest of each.
- **Which views wait.** A view hidden when it attaches; everything under a stand-in;
  and a view attached **inside a settle**, whose own bindings — `visible` among them
  — install after it attaches (a replicated row): it waits, and the settle's close
  brings it in if it is shown by then, with the values the settle arrived at.
- **First shown** (`View.$materialize`): the view takes a real surface, flushes its
  current state into it as an attach does, goes in before the next sibling that has
  one, replays what the stand-in kept, re-applies a travel request, and brings in
  its shown children. Hidden children keep waiting.
- **Once shown, kept.** Hiding again is `display: none`, as before — the same rule as
  a virtualized list's rows.
- `visible` keeps its meaning exactly: not drawn, not hit, not focusable, not counted
  in the parent's extent. `opacity = 0` is a different thing — visible, laid out,
  hittable — and is not deferred. `exists` remains the author's tool for not building
  a view at all.

**Views that never wait** (`$eagerSurface`): rich text (`RichText`, `TextFlow` — the
renderer flows and measures it), editors (`TextInput` — the element holds what is
typed and the focus), islands (an embedded program runs and is read while hidden),
media (it plays, and reports its duration, while hidden). One of these attaching
under a stand-in brings its waiting ancestors in first. A **mask stencil** is read
by the renderer while hidden too: applying a mask brings its stencil in. A **travel
request** (`travelWith`) brings in both the rider and its scroller: its caller acts on
the answer at once, positioning in the scroller's content space or in root space.

## Why it is a renderer change, not a language change

The program is the view tree; the renderer reflects it. Hit testing walks the view
tree (`hit-walk.ts`, which skips hidden views), focus order is the tree's,
`location` and `waypoint` are program state, constraints and bindings live on views.
The canvas renderer and the Mac host run every program with **no per-view DOM at
all** — so nothing in the language can depend on a hidden view having elements.
What could change is confined to the places where the DOM renderer reports a fact
back into the program:

| Channel | Not shown |
|---|---|
| Image natural size | the load runs from the view; the bitmap is pushed when the view is first shown |
| Media `duration`, playback | media never waits |
| Rich text height | rich text never waits |
| `onScreen`, `visibleRect`, `apparentScale` | report off, as hidden |
| Embedded programs | islands never wait |
| Drawings | recorded and rasterized when first shown |
| Native scroll offset | the request is kept and replayed on first show |
| Text field contents | editors never wait |

## What changes for a reader

- **Cost moves from boot to first show.** A panel opens a little slower the first
  time it is shown; every view attached in a settle is realized once, with final
  values, instead of being written and rewritten as the settle converges.
- **A script that looks in the DOM for hidden content finds nothing.** The supported
  route — `find`, `inspect` — reads the view tree and is unaffected.

## Tests

`test/deferred-dom.test.mjs`: elements only for what is shown, in sibling order
among siblings still waiting; a row hidden by its own binding makes none; a scroll
offset given while never shown lands on first show; a hidden image's natural size
reaches the program and shown it paints; list rows carry their place; a hidden
stencil still masks; a field bringing in hidden ancestors places every element
once; focus and hits on a never-shown view. The DOM/canvas parity suites and a
screenshot comparison of every app before and after hold the picture unchanged.
