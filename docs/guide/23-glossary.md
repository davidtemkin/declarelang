<!-- nav: Glossary -->
<!-- part: Appendix -->

# Glossary — one word per idea

Declare gives ordinary words specific meanings, and uses one word per idea. This page is
that list: the term, what it means, and where the guide teaches it. When two words seem
to name the same thing, the one here is the one the platform means.

## The model

- **constraint** — a `{ }` value: a standing expression the runtime keeps true, re-evaluated
  when and only when what it reads changes. Every `{ }` in a value slot is one.
  → [Relationships](declare-docs:guide:relationships)
- **binding** — the two-way form only, `text <-> :title`, which both reads a place in data
  and writes it back. A one-way `{ }` is a constraint, not a binding.
- **settle** — the update transaction. A handler's writes are applied together when it
  returns: constraints re-derive, views appear and retire, layout places, sizes update, as
  one indivisible step run to completion. Nothing paints in the middle of one. (A spring is
  also said to settle by physics, in the everyday sense; the fact it sets when it does is
  **arrived**.)
  → [Relationships](declare-docs:guide:relationships)
- **cell** — the reactive storage behind a set attribute. A set attribute (`width = { … }`)
  owns a cell and refuses a direct write; a declared attribute with a computed default
  (`n: number = { … }`) is a formula with no cell, and an assignment replaces it.
- **fact** — a value the runtime writes and a program only reads: `hovered`, `scrollY`,
  `contentWidth`, `arrived`. Assigning one is a compile error; the fact follows the thing it
  reports on.
- **slot** — an attribute considered as a place a value lives, whichever way it was set.
- **provided value** — a value an ancestor makes available to its subtree, read with
  `provided("name")` and provided by simply being set on a node. The text face and the theme
  work this way. → [Style](declare-docs:guide:style)
- **theme** — the token record a program provides once: every color and metric the library
  reads by name. A **preset** is a library theme (`SanFrancisco`, `Cupertino`, `MountainView`,
  `Redmond`, each with a `…Dark`); the **house look** is what renders when nothing provides
  one.
- **style bundle** — a top-level `style Name [ … ]`: a named record of literal text attributes
  that a run of text with no view of its own can wear.
- **text face** — the five provided text attributes as a group: `fontFamily`, `fontSize`,
  `fontWeight`, `textColor`, `letterSpacing`. Distinct from a **`Face`**, which is one file
  of a `Font`.

## The tree

- **member** — anything declared inside a `[ ]`: an attribute set or declared, a method, a
  handler, a child. Inside a `Table`, the word also names what a selection holds — the
  record for a replicated row, the view itself for a written one.
- **written** — a child authored by hand in the tree, as opposed to **replicated**.
- **replication** — one instance per record, produced by a `datapath` ending in `[]`. The
  replacement for generating children from code. → [Data](declare-docs:guide:data)
- **datapath / cursor** — the place in bound data a view and its descendants read relative
  to. The view's `datapath` sets it; a `:path` reads through it.
- **record** — the datum at a cursor.
- **classroot** — the component instance itself, reachable from any depth inside a `class`
  body. → [The tree](declare-docs:guide:tree)
- **retire** — a view's presence ending: it leaves the tree, its machinery is torn down, and
  `onRetire` fires once. Dematerialization under `virtualize` is not a retirement.
- **virtualize** — build only the instances near the viewport and leave the rest logical.
  A **materialized** row exists as a view; an unmaterialized one is still a member of the
  data. → [Scale](declare-docs:guide:scale)
- **inline view** — a real view placed in flowing rich text by a tag naming one of the
  program's own view classes. The view owns its size; the flow owns its position; a run of
  text styled by name is not one. → [Style](declare-docs:guide:style)
- **island** — a leaf view whose interior is foreign: a `DOMIsland` holds host-managed DOM,
  an `AppIsland` holds another Declare program (the **tenant**). The **island bridge** is
  the typed handshake between host and tenant: `external` attributes, `post`, `onPost`.
  → [Embedding](declare-docs:guide:embedding)

## Space and motion

- **extent** — the bounding box of a view's visible children, which an unset width or
  height auto-sizes to. `contentWidth` and `contentHeight` surface it.
- **bounds / footprint** — a view's transformed box in its parent's coordinates, and that
  box minus the position. What a layout packs.
- **one-geometry rule** — paint, hit-testing, auto-size and layout all read the same
  transformed geometry, so a scaled or rotated view is the same size to every reader.
