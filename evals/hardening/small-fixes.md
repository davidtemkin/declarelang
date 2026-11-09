# Small fixes after stage 0, round 1

Every docs item's behaviour was established by a small program before a word was written
(nine of them in one pass, 2026-11-09).

## Fixed

| Item | Kind | What was done | Commit |
|---|---|---|---|
| A view reached through an unnameable argument went stale, verify clean | compiler | tracked at run time when the parameter may hold a view; a local's name is no path | 76f36c1b |
| `__declare.stale()` | tool | the stale check; random driving of 34 corpus apps and 7GUIs found no stale value | 453391e7 |
| The tracker overflowed the stack with 1M issues grouped | app | rows pushed one at a time | 453391e7 |
| A press that follows a link out of the program | tool | says the page left the program | 453391e7 |
| `--semantics` printed headings as text | tool | a Text with a role reads as that role | 0601366d |
| `__declare.evaluate(expr)` with one argument crashed | tool | evaluated at the App | 〃 |
| `padding = [32, app.gutter, …]` said "expected ']'" | compiler message | says to brace the list | 〃 |
| `focusRingColor` missing from theme tokens | help | the token scan follows a local holding the theme | 〃 |
| `declare-help accessibility` left out View's attributes; a namespace member split at its own `;` | help | listed; split at the top level only | 〃 |
| "N of M constraints statically wired" unexplained | tool | says the rest need nothing | 〃 |
| Media seeks lost under verify | tool | verify's host answers byte ranges (the runtime was right) | ead5338b |
| Tab never reaches `onKeyDown` | docs | reference: Tab and Shift-Tab move focus, from every view | 〃 |
| `onPointerOut` on entering a child | docs | reference: over/out are the topmost view's; read `hovered` for a region | 〃 |
| `e.x` under a scaled ancestor | docs | reference: the view's own units | 〃 |
| `draw()` clipping, `fillText` baseline and wrapping | docs | reference: not clipped (`clip = true` clips), baseline, never wraps | 〃 |
| `Dataset.set` and a held record | docs | reference: the write lands in place | 〃 |
| `Focus.focus` and scrolling | docs | reference: scrolls its target into view | 〃 |
| A disabled control and presses | docs | reference: it still covers what is beneath | 〃 |
| `exists` while its condition goes on holding | docs | guide 04: the view and its state stay | 〃 |

## Reclassified on a closer look

- **TweenLayout box without `h`**: not a bug. Its reference says its boxes are whole and a
  box without `h` gives no height; the agent missed it.
- **`declare-help Sheet` not saying content scrolls**: the full answer (`--all`) says it;
  the short form shows the first sentence by design.
- **`lineHeight` read as pixels from `declare-help Text`**: the member's entry says
  multiplier; the short listing shows types only. Giving units there is a format change for
  every class, not a small fix.

## Waiting for a ruling

- **A focused Slider loses its arrow keys to an App plain-key shortcut.** Which should win
  when a focused control and an App shortcut use the same key.
- **`onPointerMove` documented as hover**, delivered only while pressed. Tied to
  `docs/system-design/drag.md`; the docs could be corrected to today's behaviour now.

## Left for later (bigger)

Hover and full-page capture in declare-look; `drive.read`; right-click in the driver;
faster waits for live data in declare-look; the eleven platform bugs of unknown status
(mostly one-off layout cases with no snapshot kept).
