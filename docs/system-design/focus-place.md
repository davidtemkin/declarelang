# Where the person's place goes when the program changes

*Design note, 2026-10-28. Built 2026-10-28 (tests: `test/focus-place.test.mjs`). A third value of `focusable`; an optional attribute saying where lost focus goes; one
runtime rule that replaces another, guarded; a corrected warning. Revised after two full
reads: every use of the focus vocabulary, and every site the behaviour change touches.*

---

## 1. The problems

Three cases from the evals, all one question: the program changed under the person, and
where are they now?

- **A place that isn't a control.** After a new screen appears, or a form is submitted with
  problems, a keyboard or screen-reader user should be taken to the new screen's heading,
  or to the list of problems. Neither is something to Tab to. Today the only way to focus a
  view is `focusable = true`, which also makes it a Tab stop for good, and `Focus.focus` on
  anything else does nothing, with a warning that tells the author to set `focusable = true`.
- **A control that becomes disabled, hidden or removed while it has focus.** Venue run 12:
  on the last ticket, Next ticket becomes disabled while focused. Focus is dropped to
  nothing; the browser reports the page body.
- **An overlay whose opener is gone.** Venue run 11: a sheet closes and tries to give focus
  back to the button that opened it, which has vanished. Fixed on 2026-10-28 (`d0690aa7`):
  focus goes to the next Tab stop after the opener's place.

And the runtime's warning made the second case worse: it says *"a container's tabOrder()
leaves it out"* for any view still shown but out of reach, a disabled one included
(`focus.ts:344`). The agent in run 12 spent ten minutes following it.

## 2. The idea

Focus is the person's **place**: where their keys go, where Tab moves on from, where a
screen reader reads. Today one attribute decides both whether a view **can hold** that
place and whether Tab **stops** there. Separate them; then use the separation to answer
what happens when the place goes away.

### Rule 1 — a view can hold focus without being a Tab stop

```declare-fragment
heading: Text [ text = "Your tickets", focusable = quiet ]
```

- `focusable` takes three values: `false` (the default), `true` (a Tab stop, as today) and
  **`quiet`**. A quiet view can hold focus when the program gives it focus
  (`Focus.focus(app.heading)`), but Tab and Shift-Tab never land on it, and it shows no
  ring. `true` and `false` keep their meaning, so `focusable = { !disabled }` and every
  existing program read as before; a constraint may answer `quiet` too. On a member of a
  group that is one stop (a radio in a RadioGroup) `quiet` and `true` are the same:
  members are never Tab stops.
- While it has focus, Tab goes to the first stop after it in the page's order, Shift-Tab to
  the last one before it. It has a position Tab continues from; it is never a stop.
- The ring hides while it has focus, even when the move came from a key, and the first Tab
  from it makes the ring appear at the next stop without a flight.
- A screen reader reads it: in the browser it is focused for real, with `tabindex="-1"`.

Nothing about existing programs changes. This is the web's split (focusable, not tabbable:
`tabindex="-1"`), and WinForms' and WPF's (`TabStop` / `IsTabStop` beside focusability).

The library already fakes this in places, and could use it instead: an overlay with nothing
to focus sets `focusable = true` on itself for good (`floating.declare` `_holdFocusItself`);
embedded programs are made focusable only so a press can hand them the keyboard.

### Rule 2 — when the focused view goes away: a narrow default, and the program can say where

Other platforms share no rule for this. The web and the Mac do nothing (focus falls to the
page or the window; the author moves it); WinForms moves to the next control in Tab order;
Flutter goes back to the view focused before it in the same scope; Android and tvOS ask the
container for its preferred focus. Only inside lists and grids do they mostly agree: stay in
the collection. A "next stop after its place" rule for every case would be a guess about
intent — once a whole panel goes, the next stop may be unrelated. So the default does only
what is clearly right, and the program says the rest.