- **scroller** — the view whose `scrolls` axis carries its content. For an `App` the
  scroller is the page itself; `ignoreScroll` pins a child against its nearest scroller.
- **arrived** — the fact that an animator or spring reached its destination on its own.
  Its pair is **running**, true while the journey is in flight.
- **glide** — a requested scroll that moves over a duration on the platform's own motion.

## Input

- **raw and resolved** — the two pointer layers. Raw handlers (`onPointerDown`, `Move`,
  `Up`, the touch family, `onWheel`) report what the pointer physically did, for
  manipulation. Resolved handlers (`onClick`, `onDblClick`, `onHold`) report what the user
  meant, for commands. → [Interaction](declare-docs:guide:interaction)
- **claim** — what declaring a handler takes from the browser: exactly the gesture that
  handler needs, and nothing more. A drag declares `claim = x` to say which axis it owns.
  → [Gestures](declare-docs:guide:gestures)
- **hit walk** — the one scroll-aware, clip-aware, transform-aware walk that routes the
  pointer and answers `viewAt`, so what a handler computes and what a press hits never
  disagree.
- **capture** — a press that began on a view stays that view's until release.
- **focus-visible** — focused, and the focus arrived by keyboard. What a focus ring shows
  for; a pointer press clears it.
- **rove** — the keyboard highlight that moves over a menu's rows or a control's segments
  without moving focus.

## Location

- **location** — the app's slice of the URL, as one two-way reactive string: its shareable
  coordinates. → [Location](declare-docs:guide:location)
- **waypoint** — location's twin with the opposite visibility: the step the Back button
  retraces and the URL never shows.
- **reference** — the one string every navigation reduces to, whether from a `link`, a
  prose href, a pasted URL or Back.
- **arrival** — a navigation landing: the reference resolved to the view it names, once
  that view exists. A **traversal** is the same landing reached by Back or Forward, which
  restores the waypoint too. (A spring landing is **arrived**, a fact; data landing is
  **loaded**.)
- **anchor** — a named place inside a location that an `@name` suffix scrolls to. In a
  table, the word also names where a shift-selected range extends from; the two uses never
  meet.
- **registry** — the compiler's table of every declared destination and anchor, against
  which every literal reference is checked at build.

## The library

- **value pattern** — a control's value is one attribute, and `input` owns where an edit
  goes. The control's own gestures deliver through `input` and never write the slot, so a
  bound control never fights its constraint. → [Controls](declare-docs:guide:controls)
- **delivery seam** — the overridable method a component hands a result through instead of
  writing state: `input`, `picked`, `sortInput`. Override it at the use site.
- **records, not children** — what a component arranges, it takes as data: a menu's items,
  a dialog's buttons, a segmented control's choices. The author never composes those rows.
- **light-dismiss** — an overlay closes on a press outside it, and that press is swallowed.
- **backdrop** — the full-app layer under a menu that catches the outside press. A
  dialog's equivalent is its **scrim**, which swallows the press without dismissing.
- **cascade** — a submenu chain; the root owns the backdrop, the delivery and Escape.
- **opener** — the view a menu was opened for. Read it in the menu's `items` to vary the
  rows per opener, so one declared menu serves many places.
- **the ladder** — a control's ordered, first-match-wins list of fill states: `control`,
  `controlHover`, `controlPressed`, `controlSelected`. Data has a ladder too: how a
  record's identity is inferred, `id` first, then the object itself.
- **declared baseline** — a composite states which part carries its baseline. A laid child
  that declares none is refused by name under `align = baseline`; a baseline is claimed,
  never guessed from a box.
- **cap band** — the ink from cap-top to baseline, which `y = center` on a label centers
  optically.
- **lane** — a segmented control's pill position as a sprung index rather than pixels, so a
  resize snaps instead of skating.
- **slack** — the room a flow leaves unfilled, absorbed by a `Spacer` or spread by
  `justify = fill`.
- **the 16-box** — the square every icon is authored in; `iconSize` scales it.

## The toolchain

- **checker** — the compile-time type checker that runs on every `{ }` body, every compile,
  with no opt-out.
- **runtime** — what keeps the program true while it runs. The **renderers** are its three
  paint substrates: DOM, canvas, and the native Mac host.
- **the crawl** — the build booting the program headless at every registered destination to
  emit its document, which is what makes a deep link indexable.
- **the settle chain** — the sequence of settles one change causes when a handler's step
  writes again; bounded, and reported if it does not converge.
