# Pagemap, run 1 — Declare, standard

The first run of the Pagemap brief (`evals/apps/pagemap/brief.md`): an exhaustive functional
brief of a professional flatplan tool, 137 numbered functions, against the Firebase emulator
suite with Pagemap's own rules and data. Declare at commit `e349b316` (the 0.7.0 release plus
the Pagemap-upgrade fixes), `claude-opus-5-5`, level standard, 17 November 2026.

## 1. The comparison

| | Pagemap run 1 | The original Pagemap |
|---|---|---|
| Time | 61.2 min (reading 4.8, writing 5.6, checking 50.8) | (weeks, by hand with an agent) |
| Turns · tool calls | 164 · 130 | |
| Output tokens | 271,367 (thinking 67,952) | |
| Cache reads · writes | 64.2 M · 0.57 M | |
| Cost (the stream's own figure) | $22.82 | |
| Declare | 5,262 lines; 4,398 of code | 4,995 lines; 4,055 of code |
| TypeScript | 786 lines (service, pure logic, pdf.js) | 1,095 lines |
| Its checks | 15 scripts, all passing at hand-over, at 1280, 1100, 900 and a 390 touch phone | |
| Verify runs | 54, 20.2 min (median 13.7 s) | |
| Source reads | `library/sheet.declare` (80 lines) | |

Idiom counts (`idiom.py`), beside the original, a recent Venue run and the to-do app:

| | Pagemap 1 | Original | Venue 38 | To-do |
|---|---|---|---|---|
| lines over 150 characters | 128 | 238 | 11 | 3 |
| colour literals outside theme declarations | 76 | 63 | 2 | 1 |
| theme reads | 228 | 299 | 86 | 69 |
| States | 2 | 0 | 2 | 7 |
| visible switches | 17 | 6 | 2 | 0 |
| branches on width or phone | 39 | 25 | 15 | 38 |
| flexes | 25 | 36 | 14 | 7 |
| browser scripts · page lookups | 2 · 1 | 2 · 1 | 0 · 0 | 0 · 0 |

The program is the original's size and shape, built in an hour: a model file of schemas and
checked edits, the map, panels, dialogs, a service module over the Firebase SDK, pure logic,
and pdf.js in a `DOMIsland`.

## 2. What it built, and how

It read the SKILL's first read in order, then the chapters the brief points at (data,
overlays, URLs, pointer and keyboard, controls, touch) and parts of collections, custom
layouts, animated arrangements, scrolling, themes and media. It signed in to the emulator with
`curl` and read the stored records and the rules (as the owner) before writing, and kept a
`PLAN.md` "so the structure survives any context summarization". It wrote the whole program
before its first verify (28 minutes in), then checked flow by flow with `--assert` scripts:
sign-in, a drag, working together (a live edit, presence, a comment, a forced conflict),
a phone tour by finger, sign-up and founding, the view-only link, artwork (upload, mapping,
pictures, the reader), the rules' refusals, phone hold-to-drag, roles (a viewer by
invitation, blocking, the release notice), search and filter, folding, keys, CSV import,
dark mode, Fit, and four window widths. It found and fixed its own bugs as it went (section
ranges counting the next section's spread partners; a founded workspace without the new
account's name; an empty admin list bound to the wrong dataset; Fit not fitting at small page
sizes; a toolbar overflowing at 900 px).

It wrote `checks/restore-seed.py`, which uses the emulator's owner token (past the rules) to
undo what its checks wrote. That tidies data; it doesn't change the service. Scoring starts
from a fresh service regardless.

What it says it never ran: print, backup export and import, password reset, clearing an
account, and a sign-in refused because the account was already blocked.

## 3. Findings for the platform

### 3.1 A layout loop that kills the program, reported against an internal rule (bug)

At sign-in the program died: "constraint cycle: App.$interaction re-evaluated 100 times in
one settle". The first report carried the loop: "View.height (stretched by View's
SimpleLayout[x]) (at app.main.body.map) → View's SimpleLayout[x] (at app.main.body) →
View.height …"; later ones carried none. The agent bisected for five minutes (ten failing
runs) and cured it by not closing an already-closed plan.

Reproduced from the recording (`logs/files.git`, commit `a78f9ae`, with the agent's
`checks/signin.mjs`): removing one statement, `app.plan.set([], ({}))` (emptying the plan
dataset a second time during sign-in), passes.

