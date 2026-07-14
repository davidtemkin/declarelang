# Task: a responsive dashboard shell

Build the outer shell of a small analytics dashboard. No data, no interactivity —
just the frame, laid out so it holds together at any window size.

## What's on screen

- A **header bar** across the very top, spanning the full width of the window,
  about 56px tall, on a raised surface. Its title reads **Dashboard**, left-aligned,
  in a semibold heading.
- A row of **three cards** below the header — equal width, same height (about 120px),
  rounded corners, a subtle border, on the raised surface. Their labels, top-left,
  read **Visitors**, **Revenue**, and **Signups**.
- A **footer bar** across the very bottom, spanning the full width, about 40px tall,
  on the raised surface.

## Behavior

The layout is **responsive to the window width**:

- **Wide** (a roomy window): the three cards sit **side by side** in one row, evenly
  spaced, filling the width between comfortable side margins (~24px).
- **Narrow** (a small window, below roughly 640px wide): the three cards **stack
  vertically**, each spanning the full content width, one above the next.

The header and footer always span the full window width and stay pinned to the top
and bottom edges respectively, at every size.

Use comfortable spacing and the ambient light/neutral color palette (a page
background, a slightly raised surface for the bars and cards, readable text, a hairline
border). Exact pixels are not important; the structure, the pinning, and the
wide-vs-narrow reflow are.
