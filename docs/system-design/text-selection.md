# Text selection — where a drag may begin, and what a copy carries

**Status: OPEN, 2026-09-26.** Two items are recorded here to come back to: where a selection
may begin (§2, with the App as a surface in §3 and a homepage test plan in §4), and selection
on the Mac and canvas (§5). One item is ruled: an inline view contributes nothing to a copy
(§6). The model this builds on is the selection-edges ruling of 2026-08-06 (gestures.md) and
the claim inventory in claim-surface.md; nothing here changes either.

## 1. The model as it stands

`selectable` is a provided value. Set on a container, it does two things:

1. **The text inside becomes selectable.** The value reaches every Text and rich text
   beneath it. Anything that activates says `selectable = false` for itself — `Control`
   does (control.declare), as do `Menu` and `MenuBar` — so a label or a menu row never
   selects, even inside a selectable region.
2. **The container's box becomes a selection surface.** A press anywhere in it — the gap
   between two paragraphs, the padding, the space beside a short line — begins a text
   selection, anchored at the nearest text, as on a web page (`View.flush` →
   `setSelectableRegion`). Only a container that sets `selectable = true` itself is a
   surface; one that inherits the value is not.

Outside every surface the UI is painted: a mouse press that lands on no selectable text is
not a selection gesture, and the input layer keeps the browser from starting one (input.ts,
the selection anchor — listed in claim-surface.md, released by the `selectable`
declaration). A press on a view that declares a pointer handler is that view's, as a press
on a `<button>` is in a browser.

## 2. What was seen, 2026-09-26

Headless Chrome, the dev server, drags scripted from a press point into the next paragraph:

| Page | Press | Result |
|---|---|---|
| architecture | inside one HTMLText paragraph, into the next | continuous; the copy keeps the paragraph break |
| architecture | the title (Text) into the lede (Text) | continuous highlight; the copy runs the two together ("…the hoodA Declare…") |
| architecture | 20px left of a paragraph | nothing |
| architecture | right of a line | nothing |
| homepage | inside the column, right of a short line | selects |
| homepage | 20px left of the column | nothing |

Architecture declares `selectable = true` on `page`, the 680px column
(architecture.declare), so its gutter belongs to the App and is painted UI — the model
working as declared. The homepage's surface is its body column, x = 40–1160. With the input
veto bypassed and `user-select` forced on, Chrome anchored every one of these presses
correctly, so nothing in the DOM's absolute positioning stands in the way.

The Text → Text copy that loses its break is a separate defect: two text leaves are two
blocks to a reader, and a copy should say so. Inside one rich text the DOM flow copies as a page
does: paragraphs a blank line apart, a tight list one item per line (markers are not copied), a
table a row per line with its cells tab-separated.

## 3. The App as the surface

`App [ selectable = true ]` compiles today and needs no new rule: the App is a View, so it
provides the value and is a surface like any other container. The program then behaves as a
document — a drag from any background begins a selection, all text selects except what says
otherwise, and on iOS a long-press on a gap offers selection (what the selection-edges
ruling removed as a default; here the program asks for it).

That suits article-shaped programs: the homepage, architecture, perhaps the docs reader. It
does not suit app-shaped ones, which are Declare's main use — so it is set per program, not
made the App's default (DT, 2026-09-26: "the wrong default given the main use case").

## 4. To test on the homepage

With `selectable = true` on the homepage App (or its outermost view), drag in Chrome and
WebKit, and on the iOS simulator for the long-press cases:

- from the left and right gutters into a paragraph, and out of a paragraph into a gutter;
- from the gap between two sections, across a figure, into the next section;
- starting on a control (nav link, button, chip) — must not select, and must still activate;
- starting on a window-drag or other declared drag — the drag wins;
- a long-press on background and on a gap (iOS) — offers selection, and a pan starting
  there still scrolls;
- a select-all and a copy — reading order, breaks between blocks, no control labels.

## 5. The Mac and canvas

The semantics are renderer-neutral: the region is the declared surface's box; order is
reading order in the tree; a press anchors at the nearest text position; a copy is the text
of the selectable leaves in order, a break between blocks. The DOM gets all of it from the
browser. Elsewhere:

- **Mac.** A selectable rich flow is a real NSTextView, so selection works within one flow.
  AppKit cannot carry one selection across separate text views, so a sweep across two
  paragraphs that are two views, across Text leaves, or from a gap, does not exist. (Plain
  Text selection on the Mac is unverified.)
- **Canvas.** No selection of static text; only editable fields get an overlay.

Both need a runtime selection engine that implements the semantics above: hit-testing and
painting from the shared line layout (measure.ts — one breaker, one ellipsis rule, the same
on all three renderers since 2026-09-26), and assembling the copy itself.

## 6. Inline views contribute nothing to a copy — RULED 2026-09-26

A view placed in a line of rich text (an inline view) is a view, not text: a selection
passes over it and a copy carries nothing for it. That is the browser's own norm for
non-text inline content, measured in Chrome (select-all of a paragraph "A · B"):

| Inline content | Copied |
|---|---|
| `<button>Docs</button>` | "A Docs B" — text content copies |
| a styled inline-block span | "A docs B" |
| the same span with `user-select: none` | "A  B" |
| `<img alt>`, `<svg><title>`, a checkbox, a text input | "A  B" |
| an empty placeholder with its label absolutely positioned elsewhere | "A  B\n\ndocs" — the label lands at the end |

The last row is the DOM shape of an inline view (a placeholder in the line, the view laid
over it), so the rule is enforced rather than assumed — or a selectable Text inside one would
be copied out of order. BUILT 2026-09-26: the rich text provides `selectable = false` to each
inline view it makes, the same provision a `Control` makes for itself, so nothing in an inline
view's subtree selects whatever the page provides. The ordering problem still reaches assistive
technology, which reads the views after the paragraph.
