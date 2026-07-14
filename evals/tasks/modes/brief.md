# Task: a segmented settings panel

Build a settings card with a segmented control that switches between three panes.

## What's on screen

- A **card** centered-ish on the page: a rounded panel on a raised surface.
- Near the top of the card, a **segmented control** — one horizontal strip holding
  three equal segments labeled **General**, **Privacy**, and **Advanced**.
- A **sliding indicator** (a pill or underline) that sits behind/under the currently
  selected segment.
- Below the segments, a **content area** showing a line of text for the selected pane
  — the text names the pane (e.g. it contains the word *General*, *Privacy*, or
  *Advanced* respectively).

## Behavior

- Exactly **one** segment is selected at a time; **General** is selected at start.
- **Clicking a segment selects it:** its label becomes emphasized (full-strength text
  vs. dimmed for the others), the content area swaps to that pane's text, and the
  **indicator glides** to sit behind the newly selected segment — an animated slide,
  not an instant jump.
- The indicator settles smoothly (spring-like motion is ideal); after it settles it is
  positioned behind the active segment.

Use the ambient light/neutral palette. Exact pixels and easing are not important; what
matters is the exclusive selection, the content swap, and the indicator that *moves*
(animates) to the selected segment rather than teleporting.