**Disabled while focused: focus stays.** The control keeps focus as a quiet place: no
activation, its disabled state read out, Tab moving on from it. This is the web's
`aria-disabled` pattern, and Declare's controls already mark disabled with `aria-disabled`
(`semantics-dom.ts:138`), so the browser lets them keep focus. Moving focus here would be
wrong: a disable is often brief (Pay while the payment is sent, an arrow at the end of a
trail, Next on the last ticket), and moving puts a neighbouring control under the person's
next Enter. The library already chose this for the Stepper, whose ends go idle rather than
disabled. A native text field is the exception: the browser itself takes focus from a
disabled `<input>`, so it is treated as hidden.

**Hidden, removed, or left out by `tabOrder()`: focus is cleared, as today — then, on the
next frame, given to the nearest container that says where.**

```declare-fragment
detail: Column [ restoresFocusTo = { app.list } ... ]
```

- **`restoresFocusTo`**, optional, on any view, default `null`: where focus goes when the
  view that had it, somewhere inside this one, goes away. It can be a constraint, and it is
  read at that moment, so the answer can depend on what just happened.
- The runtime starts at the lost view's place and walks up its containers; the first whose
  `restoresFocusTo` answers a view that can hold focus now gets it. A target that can't —
  hidden, or gone — is passed over and the walk goes on up. An inner container overrides an
  outer one. The walk ends at an overlay: inside an open one, only the containers inside it
  answer, and the overlay's own value is for its close (Rule 3).
- **A list, a grid, a tree or a row group** (a `focusScope = stop`) answers its own entry
  when its `restoresFocusTo` is `null`, so the arrows keep working, as Esc out of a member
  does today (`leaveMember`). That is the only default; a group can be told otherwise.
- **Nothing answers:** focus stays cleared, and the next Tab starts from the place, as today.
  This keeps the 2026-10-25 decision for the search field closed with Esc (`focus.ts:527`).
- It happens on the next frame (the timing an overlay's hand-back already uses), and only if
  focus is still nowhere and nothing has called `Focus.focus` or `Focus.blur` since: the
  program's own move wins. It happens whatever the last input was — the program asked —
  and after a press the ring stays hidden, as with any focus that follows a pointer.
- **Inside an overlay that is closing:** the overlay's hand-back decides (Rule 3). A menu
  hides at once while holding focus (`menu.declare:310`); the walk then would beat its
  hand-back to the opener.
- **A whole program torn down** (an embedded app re-rendered): focus is dropped, as now.

A native field's blur, when the field is hidden or disabled, goes through the same path
rather than clearing focus with no place (`text-input.ts:310`).

The walk is the runtime's own search, like the ones `focusScope` regions and dialogs already
do, run once at the moment focus is lost. It is not `provided()`: the runtime never reads a
provided value on the program's behalf (`provided()` is explicit on purpose, and a function
call so that its reach and its cost are visible). A reusable class that can't name its
target — a card used on several screens — uses `provided()` itself, in its own constraint:

```declare-fragment
class TicketCard extends Column [ restoresFocusTo = { provided("focusHome", null) } ... ]
```

### Rule 3 — an overlay gives focus back where it is told, else as now

```declare-fragment
confirm: Dialog [
    restoresFocusTo = { app.deleted ? app.listHeading : null }
    ]
```

- The same attribute, on an overlay, is read **as the overlay closes**: closing is the
  focus inside it going away.
- `null`, or a view that can't hold focus by then: as now — back to what had focus when it
  opened; when that is gone, the next stop after its place.
- With Rule 1 the target can be quiet: a heading, a list, a problem summary.
- Focus the program moves itself while the overlay closes (in `closed()` or anywhere) still
  wins: the hand-back happens only if focus is nowhere or still in the overlay.

The web's dialog guidance asks for exactly these: back to what opened it; somewhere logical
when that is gone; somewhere else when the workflow makes that more logical.

### And the warning names the real cause

*"focus left app.nav.next: it became disabled"*, *"…: it was hidden — moved to
app.list"*. The `tabOrder()` wording only when `tabOrder()` is the cause. `Focus.focus`
on a quiet view is not warned about: it is the point.

## 3. What it looks like in use

- **A new screen:** its heading has `focusable = quiet`; showing the screen
  focuses it. The reader hears "Your tickets" (and "heading" if it has
  `accessibilityRole = heading`, which is ordinary heading advice, not part of this); Tab goes to the first ticket.
