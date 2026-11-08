# 7GUIs run 1: Opus 5.5, Declare, at 85e613f9 — and against six published implementations

**15.0 min, 105 turns: all seven tasks in one program, 788 lines of Declare across 8 files
plus a 221-line formula language in TypeScript. Hidden checks: 6 of 8 scenarios (one app
failure, one accessibility failure). An independent reading against six published 7GUIs
implementations — on 7GUIs' own cognitive dimensions — finds Declare's the only one meeting
all seven tasks.** No React run: 7GUIs already has many (the user's call).

The brief (`evals/apps/7guis/brief.md`) restates Eugen Kiss's seven tasks, filling in what
the originals leave open (the date format, CRUD's starting people, a small formula language
for Cells). Each task's code is kept apart, so each compares with the published versions.

## Figures

| | Declare 1 |
|---|---|
| time | 15.0 min, 105 turns (reading 4.7 · writing 2.7 · checking 7.6 min) |
| model · tools | 11.4 · 3.6 min |
| output tokens (thinking) | 72.3k (26.8k) |
| code | 788 non-blank lines of Declare (counter 24, temperature 53, flight 93, timer 38, crud 113, circles 188, cells 274, host 102 before formatting) + `formula.ts` |
| its own checks | an assert script, 22 assertions (CRUD, Circle Drawer's right-click), and looks |
| hidden checks | 6 / 8 |

## The hidden checks

`evals/apps/7guis/drive.mjs`, by role and name, real pointer and keyboard, every behaviour in
the brief; per-task results in `drive/`. Counter, Temperature, Flight Booker, Timer, CRUD and
Circle Drawer's history pass (the timer tracks real time, follows the slider mid-drag, stops
full, resumes when raised; Flight Booker marks a bad date in red and disables Book).

- **circles_select — FAIL (the app; a docs defect behind it).** Nothing under the pointer is
  ever filled grey. The agent tracked the pointer with `onPointerMove`, which the runtime
  delivers only during a press (`runtime/src/input.ts:671`) — while `View.onPointerMove`'s
  reference says "the pointer moved over the view". Every corpus use treats it as a drag;
  the hover form is `hovered` with `app.pointerX − rootOrigin().x`. Decision pending.
- **cells — FAIL (accessibility).** Everything works (values, `=A1+B2*2`, SUM/PROD over a
  range and a list, a recompute chain, `#ERROR`, Escape, scrolling to Z99), but the sheet has
  no grid, cell or header roles: a screen reader can't navigate it.

## Against six published implementations — 7GUIs' own criteria

`comparison.md`, by a reviewer reading code only, told to look as hard for Declare's
weaknesses as anyone's and not told what result was hoped for. Elm, React + MobX, vanilla
React, Svelte's and Vue's official examples, and JavaFX + ReactFX, each task assessed on
abstraction level, closeness of mapping, hidden dependencies, error proneness, diffuseness and
viscosity, with commentary.

**Code-only lines** (shared helpers counted separately):

| Task | Declare | Elm | MobX | React | Svelte | Vue | JavaFX |
|---|---|---|---|---|---|---|---|
| Counter | 14 | 6 | 7 | 20 | 5 | 10 | 18 |
| Temperature | 34 | 31 | 92 | 72 | 14 | 22 | 44 |
| Flight Booker | 59 | 50 | 85 | 91 | 36 | 52 | 51 |
| Timer | 27 | — | 88 | 76 | 25 | 43 | 34 |
| CRUD | 86 | 73 | 97 | 227 | 54 | 63 | 65 |
| Circle Drawer | 138 | — | 373 | 222 | 73 | 84 | 195 |
| Cells | 205 + 221 | — | 463 | 611 | — | 85 | 430 |

Declare's counts carry inline styling and accessibility labels the minimal Svelte and Vue
examples leave out. Elm lacks Timer (a copy of Flight Booker), Circle Drawer and Cells;
Svelte lacks Cells.

**Correctness, by reading:** Declare meets all seven with minor deviations; no other meets
more than four cleanly. Bugs the reviewer found in the others include vanilla React's counter
starting at 1 and its CRUD seed with names swapped; Vue's timer not resuming when d is raised
and its Cells evaluating formulas as JavaScript (`new Function`); Svelte and Vue refusing a
same-day return flight; MobX and JavaFX dropping arguments after a nested call; JavaFX's Cells
overflowing on a cycle; Elm's CRUD acting on the wrong person under a filter.

**Declare's strengths, per the reviewer:** rules that read like the task (Flight Booker as named
booleans; the timer's one `running` condition; CRUD deselecting a person the filter hides);
fewer of the usual bugs (no feedback assignments, typed records, Cells' cycle detection); the
only full keyboard model for the spreadsheet, and undo/redo shortcuts.

**Declare's weaknesses, per the reviewer:** Cells is the paradigm's clearest limit — compile-time
dependency analysis can't follow formulas typed at run time, so the agent wrote a propagation
engine (and rebuilds the dependency graph on each edit) where MobX gets it from its own
tracking; bare names resolve through every enclosing node's members, library classes included
(`selected` meets a Table's own), so the code defends with 144 `classroot.` prefixes — a
hidden-dependency risk if a library class gains a member; many concepts to learn; a bad date
marked by outline rather than fill; no grid semantics; its own script didn't test Flight
Booker or Timer.

## Findings for the platform

1. **`onPointerMove` on hover** — reference and runtime disagree (above). Decision pending:
   docs to the runtime (recommended) or hover moves delivered (breaking for 25 drag handlers).
2. **`declare.md` said `onDblClick` delays the single click;** the runtime and guide deliver it
   at once. Fixed (4b6ed103), found by the reviewer.
3. **`Table.selection`** is documented and declared `null` when nothing is selected, yet typed
   `any[]`, so `{ … ? … : null }` is refused (account (d)4). To fix.
4. **A single-line field's `onEnter` never ran** with the agent's `onKeyDown` override (account
   (d)6). To reproduce.
5. **Bare-name resolution through enclosing library members** — a design question (above).
6. **Run-time dependencies** (Cells) — a design question: whether constraints should follow
   reads whose shape is only known at run time (there is a runtime-tracked path for
   undeterminable projections, `~dynamic`).
7. Gaps the agent named: a read-only text field; data generated once then mutable; frozen
   headings in a two-way scroller; revealing a rectangle in a scroller.

The account, word for word, is in `account-declare.md`.
