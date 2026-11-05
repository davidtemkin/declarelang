# Editing a value: one model for every control

*Proposal, 2026-11-04; v5, 2026-11-05. **Not built.** Built around the text the person edits and the value the
program keeps, as Cocoa, Qt and the browser's own fields are. Two independent reviews shaped it (History). Before
any code moves, the real-input workout and the scope in §8 come first. A presentation for a new developer, with a
simulator written in Declare, is the artifact "Editing a Value". The release mechanics are in `migration.md`.*

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
  - every field that formats or limits what's typed refuses with a keystroke put back, losing the caret and undo.

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

### 4.1 Terms

- **the person:** whoever is using the app.
- **you:** the developer, and the code you write.
- **a value control:** a control the person uses to set a value: `TextInput`, `Slider`, `Stepper`, `Checkbox`,
  `Switch`, `RadioGroup`, `Combobox`, `DatePicker`, and any class of yours that extends `ValueControl`.
- **your value:** the piece of your app's state the control is about (`app.size`). Its type is the control's: a
  string for `TextInput`, a number for `Slider`, the chosen item for `Combobox`, a boolean for `Checkbox`.
- **what the control shows:** for a text field, its text; for a slider, the thumb; for a combobox, the typed search.
- **an edit:** the time from the person's first change until the edit ends (§4.5). A press on a checkbox is an edit
  that begins and ends at once.

### 4.2 What you write

- **`value = { … }`**: how the control shows your value. Or **`value <-> place`** (§4.7), which also commits to
  that place.
- **`admit(v)`**, optional: asked about every change before it appears (typed, pasted, deleted, autofilled; a slider
  dragged). It receives what the change would show, and returns what to show (usually the same; or tidied, such as a
  code in upper case or a pasted sentence reduced to its digits), or `null` to refuse. Returning what's already shown
  also refuses.
- **`commit(v)`**: called with what the control now shows. It commits the person's change to your state, however
  you like: store, convert, clamp, or leave your state alone because "4" isn't a size yet. A control with no `value`
  has a built-in `commit` that keeps its own value.
- **`commitOn`**: `"each"` (the default) commits after every change; `"end"` commits once, when the edit ends.
- **`validate(v)`** and **`required`**: what's wrong with what the control shows (§4.6).

### 4.3 What a control does

A control's own code (the library's, or yours in a class that extends `ValueControl`) reports what the person does,
and the base class does the rest:
- **`edit(v)`**: the person changed what the control shows to `v`. The base class asks `admit`, shows the result,
  and calls `commit` as `commitOn` says.
- **`beginEdit()`** and **`endEdit()`** bracket an edit that takes time: a drag. Without them, each `edit(v)` is an
  edit of its own that begins and ends at once.
- **`editing`**, read-only: whether an edit is in progress, for a slider that previews live but commits once.

So the slider's pointer-down calls `beginEdit()`, each move calls `edit(v)`, and pointer-up calls `endEdit()`. The
checkbox's press calls `edit(!checked)`. The text field's runtime element reports each native change as `edit(text)`.

### 4.4 What happens, and when

1. **The person makes a change.** Before anything appears, `admit` is asked. With `null`, nothing changes and the
   caret stays put. Otherwise the control shows what `admit` returned.
2. **`commit` is called** with what the control now shows: after this change, or (with `commitOn = "end"`) when
   the edit ends.
3. **While the person is editing, what the control shows is theirs.** Changes that your own `commit` makes to your
   value aren't shown until the edit ends: clamp "4" to 8 and the person still sees "4", and can type the "8" of "48".
4. **Any other change to your value ends the edit, and the control shows it.** Another record opening, another
   window saving, a shortcut that clears the field: what the person had in progress and not yet committed is dropped,
   and nothing is written anywhere it doesn't belong. With `<->`, the control knows its place, so a pending edit is
   committed to the old place before the new one is shown.
5. **When nobody is editing, the control shows your value:** when an edit ends, and at once whenever your value
   changes.

"Changes your own `commit` makes" means, mechanically, changes made while the control's `commit` call and its settle
run. Every other change comes from outside.

### 4.5 How an edit ends

- **Leaving the control, or Return in a single-line field:** the edit ends, committing if `commitOn = "end"`.
- **Escape:** the edit is cancelled. Nothing more is committed, and the control shows your value. With `"each"`
  everything up to that point was already committed, so Escape just puts back any unkept half-change. With `"end"`
  it discards the whole edit.
- **For a control's own code, or your shortcuts:** `endEdit()` ends the edit, committing as `commitOn` says;
  `cancelEdit()` cancels it.
- **`Form.submit()` ends every member's edit, committing, before it judges anything,** so a submit by shortcut sends
  what's on screen.
