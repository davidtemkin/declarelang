An editable text field, realized as a **native** editable element (a DOM input in-box, a
positioned overlay on canvas) so caret, selection, IME, and accessibility are the
platform's, not reimplemented. It fires `input` on every edit and `enter` on a single-line
submit, and inherits View's focus and keyboard events.

It is also the first **Editor**: bind `text <-> :path` to edit a dataset record two-way — the
field reads the datapath, commits edits back into the dataset, and reseeds when the cursor
moves to a new record. The dataset owns the committed value; the field owns the *edit session*
— its draft plus `valid` / `error` / `dirty`. Supply a `validate(v)` method for a domain rule
beyond the schema type (return an error message, or `null` when valid); an invalid draft is
held and never written.

```declare
App [ fill = white, textColor = black,
    contact: Dataset { { "email": "ada@example.com" } },
    form: View [ x = 24, y = 24, datapath = { app.contact.value },
        email: TextInput [ width = 240, height = 30, padding = 6, cornerRadius = 6,
            fill = gainsboro,
            text <-> :email,
            validate(v) { return v.includes("@") ? null : "not an email" } ] ],
    ]
```

## text
The field's contents. With `text <-> :path` it is the **draft** of a two-way edit session over
a dataset record (see the intro). Otherwise: **bind** it (`text = { model }`) for a
**controlled** field — an edit that diverges from the binding reverts — or leave it unbound
(or seed it with `initial`) for a field the user edits freely.

## placeholder
The grey prompt shown while the field is empty.

## multiline
Makes it a multi-line area rather than a single line — and then **Return inserts a newline**
instead of firing `enter`.

## spellcheck
Toggles the native spell-check underline.

## wrap
For a `multiline` field, whether long lines wrap (`true`) or scroll horizontally (`false`) —
a code field wants `false`.

## padding
Inner padding around the text, in px.

## initial
An **uncontrolled seed** — React's `defaultValue` to `text`'s `value`: `text` starts at
`initial`, then holds the user's edits. For a field pre-filled from a value that must stay
freely writable (an editor seeded with source). A **bound** `text` is the controlled form
instead; **don't set both** — pick controlled *or* seeded.

## commitOn
For a `text <-> :path` field, **when** a valid draft commits into the dataset: `"input"`
(live, on every edit — the default), `"blur"` (on losing focus), `"enter"` (on Return), or
`"manual"` (never automatically — only when you call `commit()`). Point the datapath at the
real record for autosave, or at a working copy you commit on a Save button for a transaction.

## error
The current validation message for the draft, or `""` when valid. A reactive slot — bind a
label to it (`text = { app.field.error }`) to present the error.

## valid
Whether the draft passes `validate()`. A reactive slot; a form-wide "can save" is just a
constraint over several fields' `valid` (no form object needed).

## dirty
Whether the draft differs from the committed dataset value — for enabling a Save affordance
or an unsaved-changes prompt.

## onInput
Fires on every edit, carrying the new text — for live validation or search-as-you-type. On a
`<->` field the draft is already committed (per `commitOn`) by the time this runs.

## onEnter
Fires when the user submits a single-line field (Return). On a `multiline` field Return
makes a newline and this never fires.

## commit()
Commit the current draft into the bound dataset field, if it validates — for a
`commitOn = "manual"` field or a Save button (`onClick() { field.commit() }`). A no-op on a
field that is not `<->`-bound.

## revert()
Discard edits — reset the field to the committed dataset value.
