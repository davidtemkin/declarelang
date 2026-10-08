# Deferred DOM for hidden views

**Status:** designed 2026-10-08, not built. Agreed in principle with DT; the
exemptions and the test list below are the conditions for building it.

## The problem

A view with `visible = false` is a whole view: its attributes hold values, its
constraints run, its data is bound, its children exist. On the DOM renderer it is
also a whole DOM subtree, kept under `display: none`. Programs hide a great deal
this way — a loading placeholder, a panel that opens later, the header and composer
of a pane with nothing selected, the variant of a row that its record is not — and
every one of those subtrees is DOM the browser holds and styles.

Measured on the Murmur 8 eval app (1440×900, at rest): 370 elements, **229 of them
hidden**, under 44 `display: none` roots. The Svelte build of the same app holds 95
elements in all, 2 hidden: `{#if}` creates nothing for a branch not taken. Every row
a list builds pays for its own hidden parts as well, so the cost reaches the time to
open a conversation, not only the page at rest.

## The design

**A view hidden since it was created gets no DOM until it is first shown.**

- The view is built in full, as now: attributes, constraints, data, children. Only
  the DOM renderer's elements for it are deferred.
- Deferral lives **inside the DOM surface**. The view keeps its surface object
  (`$surface` is not null); the surface creates its elements on first show and pushes
  the view's current state into them — the flush it already performs at attach.
  (Skipping the surface instead would break the image loader, which ignores a load
  whose view has no surface: `image.ts`.)
- On first show the elements are inserted in sibling order, before the next sibling
  that has elements (siblings may be deferred too).
- **Once shown, kept.** Hiding again is `display: none`, as now — the same rule as
  a virtualized list's rows.
- `visible` keeps its meaning exactly: not drawn, not hit, not focusable, not counted
  in the parent's extent. `opacity = 0` is a different thing — visible, laid out,
  hittable — and is not deferred.
- `exists` remains the author's tool for not building a view at all.

## Why it is a renderer change, not a language change

The program is the view tree; the renderer reflects it. Hit testing walks the view
tree (`hit-walk.ts`, which already skips hidden views), focus order is the tree's,
`location` and `waypoint` are program state, constraints and bindings live on views.
The canvas renderer and the Mac host already run every program with **no per-view
DOM at all** — so nothing in the language can depend on a hidden view having
elements. What can change is confined to the places where the DOM renderer reports
a fact back into the program:

| Channel | Hidden today | Deferred |
|---|---|---|
| Image natural size | the view's own detached `<img>` | unchanged, because the surface object exists |
| Media `duration`, playback | the element belongs to the view; hidden audio plays | unchanged — the media element is not the view's DOM |
| Rich text height (`HTMLText`, `Markdown`) | measured by DOM flow (`dom-rich.ts`) | **exempt** until measured in an offscreen host (check what a hidden rich text measures today — likely 0) |
| `onScreen`, `visibleRect`, `apparentScale` | report off | unchanged |
| Embedded programs (`AppIsland`, `DOMIsland`) | mounted and running; `exposes` readable | **exempt** — always materialized |
| Drawings | raster owed until shown | unchanged |
| Native scroll offset | `scrollY` held on the view | applied when the elements are created, after their content |
| Text field contents | held on the view | flushed at creation |

## What changes for a reader

- **Cost moves from boot to first show.** A menu or sheet opens a little slower the
  first time. If that is felt, small deferred subtrees can be materialized at idle,
  giving back part of the saving.
- **A script that looks in the DOM for hidden content finds nothing.** The supported
  route — `find`, `inspect` — reads the view tree and is unaffected. Find-in-page and
  accessibility already ignore `display: none` content; static extraction reads the
  view tree.

## Tests that would prove it

- hit testing around a hidden view and an `opacity = 0` view;
- `focus()` on a never-shown view does not throw;
- `location` and back/forward to a page never shown;
- `scrollY` set on a never-shown scroller lands on first show;
- a hidden image's natural size feeds a constraint;
- audio plays in a hidden view;
- rich text height while hidden (and the exemption holds);
- an `AppIsland` hidden at boot runs and its `exposes` values read;
- a deferred view lands in sibling order when its siblings are deferred too;
- DOM and canvas renderers produce the same picture (the parity suites).

Then re-measure the four-way Murmur table (`my-apps/sweep/compare-murmur.mjs`).