- **Moving to another record** ends the edit by §4.4 step 4.

### 4.6 Messages

`validate(v)` returns a sentence saying what's wrong, or `""`. `required = "…"` gives the sentence for an empty
control. A control is **judged** when the person leaves it (whether or not they changed it, so tabbing past an
empty required field still flags it), when its form is submitted, or when your code calls `judge()`. From then on
its message is updated at every change. Judging never refuses a change or alters what's shown; only `admit` does.

### 4.7 `<->`: one shorthand for any value control

`value <-> place` means `value = { place }` plus `commit(v) { place = v }`:
- It works on **any value control**, because it expands into members every value control has: `TextInput [ value
  <-> :title ]`, `Checkbox [ value <-> :done ]`, `Slider [ value <-> app.volume ]`.
- **The place** is a dataset field (`:title`, `:@[(name)]`) or any writable attribute (`app.volume`).
- **The types must match.** A text field bound to a number field is a compile error that names the fix: write
  `value` and `commit` yourself, and parse in `commit`.
- **`<->` with your own `commit` is a compile error**: one place decides where the change goes.
- `admit`, `commitOn`, Escape, `validate` and `required` behave exactly as they do with the two members written out.

### 4.8 Undo

Undo is the browser's (on the Mac, the system's):
- **`admit` returns what the change would show:** the browser applies the change itself and records it, as in any
  field.
- **`admit` returns `null`:** the change is cancelled before it happens. Nothing is recorded, and nothing already
  recorded is lost.
- **`admit` returns different text:** the runtime applies it through the browser's editing command
  (`execCommand("insertText")`), which records it as one step. ⌘Z goes back to the text before it. The caret goes
  after what was inserted (§7.3).
- **Undo and redo are changes** like any other. They reach `commit`; they skip `admit`, because they only restore
  text that was already admitted.
- **Showing your value again** writes the field only if the text differs. When it does, the field's undo history
  starts afresh, as a native field's does at the end of an edit.

### 4.9 Every value control the same way

