# Editing a value: one model for every control

*Proposal, 2026-11-04, revised 2026-11-05. **Not built, and deliberately deferred.** The current form (§4) replaced
two earlier ones. The first was reviewed independently and would have brought back the bugs it was meant to fix.
The second was built around a "draft" and the program's "answer", and couldn't be explained in a few plain terms.
Before any of it is built, a full line-by-line review of every subsystem it touches is still needed (§8). A
presentation of the design for a new developer, with a simulator written in Declare, is the artifact "Editing a
Value".*

---

## 1. The problem

Three Presentify runs in a row (2026-11-02 to 11-04) built a field that couldn't be typed into:
- run 2: "48 over 32 gave 328";
- run 3: a hex colour field;
- run 4: number fields, "the 48 I typed never landed".

Each agent wanted the same thing: *show the program's value; let the person type something that isn't a value yet;
use it when it is one.* Run 4's code review also found a title field that silently stopped following the document
after one keystroke.

The causes are structural:
- **A text field is one of three kinds, decided by how `text` is bound,** and the three behave differently (§2).
  Only the kind bound to a dataset with `<->` can hold a half-typed text, choose when to deliver it, revert, or
  report `dirty`. A field for app state, a computed value or an inspector over a selection can't. That's the field
  every Presentify run needed.
- **On a one-way field, text that isn't a value yet can only be refused.** That makes "4" on the way to "48"
  impossible whenever the program refuses values under 8.
- **`TextInput` sits outside the value pattern every other control follows.** It has its own delivery word
  (`onInput`), its own arrow (`<->`), its own draft machinery behind that arrow, and its own copy of the judging and
  form protocol, which has already drifted from `ValueControl`'s.
- **Other controls need the same concept and build it by hand:**
  - run 4 made a slider drag one undo step by watching `dragging` with `trackChanges`;
  - `Combobox` holds its typed query as a hand-made draft;
  - `DatePicker` has the same problem with a typed date as the number field has with "4".

## 2. Today's model (verified against the runtime)