- **The last ticket:** Next becomes disabled and keeps focus; Enter does nothing; Tab goes
  on to Book more seats.
- **A row deleted from its menu:** the row is gone; focus goes to the list's entry, and the
  arrows go on working. No attribute needed.
- **A detail panel closed by a key:** the panel's `restoresFocusTo = { app.list }` sends
  focus back to the list it was opened from.
- **A form with problems:** `Form.submit()` focuses the first problem today. A program that
  lists the problems at the top could focus that list instead; whether `Form` should is a
  separate question.

## 4. What it costs in the base runtime

All in the boot bundle except the ring (a library class, compiled only into programs that
use controls) and the overlay's reading of the attribute at close (library).

| change | where |
| --- | --- |
| `quiet` as a value of `focusable`: a boolean-or-name kind in the schema and the type checker (compile time; the runtime stores one more value) | `schema.ts`, compiler |
| Tab passes a quiet view, and goes on from it by its place (today Tab from a view not in the sequence goes to the first stop: `entryIndex`, `focus.ts:840`) | `focus.ts` |
| reachability ignores `tabOrder()` for a quiet view | `focus.ts` |
| a disabled control keeps focus | `focus.ts` (`reachable`) |
| `restoresFocusTo` in the schema table; the walk up for it, a group answering its entry; the deferred, guarded move; the native-blur path | `schema.ts`, `focus.ts`, `text-input.ts` |
| `tabindex="-1"` for a quiet target, including where a focused element is given one (`semantics-dom.ts:280, 299`) | `semantics-dom.ts` |
| the warning's wording by cause | `focus.ts` (strings ship: production equals development) |
| the ring: hidden on a quiet view, no flight from it | `focusring.declare` (library) |
| an overlay's `restoresFocusTo`, read at close | `floating.declare` (library), one line in `_giveBack` |

Measured: 422 bytes gzipped (1.4 KB raw) added to the boot bundle, now 258.3 KB gzipped.
Nothing new is loaded.

## 5. To decide

1. **The names.** From the read of every use:
   - The view's: **`focusable = quiet`** — chosen 2026-10-28. One setting with three
     states, not a second boolean: `focusable` and `tabbable` gave four combinations, one
     meaningless, and a reader had to know the second mattered only when the first was
     true. `true` and `false` keep their meaning, so nothing existing changes. Considered:
     `tabbable` (the web's word), `tabStop` (clashes with `focusScope = stop`), making
     `focusable` an enumeration (every `true` changes, and `{ disabled ? none : stop }`
     reads worse), and the values `byProgram` and `programmatic`.
   - The container's and overlay's: **`restoresFocusTo`** — chosen 2026-10-28, and on any
     view, not only overlays (2026-10-28); it says what the attribute is for (focus is
     saved on open and restored on close, as Dialog and the overlays guide already put it);
     the target may be a place that never had focus, read as "restored to the page, here".
     Considered: `givesFocusTo` (the voice of `takesFocus`), a method `focusBack()`.
     Not `returnsFocusTo`: in Dialog, Return is the key (`returnTaken()`). Not anything with
     "opener": `opener` is not where focus returns.
2. **What Rule 2 changed**, as built: no existing test needed rewriting — the warning's
   test, the "cleared after a hide" tests and the search field's "cleared, not moved" all
   pass as they were, since focus now moves only inside a group or where a program asks.
   The desktop's window close moves focus itself, and counts as the program's move; its
   tests pass, but a window closed with focus inside has not been tried in a browser. The
   walk follows containers, not an order of stops, so a container that reorders Tab with
   `tabOrder()` says where focus goes with `restoresFocusTo`.
3. **A disabled control keeping focus** is the one part of Rule 2 that changes what
   `focusable = { !disabled }` means: disabled stays reachable while it is focused, and
   only then.

Two doc errors found on the way, to fix regardless: `accessibility.md:327` says a focusable
view gets `tabindex="-1"` (the code writes `0`), and the Focus reference says focusing a
view that can't take focus "is a no-op" (it warns).
