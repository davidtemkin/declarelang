# Task: blocks and shelves

Build a small board where labeled blocks sit on two shelves and can be dragged
between them.

## Seed data

Five blocks, each with a label, a numeric weight, and a home shelf:

| label | weight | shelf |
|---|---|---|
| alpha | 3 | left |
| beta | 2 | left |
| gamma | 1 | left |
| delta | 2 | right |
| epsilon | 2 | right |

## What's on screen

- Two **shelves** side by side — visually distinct panels, "Left" and "Right".
- On each shelf, its **blocks in a row**, left to right. A block's **width is
  proportional to its weight** (alpha renders three times as wide as gamma);
  heights are uniform. Each block shows its label.
- Under (or on) each shelf, a **total** — the sum of the weights currently on
  that shelf (initially 6 and 4). The totals update live.

## Behavior

- **Drag to move:** press a block and drag it over the other shelf; release, and
  the block now belongs to that shelf — it appears in that shelf's row, both
  totals update, and the rows close ranks. While the drag is live, **something
  visibly rides with the pointer** — the block itself or a labeled stand-in,
  your choice — so the user can see what they're carrying. While a drag is over
  a shelf, that shelf **highlights** so it's clear where the block would land;
  releasing anywhere that isn't a shelf leaves everything unchanged.
- **Select:** clicking a block selects it — the selected block **stands taller**
  than its neighbors (pick an amount that reads clearly). Selecting another
  block moves the tallness there. The growth and shrink should be **smooth, and
  interruptible** — clicking a different block mid-motion must redirect the
  motion from wherever it is, with no snap and no stutter.

Exact colors and spacing are yours; the proportional widths, the live totals,
the drag-to-move with its landing highlight, and the smooth interruptible
selection are the contract.