| control | what it shows while editing | an edit ends |
|---|---|---|
| `TextInput` | the typed text | leaving, Return, Escape |
| `Slider` | the thumb | letting go; each key press is an edit of its own |
| `Stepper` | the number | at once: each step is an edit |
| `Combobox` | the typed search; your value is the chosen item | a pick (commits the item), leaving or Escape (the search goes back to the item's label) |
| `DatePicker` | nothing in between: it opens a calendar | at once, on a pick |
| `Checkbox`, `Switch`, `RadioGroup` | nothing in between | at once, on a press |

`value`, `admit`, `commit`, `commitOn`, `edit`, `beginEdit`, `endEdit`, `cancelEdit`, `editing`, `validate` and
`required` are defined once, on `ValueControl`. `TextInput` becomes a `ValueControl` in the library, around a bare
runtime editable. The runtime editable is the native element and nothing more: caret, selection, composition,
cancelling a refused change, applying rewritten text, and the caret's place. Judging, the form protocol and the
field's chrome move to the library, so they're no longer duplicated in `text-input.ts`. A text field overrides what
it doesn't take from `Control`: Space and Enter activating `press()`, the button role, and `flashPress`.

**Not value controls:** `Sheet`, `Popover`, `Disclosure`, `Window`, `Table`, `Tree`, `Splitter` and the like. They
hand changes back through their own `input(v)` (the value pattern of `declare.md` §11), and they have none of the
above: nothing to admit, judge or submit. They're unchanged by this proposal.

### 4.10 Removed

- `onInput` on `TextInput`, and `input(v)` on value controls: both become `commit(v)`.
- `text` as a field's binding: the binding is `value`, and `text` becomes the read-only text on screen.
- `text <-> :path` as a special form: it becomes `value <-> :path`, the general shorthand.
- `initial`: a control with no `value` keeps its own (and see §5).
- The edit session's draft, `commit()` and `revert()` with no argument, `dirty`, and `commitOn = "input" | "blur" |
  "enter" | "manual"`. These become `endEdit()`, `cancelEdit()`, `editing` and `commitOn = "each" | "end"`.
- The schema floor on a text field. Parsing happens in `commit`, and the dataset's schema still checks every write.
- DECLARE4036.

### 4.11 Names

- **`commit`**, not `input`. `input` reads as a noun, the person's input, where a verb is meant. `commit` says what
  the method does, and `commitOn` when; the two steps read "admit, then commit".
  - `set` lost the pairing with `commitOn`, and `Dataset` already has `set(path, v)`.
  - `record` reads as a noun in Declare, which uses "record" for a data object throughout.
  - `keep` and `update` were weaker for value controls.
- **`commitOn = "each" | "end"`**, not `"change"`: HTML's `change` event fires when editing *ends*, so web developers
  would read `"change"` backwards.
- **`admit`**, not `filter`: `filter` is already an attribute of every view.
- **`value`** for the binding on every value control, `TextInput` included; `text` is the text on screen.
- **`edit`, `beginEdit`, `endEdit`, `cancelEdit`, `editing`:** what the person does, as the control reports it.

### 4.12 Moving existing programs over

This lands as a release: with "Changes to make" in its release notes, `declare-changes` to list them, and a version
line a program can carry. `migration.md` has the design. These are the changes the notes must carry, the quiet ones
included:

| old | new | behaviour that changes silently |
|---|---|---|
| `onInput(v) { … }` on a field; `input(v) { … }` on a value control | `commit(v) { … }` | An `onInput` that only *watched* a field with no `text` binding must call `super.commit(v)`, or the field stops keeping its text. |
| `text = { … }` on a field | `value = { … }` | |
| `text <-> :title` | `value <-> :title` | `<->` with `validate` used to block invalid writes. Now every change is written, and `validate` only judges. Write `commit` yourself to keep invalid text out of the data. |
| `text <-> :n` on a `number` field | `value = { String(:n) }` with a parsing `commit` | `<->` used to parse; now the types must match (a compile error). |
| `text <-> { classroot.field }` (a field chosen by name) | `value <-> :@[(classroot.field)]` | |
| `initial = { … }` | `value = { … }` and a `commit` that keeps the text in your state | See §5. |
| `commitOn = "input"`; `"blur"` or `"enter"`; `"manual"` | `"each"`; `"end"`; `"end"` with `endEdit()` from your Save | |
| `field.commit()`, `field.revert()`, `dirty` | `endEdit()`, `cancelEdit()`, `editing` | |
| writing `field.text = …` on a field with no binding | give it a `value` and write your state | |

### 4.13 Decided against, on purpose

- **A separate `paste` hook:** `admit` sees a paste as a change like any other.
- **A per-field undo history kept by Declare:** it would depend on intercepting every undo path in every browser
  (keys, the Edit menu, the right-click menu, the shake gesture). A single miss would leave two histories
  disagreeing.
- **Teaching errors in the compiler for every old spelling:** a lot to carry for an optional gain. The release
  notes and `declare-changes` carry the migration instead.

## 5. Separate question: a write meeting a computed default

On an existing attribute (`width = { … }`), a write is refused. On a declared attribute with a computed default
(`slug: string = { slugify(title) }`), **a write lands and silently ends the formula for good** (`03-constraints.md`:
"a formula, not a guard"). It caused run 4's title bug.

This design doesn't depend on it. It only decides how a migrated `initial` ("starts from a suggestion, then becomes
the person's") is written:
- **keep the takeover:** `value = { app.slug }`, and `commit(t) { app.slug = t }` takes the formula over;
- **or one rule (a `{ }` always owns its attribute):** the suggestion is explicit, as `slugEdited: boolean` plus
  `slug = { slugEdited ? ownSlug : slugify(title) }`.

Decide it before the corpus's `initial` uses are migrated.

## 6. How it reads

```declare
TextInput [ value <-> app.name ]

TextInput [ value = { String(app.size) },
    admit(t: string) -> string | null { return /^[0-9]{0,3}$/.test(t) ? t : null },
    commit(t: string) { if (t != "") app.size = Math.max(8, Math.min(400, Number(t))) } ]

TextInput [ value = { app.code }, purpose = oneTimeCode,
    admit(t: string) -> string | null { return t.replace(/[^0-9]/g, "").slice(0, 6) },
    commit(t: string) { app.code = t; if (t.length == 6) app.verify() } ]

TextInput [ value <-> app.email,
    validate(t: string) -> string { return t.includes("@") ? "" : "Enter an address like name@example.com." } ]

TextInput [ value = { app.doc.title }, commitOn = "end",
    commit(t: string) { if (t.trim() != "") app.doc.setTitle(t.trim()) } ]

Checkbox [ value <-> :done, label = "Done" ]

Slider [ value = { app.opacity }, commitOn = "end", commit(v: number) { app.setOpacity(v) } ]

class Rating extends ValueControl [ value: number = 0,
    press() { edit(value % 5 + 1) } ]
```

## 7. Runtime obligations

1. **Before each change lands,** compute what it would show from `beforeinput`: `inputType`, `data` (or
   `dataTransfer` for paste and drop) and the selection, for every insert and delete kind. Then ask `admit`:
   - `null`: cancel the change;
   - the same text: let the browser apply it;
   - different text: cancel, then apply it with `execCommand("insertText")` over the changed range.

   `historyUndo` and `historyRedo` are let through, and go to `commit`.
2. **A change that arrives without `beforeinput`** (if autofill or a password manager turns out to send none):
   `admit` runs immediately after it, and the corrected text is in place before the next frame is drawn. Undo of
   that one change may be lost.
3. **The caret after a rewrite:** the runtime compares the text before and after. The common prefix and suffix locate
   what was inserted, and the caret goes after it. That handles grouping a card or phone number and upper-casing.
4. **Composition (IME, Android):** while composing, what's shown follows the composition and nothing else runs. The
   finished composition is the change. Chrome and Safari order `compositionend` and the last `input` differently,
   and both orders must produce one change.
5. **The caret when your value is shown again:** it keeps its distance from the end of the text.
6. **Canvas mode's overlay element and the Mac host** have the same obligations. On the Mac that means
   `shouldChangeText` for refusal, and replacement through the field editor so it stays undoable.
7. **Everything that reads "what is shown"** (auto-height, `select()`, the content extent) reads the text on
   screen.

## 8. Before any code moves

1. **The real-input workout,** in headed Chrome driven by macOS's own input (CGEvent, System Events for menus) with
   screen capture, then Safari and Firefox. For each case: whether `beforeinput` arrives and can be cancelled, what
   the caret does, and what ⌘Z, the Edit menu and the right-click menu's Undo do afterwards.
   - typing, deleting by character, word and line, and paste and drop;
   - a refused change, and a rewritten one;
   - autofill (saved addresses, a password manager);
   - IME composition: Chrome's composition commands, and a real Japanese input method;
   - dictation;
   - the field showing your value again.

   §7 promises exactly what the table shows.
2. **The full scope, written out for the author before building:** runtime, compiler and checker, library (every
   value control's real edit model), corpus, docs demos, eval references, documentation (`declare.md` §5, §7, §11;
   guide chapters 03, 08, 14, 15, 30, 31; the generated reference; `input.md` and its kin here; the skill), tests,
   the Mac host, canvas mode, performance (the grid's editor cells, virtualized rows, slim sizes), accessibility,
   and the migration system.
3. **Controls that hold a value but aren't `ValueControl`s** (`Segmented`, `TabBar`, `DataGrid`'s value pattern):
   bring each in, or state why not.

## 9. Landing it

1. The workout and the scope (§8).
2. Build it, with a **Forms page in the sampler**, written against the new model: the first real use of the
   library's `Form` in the corpus.
3. The migration system (`migration.md`), and this release's "Changes to make" (§4.12).
4. Before pushing, run the full gate: `npm test`, the ladder corpus, the eval references, the Mac shell's
   conformance, and the grid and virtualization benchmarks.
5. Push as one revertable series, as a release.
6. Run the four briefs (Venue, Cadence, Murmur, Presentify) one at a time, each audited against its last runs.
   A regression traced to this change stops the sequence for a decision.
7. **Migration test:** a fresh agent is given the author's older app and the new release, and nothing else, and
   brings the app up to date. What it gets stuck on is fixed before the release is announced.

## History

- **v1 (2026-11-04):** `TextInput` only, with a field-owned draft and `validate` gating what was delivered. The
  first independent review found:
  - the gate gave `validate` a second meaning;
  - the rules brought back "328" and "1." → "1";
  - `Form.submit` doesn't commit;
  - putting a change back costs the caret, undo and IME;
  - `initial` was the trap behind the title bug.
- **v2 and v3:** a draft plus deferred "answers", the contract moved to `ValueControl`, and the Mac host in scope.
  Correct, but it couldn't be stated in a few plain terms.
- **v4 (2026-11-05):** built around the text: six terms, two methods, five steps. `admit` refuses or rewrites, which
  covers paste too; undo stays the browser's. Then `input` was renamed `commit`.
- **v5 (2026-11-05, this document):** a second independent review of v4 found:
  - nothing for control authors;
  - the inspector case, where a selection change could write one item's text into another;
  - stale form submits;
  - `endEdit` meaning two things;
  - text-only terms;
  - two wrong table rows;
  - the rename's reach undecided;
  - the caret, autofill, composition and undo under-specified;
  - `"change"` reading backwards;
  - quiet migration changes.

  v5 answers each:
  - `edit`, `beginEdit`, `endEdit`, `cancelEdit` and `editing`;
  - the new step 4;
  - submit ends edits;
  - general terms;
  - value controls only, with the others unchanged;
  - `<->` kept as a shorthand for any value control;
  - `commitOn = "each" | "end"`;
  - the §4.12 table;
  - judging on leaving.

  The author decided against teaching errors, in favour of release notes, `declare-changes` and a version line.
