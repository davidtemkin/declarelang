# Drag as a resolved gesture — a proposal

**Status: PROPOSAL, 2026-11-08, for the user's consideration. Nothing built.** The user's
direction: "The resolved event sounds like the right path. But truthfully this is pretty
subtle and I would prefer a design note — and some consideration time."

## 1. The bug that raised it

`View.onPointerMove`'s reference says "the pointer moved over the view — and, once pressed on
it, every move while captured". The runtime delivers it only during a press
(`runtime/src/input.ts`, the move path returns while nothing is held). The 7GUIs run's Circle
Drawer tracked hover with `onPointerMove` and never selected a circle (hidden check
`circles_select`, `evals/reports/2026-11-08-7guis-run1/`). Every one of the corpus's uses treats
the event as "moves of a press" — the reference sentence is the outlier, and the name invites
what it describes.

## 2. What `onPointerMove` is today

Declaring it is how a view says *I drag* (`view.ts`, `drags = typeof self.onPointerMove ===
"function"`), and the runtime hangs drag behaviour on that fact:

- **the claim** (`wantsDrag`): on touch, a finger on the view is the view's drag, not the page's
  scroll (gestures.md: "declaring the handler is the claim"); with `onHold`, the claim moves to
  the press-and-hold;
- **capture**: moves and the release keep coming outside the view until release;
- **the home freeze** (`$pressHome`, `$freezeHome`): the view's place is held for the drag;
- **autoscroll** (`dragMoved`): near a scroller's edge the scroller moves and the move is heard
  again each frame;
- **the payload**: `deltaX`/`deltaY` since the press, `rootX`/`rootY`, and `onPointerUp` carries
  `canceled` when a touch drag is taken back.

So a raw-layer name carries a resolved gesture's semantics. The guide's own model says
otherwise: raw (`onPointerDown/Move/Up`) is *what the pointer did*; resolved (`onClick`,
`onDblClick`, `onHold`) is *what the person meant*, judged over the whole gesture. A drag is a
resolved gesture — the click's mirror: a press that wandered instead of one that stayed.

## 3. The proposal

### Resolved: `onDragStart`, `onDrag`, `onDragEnd`

- **`onDragStart(e)`** — the press has wandered past the click slop (about 4 px for a mouse,
  10 for a finger — the same threshold that makes it *not* a click). `e.x/e.y` the press point.
- **`onDrag(e)`** — each move after that, captured; `deltaX`/`deltaY` since the press,
  `rootX`/`rootY`. Autoscroll and the home freeze belong here.
- **`onDragEnd(e)`** — release, or `e.canceled` when the platform took the gesture back.
- **Declaring any of the three is the drag claim** (gestures.md's rule, unchanged in spirit).
- A press that never wanders is a click and fires `onClick`; one that wanders fires the drag and
  no click — today's arbitration, now symmetric and written in the names. The guide's "keep a
  small threshold of your own so a sloppy tap doesn't wiggle the view" disappears: `onDrag`
  never fires inside the slop.

### Raw: `onPointerMove` reports every move

Hover included, as the browser's own `pointermove`. The payload gains **`pressed: boolean`**.
With a press, moves are captured as now. Declaring `onPointerMove` *alone* claims nothing — a
hover tracker never blocks a phone's scroll.

### The open choice: how a raw press-tracker claims

Some manipulation wants every move from the press itself, with no slop: drawing, a slider thumb,
a splitter grabbed exactly. Those stay raw (`onPointerDown` + `onPointerMove` + `onPointerUp`) and
still need the touch claim. Two ways, both keeping "the handler is the policy":

- **(a) The pair is the claim.** `onPointerDown` and `onPointerMove` declared together claim the
  press, as `onPointerMove` alone does today; `onPointerMove` alone (hover) claims nothing. Most
  existing drags already declare the pair (the guide's pattern), so their claim is unchanged.
  Cost: hover moves now reach those views too, so a press-tracker reads `e.pressed` — or the
  runtime withholds hover moves from a view that declares `onPointerDown` (simpler for authors,
  one more rule to know).
- **(b) Only the resolved events claim; raw never does.** Cleanest model; drawing on a phone then
  needs `onDrag` (accepting the slop) or a claim attribute — which gestures.md rules out.

Leaning (a), with hover moves withheld from a view that declares `onPointerDown` — to be decided.

## 4. What it touches

**Corpus — 21 files declare `onPointerMove`** (each to be read and placed, not renamed blindly):
apps — calendar, desktop, lzx-calendar, lzx-dashboard (applets, chrome), todo; library —
carousel, datagrid (column resize), sheet, slider, splitter, switch, window, the inspector and
viewer apps; guide — chapters 07, 09, 10, 13, 17, 21. Real drags (a window, a sheet, a card, a
column edge, a carousel page) become `onDragStart/onDrag/onDragEnd`; trackers that must respond
from the press (slider and switch thumbs, possibly the splitter) stay raw under rule (a).

**Runtime:** gesture resolution in `input.ts` (drag start after slop; `pressed` on moves; hover
delivery), the claim flags in `backend.ts`/`dom-backend.ts`/`canvas-backend.ts`
(`wantsDrag` from the drag events, or the raw pair), the drag behaviours in `view.ts` moved under
the drag events, `drag-autoscroll.ts`. **Mac host:** it feeds the same router (`feedPointer`) —
check hover moves arrive there as on the web. **Checker and driver:** `drive.drag` and the swipe
paths assume today's semantics; the hidden drives use real input and should be unaffected.

**A silent change to guard:** a program written today whose drag is `onPointerMove` alone would,
on a phone, scroll instead of drag under the new rule, with no error. A migration warning:
`onPointerMove` that reads `deltaX`/`deltaY` without `onPointerDown` — "this reads like a drag:
`onDrag`". And a `## Breaking changes` entry with a `Find:` for it.

**Docs:** the guide's Raw and resolved events and Dragging sections, `declare.md` §8, the
reference entries for the six events and `PointerEvent.pressed`, gestures.md's realization table
and claim inventory (`claim-surface.md`).

## 5. Questions to settle

1. Claim rule (a) or (b); and under (a), deliver hover moves to a press-tracker or withhold them.
2. Whether `onDragStart` gets the press point or the point where the slop was crossed (both are
   needed by someone; the press point plus `deltaX` gives the other).
3. Whether a drag can be refused once started (a view that only drags along one axis already has
   `claimAxis` in the backend; is that a declaration?).
4. `onHold` + drag: today the hold moves the claim to press-and-hold (a reorder list's pick-up).
   Under the resolved events, `onHold` then `onDrag` should read the same way.
5. Timing: the release this lands in, and whether the corpus moves in the same change (the
   corpus-adoption rule: no change in behaviour or appearance, never harder to read).
