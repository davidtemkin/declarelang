# Editing a value: one model for every control

*Proposal, 2026-11-04. **Not built, and deliberately deferred.** It has had one independent review, of an earlier
draft. That review found that the draft would have brought back the bugs it was meant to fix, and later scrutiny
found more (§9). Treat this as a careful starting point that still needs a full line-by-line review of every
subsystem it touches before any of it is built. It is not a plan to execute as written.*

---

## 1. The problem

Three Presentify runs in a row (2026-11-02 to 11-04) built a field that couldn't be typed into:
- run 2: "48 over 32 gave 328";
- run 3: a hex colour field;
- run 4: number fields, "the 48 I typed never landed".

Each agent wanted the same thing: *show the program's value; let the person type something that isn't a value yet;
deliver it when it is one.* Run 4's code review also found a title field that silently stopped following the
document after one keystroke.

The causes are structural:
- **A text field is one of three kinds, decided by how `text` is bound,** and the three behave differently (§2).
  Only the kind bound to a dataset with `<->` can hold a half-typed value, choose when to deliver it, revert, or
  report `dirty`. A field for app state, a computed value or an inspector over a selection can't. That's the field
  every Presentify run needed.
- **On a one-way field, text that isn't a value yet can only be refused.** That makes "4" on the way to "48"
  impossible whenever the program refuses values under 8.
- **`TextInput` sits outside the value pattern every other control follows:** its own delivery word (`onInput`),
  its own arrow (`<->`), its own draft machinery behind the arrow, and its own copy of the judging and form
  protocol, which has already drifted from `ValueControl`'s.
- **Other controls need the same concept and build it by hand:**
  - Run 4 made a slider drag one undo step by watching `dragging` with `trackChanges`.
  - `Combobox` holds its typed query as a hand-made draft.
  - `DatePicker` has the same problem with a typed date as the number field has with "4".

## 2. Today's model (verified against the runtime)