| | uncontrolled | one-way | two-way |
|---|---|---|---|
| written | `initial = { … }`, or nothing | `text = { app.x }`, `onInput(v) { app.x = v }` | `text <-> :x`, inside a `datapath` |
| who holds what is typed | the field | nobody: the edit fires `onInput`, then the field shows `text` again | the field (`text` is the draft) |
| a keystroke `onInput` doesn't write | — | put back | stays |
| follows its source | until the first keystroke, then **never again** (`initial`'s yielding derive is disposed by the edit: run 4's title bug, and probably the DataGrid's Escape) | always | yes; edits persist in between |
| `commitOn`, `commit()`, `revert()`, `dirty` | no (DECLARE4036 warns) | no (DECLARE4036 warns) | yes |

**Writes to the native element, measured** by counting programmatic `value` writes while typing "ab1 cd", then
pressing ⌘Z:

| field | writes | ⌘Z |
|---|---|---|
| plain, or one-way whose handler writes what was typed | 0 (`setEditable` skips an unchanged value) | works |
| one-way, handler upper-cases | 4, the whole value each time | does nothing |
| one-way, handler refuses non-digits | 5, the whole value each time | does nothing |

Every correcting or refusing field today moves the caret to the end on each write, and loses native undo.

Other facts that matter:
- **There's no IME guard** except on Enter (`isComposing`).
- **`input(v)` is a convention, not a `ValueControl` member.** Each control declares its own, and the checker reads
  its default body (`check.ts` `writtenByInput`).
- **⌘Z, ⌘A, cut, copy, paste and the caret commands belong to a focused field,** whatever the app declares
  (`keys.ts` `FIELD_CHORDS`, the Mac's first-responder rule).

## 3. What other toolkits do

- **The model is built around the text, not the value.** Cocoa's formatters, Qt's validators, Flutter's
  formatters and the browser's `<input type=number>` all keep the text in the field and the value in the program.
  A check runs before each change lands, and the field shows the value again when editing ends. None of them
  rewrites what the person is typing from the value mid-edit.
- **Undo works where the toolkit applies the change itself:**
  - HTML's own `maxlength` and `type=number`;
  - Qt's `QLineEdit`, with its own undo stack;
  - Flutter, which has had an undo history since 3.7.

  **It's usually broken where app code rewrites the text:**
  - the web's masking libraries;
  - React controlled inputs that change what was typed;
  - iOS fields formatted by setting `text` inside `shouldChangeCharactersIn`, where shake-to-undo is known to crash.
- **One-time codes:** best practice is one field (`autocomplete="one-time-code"`, numeric, length 6). It's drawn
  as six boxes when the design wants boxes, with one invisible native input underneath (the `input-otp` pattern).
  Paste and autofill then work because it's one field, and pasted text is cleaned before it's shown.
- **Guidance** (GOV.UK, among others) advises accepting what people type, including spaces and dashes, and tidying
  it afterwards, rather than live input masks.
- **Apps that take over ⌘Z for text** (code and rich-text editors) own the whole text model. They use a native
  element only to receive input. Apps with ordinary fields leave ⌘Z to a focused field.

## 4. The proposal

### 4.1 Six terms

- **the person:** whoever is using the app.
- **you:** the developer, and the code you write.
- **the field:** the control on screen: a text field, a slider, a date picker.
- **the text:** what's on screen in the field.
- **your value:** the piece of your app's state the field is about (`app.size`). The field is told how to show it:
  `value = { String(app.size) }`.
- **editing:** from the person's first change until they stop: they leave the field, press Return, or press
  Escape. Moving the field to another record also stops it.

### 4.2 Two methods you write, both optional

- **`admit(text) -> string | null`** is asked about every change before it appears: typed, pasted, deleted,
  autofilled. It receives the text the change would produce. It returns the text to show (usually the same; or a
  cleaned-up one, such as upper case or a pasted sentence reduced to its digits), or `null` to refuse. Returning
  the text as it was before the change also refuses.
- **`commit(text)`** is called after each change, with the text now on screen: it commits the person's change to
  your state, however you like (store, convert, clamp, or leave it alone because "4" isn't a size yet). With no
  `value`, the built-in `commit` keeps the text in the field.

### 4.3 What happens, and when

1. **The person makes a change.** Before anything appears, the field calls `admit`. `null`: nothing changes, and
   the caret stays. Otherwise the field shows what `admit` returned.
2. **The field calls `commit`** with the text now on screen.
3. **While the person is editing, the field keeps showing their text,** whatever your value becomes.
4. **When the person stops editing,** the field shows your value.
5. **When nobody is editing and your value changes,** the field shows it at once.

**Timing.** `commitOn` says when `commit` is called: `"change"` (the default) after every change, `"end"` once, when
editing stops. Escape stops editing without calling `commit`: with `"change"` every change has already been committed, and with `"end"`
Escape is cancel. `endEdit()` lets code stop the person's editing itself, for example a shortcut that clears the
field.

**Error messages.** `validate(text)` returns a sentence or `""`, and `required = "…"` gives one for an empty field.
The message shows after the person first stops editing, or on submit, and is updated at every change after that.
It never refuses a change or changes the text; only `admit` does.

### 4.4 Undo

Undo is the browser's (on the Mac, the system's):
- **`admit` returns the text unchanged:** the browser applies the change and records it, as in any field.
- **`admit` returns `null`:** the change is cancelled in `beforeinput`, before it happens. Nothing is recorded,
  and nothing already recorded is lost.
- **`admit` returns different text:** the runtime applies it with `document.execCommand("insertText")` over the
  changed range. That records it as one step, and ⌘Z returns to the text before it.
  - The standard calls `execCommand` obsolete, but every major browser supports it and nothing has replaced it.
  - If it were ever dropped, rewritten changes would still apply but couldn't be undone. Unchanged and refused
    changes never use it.
- **Showing your value again** (steps 4 and 5) writes the field only if the text differs. When it does, the field's
  undo history starts afresh, as a native field's does at the end of an edit.
- **Rejected:** Declare keeping its own undo history per field. It would depend on intercepting every undo path in
  every browser (keys, Edit menu, context menu, shake), and a single miss would leave two histories disagreeing.
  The only gain would have been live formatting, which `admit` now gives without it.

### 4.5 Every control the same way

| control | what the person changes | editing stops |
|---|---|---|
| `TextInput` | the text | leaving, Return, Escape |
| `Slider` | the thumb | letting go |
| `Combobox` | the search text | a pick, leaving |
| `DatePicker` | the typed date, or the month shown | a pick, leaving |
| `Checkbox`, `Switch`, `RadioGroup`, `Stepper` | one press | at once |

`value`, `admit`, `commit`, `validate`, `required`, `commitOn` and `endEdit()` are defined once, on `ValueControl`,
and `TextInput` becomes a `ValueControl` in the library around a bare runtime editable. The runtime editable is the
native element and nothing more: caret, selection, IME, refusal in `beforeinput`, applying rewritten text, and the
caret's place. Judging, the form protocol and the field's chrome move to the library, so they're no longer
duplicated in `text-input.ts`. A text field overrides what it doesn't take from `Control`: Space and Enter
activating `press()`, the button role, and `flashPress`.

### 4.6 Removed

- `<->`, and with it the third form of the value pattern and its grammar and scope checks.
- `onInput` on `TextInput`, and `input(v)` on every other control, replaced by `commit(v)`: one verb for every control.
- `TextInput.text` as the binding: the binding is `value`, and `text` becomes the read-only text on screen.
- `initial`: a field with no `value` keeps its own text (see §5).
- The edit session's draft, `commit()`, `revert()`, `dirty` and `commitOn = "blur" | "enter" | "manual"`. These
  are now Escape, `endEdit()`, and `commitOn = "change" | "end"`.
- The schema floor on a text field. `commit` parses, and the dataset's schema still checks every write.
- DECLARE4036.

### 4.7 Names

- **`commit`**, not `input`. `input` reads as a noun (the person's input) where a verb is meant, and it named what was
  typed as well as the method. `commit` says what the method does, and `commitOn` says when it's called; the two
  steps read as "admit, then commit". `set(v)` was the runner-up: the most guessable on its own, but it loses the
  pairing with `commitOn`, and `Dataset` already has a `set(path, v)`.
- **`admit`**, not `filter`: `filter` is already an attribute of every view.
- **`value`** for the binding on every control, `TextInput` included; `text` is the text on screen.

### 4.8 Moving existing programs over

People are using Declare, so this lands as a release, with notes, and with the compiler teaching the new forms
rather than only refusing the old ones. Every old spelling gets an error that names its replacement, written out
for the line at hand:
- `onInput(v) { … }` on a field, and `input(v) { … }` on any control, become `commit(v) { … }`.
- `text = { … }` on a field becomes `value = { … }`.
- `text <-> :title` becomes `value = { :title }, commit(t: string) { :title = t }`.
- `initial = { … }` becomes `value = { … }` with a `commit` that keeps the person's text in your state.
- `commitOn = "input"` becomes `"change"`; `"blur"` and `"enter"` become `"end"`; `"manual"` needs `endEdit()`.
- `commit()`, `revert()` and `dirty` on a field are explained in terms of `endEdit()` and Escape.

These teaching errors stay for at least one release after the change. The release notes list each one with a
before and after.

### 4.9 Decided against, on purpose

- **A separate `paste` hook.** `admit` sees pastes as changes like any other, and can clean them.
- **A per-field undo history kept by Declare** (§4.4).

## 5. Depends on: a write meeting a computed default (decide first)

On an existing attribute (`width = { … }`), a write is refused. On a declared attribute with a computed default
(`slug: string = { slugify(title) }`), **a write lands and silently ends the formula for good**. `03-constraints.md`
documents this as "a formula, not a guard", and it caused run 4's title bug.

The field itself no longer relies on this, because §4.3 replaces `initial`. But "starts from a suggestion, then
becomes the person's" (an address suggested from a title) is still written with it today. So the two must be
consistent before building:
- **keep the takeover:** `value = { app.slug }`, and `commit(t) { app.slug = t }` takes the formula over;
- **or one rule (a `{ }` always owns its attribute):** the suggestion is explicit, as `slugEdited: boolean` plus
  `slug = { slugEdited ? ownSlug : slugify(title) }`. Every corpus use of a takeover is found and rewritten first.

## 6. How it reads

```declare
TextInput [ value = { app.name }, commit(t: string) { app.name = t } ]

TextInput [ value = { String(app.size) },
    admit(t: string) -> string | null { return /^[0-9]{0,3}$/.test(t) ? t : null },
    commit(t: string) { if (t != "") app.size = Math.max(8, Math.min(400, Number(t))) } ]

TextInput [ value = { app.code }, purpose = oneTimeCode,
    admit(t: string) -> string | null { return t.replace(/[^0-9]/g, "").slice(0, 6) },
    commit(t: string) { app.code = t; if (t.length == 6) app.verify() } ]

TextInput [ value = { app.email }, commit(t: string) { app.email = t },
    validate(t: string) -> string { return t.includes("@") ? "" : "Enter an address like name@example.com." } ]

TextInput [ value = { app.doc.title }, commitOn = "end",
    commit(t: string) { if (t.trim() != "") app.doc.setTitle(t.trim()) } ]

Slider [ value = { app.opacity }, commitOn = "end", commit(v: number) { app.setOpacity(v) } ]
```

## 7. Runtime obligations

1. **Before each change lands,** compute the text it would produce from `beforeinput`: `inputType`, `data`
   (`dataTransfer` for paste and drop) and the selection, covering every insert and delete kind. Then ask `admit`:
   - `null`: cancel the change;
   - the text unchanged: let the browser apply it;
   - different text: cancel, then apply it with `execCommand("insertText")` over the range, and put the caret at
     the end of what was inserted.

   `historyUndo`/`historyRedo` are let through: they only restore text that has already been admitted.
2. **IME:** during composition the text follows it, and nothing else runs. `compositionend` is the change (Chrome
   and Safari order it differently from the last `input`).
3. **The caret** keeps its distance from the end when the value is shown again.
4. **Canvas mode's overlay element and the Mac host** have the same obligations. On the Mac that means
   `shouldChangeText` for refusal, and replacement through the field editor for undo.
5. **Everything that reads "what is shown"** (auto-height, `select()`, the content extent) reads the text on
   screen.

## 8. What a review must cover before building

This design has had less scrutiny than its predecessors' failures call for. A review goes line by line through:
1. every value control's real edit model, implemented and not stubbed;
2. controls that hold a value but aren't `ValueControl`s (`Segmented`, `TabBar`, `DataGrid`'s value pattern):
   bring each in, or state why not;
3. every corpus use of `<->`, `onInput`, `initial`, `commitOn` and `text =` on a field, in apps, the library,
   docs demos, eval references and tests. That includes fields that use `onInput` only to watch typing: under
   `commit(v)` an override replaces the built-in one;
4. performance: the grid's editor cells and virtualized rows, if `TextInput` becomes a library class; slim build
   sizes;
5. accessibility: role, error and required, a refused keystroke being silent to a screen reader;
6. the Mac host and canvas mode (§7.4);
7. the compiler and checker:
   - `<->` lexing (keep a teaching error);
   - the "constrained value with no `commit`" check, extended to datapath values;
   - typing for `admit`, `commit`, `value`, `text` on every control;
   - retiring DECLARE4036;
   - `admit` must not collide with an existing member (`filter` was taken by `View`);
8. the documentation: `declare.md` §5, §7 and §11, guide chapters 03, 08, 14, 15, 30 and 31, the generated
   reference, `input.md` and its kin in this directory, and the skill;
9. the tests, including the Mac conformance;
10. a browser test of §7.1 in Chrome, Safari and Firefox: that `beforeinput` is cancellable for every insert kind
    in an `<input>` and a `<textarea>`, and that `execCommand("insertText")` records one undo step.

## 9. Landing it

1. Decide §5.
2. Review against §8.
3. Build.
4. Before pushing, run the full gate: `npm test`, the ladder corpus, the eval references, the Mac shell's
   conformance, and the grid and virtualization benchmarks.
5. Push as one revertable series.
6. Run the four briefs (Venue, Cadence, Murmur, Presentify) one at a time, each audited against its last runs
   before the next starts. Any regression traced to this change stops the sequence for a decision.
7. **Migration test:** a fresh agent is given an existing app written a couple of releases earlier, plus the release
   notes, and asked to bring it up to date. What it gets stuck on, and what the teaching errors don't explain, are
   fixed before the release goes out.

## History

- **v1 (2026-11-04):** `TextInput` only. A field-owned draft, with `validate` gating what was delivered. The
  independent review found the gate gave `validate` a second meaning, and that the rules brought back "328" and
  "1." → "1". It also found that `Form.submit` doesn't commit, the caret, undo and IME costs, and `initial` as the
  trap.
- **v2–v3:** a draft plus deferred "answers", the contract moved to `ValueControl`, and the Mac host in scope.
  Correct, but it couldn't be stated in a few plain terms.
- **v4 (2026-11-04 to 11-05, this document):** built around the text, the way the toolkits in §3 are:
  - six terms, two methods, five steps;
  - `admit` refuses or rewrites, which also covers paste;
  - undo stays the browser's.
- **v4.1 (2026-11-05):** `input` renamed `commit`, and `commitOn` became `"change" | "end"`. Added the migration
  plan (§4.8).
