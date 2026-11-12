# Presentify run 6: round 1 and a keyboard follow-on, Opus 5.5, Declare, at bfd4a2e0 (0.6.10)

**Round 1: 33.5 min, 145 turns; 19 of 19 hidden checks delivered, 18 of 19 at its first clean
boot (19.5 min).** **Keyboard follow-on (`brief-keyboard.md`, the same session resumed): 14.3 min,
65 turns; 9 of 9 keyboard-only hidden checks, and round 1's 19 still pass.** No platform bug
stopped either part; the audit found nine defects in the platform and its tools (below), none of
which the hidden checks could see.

## Figures

| | Run 5 | **Run 6, round 1** | **Run 6, keyboard** |
|---|---|---|---|
| time | 37.3 min, 126 turns | **33.5 min, 145 turns** | **14.3 min, 65 turns** |
| model · tools | 27.8 · 9.5 min | **27.0 · 6.5 min** | **10.9 · 3.4 min** |
| output tokens (thinking) | 178.8k (66.5k) | **175.2k (61.7k)** | **69.1k (29.6k)** |
| cache reads · cache writes | | **39.5M · 443k** | **30.5M · 139k** |
| code | 2,227 lines Declare, 311 TS | **2,666 lines Declare** (no comments or blanks) | **2,948 lines Declare** (+`commands.declare`) |
| first clean boot | 21.2 min | **19.5 min** | — (it booted after its first big edit) |
| hidden checks at first boot | 19 of 19 | **18 of 19** | — |
| hidden checks delivered | 19 of 19 | **19 of 19** | **keyboard 9 of 9; round 1 19 of 19** |
| its own checks | 2 flows, 71 assertions | **3 flows** (the brief's scenario in two halves, then editing: 28 assertions) | **+ `tests/keyboard.mjs`: 75 steps, 45 assertions**, keys only |

Timing records: `evals/timings/2026-11-12-presentify-run6.txt` and `-keyboard.txt` (their
reading/writing/checking split is unreliable: it counts everything after the first verify as
checking).

### Where the time went (round 1)

| What | Minutes, about |
|---|---|
| Reading (README, SKILL, declare.md, guides 01/04/05/06, the to-do app, then 08, 09, 12, 14, 17, 18, 21, 23) and help lookups | 5 |
| A prototype of the slide renderer over the live service, two screenshots | 3 |
| Writing nine files: model with undo, slide renderer, save engine, editor, brand, stage, panels, home, App | 11 |
| First boot, first looks; the never-settling pulse spring | 2 |
| The brief's scenario as two flow scripts; the `textColor` collision found by screenshot (B7) | 6 |
| In-between states, the conflict preview's datapath (B1), offline, the open animation, 100 slides | 3 |
| Third flow (editing, 28 assertions), clipboard, polish, the dev server | 3.5 |

The keyboard follow-on: planning the command table and writing `commands.declare` (4 min);
wiring the menu bar, sheet, conflict dialog and inspector keys (3); the keyboard-only flow and
the list's focus entry and arrows (B2) (3); focus rings (`focusShape`), Shift-F10, the dialog's
width (B5), the final suites (4).

## The hidden checks, and their audit

**Round 1: `drive.mjs`**, the same 19 flows as run 5, against the app copied unedited into the
main tree and served on 8290. First pass on the round-1 app: 18 of 19, failing
`rename_and_delete_presentation` ("not found: a control named /more|actions|…/ for Reading
group"). **The check's fault.** Each card's "More for …" button shows only while the card is
hovered or holds focus (`opacity` 0 otherwise, so not in the accessibility tree), and the check
looked for it without the pointer over the card, as no person with a mouse would. The check
now moves the pointer over the card and looks again before searching nearby. **19 of 19.**

After the follow-on, `present_and_return` failed ("returned to slide 1, not 3"). **The check's
fault again:** the follow-on added a menu bar with a **Present** menu, and the check's loose name
match pressed that menu's title instead of the **▶ Present** button; its arrows then moved
through the menu. The check now prefers a button of that name. **19 of 19**, and the round-1 app
still passes the changed check.

**First boot** (the recording's snapshot at 19.5 min, the first clean R4): **18 of 19**. Presenting
from slide 1 and moving on twice came back to slide 1; the agent's second flow script caught and
fixed it at about 21 min.

**Keyboard: `drive-keyboard.mjs`** (new, hidden; written for `brief-keyboard.md` before the
follow-on started). After loading the page it never touches the pointer; it reads where focus
is from the accessibility tree and judges by what the service stored. Nine checks: Tab through
the parts and back; the slide list's arrows, Home, End and ⌥-arrows; a shape added from the
keyboard alone; the editing and arranging keys; keys that follow the focus (⌘A and ⌫ in an
inspector field, arrows stepping a value); Escape putting a field back; the delete dialog by
keyboard; the shortcuts listed in one place; the whole of "what done looks like", keys only.
Calibrated on the round-1 app first (1 of 9, as expected: none of it was asked for). Against the
delivered app, two fixes to the check, neither loosening a verdict:
- it reads a one-stop list's current item as a screen reader does (`aria-activedescendant`, else
  the list's selected item, noted);
- the slide's Tab stop may be a view that holds the element labelled "Slide" (here "Slide
  editor"), and Shift-Tab from the slide reaches the list within a few steps (the list's part has
  its own "New slide" button at its foot).

**9 of 9.** One note: after Escape cancels the delete dialog, focus is on nothing. The dialog was
opened from the card's menu, and the card's "More" button is invisible once focus leaves the card,
so there is nothing to give it back to. A plain menu button gets focus back correctly
(`audit/` has no repro of a defect here); whether focus should then go to the next stop is a
question for the deferred focus work.

## What it built, and how

One `SlideView` (1280 × 720 inside, `scale` set by whoever places it) draws every slide: the
editor, the slide list, the home cards, the conflict preview and presenting. Elements are a class
per kind with recursive groups through `classFor`. A `Doc` dataset class makes every write; an
`Editor` node holds the selection and the verbs, with the selection's box, the inspector's mixed
values and every enabled state derived; undo is whole-document snapshots in a `History` node. A
hand-written `Saver` reconciles the working copy with the service: debounced, serial, retried,
with conflict detection by version. One `openT` spring grows a card into the editor. The slide
list glides through a `TweenLayout` subclass; a reorder drags a ghost with a drop line and moves
on release. Hit-testing is geometry in a script, on one pointer surface over the slide.

The follow-on put every command in one table (`commands.declare`) that feeds a `MenuBar` (the
library makes its items' keys global, stands them down in text fields and under dialogs, and
lists them in the hold-⌘ panel), the context menus, the tooltips and a keyboard-shortcuts sheet.
The slide list and the colour grid are `focusScope = stop` groups with `focusEntry()`; inspector
numbers step with the arrows, apply on Return or leaving, and revert on Escape
(`commitOn = "end"`); the conflict became a `Dialog`.

## Findings for the platform

The audit's nine defects (B1–B9, each with a repro in `audit/`) are in **Audit** below. In
short:

1. **B2 — a one-stop container's own arrow, Home and End bindings never run** while a member has
   focus, and the `focusScope` reference's own `onKeyDown` recipe fails the same way. This
   contradicts guide 09's walk ("the first view that binds the key takes it"). The delivered
   palette's Up/Down by a row is dead because of it.
2. **B3 — a menu shows a record's `key` verbatim**: "Ctrl+G" on a Mac where ⌘G fires, while the
   hold-⌘ panel formats keys with `keyLabel`. It drove the agent to spell every key per platform
   in a browser script (`keyText`); `keyLabel` itself isn't exposed (account, part 2 (g)).
3. **B1 — a datapath into a derived Dataset follows the object's original dataset**, shows its
   new value, then throws — the route the runtime's own message recommends.
4. **B7 — R5 is silent about a runtime error R4 fails on**: the `textColor` collision (a
   declared `textColor: string` shadowing the provided colour) built after boot passed R5 with
   invisible text. The agent's costliest obstacle (about 15 min by its account).
5. **B4 — the layout check runs at `settleData` while a spring is mid-flight**: a false "covered"
   finding the agent couldn't silence, in both parts.
6. **B5 — the library `Dialog` overflows with three ordinary buttons**, and no layout check sees it.
7. **B6** (R1's message for `height = null` suggests a fix R3 refuses), **B8** (the held clock makes
   `Date.now()` fractional), **B9** (`page.mouse.dblclick` missing in assert scripts; no
   `declare-look --hover`).

Not defects, but silent wrong types the agent asks to be caught (account, part 2 "Bad"): a
declared attribute shadowing a provided built-in with another type (`textColor`), and
`focusShape()` returning a view where a box is due — both compiled, both failed only at runtime.
New diagnostics, so they wait for the bar for product changes.

**Reference gaps** (13 reads of `library/` and `runtime/` source; see the audit's table): when an
animated layout re-places its children; a field's line height beside `Text`'s; that ⌥-letters
match by physical key on a Mac; that the menu bar is one Tab stop and its menus type-to-select;
that there is no undo facility. The theme-token and focus-ring reads were answerable from
`declare-help`.

### Idiom counts

| | Presentify 5 | Run 6 round 1 | Run 6 final | To-do |
|---|---|---|---|---|
| code | 2,227 lines Declare, 311 lines TS | 2,666 lines Declare | 2,948 lines Declare | 843 lines Declare |
| bytes | 134 KB | 139 KB | 157 KB | 48 KB |
| lines over 150 characters | 15 | 24 | 26 | 3 |
| colour literals outside theme declarations | 66 | 40 | 40 | 1 |
| theme reads | 93 | 135 | 150 | 69 |
| States | 2 | 1 | 1 | 7 |
| visible switches (visible = { x == '…' }) | 1 | 5 | 5 | 0 |
| branches on width or phone | 0 | 0 | 0 | 38 |
| flexes | 6 | 6 | 8 | 7 |
| browser scripts (host = browser) | 1 | 1 | 2 | 0 |
| page lookups (document.querySelector…) | 0 | 0 | 0 | 0 |

## Is it idiomatic Declare?

(Read over the program as it finally stands, after both parts.)

The program is `my-apps/presentify/`: 10 files and 3,892 lines of Declare, with five assert scripts. All file:line references below are to the final tree. Round 1's tree differs from it only in the files the keyboard follow-on touched. For the counts (40 colour literals outside theme declarations, 150 theme reads, 1 `State`, 5 visible switches, 2 browser scripts, 26 lines over 150 characters), see the idiom.py table.

**Overall:** the architecture is well-made Declare, and much of it is better than run 5's:
- one slide renderer at every scale;
- a model made of a `Dataset` subclass with verbs plus an `Editor` node of derived facts;
- springs for continuity;
- a custom layout where one is needed;
- `MenuBar` used as the shortcut table.

The missteps are mostly at the edges:
- hand-rolled controls where the library already has one (`Toolbar`/`ToolButton`, `Stepper`, `Button` with a `menu`);
- ternary chains where a `State` belongs;
- two push-style `onChange` handlers where a constraint belongs;
- a few timing guesses with `afterDelay`.

Four behaviours the keyboard brief asks for are wrong in the delivered app. Three are the agent's slips. The fourth (the palette's Up/Down) is caused by a platform defect (B2 below).

### What it gets right

- **One `SlideView` for every slide** (`slide.declare:17`): 1280×720 inside, with `scale` set by whoever places it. It is used by the stage (`stage.declare:98`), the rail (`panels.declare:161`), the cards (`home.declare:120`), presenting (`presentify.declare:96`), the drag ghost (`panels.declare:85`) and both conflict views (`stage.declare:318`, `:335`). The editor, the thumbnails and presenting therefore cannot disagree.
- **Kinds as classes:** `classFor` picks `RectMark`/`EllipseMark`/`LineMark`/`TextMark`/`GroupMark`, recursively for groups (`slide.declare:28`, `:125`). This is exactly the reference's form.
- **The model, in the to-do app's shape:**
  - `Doc extends Dataset` makes every write through named verbs (`model.declare:365-397`).
  - `Editor extends Node` holds where the person is, and everything else is derived: `selEls`, `selBox`, `single`, `canGroup` and the rest (`editing.declare:30-43`).
  - The inspector's mixed-value detection is pure constraints (`panels.declare:291-310`).
  - The save status is one derived three-way string (`sync.declare:68-72`).
- **Pure geometry in `script`** (`model.declare:69-355`). It is long, but it is exactly what the drift check allows: pure functions of their arguments, with no state, no placement and no colours.
- **Continuity:**
  - One `openT` spring drives the editor's `x`, `y`, `scale` and `cornerRadius` from the card's box (`presentify.declare:189-190`, `378-388`), which is the weather app's `openT` pattern.
  - The rail is a `TweenLayout` subclass that is retargeted on width change (`panels.declare:18-24`, `55-56`), copied from the to-do app.
- **A custom layout:** `CardGrid` (`home.declare:151-170`) is a layout of its own for "as many columns as fit, at least 240 wide". This is the right reach and is often missed.
- **Data:**
  - Each card's thumbnail is its own `DataSource` with a `url` constraint and `autoFetch` (`home.declare:105-106`).
  - `Probe`'s `url` is a constraint on the slide id (`sync.declare:285-289`).
  - The deck list binds `:decks[]` (`home.declare:207`).
- **Theme:**
  - `theme Presentify [ … ]` is spread over `SanFrancisco` (`brand.declare:15-46`, `presentify.declare:140`), and library controls are restyled through tokens. The focus ring comes from tokens too: `focusRingStyle`, `focusRingInnerColor` and the rest (`brand.declare:43-44`).
  - `Section` and `Row` use `defaultPlacement` correctly (`brand.declare:275-299`).
- **Number fields built on ValueControl's edit cycle** (`brand.declare:305-329`): `commitOn = "end"`, `beginEdit()`/`edit()` for arrow steps, Escape-cancel inherited. A step is shown at once, applied on Return or on leaving, and reverted with Escape, in about eight lines.
- **Overlays as standing members:**
  - `Menu`, `ContextMenu`, `Popover` (`Palette`), three `Dialog`s, `Toast` and `Sheet` (`KeysSheet`), all declared on the App (`presentify.declare:400-506`, `commands.declare:265`).
  - Context menus open with `open(this, e)`, and `Shift+F10` opens them with `openFor`.
- **Clipboard:** `onClipboardCopy/Cut/Paste` on the App, with a private MIME type plus plain text (`presentify.declare:356-369`). Menu items with `command: "copy"` reach the same handlers (`commands.declare:76-78`).

### Missteps, and how they should have been written

1. **Pushing a derived value into another node.**
   - Where: `stage.declare:38-40` writes `app.ed.k` from `trackChanges = ["k"]`/`onChange`/`onInit`; `editing.declare:65` declares `k: number = 1` to receive it.
   - Instead: a constraint where it is read, `k: number = { app.stage?.k ?? 1 }` on `Editor`. The push also leaves `k` stale for a frame after a resize.
2. **Loading a deck as a hand state machine.**
   - Where: `presentify.declare:243-271`. `trackChanges = ["deckId"]` → `load()` → `loader.fetch()` → `onLoad` reads `_deck`, rewrites its own `url`, fetches again, then calls `begin()`.
   - The slides URL depends only on `deckId`, so nothing has to wait for the deck. Instead: two sources with `url` constraints and `autoFetch`, and `begin` run once both are `loaded`, keyed on `deckId`.
   - The same applies to `Home.decks`: it has a `url` constraint but fetches in `onInit` (`home.declare:15-18`). `autoFetch = true` says it.
3. **Timing guesses.**
   - Where: `afterDelay(420, …)` to focus the new title once the open spring "has finished" (`presentify.declare:214`), and `afterDelay(60, …)` to select the rename field (`:485`).
   - Both are "wait until it exists". That is `afterSettle`, which the to-do app uses at `todo.declare:547` and `:707`.
4. **The tools row.**
   - Where: five `ToolToggle`s in a `View` with `accessibilityRole = toolbar` (`panels.declare:218-241`, class at `brand.declare:177`).
   - The DECLARE4026 warning asked for a `ChoiceControl` with `ChoiceItem`s on every build, and it is still in the final verify. The agent used exactly that for text alignment in part 2 (`panels.declare:405-415`) but never went back.
   - The library also has `Toolbar` with `ToolButton [ toggle ]`, "a drawing app's tools" (`08-controls.md:40`). The agent's own class was first named `ToolButton` and refused for colliding with the library class (DECLARE5000).
5. **Hand-made controls the library already has.**
   - `StepPair` (`panels.declare:515-537`) is `Stepper`. It is also the drift check's "method per control that only passes the press on": `down() { }` and `up() { }` are declared on the class and overridden at the use site.
   - `PopButton` (`brand.declare:202-211`) is a `Button` with a `menu`, which draws the chevron and opens the menu under itself (`declare-help Select`). The agent replaced the library `Button` because its label was too large. Unsure: `fontSize` on the Button, or a theme token, may have fixed that.
   - The 30×30 `IconTool` command rows in the inspector (`panels.declare:454-507`) bypass the command table. They should be `command = "…"` buttons (or `cmds.run` with `tip(...)`): as written, the brief's "each command's key shows wherever the command does" fails for align, distribute, order, group, duplicate and delete.
   - `Toggle` is used for two one-shot commands ("Square corners", and "Fully round ends", which has no `on`; `panels.declare:362-368`).
6. **Looks as ternary chains, not states.**
   - `IconTool` uses a `State` for `on` (`brand.declare:168`), the program's one `State`.
   - `Pill`, `Toggle` and `IconChoice` fold hover, pressed and on into one nested ternary (`brand.declare:186`, `225`, `340`). The DECLARE4025 lint fires on all three; `cursor` and `text` trip it too (`stage.declare:45`, `259`; `panels.declare:331`).
   - `opacity = { disabled ? 0.38 : 1 }` (or 0.45) is hand-written in six classes rather than reading the `disabledOpacity` token.
7. **Placing by arithmetic.**
   - `DeckCard`'s height is arithmetic over its children (`width * 0.5625 + 74`). Its words, and its "more" button, are placed by `y = { parent.width * 0.5625 + 12 }` (`home.declare:86`, `128`, `139`). `Skeleton` repeats the same numbers (`home.declare:242-247`).
   - This is the drift check's first "placing by hand" tell. A y-axis `SimpleLayout` (picture, then words) sizes itself; only "more" needs a place of its own.
8. **Duplicated geometry and constants.**
   - `SlideRow.focusShape()` returns the literal `{ x: 30, y: 8, w: 160, h: 90, rad: 6 }` (`panels.declare:151`), copying `frame`'s numbers (`:157`). Read `frame.x`, `frame.y`, `frame.width`, `frame.height` and `frame.cornerRadius`, as the library's `Checkbox` does.
   - The service URL is written twice (`home.declare:14`, `sync.declare:34`).
   - The brand violet is re-typed as hex inside shadows and the marquee fill (`0x5B3DF540`, `0x5B3DF51A`, `0x5B3DF530`; `brand.declare:189`, `stage.declare:177`, `panels.declare:160`) rather than `colorWithAlpha(provided("theme").accent, …)`.
   - The delete dialog's red is three hex literals in a theme override (`presentify.declare:503-504`).
9. **`as any` on its own data.** `menus = { app.cmds.menus as any }` (`panels.declare:209`): the `CmdMenu` schema (`commands.declare:29-31`) is not the bar's record type. This is the drift check's `as any` item. Declare `Cmd`/`CmdMenu` so they fit `MenuBarMenuRecord`/`MenuItemRecord`.
10. **Small noise.**
    - `d.w; d.h` as a bare statement in a `draw` (`stage.declare:142`).
    - `clip = clip` (`editing.declare:109`).
    - `+ 0.0` (`panels.declare:117`).
    - `Focus.focus(this)` in the stage's `onPointerDown` (`stage.declare:80`), which a press on a focusable view already does.
    - `poke()` debounces with `afterDelay` plus a `_quietAt` timestamp (`sync.declare:125-127`), where keeping the `DelayHandle` and calling `cancel()` says it directly. The agent noted this itself.

### Workarounds the platform forced, and how the platform or docs should handle each

1. **Undo** (`model.declare:400-459`): whole-document snapshots with `structuredClone`. There is no history facility; this is the same gap as run 5.
2. **Full screen and the leave-page guard** (`presentify.declare:53-69`): a browser script. The same gap as run 5. The platform needs a fullscreen request with a reactive fact, and an "unsaved, ask before leaving" flag.
3. **Key labels** (`commands.declare:33-52`, `180-182`):
   - The agent wrote its own `keyText()` because a `Menu` prints a record's `key` verbatim: "Ctrl+G" is shown on a Mac where ⌘G is what fires (repro B3).
   - The runtime already has `keyLabel()` and the hold-⌘ panel uses it, but neither `Menu` nor any public API does.
   - The platform should format `key` with `keyLabel` in `Menu` and `MenuBar` and expose it as a function. The second browser script then goes away.
4. **Arrow keys in a one-stop list** (`panels.declare:140-146`):
   - The list's own Up/Down/Home/End bindings never ran, so they moved to every row.
   - The palette grid's Up/Down by 7 (`panels.declare:558`) has the same cause and is **dead code** in the delivered app. Confirmed live: on the colour after `#0E3B43`, ArrowDown goes to the next colour, not the one a row below.
   - The platform should run a stop container's explicit bindings (and `onKeyDown`) before the stop's built-in arrows (repro B2).
5. **The conflict preview's binding** (`stage.declare:301`, `316-318`; `presentify.declare:444-449`): a derived `Dataset` plus a wrapper `View [ datapath = { ds.value } ]` and `:slide` inside it, because `{ ds.value.slide }` throws once the object's first dataset has moved on (repro B1).
6. **The title field:**
   - Its width is `measureText(this.text, …)` (`panels.declare:191`), because `contentWidth` is the children's box, not the text.
   - Its ellipsis is an overlaid `Text` with the field's own text made transparent (`:193-197`), because a `TextInput` has no truncation when it is not focused.
   - Both need a field that sizes to its text and an "ellipsis when idle" option; or the docs should say which to use.
7. **Text height written back to the model** (`slide.declare:116-118`, `editing.declare:414-419`). The service stores a text box's height "as last laid out", so this one is the brief's demand, not a platform gap.
8. **Three dialog buttons overflowing** (`presentify.declare:429`, `dialogWidth: 500`). The library `Dialog`'s default row overflows its box with three ordinary buttons, and no layout check reports it (repro B5). `arrangement = "stack"` was the documented way out; the platform should not overflow silently.
9. **A destructive default button** (`presentify.declare:497-504`): `DialogButtonRecord` has no `destructive`, and `tone = "error"` only tints the title. So the accent is overridden with hex.
10. **Hit-testing** in script with a single pointer surface (`model.declare:123-144`, `stage.declare:79-92`). This was deliberate (thin lines, the inside of an ellipse) and reasonable. There is no shape-aware hit test to use instead.

### The keyboard follow-on against Declare's keyboard model

**Used well:**
- **`MenuBar` as the program's shortcut table** (`panels.declare:209`, `commands.declare:64-148`). Each key is declared once. The library makes the keys global, stands them down in fields and under dialogs, and lists them in the hold-⌘ panel. This is exactly what `declare-help MenuBar` and `Shortcuts` teach.
- **Keys in the right places:**
  - App-level `keyBindings` with `when: "atHome"` (`presentify.declare:349-351`).
  - The stage's `keyBindings` return `false` to hand a key on when nothing is selected (`stage.declare:50-71`).
  - `everywhere: true` on the presenter's Escape (`presentify.declare:86`).
  - `DeckCard` bindings carry `label` and `group` for the panel and sit on a non-focusable container that the walk reaches from its two controls (`home.declare:94-100`).
  - `Shift+F10`/`ContextMenu` open the right-click menu in all three places (`stage.declare:57`, `panels.declare:60`, `home.declare:97`).
- **Focus scopes:**
  - `focusScope = stop` with `focusEntry()` landing on the current slide (`panels.declare:52-53`).
  - `ChoiceControl` for alignment (`panels.declare:405-415`).
  - A one-stop colour grid with `focusEntry` on the picked swatch (`panels.declare:556-566`).
  - The stage made one stop with a `focusShape` around the paper (`stage.declare:28-32`).
- **The library carrying the rest:** the hold-⌘ panel comes free from the menu records, and the shortcuts sheet is a `Sheet` driven by the same records (`commands.declare:265-299`). Field chords stay the field's, with no code.

**Used badly or incompletely:**
- **Keys the hold-⌘ panel never lists.** The stage's and the rows' bindings carry no `label`/`group` (`stage.declare:50-58`, `panels.declare:140-143`), so the panel shows none of the slide or list keys. The sheet's "On the slide" and "In the slide list" groups are a hand-written copy instead (`commands.declare:153-176`), which can drift from the real bindings. Labelling the bindings would make the panel and `Keyboard.shortcutsInForce()` the single source.
- **One big `run(id)` switch** (`commands.declare:203-257`). This is the `picked(id)` delivery seam, and it works. But only cut, copy and paste use `command:` and the walk, so a menu item does not act on "where the person was working". The inspector buttons bypass the table altogether (misstep 5).
- **Tools as five toggles**, not a `ChoiceControl` or `Toolbar` (misstep 4). Arrow keys do not move among them.
- **`focusShape()` returned views from round 1 onwards** (B-audit, part 2), so the slide, rows and cards had no ring until part 2. The final literal box duplicates geometry (misstep 8).
- **Delivered key-display bugs:**
  - `newBtn`'s tooltip says "(⌘N)" (`home.declare:186`), but the key is `Ctrl+Alt+N` (⌥⌘N, `presentify.declare:349`, `commands.declare:67`).
  - `deckMenu`'s keys "Enter" / "Ctrl+Alt+R" / "Backspace" (`presentify.declare:453`) skip `spell()`, so on a Mac that menu says "Ctrl+Alt+R" while the bar says "⌥⌘R".
  - The close button's "Close   Esc" is hard-coded (`commands.declare:272`).
- **The palette grid's Up/Down are dead** (forced, B2). §3's "a colour by choosing one of its swatches with the arrow keys" works only linearly.

## Audit

**Effort.**

| | Wall time | Turns | Output tokens | of which thinking |
|---|---|---|---|---|
| Round 1 | 33.5 min | 145 | 175.2k | 61.7k |
| Keyboard follow-on | 14.3 min | 65 | 69.1k | 29.6k |

Per-obstacle figures below are estimates: the turns' share of the agent's written output, scaled to the run's total.

My repro programs are in `/private/tmp/claude-503/-Users-temkin-Code-declare-overlay/6a505da1-0494-4b83-acec-f4d7f2048458/scratchpad/p6-audit/`. Each was run with `npx declare-verify` (or `declare-look`) from `~/Code/Declare` at dfebb414.

### Platform defects: correct code refused, or a correct program judged or laid out wrong

**B1. A datapath into a derived Dataset follows the object's original dataset, then throws.**
- **What the agent wrote:** `copy: Dataset [ contents = { ({ slide: classroot.theirs }) } ]`, then `SlideView [ datapath = { classroot.copy.value?.slide ?? null } ]` (round 1, #94). This is exactly the route the runtime's own message recommends for computed records ("derive a Dataset beside the view … and point at it").
- **Repro:** `dp-derived.declare` + `dp-derived.mjs`. Two views point at the same object in the derived set: one by expression (`{ app.copy.value?.slide }`), one by root plus path (`{ app.copy.value }` then `:slide`).
- **Result:** after the source dataset replaces its own copy, the expression view **shows the source's new value** (`A n=2`; the derived set still holds `n=1`) and then throws `View 'a'.datapath: this value is no longer anywhere in its dataset`. The path view shows `B n=1`, which is correct.
- **Cause:** `toCursor` (`runtime/src/data.ts:1271-1300`) resolves through the object's adoption tag, which still names the first dataset. Two spellings of one place disagree.
- **Cost:** about 3k output tokens and two rewrites. The workaround stays in the final program (`stage.declare:316-318`, `presentify.declare:444-449`).
- **The agent's first attempt** (`datapath = { classroot.theirs }`, an object held from `Probe`'s value after `Probe` had loaded again) was refused correctly. The message could name the dataset that moved on.

**B2. A `focusScope = stop` container's own arrow, Home and End bindings never run while one of its members has focus. The reference's own recipe for grids fails too.**
- **Repro:** `stop-keys.declare` + `stop-keys.mjs`. A stop list binds ArrowDown and End. Tab lands on "One"; ArrowDown moves focus to "Two" with `moved = 0`; End moves to "Three" with `ended = 0`.
- **`stop-onkeydown.declare`:** the same container answering the keys in `onKeyDown`, which is what `declare-help View.focusScope` prescribes ("in a grid where Up means the row above, the view answers the arrows itself (`onKeyDown`)"), gives the same result: it never runs.
- **What the docs promise:** 09 says "the first view that binds the key takes it", walking outward from the focused view. The container is the first view on the way out that binds ArrowDown, yet the stop's built-in movement takes the key silently.
- **Cost in the run:** the follow-on's two failed assertions (`expected 1, got 0 … ArrowDown` and `expected 3, got 1 … End`), about 3k tokens. The palette's Up/Down by 7 is dead in the delivered app; I confirmed it live and read-only, with the saver pointed at a dead port.

**B3. A menu shows a record's `key` verbatim, so a key spelled the documented way reads wrong on a Mac.**
- **Repro:** `menu-key.declare` + `menu-key.mjs`, in a page whose `navigator.platform` is `MacIntel`. A `MenuBar` item with `key: "Ctrl+G"` displays **"Ctrl+G"**, while ⌘G is what fires it.
- **Cause:** the hold-⌘ panel formats keys with `keyLabel()` (`runtime/src/focus.ts:1334`, `1347`); `Menu` prints `"" + :key` (`library/menu.declare:774`).
- **The docs say both:** `Shortcuts.items` says keys are spelled the Windows way ("Ctrl is the command key, ⌘ on a Mac"), and `MenuBar`'s own example writes "⌘N".
- **Cost:** the follow-on's `keyText()` browser script, two `spell` layers, and the deck menu's stale "Ctrl+Alt+R".
- **The agent's account is wrong here:** it says headless Chrome "reported as non-Mac". It reports MacIntel.

**B4. The R5 layout check runs at `drive.settleData()` while a spring is mid-flight, and reports a cover that is a transition.**
- **Repro:** `cover.declare`. A list's button is covered by an editor that a spring grows over it; the list has `pointerEvents = none` and a gated `tabOrder()` while open, and is hidden once the editor arrives.
  - With `cover.mjs` (`set open` → `settleData` → `settleMotion`), and with `cover3.mjs`: `layout after set app.open: … app.home.newBtn (by app.editor.stage)`.
  - With `cover2.mjs` (`set open` → `settleMotion` only): no finding.
- **What the docs say:** `verify.md` names `settleData()` as a place "the program comes to rest". With motion still running, it isn't.
- **Effect in the run:** every "control(s) another view takes the presses of … homeView" finding:
  - round 1 at #70 and #84–86;
  - part 2 at #62, after `key Mod+Alt+N`;
  - in the final run, still reported.

  The agent added `pointerEvents` and `tabOrder` gates for it (both harmless) and lived with the finding. Unsure: the round-1 Tab-order finding ("More for Reading group" → "All presentations") was probably the same mid-transition snapshot, since the list is invisible once the open spring has settled.

**B5. The library `Dialog` overflows with three ordinary buttons, and no layout check sees it.**
- **Repro:** `dialog3.declare`, the agent's own title, message and three buttons at default width. The left button starts at x=412 while the dialog's box starts at 430 (`dialog3.png`). R4 is clean, with no "child past its box" finding.
- **Cost:** about 1.7k tokens. A theme override (`dialogWidth: 500`) remains in the final program.

**B6. R1's message for `height = null` suggests a fix that R3 then refuses.**
- **Repro:**
  - `unset-height-bare.declare`, R1: `Words.height expects a Length … got 'null' — write { null } to read it in a constraint [DECLARE2000]`.
  - `unset-height.declare`, R3, with exactly that written: `the { } body of 'height' computes a null, but 'height' is typed Length — a size can't be unset by a value [DECLARE6001]`.
- **Verdict:** the agent's judgement in its account ("there is no way to say unset an inherited attribute"; it restructured `Shape`) is right. The R1 message is self-contradictory.

**B7. R5 says nothing about a runtime error that R4 fails on.**
- **Repro:** `textcolor.declare`. A container declares `textColor: string`, which shadows the provided text colour. R4 fails it: `boot: a color attribute received "mixed" (a string)…`.
- **`textcolor-later.declare` + `.mjs`:** the same container built only after a state change. R5 passes with no note, while the field's text is `rgba(0,0,0,0)`.
- **This is what happened to the agent:**
  - The inspector is not built at boot, so R4 passed (#59) and R5 passed (#71).
  - Only `declare-look --console` printed the error.
  - The agent paid for it with screenshots, `--js` and reading `library/textinput.declare` (about 3k tokens; the agent puts it at about 15 minutes).
- **What is and isn't a defect:** the compile-time check the agent asks for (a declared attribute that shadows a provided name with a different type) would be a new diagnostic. R5 swallowing an error that R4 treats as fatal is the defect.

**B8. The look tool's held clock makes `Date.now()` fractional.**
- **Repro:** `clock.declare`. `declare-look … --js 'Date.now()'` gives `1794452636762.7`. A real browser's `Date.now()` is always an integer.
- **Effect:** the agent's ids came out as `"ej.atqua4t"` (#119). It wrapped the clock in `Math.floor` (`model.declare:94`). A fidelity defect, small.

**B9 (tool gaps, minor).**
- `page.mouse.dblclick` is undefined in assert scripts. `page.mouse.click` exists (`mouse.mjs`), and Playwright's `Mouse` has `dblclick`. `verify.md` presents `page` as Playwright's page and never says it is partial. The agent switched to `drive.dblclick` (#117–118).
- `declare-look` has no `--hover`, although `drive.hover` exists (#120).

### Every refusal, finding and behaviour changed: what was written, what was said, verdict

**Round 1: compile and boot refusals.**

| # | Written | Platform said | Verdict |
|---|---|---|---|
| 31 | `class TextShape extends Shape [ height = null …` (proto) | DECLARE2000: expects a Length, "write { null }" | Agent's code wrong. The suggested fix is itself refused (B6). |
| 32 | `schema TextStyle`, `schema Stroke` | DECLARE4015: takes the name of a Declare type; rename | Agent's code wrong. Excellent message. |
| 33 | `datapath = { app.src.value?.slides[app.pick] }` | DECLARE6001: `Slide \| undefined` not assignable | Agent's code wrong. Fine. |
| 55 | NumField base with a `value` constraint and no `commit` | DECLARE2000: add `commit(…)` beside it | Agent's code wrong. Good. |
| 55 | `accessibilityRole = alert` | an alert is `status` + `accessibilityLive = assertive` | Agent's code wrong. Good. |
| 55 | `fill: string` declared on Inspector | View already has `fill` | Agent's code wrong. Good. |
| 55 | `doc: Doc [ ]` | a Dataset needs data | Agent's code wrong. Good. |
| 56 | `classFor = { app.markClass(:kind) }` | DECLARE4000: classFor reads only the record | Agent's code wrong; the reference's own example is the ternary chain. The account's claim that the chain "then draws the DECLARE4025 lint" is false: the final verify shows no 4025 on `slide.declare`. |
| 56 | `value <-> classroot.draft` inside a Dialog on the App | DECLARE4003: `classroot` only inside a class | Agent's code wrong. Good. |
| 58 | `app.palette.openFor(this)` | `openFor` is not a member of Palette | Agent's code wrong. `Popover` uses `showFor`; help would have said. |
| 58 | `app.stage.k` (alias typed `Stage?`) | Object is possibly null | Agent's code wrong. |
| 112 | `class ToolButton extends IconTool` | DECLARE5000: a library class name | Agent's code wrong. Good message. It could add that the library `ToolButton [ toggle ]` in a `Toolbar` is the thing being re-made. |
| 113 | child `shown: Text` inside a TextInput | DECLARE2000: `shown` is an attribute | Agent's code wrong. Good. |

The account puts the last two in part 2. Both happened in round 1.

**Round 1: warnings acted on and left.**
- **Fixed:**
  - 4023, `rowIndex` read from a non-replicated child: fixed to `classroot.rowIndex`.
  - 4022, swatch pressed state: fixed.
  - 4035, a label without a role: fixed on the paper and the presenter.
  - 4020, a button inside a button: `DeckCard` restructured into two sibling controls, which is the right fix.
- **Left:** 4026 (tools as one choice; misstep 4) and 4025 (ternary chains; misstep 6). Both are still in the final verify.

**Round 1: runtime and behaviour.**

| # | Written | Platform said or showed | Verdict |
|---|---|---|---|
| 60 | `beat` Spring to 1000 with stiffness 0.6, as a pulse | R5: motion did not settle within 5000 ms | Agent's code wrong. The guide says per-frame motion is a `Time`. |
| 60–79 | `textColor: string = {…}` on Inspector | No compile error. R4 and R5 clean, since the inspector isn't built at boot. Console error and transparent field text seen only in `declare-look` | Agent's code wrong. The silence in R5 is B7. |
| 63 | the title's `width = { this.contentWidth + 24 }` | Title truncated, seen in a screenshot | Agent's code wrong: `contentWidth` is the children's box. Docs unclear that a field never sizes to its text (workaround 6). |
| 70, 84 | `getByRole("button", { name: "Text" })`; `"Present"` | Strict mode: matches 2 elements | Test code wrong. Good message. |
| 70–86 | the home list under the opening editor | layout: controls another view takes the presses of (home by stage, by rail) | **Platform** false positive (B4). The agent added `pointerEvents` and `tabOrder` gates. |
| 84 | Tab order across home and editor | layout: Tab goes from "More for Reading group" to "All presentations" | Unsure. Probably the same mid-transition snapshot. The agent's `tabOrder()` gate (`home.declare:178`) is good practice either way. |
| 85 | `Presenter [ at = { app.showAt } ]` at the use site, and `at = at + 1` in the class | runtime: `Presenter.at is bound by a constraint — a direct write would be silently overwritten` | Agent's code wrong. §5 explains it; good message. Moved to a class default. |
| 85 | the editor left visible under the presenter | layout: 35 controls covered by `presenterView` | Correct finding (agent's code). Fixed with `editor.visible` gated on the presenter's arrival (`presentify.declare:379`). |
| 93 | `SlideView [ datapath = { classroot.theirs } ]` | `this value is no longer anywhere in its dataset` | Agent's code wrong: it pointed at `Probe`'s value after `Probe` had loaded again. The message could name the dataset that moved on. |
| 94 | derived `copy: Dataset` + `{ copy.value?.slide }` | the same error | **Platform** (B1). |
| 71 on | (library) | note: `onChange: 'v' changed again in the same settle chain` | Unsure. It comes from `library/valuecontrol.declare:322` (`_member`), not the program. A title-field repro (`ring.declare`) did not show it. The agent never traced it. |
| 117 | `page.mouse.dblclick(…)` in a script | `page.mouse.dblclick is not a function` | Tool gap (B9). |
| 119 | ids from `Date.now().toString(36)` | an id `"ej.atqua4t"` | Tool fidelity defect (B8). |
| 120 | `declare-look … --hover` | not an option | Tool gap (B9). |
| 60–62 | a `--shot` path left from an earlier, failed run | Stale picture nearly misread | Tool behaviour as designed (the run printed FAILED). Minor. |
| 136–143 | `npm start` on 8200, then 8201 | Port taken by another tree; the message names the next port | Fine; good message. |

**Keyboard follow-on.** There were no R1–R4 refusals; every verify from #22 on is clean.

| # | Written | Platform said or showed | Verdict |
|---|---|---|---|
| 27–30 | menu records `key: "Ctrl+G"` | The menu showed "Ctrl+G" while its own sheet showed "⌘G" | **Platform** (B3). The agent reworked keys into display spellings. |
| 32–34 | the slide list with `focusable = true, focusScope = stop` | Assertion `expected true, got false` after Shift+Tab. Tab trace: focus on "Slides", not a row | Agent's code wrong. The reference's order ("`focusEntry()`, else the last focused, else the view itself when it takes focus") says so. Fixed with `focusEntry()`. |
| 34–37 | ArrowUp/Down, then Home/End, as the list's `keyBindings` | `expected 1, got 0 … ArrowDown`; `expected 3, got 1 … End` | **Platform** (B2). The agent moved them to the rows, which `08-controls.md:287` does describe for a member that wants an arrow. The container's binding being silently outranked contradicts 09 and the `focusScope` reference. |
| 38–54 | `focusShape() -> object { return this.paper }` (also `this.frame`, `this.pic`, all from round 1) | Compiles. R5 passes with only notes: `FocusRing.draw(): moveTo was given a coordinate that is not a finite number`. No ring on the slide, rows or cards | Agent's code wrong: `declare-help Control.method.focusShape` states `{ x, y, w, h, rad }`. Repro `focusshape.declare` confirms the silence. The platform's note blames `FocusRing.draw`, not the control whose `focusShape` returned a view. That misattribution is what sent the agent into `library/focusring.declare`. Cost about 5k tokens. |
| 54 | `row.scrollIntoView()` | The list scrolled the row to the top | Agent's choice. The signature documents `"nearest"`. |
| 57–60 | the conflict Dialog with three buttons | Overflow, seen in a screenshot | **Platform** (B5). |
| 57 | Shift+F10 opening the menu `openFor(this.paper)` | The menu opened at the paper's corner | Agent's design; moved the anchor to the se handle. |
| 62 | (same cover as round 1) | layout after `key Mod+Alt+N`: `homeView.bar.newBtn (by stage)` | **Platform** false positive (B4). |

### Reads of library/ and runtime/ source (reference gaps)

| # | Read | Looking for | Did declare-help or the docs have it? |
|---|---|---|---|
| R1 #12 | `grep -ril undo library docs/guide` | An undo or history facility | No: there is none, and nothing says so. Gap (same as run 5). |
| R1 #24–25 | `grep runtime/src` for TweenLayout; `runtime/src/tween-layout.ts:1-80`; `grep apps` for `.move(`/`reorder` | When `place()` re-runs, and whether a live reorder is supported | Partly. `TweenLayout.retarget` says it "re-aims at the current arrangement", but not that `place()` runs only on retarget or install. This read decided the ghost-and-drop-line reorder design. |
| R1 #50 | `grep library/textinput.declare` (lineHeight, padding, NativeText) | How a TextInput's line metrics compare with `Text`'s, for typing in place | No. `TextInput` and `NativeText` help say nothing about line height versus `Text`'s. |
| R1 #78 | `library/textinput.declare:244-380` | Why the inspector's fields had transparent text | No. The answer (its own `textColor` attribute shadowing the provided one) is nowhere a reader would look. B7 would have caught it in R5. |
| R1 #126 | `grep library/dialog.declare` (DialogButtonRecord, destructive, danger) | A destructive button | Yes, by absence: `Dialog.method.open` gives the record shape `{ id, label, default?, cancel? }`. `Dialog.buttons` names the type but not its fields. |
| P2 #4–6 | `runtime/src/keys.ts` (1–80, 110–200) | Whether ⌥-letter shortcuts match on a Mac, where ⌥A types å; which chords a field keeps | Half. 09 lists the field's chords. That `Alt+letter` bindings match by physical key on a Mac is documented nowhere (09 mentions only `code: "KeyW"`). Gap. |
| P2 #7–8 | `library/menubar.declare` (grep; 108–180), `grep library/menu.declare` typeahead | That the menu bar is one Tab stop; that its item keys are global; type-to-select in menus (brief §4) | Global keys: yes (`MenuBar.menus`, `Shortcuts`). One Tab stop and Left/Right among titles: only in the library file's internal section. Menu type-to-select: nowhere. Gap. |
| P2 #11, 18, 19 | `grep library/themes/*.declare`, `defaults.declare`, `sanfrancisco.declare`, `library/focusring.declare` for focusRing and menuBar tokens | Ring and menu-bar token names and defaults | Yes. `FocusRing`'s help lists the tokens, and `declare-help "theme tokens" --all` gives the defaults. The agent read only the first screen. |
| P2 #24 | `library/choicecontrol.declare` (class body) | How ChoiceControl takes focus and commits | Mostly yes: `ChoiceControl --all` and `08-controls`. |
| P2 #48–49 | `library/focusring.declare` (grep; 200–330) | Why no ring drew | Yes: `Control.method.focusShape` states the box contract, and the agent asked it next (#53). It went to the source because the runtime note named `FocusRing.draw` (see above). |
| P2 #53 | `grep "focusShape()" library/*.declare` | Examples of a `focusShape` | The reference's sentence sufficed. The examples confirmed it. |

### Where the account is wrong or unsure, against the streams

- **"ToolButton" and the `shown` child:** these refusals are listed under part 2. They happened in round 1 (#112–113).
- **classFor and DECLARE4025:** the ternary chain does not draw the lint.
- **Headless Chrome:** it does not report as non-Mac; it reports MacIntel (B3 repro). The "Ctrl+G" in the menu is the menu's verbatim display, not the platform guess.
- **The keyboard 2-D grid:** "I added my own Up/Down by ±7" (g3) describes code that never runs (B2). The keyboard script tested only ArrowRight in the palette, so this was not caught.
- **The `textColor` judgement:** "the platform should refuse this" asks for a new compile check. The real defect underneath is that R5 stayed silent (B7).


## Names

Round 1: one miss (`openFor` on a Popover, which has `showFor`; no hint, resolved at once) and three collisions, each refused with a message naming the fix (`TextStyle`, `Stroke`: Declare's types; `ToolButton`: a library class). The follow-on: none. No `declare-help` lookup missed.

## The agent's account, verbatim

Asked after the follow-on, resuming the session with read-only tools (`impressions.txt`: the standard questions, asked for each part).

# Building Presentify in Declare: a candid account

## Part 1: the first build

### (a) Getting up to speed

**What I read, in order.**
1. `README.md`.
2. `skill/SKILL.md` and `AGENTS.md`.
3. `docs/declare.md`, whole.
4. `docs/guide/01-what-declare-is.md`, `04-structure.md`, `05-run-and-check.md` and `06-layout.md`, whole.
5. `apps/todo/todo.declare` and `todo-parts.declare`, whole.

That is the order SKILL.md prescribes, and I followed it. I then read more guide chapters, picking them by what the plan needed:
- `09-pointer-and-keyboard.md` and `14-data.md`, whole;
- `18-overlays.md`, `17-your-own-views.md`, `12-text.md`, `21-motion.md`, `23-animated-arrangements.md` and `08-controls.md`, whole;
- part of `docs/operational/verify.md` (the assert-script API and the `drive` table);
- the `grep` index of `docs/operational/introspection.md`.

**What I skipped.**
- The tracker, desktop and calendar apps. The skill table pointed at desktop for "objects people move and resize". I judged my drag model to be far enough from window dragging that reading it wasn't worth the context. I'm unsure that was right: desktop may have had a ready pattern for resize handles.
- Guides 02, 03, 07, 10, 11, 13, 15, 16, 19, 20, 22, and 24–31. I relied on `declare.md` for constraints (03) and on `npx declare-help` lookups for everything else.
- The theme chapter (11). Not reading it cost me the `textColor` collision; see (d).

**What taught me the most.**
- The to-do app. It showed the shape: a dataset class that makes every write, state on the App, `classFor`, a `TweenLayout` subclass with `retarget`, and `afterSettle(() => Focus.focus(...))`. I copied its patterns directly, including `Line`/`Glide`, the `Glyph extends Icon` drawing pen, and `IconButton extends Control`.
- `declare.md` §5 on what you can assign, and the settle. Together these explained why `at = { app.showAt }` was later refused.
- `npx declare-help` itself. It was fast, and I used it about 40 times: `Color`, `View.scale`, `stroke`, `DrawContext`, `TextInput`, `TweenLayout --all`, `Dialog`, `PointerEvent`, `ClipboardEvent`, `afterDelay`, `provided`, `ChoiceControl` and others.

**What was missing or misleading.**
- **Datapaths need a place, not a value.** Nothing I read said plainly that a `datapath` must point at a place in a Dataset and not at an arbitrary object. I hit this at runtime (d6).
- **Built-in names are taken.** The rule that a declared attribute named like a built-in provided value (`textColor`) silently shadows the cascade below it is implied by "providing is just holding a value". I didn't connect the two until a screenshot showed invisible text.
- **`focusShape()` returns a box.** Its contract (`{x, y, w, h, rad}`) is in the reference, but I wrote `focusShape() -> object { return this.frame }` from intuition, and nothing complained at compile time. See Part 2.
- **When `place()` re-runs on a TweenLayout.** I had to read `runtime/src/tween-layout.ts` to learn that `place()` runs on retarget or install, not whenever it reads something new. That decided my reorder-by-drag design (h3).

### (b) Expressing what I wanted

**Where Declare fit well.**
- **One scaled class for every slide.** One `SlideView` (1280×720 inside, `scale` set by whoever places it) serves the editor, the slide list, the home cards, the conflict preview and presenting. `scale` really does take the footprint, so the layout around a scaled slide just worked.
- **The open/close animation.** One `openT` spring, with the editor's `x`, `y`, `scale` and `cornerRadius` reading it. About ten lines, and it worked the first time.
- **Derived state.** `selEls`, `selBox`, `canGroup` and the inspector's mixed-value detection are all constraints, with no update code.
- **Overlays.** `Menu`, `ContextMenu`, `Dialog.open(..., cb)`, `Toast` and `Popover.showFor`.
- **TweenLayout.** Slides glide when they reorder, arrive or leave, with no code.
- **DataSource as a write channel.** Setting `url`, `method` and `body` and then calling `fetch()` from `pump()`, with `onLoad` and `onError` dispatching on a `_job` field, worked cleanly for a serial save queue.

**Where I worked around it.**
- **Hit-testing.** All of it lives in `script` geometry functions. The slide's marks are `pointerEvents = "none"`, and the stage takes every press and converts the point to slide coordinates. This was deliberate (thin lines, ellipse interiors), not forced, but it means views don't help with hit-testing.
- **Element edits.** These are pure functions in `script` (`mapEls`, `fitEl`, `restack`, ...), with whole arrays written back through `Doc.setElements`. The model is immutable values, and Declare's datapath writes (`:x = v`) went almost unused, because a drag replaces whole elements.
- **Undo.** Built by hand as snapshots (`History` holding `structuredClone(app.doc.slides())`). I didn't look for an undo facility. The tracker has undo via toast; I didn't check whether the platform offers transaction history on Datasets (see g).
- **The save engine.** It's a hand-written reconciler. Fine, but it is a lot of imperative code in a `Node` class.

### (c) The first time it ran

I prototyped `my-apps/proto/proto.declare` first: a scaled SlideView over `/api/decks/d1/slides`. The first screenshot showed the coast slide rendered correctly. Groups and lines were missing, because I had no classes for them yet, and that's how I found them. I then wrote the whole app. On its first boot, the home screen was right. The editor screenshot looked right except:

1. **The title was truncated.** "Field notes from the" was cut off, because the field's `width = { this.contentWidth + 24 }` didn't measure the text. I found it by eye in the screenshot.
2. **The inspector's number fields looked empty.** I found the cause with `--js` over `document.querySelectorAll("input")`: the values were present, but the text colour was `rgba(0,0,0,0)`. That led to the `textColor` attribute collision (d7).
3. **The keep-proportions checkbox had no label.** Same cause.
4. **The "Font" Button was oversized.** That's the library Button's own type size; I replaced it with my own `PopButton`.
5. **A console error.** `--console` printed `a color attribute received "" (a string)`; it was the same `textColor` collision.

### (d) Every refusal and surprise

1. **The prototype's TextShape height.**
   - Wrote: `class TextShape extends Shape [ height = null, ...` (Shape set `height = { :height ?? 0 }`).
   - Platform: `TextShape.height expects a Length ... got 'null' — write { null } ... [DECLARE2000]`.
   - Changed: Shape no longer sets height; Rect and Ellipse marks set it.
   - Judgement: my code. What I wanted was "unset", and there is no way to say "unset an inherited attribute". The fix the message offered (`{ null }`) wasn't what I needed. The message was clear, though.
2. **Schema names clash with built-in types.**
   - Wrote: `schema TextStyle [...]` and `schema Stroke [...]`.
   - Platform: `schema TextStyle takes the name of one of Declare's own types ... Rename yours [DECLARE4015]`.
   - Changed: renamed them `Words` and `Ink`.
   - Judgement: an excellent message. Not a fault.
3. **A datapath can't be undefined.**
   - Wrote: `datapath = { app.src.value?.slides[app.pick] }`.
   - Platform: `Type 'Slide | undefined' is not assignable to type 'object | DataCursor | null' [DECLARE6001]`.
   - Changed: added `?? null`.
   - Judgement: fine.
4. **First full verify (R1).** Five errors at once:
   - `TextInput.value is constrained here, but the TextInput also changes it itself ... add 'commit(…)'` (my NumField base had a `value` constraint and no `commit`). Fix: an empty `commit` in the base.
   - `ConflictBanner.accessibilityRole ... got 'alert' — an alert is accessibilityRole = status with accessibilityLive = assertive`. Fix applied as told. A great message.
   - `View already has an attribute 'fill' — a declaration introduces a new one` (I declared `fill: string` on Inspector as data). Renamed to `fillVal`.
   - `a Dataset needs data` for `doc: Doc [ ]`. Fixed with `{ { "slides": [] } }`.

   All my code; all the messages were good.
5. **R2 refusals.**
   - Wrote: `classFor = { app.markClass(:kind) }`, a method returning a class. Platform: `classFor reads the record and names classes — 'app' is neither [DECLARE4000]`. Changed it to an inline ternary chain, which then draws the DECLARE4025 nesting lint. Judgement: an understandable restriction, but the lint then penalises the only shape allowed. Mildly wrong-feeling, platform-side.
   - Wrote: `value <-> classroot.draft` inside a Dialog declared as an App member. Platform: `'classroot' ... valid only inside a class body [DECLARE4003]`. Changed it to `app.renameDialog.draft`. My error.
6. **R3.**
   - `'openFor' is not a member of this Palette`: Popover uses `showFor`. My error; the help lookup would have told me.
   - `Object is possibly 'null'` for `app.stage.k` (the alias is typed `Stage?`). I used `app.ed.k` instead.
7. **The `textColor` collision (biggest surprise).**
   - Wrote, on Inspector: `textColor: string = { app.agree(this.texts.map(...)) }`.
   - Platform: no compile error. At runtime: `[Declare] a color attribute received "" (a string) ... Nothing was painted`, plus invisible text in every input and the checkbox label inside the inspector.
   - Changed: renamed it `wordsColor`.
   - Judgement: the platform should refuse this. Declaring an attribute whose name is a provided built-in (with a different type, `string` vs `Color`) is almost certainly a mistake. A compile error, like the `fill` one in d4, would have saved about 15 minutes. That `fill` was refused while `textColor` was not looks inconsistent.
8. **The settle never finished.**
   - Wrote: `beat: number = 0, Spring [ attribute = beat, to = { app.loadingDeck ? 1000 : 0 }, stiffness = 0.6, damping = 2 ]` as a crude pulse.
   - Platform: `motion did not settle within 5000 ms`.
   - Changed: removed the pulse.
   - Judgement: my abuse. The guide does say per-frame motion should be a `Time`.
9. **An index the presenter couldn't move.**
   - Wrote: `presenterView: Presenter [ at = { app.showAt } ]` at the use site, plus `next() { at = at + 1 }` in the class.
   - Platform: `Presenter.next threw: Presenter.at is bound by a constraint ... a direct write would be silently overwritten`.
   - Changed: `at: number = { app.showAt }` as a declared default inside the class.
   - Judgement: my error. §5's table explains exactly this, and the runtime message pointed me there.
10. **A datapath to a plain object.**
    - Wrote: `SlideView [ datapath = { classroot.theirs } ]`, where `theirs` is a `ServerSlide` object held in an attribute.
    - Platform: `SlideView.datapath threw: SlideView.datapath: this value is no longer anywhere in its dataset`.
    - Then wrote: `copy: Dataset [ contents = { ({ slide: classroot.theirs }) } ]` with `datapath = { classroot.copy.value?.slide ?? null }`. Same error.
    - Changed: `peek: View [ datapath = { classroot.copy.value }, SlideView [ datapath = :slide ] ]`. Binding to a place by path worked.
    - Judgement: unsure. Either `{ dataset.value.x }` re-derives to a fresh object identity that the cursor can't find, or a derived dataset's contents are re-created. The docs say a non-replicated datapath "points at a place", and the fix shows that's the rule. But the second attempt *looks* like a place to a reader. The message could say "point at the dataset and select with a :path".
11. **Layout findings.**
    - "control(s) another view takes the presses of: app.homeView.bar.newBtn (by app.editor.body.stage)". This is the list under the growing editor. I added `pointerEvents = { app.open ? "none" : "auto" }` and a `tabOrder()` gate. It still reports, because the check runs mid-transition right after `set app.location`. Judgement: my design is intentional; the checker can't know that, and I found no way to tell it. Platform-side, arguably: it could skip views that are mid-spring.
    - "Tab goes from 'More for Reading group' to 'All presentations', which sits above it". Fixed by the `tabOrder()` gate on HomeScreen.
12. **Library names taken.** `ToolButton` is a library class and can't be redeclared ([DECLARE5000]); I renamed mine. A child named `shown` on TextInput was refused because `shown` is an attribute. Both were good messages. (These two happened in Part 2 but belong to the same family.)
13. **Not-integer clock in tests.**
    - `newId()` built ids from `Date.now().toString(36)`. Under the look tool's held clock, `Date.now()` was fractional, which produced ids like `"ej.atqua4t"`.
    - Changed: wrapped it in `Math.floor`.
    - Judgement: the platform's held time returning fractional ms is defensible but surprising. Unsure whether real browsers can do this.
14. **Seen running.**
    - `onChange: 'v' changed again in the same settle chain — a ring of change handlers` appeared in R5 notes. I never traced it. I suspect a library ValueControl, or my TextMark `measured` writing the model height inside the settle triggered by height. Unsure.
    - Pressing `--press app.editor.body.stage 640,500` selected a line via marquee rather than the shape I expected. That was my coordinate arithmetic, not the platform.

### (e) Verifying it

- **`declare-verify` R1–R4 after every edit.** It caught every structural, type and name error above, quickly (a few seconds).
- **`declare-look` screenshots.** These caught the empty fields, the truncated title, the oversized Button, and confirmed the open animation, guides, marquee, rail ghost, conflict banner, presenter and dialogs. `--press/--move/--shot` for in-progress drags was exactly what I needed.
- **`--js`** found the transparent text colour, and the `--set app.saver.api=http://127.0.0.1:1/api` trick simulated an outage. Both were very effective.
- **Three assert scripts against the live service.** `flow` covers the brief's §12; `slides` covers duplicate, reorder, present and conflict; `editing` covers handles, proportions, groups, clipboard and the inspector. They caught:
  - strict-mode locator ambiguity ("Text" also matched "Text colour");
  - the presenter `at` constraint bug;
  - `page.mouse.dblclick` not existing.
- **`drive.profile`** on a 100-slide deck gave turn costs (~10 ms) with causes. Useful and readable.
- **Tool friction:**
  - Writing to a live service leaks test data whenever a script fails before cleanup. I added `try/finally` after leaking `d101` and `d107`. The verify note warning about this was helpful.
  - The first `--shot` to a path that already existed silently left a stale image from another program after a failed run. Easy to misread; I nearly did.
  - The dev server's port conflicts (8200 and 8201 taken by other trees) were well explained.

### (f) Confidence (Part 1)

**High:**
- presentations list, create, rename, delete with confirmation;
- slides add, duplicate, delete and reorder with gliding;
- drawing all four kinds, shift for square or circle, click to make a text box;
- select, shift-select, marquee;
- move, nudge, resize with handles, keep proportions and its shift override;
- corner radius that stays fixed on resize;
- group, ungroup, double-click into a group;
- align, distribute, ordering;
- undo and redo with selection restored;
- saving and the three status strings;
- presenting;
- conflict detection when returning to a slide.

**Medium:**
- **Text height and in-place text.** Line height in the native field versus `Text lineHeight = 1.2` looked identical in one screenshot only.
- **Clipboard across windows.** The custom MIME type is untested across real windows.
- **Deck-level changes from another window.** A slide added elsewhere isn't shown until reopen.
- **Width-only text handles.** Fine, but a tester might expect corner handles on text.

**Where I'd expect bugs:**
- Lines inside groups during resize.
- Very thin shapes, where the side handles hide.
- Rapid undo during a save in flight.
- `finishText` when history isn't open.
- The offline state stuck after a 422.
- Rails with 100 slides while dragging near the scroll edge.
- The `onChange` ring note in (d14).

### (g) Gaps I worked around

1. **Hit-testing arbitrary shapes.** I wanted views to answer "does this point hit me" for ellipses and lines. I used `script` geometry plus a single pointer surface. Unsure: `viewAt` exists, but a shape-aware hit test probably doesn't. I didn't search.
2. **Undo.** I wanted dataset transactions or history. I wrote snapshot history by hand. I didn't look; the tracker's toast undo suggested there is no general facility. Unsure.
3. **Fullscreen.** No Declare API that I found. I used `script [ host = browser ]` with `requestFullscreen` and a `fullscreenchange` callback. This is probably genuinely absent, and the script door is the intended route.
4. **Leave-page guard.** `beforeunload` through browser script, same reasoning.
5. **Ellipse paint.** No ellipse primitive, so `draw()` with `d.ellipse`. Fine.
6. **Line hit width and "unset" height on a subclass.** Worked around by class structure.
7. **Debounce.** `afterDelay` plus a `_quietAt` timestamp check. I didn't look for whether `afterDelay`'s handle `cancel()` would be cleaner; it would have been. I saw `DelayHandle` in help but didn't use it.
8. **Ellipsis on a text field.** I overlaid a `Text` with `maxLines = 1` over a field with transparent text. Probably genuinely absent from TextInput.

### (h) Changes of direction

1. **Conflict UI.** First a banner only (Part 1); it became a Dialog plus the banner in Part 2, because the keyboard brief wanted it as a dialog.
2. **The conflict preview's binding.** Value datapath → derived dataset → path datapath, all within about 10 minutes, driven by the runtime error.
3. **Slide reordering.** I considered moving the record live as the drag crossed rows (the guide's recommended idiom). Before writing it, I chose a ghost plus a drop line with the move on release, because TweenLayout's `place()` doesn't re-run live (from reading the source) and the brief says the list must not reflow under the pointer. Own second thoughts.
4. **Library Button to my PopButton for the font and weight menus.** From the screenshot.
5. **DeckCard.** A Control with a nested "more" Control became a View holding two sibling Controls, after the accessibility warning that a button inside a button is unreachable.
6. **Tool tooltips.** "Select (V)" became exactly "Select" in Part 1, out of caution about the brief's wording. In Part 2 they changed back to "Select   V".
7. **The text-height measuring rule.** Planned as always-write; I changed my mind before writing it to write only for `editingId`/`reflow` ids, so that opening a deck doesn't dirty it.

### (i) The code, quoted

- **Collision (d7):**
  ```
  class Inspector [ ...
      textColor: string = { app.agree(this.texts.map((e) => opaque(e.text?.color ?? "#000000"))) },
      ...
      NumField [ accessibilityLabel = "Outline width", ... ]
  ```
  Console: `[Declare] a color attribute received "" (a string) — inside { } a color is a NUMBER: 0xRRGGBB (named colors are bare-value vocabulary only). Nothing was painted.` DOM: the inputs had `color: rgba(0, 0, 0, 0)`.
- **Datapath to an object (d10):**
  ```
  class ConflictBanner [ ...
      theirs: ServerSlide? = { app.saver.conflicts[app.ed.currentId] ?? null },
      copy: Dataset [ contents = { ({ slide: classroot.theirs }) } ],
      peek: View [ ..., SlideView [ scale = { 96 / 1280 }, pivotX = 0, pivotY = 0, datapath = { classroot.copy.value?.slide ?? null } ] ],
  ```
  Error: `SlideView.datapath threw: SlideView.datapath: this value is no longer anywhere in its dataset — while working out SlideView.datapath at app.editor.body.stage.banner.peek.0`. Reproduced by calling `Saver.heard()` with a newer version, so that `conflicts` gets a new key.
- **classFor (d5):** `Mark [ datapath = :elements[], classFor = { app.markClass(:kind) } ]` → `classFor reads the record and names classes — 'app' is neither ... [DECLARE4000]`.
- **Spring that never settles (d8):** quoted above. Message: `motion did not settle within 5000 ms (after: settleMotion → settleMotion)`.
- **Presenter (d9):** `next() { if (at < count - 1) at = at + 1 }` with `at = { app.showAt }` at the use site. Message: `Presenter.next threw: Presenter.at is bound by a constraint (Presenter.at) — a direct write would be silently overwritten; change what the constraint reads instead — in Presenter.next (line 75)`.

### Surprises, good and bad (Part 1)

**Good:**
- Diagnostics that name the fix, nearly every time.
- `scale` that layout honours.
- Springs and TweenLayout with no code.
- Verify, look and assert in one ladder.
- Profiler output written in the program's own terms.

**Bad:**
- Silent attribute shadowing of provided built-ins.
- Datapath-identity rules learned only at runtime.
- Strict-mode test locators colliding with my own labels.
- The layout checker not distinguishing an in-flight transition.

**The sharpest edge** was the `textColor` collision. It was one obstacle that cost about 15 minutes; a compile-time refusal would have prevented it.

## Part 2: the keyboard follow-on

### (a) Getting up to speed

I didn't re-read the core docs; my context was intact. I read:
- `task/brief-keyboard.md`;
- `npx declare-help MenuBar --all` and `ShortcutsPanel --all`;
- `library/menubar.declare`, by grep and lines 108–180, to learn that it is one Tab stop and that `_shortcuts` makes the item keys global;
- `runtime/src/keys.ts`, lines 110–200, to learn how ⌥-letters match on a Mac (`comboOfCode`) and the `FIELD_CHORDS` list;
- `declare-help Shortcuts --all`, `Keyboard`, `ChoiceControl`/`ChoiceItem`, `FocusRing --all` and `focusRingStyle`;
- the `Dialog.buttons` record shape (via grep of `library/dialog.declare`);
- `library/choicecontrol.declare`;
- `library/focusring.declare`, lines 200–330, while debugging the missing ring.

What taught me most: `keys.ts`. It answered "will ⌥A work on a Mac, where Option types å?" and "which chords does a text field keep?". Neither question is answered in the guide I had read; they may be answered in `09-pointer-and-keyboard.md`, which I'd read for Part 1, but not at that depth.

What was missing:
- Whether a Menu displays a record's `key` verbatim (it does) versus formatted per platform (the hold-⌘ panel does format). I found out from a screenshot showing "Ctrl+G" in a menu while my sheet showed "⌘G".
- The `focusShape` contract. See (d).

### (b) Expressing what I wanted

**What fit well:**
- `MenuBar` as the shortcut table. Declaring each key once in menu records, with the library making them global, standing them down in text fields and under dialogs, and listing them in the hold-⌘ panel, did most of §2 and §5.
- `command: "copy"` on menu items routing to `onClipboardCopy`.
- `Dialog` with `shown`, `input` and `buttons` for the conflict.
- `ChoiceControl` for text alignment.
- `focusScope = stop` with `focusEntry()` for the slide list and the colour grid.
- ValueControl's `beginEdit`/`edit`/`commitOn = "end"`/Escape-cancel. Number-field arrow stepping that applies on Return or leaving and reverts on Escape was about eight lines.

**What I worked around:**
- **Key display.** I had to spell keys per platform myself (a `keyText()` in a browser script) so that menus, tooltips and the sheet agree.
- **Arrow keys in a focus stop.** The stop's own handling preempts the container's bindings, so I moved the arrow and Home/End bindings onto the rows.

### (c) The first time it ran

It compiled and booted the first time after the big edits, surprisingly (R1–R4 clean). Then:
1. **The menu showed "Ctrl+G" while my sheet showed "⌘G"**, seen in a screenshot. Fixed by spelling keys in the table.
2. **Shift+Tab into the slide list focused the list, not a row**, found by the keyboard script's assertion and then a Tab-trace script that printed `document.activeElement` labels. Fixed with `focusEntry()` and by removing `focusable = true` from the list.
3. **ArrowDown and Home/End in the list did nothing**, found by assertions. I moved the bindings to the rows.
4. **No focus ring on the slide, slide rows or deck cards.** Screenshots showed none; `--js` reading the FocusRing view's state led to runtime notes saying `FocusRing.draw(): moveTo was given a coordinate that is not a finite number`. Cause: my `focusShape()` returned views.
5. **The list scrolled the focused row to the top.** `scrollIntoView()` defaults to "start"; changed to `"nearest"`.
6. **The conflict dialog's three buttons overflowed**, seen in a screenshot. Widened via a theme override `dialogWidth: 500`.
7. **Shift+F10's menu opened below the paper's corner**, seen in a screenshot. Anchored to the se handle instead.

### (d) Every refusal and surprise

1. **Library class name taken.** Wrote `class ToolButton extends IconTool [...]`. Got `'ToolButton' is a library class — a class of the program can't take its name; rename yours, as 'PresentifyToolButton' [DECLARE5000]`. Renamed it `ToolToggle`. Good message; my error.
2. **Child named like an attribute.** Wrote a child `shown: Text [...]` inside the title TextInput. Got `TextInput.shown is an attribute — a child may not take an attribute's name [DECLARE2000]`. Renamed it `asShown`. Good.
3. **`focusShape` returning a view (silent).**
   - Wrote: `focusShape() -> object { return this.frame }` (SlideRow, from Part 1), `return this.pic` (DeckCard) and `return this.paper` (Stage).
   - Platform: compiled. At runtime the ring drew nothing, with only R5 notes: `FocusRing.draw(): moveTo was given a coordinate that is not a finite number (NaN or Infinity)`.
   - Changed: return `({ x: 30, y: 8, w: 160, h: 90, rad: 6 })` etc.
   - Judgement: my code was wrong, but the platform should catch it. The return type `-> object` let a View through. If `focusShape` were typed as `{x,y,w,h,rad} | null` in the reference's TypeScript surface, the compiler would have refused it. This bug existed silently since Part 1: the first build's "keyboard first-class" claim had a hole I didn't see. That's the most important finding of Part 2.
4. **Arrow keys in a `focusScope = stop` container.**
   - Wrote: on the list View, `keyBindings = { [ ({ key: "ArrowUp", command: "prev" }), ... ] }`.
   - Platform: no error. The arrows moved focus between rows (the stop's built-in behaviour), but `app.ed.step` never ran, so the shown slide didn't follow.
   - Changed: bindings on each `SlideRow`. ("A member of a stop that wants an arrow for itself binds it", in `08-controls.md`, which I had read but not applied.)
   - Judgement: the docs cover it, but the container's own bindings being silently outranked is a trap. A lint ("keyBindings for arrows on a focusScope=stop container never run") would help. Same for Home/End.
5. **Menu key display.** Not an error; Menu prints `key` as given. Judgement: unsure whether intended; the hold-⌘ panel formats keys and Menu doesn't, which is inconsistent.
6. **Layout finding:** the same mid-transition one as Part 1, now after `key Mod+Alt+N`.
7. **The `focusShape` fix revealed a Part 1 accessibility gap.** There was no ring on SlideRow or DeckCard, and none of the Part 1 checks would have caught it: R4 doesn't Tab, and my scripts didn't screenshot focus.

### (e) Verifying it

- **`tests/keyboard.mjs`:** 75 steps, 45 assertions, the whole §6 scenario keys-only, plus inspector stepping and Escape, palette arrows, the menu bar and the sheet. It caught the list-focus and arrow-binding problems.
- **A throwaway `_tab.mjs`** printing the Tab order. It confirmed toolbar → rail → stage → inspector, and that disabled controls are skipped.
- **A throwaway `_k.mjs`** for the clipboard keys, Backspace while typing, Shift+F10, and ring screenshots.
- **Re-running the three Part 1 suites.** Only the conflict step needed changing, now a dialog answered with Return.
- **How the tools served me:** `drive.key("Mod+Alt+N")` and friends were excellent. Ring problems needed screenshots plus `--js` into the FocusRing view; a `--read` of focus-ring state, or a layout finding like "focused view has no visible ring", would have caught it at once.

### (f) Confidence (Part 2)

**High:**
- Tab order;
- slide list keys;
- every menu command and key in headless Chrome;
- inspector numbers, colours and alignment;
- menus open and close with focus restored;
- dialogs answering Return and Escape;
- the sheet;
- the §6 run.

**Medium to low:**
- **Real macOS Chrome.** Headless runs reported as non-Mac (menus showed "Ctrl"), so the ⌥-letter matching via `code`, ⌘= and ⌘−, ⇧⌘R (hard reload) and ⇧⌘B (bookmarks bar) were never exercised on a Mac. A Mac tester may find a browser taking one of them.
- **Return on a selected text box and Return to insert with a tool in hand** are tested only through the stage binding.
- **Focus after closing the shortcuts sheet.**
- **Screen-reader output of the menu bar.**
- **⌥↑/⌥↓ while typing** move the slide instead of the caret. This is known, and not fixed.

### (g) Gaps I worked around

1. **Platform-formatted key labels for my own UI.** I wanted the library's `keyLabel()`, which exists in `runtime/src/keys.ts`. I looked at `declare-help Keyboard` and saw only `isDown`/`held`/`navClaim`/`shortcutsInForce`. So I wrote `keyText()` in a browser script. Unsure: the function is probably exposed somewhere I didn't find.
2. **A shortcut "only while typing is not happening".** For ⌥↑ I wanted that distinction and found no `when:` on menu records. I left it. Possibly available; I didn't check whether Menu items take `when`.
3. **A keyboard 2-D grid.** `focusScope = stop` moves linearly, so I added my own Up/Down by ±7.
4. **A non-dialog conflict prompt that holds focus.** I used a Dialog, which is what the brief asked for anyway.

### (h) Changes of direction

1. **The keys.** Planned first as App `keyBindings` (Part 1 style); I chose `MenuBar` as the single table before writing any, after reading its reference.
2. **Tooltips.** Exact names → names plus key, because of brief §5.
3. **The list's focus behaviour.** `focusable = true` on the list (the list as the stop) became `focusEntry()` on the current row, because the Tab trace showed "Slides" focused rather than "Slide 1".
4. **Where the arrow keys live.** List bindings became row bindings, after the failing assertion.
5. **Keys spelled the Windows way and formatted at display** became keys spelled per platform in the records, after seeing "Ctrl+G" in the menu on screen.

### (i) The code, quoted

- **focusShape:**
  ```
  class SlideRow extends Control [ ...
      focusShape() -> object { return this.frame },
  ```
  `Stage`: `focusShape() -> object { return this.paper },`. Notes after a keyboard Tab to the stage: `FocusRing.draw(): moveTo was given a coordinate that is not a finite number (NaN or Infinity) — that mark is skipped ...` (also for `lineTo` and `arc`). No compile diagnostic.
- **Arrows in a stop:**
  ```
  list: View [ ..., focusScope = stop, focusEntry() -> View? { return this.rowOf(app.ed.currentId) },
      keyBindings = { [ ({ key: "ArrowUp", command: "prev" }), ({ key: "ArrowDown", command: "next" }), ({ key: "Home", command: "first" }), ... ] },
      SlideRow [ datapath = :slides[] ] ]
  ```
  Assertion: `expected values to be 1, got 0 (after: key Shift+Tab → key Shift+Tab → key ArrowDown)`, then `expected values to be 3, got 1 (after: ... key ArrowDown → key End)` once the arrows were moved but Home/End weren't.
- **The menu key display:** `({ id: "group", label: "Group", key: "Ctrl+G", ... })` rendered as "Ctrl+G" in the menu, in the same run where `keyText("Ctrl+G")` in my sheet rendered "⌘G".

### Surprises; good and bad; comparisons; what I'd improve; what I'd use it for

**Surprises.** How much the keyboard brief was already done by the library: the menu bar as shortcut table, field chords kept by fields, dialogs trapping focus, the hold-⌘ panel, Escape-cancel in fields, focus restored after menus. Part 2 was about four hours' worth of brief done in far less code than I expected (`commands.declare` is most of it). On the other side, the one thing I got wrong (`focusShape`) was silent.

**Good:**
- Diagnostics that name the fix.
- Reactive geometry plus springs for continuity.
- Overlays as standing members.
- The verify, look and assert ladder.
- Library keyboard and focus semantics that are genuinely desktop-grade.

**Bad (the patterns):**
- **Silent wrong-type values from my code.** A string `textColor`, a View as `focusShape`, an object datapath that only fails when evaluated. These were three obstacles of the same kind, roughly 45 minutes in total. To write them right the first time, I'd have needed compile-time refusals: a declared attribute that shadows a provided built-in; a `focusShape` return type that isn't the box shape; and a datapath expression that isn't rooted in a dataset place.
- **Behaviour determined by where a binding sits relative to focus scopes**, learned by experiment.

**How it differs from what I know.** It's closest to OpenLaszlo (which it acknowledges) and to SwiftUI or QML in its reactive bindings. Unlike React there is no render. Unlike QML, layout is an attribute object and Datasets are first-class. The `script` boundary felt like Elm ports: a clear line between the pure core and the effectful edges. The MenuBar-as-shortcut-table felt like AppKit's responder chain and key equivalents.

**Where I'd most want improvement:**
1. Compile-time type checks at the boundaries listed above.
2. A "focused view has no visible ring" check in R4 or R5 (Tab through the app automatically).
3. A layout-checker exemption for views mid-spring or covered on purpose.
4. Exposing `keyLabel` and making Menu format keys the same way the hold-⌘ panel does.
5. A documented undo or transaction facility on Datasets, if one doesn't exist.

**What I'd use it for:** desktop-grade web tools with lots of direct manipulation and keyboard depth — editors, boards, dashboards with drill-down. That is where its continuity and keyboard and focus model pay off most, and where I'd normally spend days on plumbing.

## Names ledger

```
NAMES — eval-presentify-6-round1: 1 missed name(s), 3 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
    19 · member    · openFor              · this Palette             · —                  · none         · ×1  ·   19 · resolved
         'openFor' is not a member of this Palette — declare it (openFor: <type> = …) or fix the name [DECLARE6001] (brand.declare:209:27)

COLLISIONS (min · held by · name)
     3 · Declare's type · TextStyle
     3 · Declare's type · Stroke
    28 · library class  · ToolButton

SUMMARY: 1 of 1 misses got no hint · 0 declared instead (none) · 0 never resolved (none)

NAMES — eval-presentify-6.noindex: 0 missed name(s), 0 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)

SUMMARY: 0 of 0 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
