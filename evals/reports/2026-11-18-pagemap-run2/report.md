# Pagemap, run 2 — Declare, minimal

The second run of the Pagemap brief: the same exhaustive functional brief of a flatplan tool as
[run 1](../2026-11-17-pagemap-run1/report.md), against the same Firebase emulator suite, on a
local tree at `e349b316` with the day's uncommitted work (the 0.7.0 release plus the
Pagemap-upgrade fixes), `claude-opus-5-5`, level **minimal**, 18 November 2026.

The prompt asked for a build that compiles and starts, and nothing more: "do not drive it,
script it, take screenshots of it or look at it in a browser." So this run measures how far the
distribution carries an agent that only writes and compiles. Nothing it built was exercised,
by the agent or by a drive, and this report does not score behavior.

## 1. The comparison

| | Pagemap run 2 (minimal) | Pagemap run 1 (standard) |
|---|---|---|
| Time | 28.4 min (reading 5.3, writing 3.4, checking 19.7) | 61.2 min (reading 4.8, writing 5.6, checking 50.8) |
| Turns | 75 | 164 |
| Output tokens | 193,565 (thinking 47,502) | 271,367 (thinking 67,952) |
| Cache reads · writes | 20.2 M · 0.42 M | 64.2 M · 0.57 M |
| Cost (the stream's own figure) | $11.26 | $22.82 |
| Declare | 4,177 lines of code, in six files | 4,398 lines of code |
| TypeScript | 471 lines (`service.ts`) | 631 lines |
| Verify runs | 13, 0.57 min (median 2.4 s) | 54, 20.2 min (median 13.7 s) |
| Its checks | none (as asked) | 15 scripts |
| Source reads | `library/dialog.declare`, `library/themes/sanfrancisco.declare`, `compiler/src/compile-node.ts` | `library/sheet.declare` |

"Checking" here is almost all model time after shell commands (35 turns, 18.8 min): the agent
reasoning over its compile results, not waiting on tools (1.2 min of tool time in all).

Idiom counts (`idiom.py`):

| | Pagemap 2 | Pagemap 1 |
|---|---|---|
| lines over 150 characters | 131 | 128 |
| colour literals outside theme declarations | 51 | 76 |
| theme reads | 162 | 228 |
| States | 2 | 2 |
| visible switches | 8 | 17 |
| branches on width or phone | 11 | 39 |
| flexes | 29 | 25 |
| browser scripts · page lookups | 1 · 0 | 2 · 1 |

## 2. What it built

The same shape as run 1, a little smaller, in half the time: `model.declare` (the data's
shapes, the fourteen templates, and a flatplan class that works out folios, spreads, sides,
move groups, story fit and booking fit, and checks every edit against the brief's rules before
sending it, with undo and conflict handling), `map.declare` (pages that glide to their new
places when the order changes), `drag.declare`, `panels.declare` and `dialogs.declare` (sign-in,
the top bar, the side panel, the inspector, every dialog as a step in history), and
`pagemap.declare` (the App: the address grammar, selection, zoom, search and keys), over a
`service.ts` of Firebase glue.

At hand-over it passed `declare-verify` through R4 on the tree it was written for: no errors,
no warnings, and it booted to its sign-in screen in headless Chrome (1,361 nodes). It had
turned lint notes off (`defaultFlags [ lint = false ]`, 22 notes). Its own account names what
that leaves untested: every screen after sign-in, every write against the service's rules,
and the phone layout. It also names three places it knowingly falls short of the brief: PDF
pages shown as pictures (no selectable text), a reader address that records the page it was
opened from rather than the spread on screen, and a new-version notice that a development
build never shows.

## 3. Findings for the platform

### 3.1 Missed names got no hint

`names.py` lists six names the compile refused; none got a did-you-mean or a hint, and all six
were resolved within a minute:

- `Switch [ label = … ]` — Switch had no `label` then. 0.7.1 gives it one, the same name a
  `Checkbox` takes, so this miss is now the platform's own form.
- `accessibilityRole = form` — not a role. The message lists the roles, which is the answer.
- `f`, `form`, `tools`, `importBookings` — the agent's own names, referenced before or without
  being declared (a dialog's form object, a top bar's part, an App method). The message says
  to declare it or fix the name, which is all a compiler can say.

And one collision: an attribute of its own named `link`, which the platform holds.

### 3.2 A member meeting a script function

The run's diagnostics include DECLARE4045 once: a name both a member and a top-level script
binding, then a warning. Run 1 hit the same thing as a recursion at boot (its §3.2); 0.7.1 makes
it an error.

### 3.3 Source reads

Three: the library's `dialog.declare` and the San Francisco theme (looking up how a dialog and
the theme's tokens are spelled, which the reference covers), and `compiler/src/compile-node.ts`.
None stood in for a missing document in a way this run's logs make clear; the compiler read is
the one worth a look when a reference gap is next audited.

## 4. What this run says

At the minimal level the agent wrote a program of run 1's size and structure in under half the
time and half the cost, and it compiles and boots clean. What the level gives up is everything
after the first screen: run 1 spent most of its hour finding and fixing what its own checks
showed, and none of that happened here. As a measure of the distribution, the run says the
teaching carries an agent to a well-shaped, compiling program on its own; it says nothing
about whether that program works.

Not kept: the run's logs, its screenshots (none were taken), the Pagemap eval package and its
fixtures. Kept: the program (`app/`), the prompt, and the run's start record. Its timing is in
`evals/timings/2026-11-18-pagemap-run2.txt`.