| | uncontrolled | one-way | two-way |
|---|---|---|---|
| written | `initial = { … }`, or nothing | `text = { app.x }`, `onInput(v) { app.x = v }` | `text <-> :x`, inside a `datapath` |
| who holds what is typed | the field | nobody: the edit fires `onInput`, then the field shows `text` again | the field (`text` is the draft) |
| a keystroke `onInput` doesn't write | — | put back: **the caret jumps to the end** (`dom-backend.ts`, `el.value = …`), **and native undo is lost** | stays |
| follows its source | until the first keystroke, then **never again** (`initial`'s yielding derive is disposed by the edit: run 4's title bug, and probably the DataGrid's Escape) | always | yes; edits persist in between |
| `commitOn`, `commit()`, `revert()`, `dirty` | no (DECLARE4036 warns) | no (DECLARE4036 warns) | yes |
| what gates a commit | — | — | `validate` and the schema floor only (`editor.ts` `commitDraft`); `required` and `refused` don't |
| `onInput` | after the field wrote `text` | on every edit | on every edit, after the session ran |

Further facts that matter:
- **There is no IME guard** except on Enter (`isComposing`).
- **`input(v)` is a convention, not a `ValueControl` member.** Each control declares its own, and the checker
  reads its default body (`check.ts` `writtenByInput`).
- **The value pattern is `declare.md` §11; `<->` is §7.**
- **The coming-from tables mapped React's controlled input, Svelte's `bind:value` and Vue's `v-model` to `<->`
  alone.** Corrected on 2026-11-04: for a program's own state, the mapping is one-way plus `onInput`.

## 3. What other toolkits do

They converge on three layers:
1. **An edit filter, before the edit lands.** It refuses what can never be part of a value. Qt `QValidator`
   (Invalid), Cocoa `isPartialStringValid`, UIKit `shouldChangeCharactersIn`, Android `InputFilter`, Flutter
   `TextInputFormatter`, Flex `restrict`/`maxChars`, HTML `maxlength`/`beforeinput`.
2. **Text that isn't a value yet, held by the field.** Qt's Intermediate, Cocoa's partial string, `<input
   type=number>` (whose `value` is "" until the text parses), SwiftUI `TextField(value:format:)`. **None of them
   rewrites what the person typed until the edit ends:** Cocoa formats at end of editing, and Qt's `fixup` runs
   then.
3. **Validity:** required, in range, well formed. It never blocks typing, and it's said when the form chooses.

The classic mistakes are a range check in layer 1, and no layer 2. React's controlled input has no layer 2, which
is Declare's one-way trap.

## 4. The proposal

### 4.1 The edit contract belongs to `ValueControl`

Every control that holds a value a person sets has the same edit contract, defined once in `ValueControl`:

| member | meaning |
|---|---|
| the value (`checked`, `value`, `text`, … with `fieldValue` naming it) | **The program's**, when constrained; the control's own, when not. Never written by the control while constrained (§5 of `declare.md`, unchanged). |
| `draft` (read-only) | **The edit in progress:** a typed text, a slider mid-drag, a colour being dragged through, a typed date. It equals the value when nothing is being edited. |
| `accepts(v) -> boolean` | **The edit filter:** can the draft become this at all? Default: yes. |
| `commitOn` | **When a draft is proposed:** `"input"` (as it changes, the default) or when the edit ends. The words follow each control's edits; see §9.3. |
| `input(v)` | **The one delivery,** declared on `ValueControl`. The default writes the value. An override delivers up. |
| `commit()`, `revert()`, `dirty` | Propose the draft now / put the value back in the draft / `draft != value`. |
| `validate`, `required`, `refused`/`refuse()`, `problem`, `valid`, `error`, `judged`, `name`, `form` | **Unchanged in meaning, judged on the draft.** `refuse()` captures the draft. |

**The three rules, for every control:**
1. **An edit that `accepts` lets in becomes the draft,** and is proposed through `input(v)` when `commitOn` says.
   An edit it refuses never lands.
2. **While the person is editing, the draft is theirs.** Only their own edits change it, plus any change to the
   value that isn't the program's answer to the control's own proposal. "The program's answer" is mechanically any
   change made while the control's own `input(v)` call and its settle run. What the program does in answer (take,
   correct, clamp or ignore) shows when the edit ends.
3. **When the edit ends, a proposed draft gives way to the value,** so the program's answer shows, unless the draft
   has a `problem`, in which case it stays with its error. A draft not yet proposed (a deferred `commitOn` the edit
   didn't trigger, or `commit()` not yet called) stays, `dirty`, until `commit()` or `revert()`.

`validate` keeps one meaning on every control: **it judges, and never decides what is delivered.** "Not a value
yet" is said by the program not taking a proposal, which rule 2 makes safe.

**Why rule 2 defers the answer.** It's the only rule safe for every lossy round trip between what is shown and
what is held. Delete the "5" of "1.5": the program takes 1, and `String(1)` is "1". A control that showed the
answer live would swallow the point, and the next "7" would give "17". It also makes clamping safe: "4" is clamped
to 8, but "48" still lands. Every toolkit in §3 behaves this way.

### 4.2 Each control says what its draft is, and when its edit ends

| control | the draft | an edit ends |
|---|---|---|
| `Checkbox`, `Switch`, `RadioGroup` | the value (an edit is a single act) | at once |
| `Stepper` | the value | at once |
| `Slider` | the value under the drag or key | on release; for a key, at once |
| `Combobox` | the typed query (today's hand-made draft, replaced) | on a pick, or on leaving |
| `DatePicker` | the typed text or the calendar's navigation | on a pick, or on leaving |
| `TextInput` | the typed text | on leaving the field |

So `Slider [ commitOn = "end" ]` (spelling to settle, §9.3) makes a drag one proposal, and one undo step, with no
`trackChanges`.

### 4.3 `TextInput` becomes a `ValueControl`

`TextInput` becomes a **library class, `TextInput extends ValueControl`,** around a bare runtime editable. Its
public name and its attributes stay.
- **The runtime editable** is the native element and nothing more: caret, selection, IME, the native undo stack,
  refusing an edit in `beforeinput`, and keeping the caret's place when the program's value replaces the draft.
- **Judging, the form protocol, the chrome derives (fill, stroke, padding, auto-height) and the draft rules** live
  in the library, once, and stop being duplicated in `text-input.ts`.
- **What a text field doesn't take from `Control`,** it overrides: Space and Enter activating `press()`, the
  button role (a text field's role is `textField`), and `flashPress`.

Whether the runtime editable is the field's own view or a child of it is decided by measurement (§9.5).

### 4.4 Around the edges

- **Escape reverts a dirty draft,** and is consumed. Otherwise it passes on, so a dialog closes and a field's own
  Escape handling runs.
- **`Form.submit()` commits each member first,** then judges. A blur-commit field submitted with Return sends what
  it shows.
- **An edit to a control that isn't focused** (autofill) is proposed at once, whatever `commitOn` says.
- **The draft resets when the control moves to another record** (its datapath cursor changes), not only when the
  value differs, so a recycled row never carries an old draft.
- **A Clear button over a held draft** calls `revert()`: a write of the value already there wakes nothing (§5).
- **A field chosen by name** uses the datapath form that already exists:
  `text = { "" + (:@[(classroot.field)] ?? "") }, input(v: string) { :@[(classroot.field)] = v }`.

### 4.5 Removed

- `<->`, and with it the third form of the value pattern, its grammar check, its scope check, and the edit
  session's tie to binding (`editor.ts`'s sessions).
- `onInput` on `TextInput`, replaced by `input(v)`.
- `initial` (see §6).
- The schema floor on a text field: "must be a number", and committing the parsed number. The program parses in
  `input`; the dataset's schema still checks every write. The guide teaches the number field as a principle,
  including that `Number("")` is 0.
- DECLARE4036.

## 5. Runtime obligations

These are part of the design. Each of them decides whether the design works for a person.

1. **Refusal in `beforeinput`, with native undo kept.**
   - The runtime computes the text the edit would produce from `inputType`, `data` and the selection:
     - typing and replacement;
     - paste and drop;
     - each delete kind (backward and forward, by character, word and line);
     - line breaks.
   - It asks `accepts`, and cancels the edit with `preventDefault()` when it's refused. The element never changes,
     so the caret and the browser's undo history survive.
   - Kinds the runtime can't compute (`historyUndo`/`historyRedo`, and anything unknown) are let through and judged
     after the fact. **Restoring a value afterwards is never the mechanism:** it loses undo.
2. **IME.** While composing, the draft takes the composition and nothing else runs: no filter, no proposal, no
   correction. `compositionend` is the edit. (`insertCompositionText` can't be cancelled, which is one more reason
   to defer.) Chrome and Safari order `compositionend` and the last `input` differently; both orders must produce
   one edit.
3. **The caret when the value replaces the draft** (rule 3, or an outside change): it keeps its distance from the
   end of the text.
4. **The Mac host's native field gets the same behaviour,** in this change: the filter before the edit lands, the
   native undo kept, IME composition, and the caret. One model means one behaviour on every host.
5. **Everything that reads "what is shown" reads `draft`:** auto-height, the value pushed to the element,
   `select()` clamping, the content extent.

## 6. Depends on: a write silently taking over a constraint (decide first)

Today there are two kinds of `{ }`. On an existing attribute (`width = { … }`) a write is refused. On a declared
attribute with a computed default (`draft: string = { app.title }`) **a write lands and silently ends the formula
for good.** `03-constraints.md` documents this as "a formula, not a guard". It caused run 4's title bug.

Removing `initial` sends "starts from a value, then becomes the person's" to exactly that rule. So this proposal
can't be built until that question is decided:
- **Keep the takeover:** "starts from" is `slug: string = { slugify(title) }`, which the first write takes over.
  That's simple, but it is the mechanism that silently stops following.
- **One rule (a `{ }` always owns its attribute; a write is refused):** "starts from" is said explicitly, as
  `slugEdited: boolean` plus `slug = { slugEdited ? ownSlug : slugify(title) }`. Every corpus use of a takeover has
  to be found and rewritten first.

## 7. How the cases read

```declare
// a font size over a selection: letters refused, half-typed numbers held, clamping safe
TextInput [ text = { app.sizes.mixed ? "" : String(app.sizes.one) }, placeholder = { app.sizes.mixed ? "Mixed" : "" },
    accepts(v: string) -> boolean { return /^[0-9]*$/.test(v) },
    input(v: string) { if (v != "") app.setSize(Math.max(8, Math.min(400, Number(v)))) } ]

// a hex colour: partial hex is simply not taken
TextInput [ text = { app.colour }, accepts(v: string) -> boolean { return /^#?[0-9a-fA-F]{0,6}$/.test(v) },
    input(v: string) { if (isHex(v)) app.colour = v } ]

// a phone number: refuse letters, judge completeness, deliver every edit
TextInput [ purpose = tel, text = { app.phone }, input(v: string) { app.phone = v },
    accepts(v: string) -> boolean { return /^[0-9 +()\-.]*$/.test(v) },
    validate(v: string) -> string { return digits(v).length >= 10 ? "" : "A full number, with its area code" } ]

// a title that follows the open document: the bug can't be written
TextInput [ text = { app.doc.value?.title ?? "" }, commitOn = "blur",
    input(v: string) { if (v.trim() != "") app.doc.setTitle(v.trim()) } ]

// a slider whose drag is one undo step
Slider [ value = { app.opacity }, commitOn = "end", input(v: number) { app.history.record(() => app.opacity = v) } ]
```

## 8. Deliberately given up

These are decisions, to be stated as such in the docs. They aren't debt.
- **Live reformatting while typing** (grouping a card number as it's entered, upper-casing each key). The answer
  shows at the end of the edit. If it's ever wanted, its place is the filter returning the text to keep, as
  Flutter's formatter does, applied before the edit lands with the caret known.
- **The one-line form** `text <-> :title`. It becomes two members, the same as a `Checkbox` bound to data.
- **The schema floor** (§4.5).

## 9. Known open questions, and what a review must cover

**This proposal is not complete.** The draft before it, which was nearly built, missed:
- issue §6 entirely;
- the loss of native undo;
- the Mac host;
- that the contract belongs to every control, not one.

So assume further gaps of that size exist. Before building, a review must go through every one of these line by
line.

1. **Every value control's real edit model,** implemented and not stubbed: `Checkbox`, `Switch`, `RadioGroup`,
   `Stepper`, `Slider`, `Combobox`, `DatePicker`, `TextInput`.
2. **Controls that hold a value but aren't `ValueControl`s:** `Segmented`, `TabBar`, `DataGrid`'s value pattern,
   and any others. Bring each in, or state why it isn't one.
3. **The `commitOn` vocabulary across controls.** "blur", "enter" and "manual" are text words. A slider's edit
   ends on release. One vocabulary must cover all, or each control must name its own end.
4. **Every corpus use** of `<->`, `onInput`, `initial` and `commitOn`, in apps, the library, docs demos, eval
   references and tests. That includes the fields that use `onInput` only to watch typing: under `input(v)` an
   override replaces the default write, so each must be migrated to read `draft`, or to call `super.input(v)`.
5. **Performance:** the grid's editor cells and virtualized rows, if `TextInput` becomes a library class (one view,
   or a wrapper and a child?), and the slim builds' sizes.
6. **Accessibility:** the role, `accessibilityError`/`Required`, a refused keystroke being silent to a screen
   reader, and the native element's label.
7. **The Mac host:** its native field's callbacks, the filter, undo, IME.
8. **Canvas mode:** its overlay element has the same obligations as the DOM backend's.
9. **The compiler and checker:**
   - `<->`'s lexing (keep a teaching error for stale programs);
   - the "constrained value with no `input`" check, extended to datapath values (`text = :path`, `checked = :done`
     are missed today);
   - typing for `input`, `accepts` and `draft` on every control;
   - DECLARE4036's retirement.
10. **The documentation:**
    - `declare.md` §5, §7 and §11;
    - guide chapters 03, 08, 14, 15, 30 and 31, and the generated reference;
    - this directory's `input.md` and its kin, which describe `<->` as current;
    - the skill.
11. **The tests:** `databinding`, `forms`, `typed-fields`, `silent-failures`, `accessibility`, the soak and
    benchmark programs, and the Mac conformance.

## 10. Landing it, when it's time

- **Decide §6 first,** then review this document against §9, then build.
- **Before anything is pushed,** run the full gate: `npm test`, the ladder corpus, the eval references, the Mac
  shell's conformance, and the grid and virtualization benchmarks.
- **Push as one revertable series.**
- **Then run the four briefs** (Venue, Cadence, Murmur, Presentify), **one at a time,** each audited against its
  last runs before the next starts. Any regression traced to this change stops the sequence for a decision: fix, or
  revert.

## History

- **v1 (2026-11-04):** `TextInput` only. Its draft was owned by the field, `validate` gated what was delivered,
  and an ignored proposal snapped back.
- **The independent review of v1** (a fresh agent, after a full read of the reference, guide, library and runtime,
  with three probes) found:
  - `validate` as a gate gives the word a second meaning;
  - the snap-back brings back "328", and showing corrections live turns "1." into "1";
  - `Form.submit` doesn't commit;
  - the caret, undo and IME costs of putting an edit back;
  - `initial` as the trap behind run 4's title bug;
  - the observer fields that the rename to `input` would silently break.
- **v2:** the three rules, with the answer deferred to the end of the edit. That's a departure from the
  reviewer's own alternative, which still showed answers live and so kept the "1.5" → "17" hazard.
- **v3 (this document):** the contract moved into `ValueControl` for every control; `TextInput` as a library
  `ValueControl`; refusal in `beforeinput` with native undo kept; the Mac host in scope; §6 made a prerequisite;
  §9's review list.