**The loop, traced (fix round, 2026-11-17).** It is not in the map but in the header. The
header is a row; in it, the title is a `Control` that `shrinks`, itself a row of two texts
that shrink (the issue's name and its edition). A child that shrinks is given its natural
size less what the room lacks, and the title's natural size is its content width, which is
measured from its texts' current widths. Those are what the title's own row gave them,
under the title's width. So the title's width depends on its texts' widths, which depend on
the title's width. Every width from 40 to 123 satisfies the rules; logged pass by pass, the
two layouts alternate, one reading the other's width a pass late:

| pass | the header gives the title | the title's row gives the name | so the title's content is |
|---|---|---|---|
| A | 40 | 83 | 123 |
| B | 123 | 0 | 40 |

It is a bug against the documented rule (a shrinking child keeps "the size its content gives
it"), not a gap in it: for a container, that can only mean its content with nothing in it
giving way. **Fixed (2026-11-18):** a run now takes a shrinking child's natural size from
`Layout.naturalOf`, which for a child whose own layout sizes its parts is that layout's run
with nothing giving way (`naturalExtent`). The title is 123 wherever it starts; the recorded
sign-in passes. A small program reproduces the stuck form (a title laid out empty stays at its
padding, 16 wide, its name spilling out), and it and two others are now tests. Every app in
the corpus lays out identically before and after, at desk and phone sizes.

**The message (fixed):** it named `App.$interaction`, the runtime's hover rule, which only
read the looping widths and hit the limit downstream, and after the first time it named no
loop. The kernels now count each rule's runs in the settle (`kernel_runs`), and the report
finds the loop among the rules that kept running; when the rule at the limit is one of the
runtime's own, the loop leads: "these values kept changing each other and never settled —
Text.width (sized by Control's SimpleLayout[x]) (at app.main.header.title.0) → …". It names
the same loop on every run.

### 3.2 A script function shadowed by an App method recursed at boot (language)

The agent's script defined `initialsOf(name)`, and its App a method `initialsOf(id)` whose body
called `initialsOf(…)` meaning the script's. In a body, the bare name is the App's member, so the
method called itself: "Maximum call stack size exceeded — while working out Avatar.initials".
DECLARE4002 had said so ("bare 'signIn' means App's member here, not the script { } binding of
the same name"), but as a lint warning among 30. It renamed six script functions (`signIn` →
`authSignIn`, …). The original Pagemap hit the same leak ("A script host's top-level names leak
into Declare scope, which forced renames"). A bare name that silently means something other
than what the program declared at its own top level is the kind of shadowing "names mean one
thing" rules out. **Fixed (DT ruling):** a bare name both a member and a top-level script
binding answer to is now an error where it is read (DECLARE4045); a library class's own member
is exempt.

### 3.3 A segmented control's label runs past its segment, and nothing says so (bug)

Seen by David in the running app: in the zoom control (Overview · Comfortable · Detail · Fit),
"Comfortable" runs past the selected pill on both sides. The control is the library's
`Segmented`, given `width = { app.wide ? 300 : 260 }`: it divides the width it is given equally
among its items (`_segmentWidth = (width - 4) / count`, about 64 px each at 260), and a label is
a `TextLabel` with `wrap = false`, centered and neither clipped nor fitted, so a label wider than
its share overflows. Its default width ignores the labels too (`segmentMinWidth = 96` per item).

Two faults: the library's, that a segment's width doesn't follow its label; and the platform's
checking, which didn't catch it: the agent checked four widths and `verify` reported no layout
findings at any of them. Verify does flag a text whose own width is bounded running past its
box; a content-sized label running past its parent (here, the segment) is not one of its
questions. Ledger run 5 (2026-11-12) had already seen it ("Segmented text
overlap. No diagnostic, only the picture").

**Fixed in `Segmented` (2026-11-17, kept to that class as David ruled):** it is as wide as its
labels need, each with its margin (`segmentedLabelInset`, a new theme value) at both sides; its
segments share the width equally (each as wide as the widest label needs) or, with
`segmentWidths = "proportional"`, in proportion to their labels; a width given is honored and
shared out by the same rule, and a label with too little room ends in an ellipsis inside its
margins, with the whole label as the segment's accessible name and, when cut short, its
tooltip. `segmentMinWidth` is now the floor per segment (44), not the default width. `TabBar`
and `TextSizeSwitch` follow. Then, in the fix round:

- **`Text.truncated`** now reports a last line cut short with an ellipsis, not only lines
  dropped, and is a rule of its own, so a `TextLabel` has it; `Segmented` reads it.
- **`Button`** given a width narrower than its content cuts its label inside its margins, names
  it whole to a screen reader, and shows it whole in a tooltip.
- **A cut run read whole.** Chrome named a cut "Comfortable" as "Co mfortable" (the hidden
  remainder was positioned out of the line); it now stays inline at no size.
- **`verify`** says when a run is drawn past the view it sits in, where that shows: the view has
  a fill or a stroke, or the spill lands on a neighbor. It would have caught "Comfortable".

### 3.4 Friction that compiled into the right form

- **An object as a default** (`rawAccounts: object = {}`), refused four times with "give the
  object its own braces". Kept as one rule (DT); the message now shows the line corrected
  (`write = { {} }`) and says why, and the notation chapter states it.
- **An enum token inside `{ }`**: `fontWeight = { current ? bold : medium }` is refused; inside
  code the token is a string ("bold"). Reasonable, and the message says it, but a typed
  attribute could accept its own tokens in code.
- **A schema field typed `object`**: refused; `any` is the word. The message lists the types.
- **`width` and `flexes` together**: `width = { phone ? 0 : 220 }, flexes = { phone }` was refused
  at run time (a child that flexes doesn't state its width). The intent, "fill the row on a
  phone, 220 on a desk", is `flexes = true` with a computed `maxWidth`, the form the agent
  reached. Now refused at compile time, naming that form.
- **Its own class `Toolbar`** collided with the library's (DECLARE5000, with a suggested name).
- **`Color.parse`** for text to a color: corrected to `Color.from` from `declare-help Color`.

### 3.5 Docs

All three addressed in the fix round:

- **A sheet with content taller than it.** Neither the overlays chapter nor `Sheet`'s reference
  said whether a sheet scrolls its content; the agent read `library/sheet.declare` for it. Both
  say so now.
- **Points between a view and the window.** It searched `View`'s member list for a
  root-coordinate method for the drag (the original Pagemap re-derived its layout's geometry
  by hand for the same reason, `CONTEXT.md`). The drag section now shows `rootOrigin()`, and
  `declare-help` answers "window coordinates" and its kin with it.
- **Script promises writing back**: it searched the guide for how a script's callbacks assign
  into the program, and found the answer by example. The script section now shows it.

## 4. Names

From `names.py`: 2 missed names (`fontWeight = heavy`; `app.body.map` before it existed), 1
collision (`Toolbar`), no `declare-help` misses. Both misses resolved within the minute; the
messages named the fix. Not in the ledger: the six script renames forced by DECLARE4002, and
`clip` renamed to `copied` before the first compile (`clip` is a view attribute).

## 5. The score

Scored by the Pagemap drive (`evals/apps/pagemap/score/drive.mjs`): it drives a build through the
screen alone (the accessibility tree, visible text, a real pointer, keyboard and touch) and reads
the service as the owner; it never reads a build's code. It was proved on the original Pagemap
first. Every failure on the original was taken as the drive's fault until shown otherwise; seven
were, and each was fixed (field replacement on macOS, controls scrolled out of view, a menu item
preferred over a same-named button, the map's heading mistaken for a side-panel row, ⌘C/⌘V that
fired no clipboard event, text in a toolbar that scrolls away, a "conflict" that wasn't one).

**Coverage, so far:** 96 checks over 91 of the 137 functions (75 of 104 core, 16 of 31 standard),
plus three judged from screenshots (F-MAP-05, -06, -08). The other 43 functions have no check
yet; extending the drive to them is the next step, and the score below is for what it covers.

| | The original Pagemap | Pagemap run 1 |
|---|---|---|
| Checks passed | 95 of 96 | 96 of 96 (F-ACC-06 failed in one of three runs, below) |
| Judged from screenshots | F-MAP-05/06/08 pass; F-SEL-04 pass | F-MAP-05/06/08 pass; F-SEL-04 partial |
| Fails | F-MAP-09: Fit doesn't fit (the page size ignores the heading and figures above the map; the back half of the book is below the window) | — |

What the run's build gets wrong, then:

- **Ghost presence after signing out (intermittent; F-ACC-06, F-COLLAB-01).** Once in three runs,
  a presence record of the person who signed out was still stored afterwards, so others would
  see them "here" for up to 2½ minutes. Its 30-second renewal can fire between removing the
  record and the sign-out finishing; the original guards that window with a signing-out flag.
- **The chosen page among several isn't marked more strongly** (F-SEL-04): both chosen pages are
  outlined alike; only the folio of the one in the address is bolder.
- **"Comfortable" runs past its segment** (§3.3): the brief leaves looks to the builder, so this
  scores as a platform finding rather than a failed function.

Two of the run's gaps it named itself and the drive also doesn't reach yet: print, and backup
import. Backup export passes (F-PRINT-10).
