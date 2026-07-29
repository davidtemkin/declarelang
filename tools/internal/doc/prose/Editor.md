The abstract base every editing control extends (`TextInput` today). It owns the
**edit session**: a draft the user is typing, the committed value it will become,
and the validity derived from both — so a control gets `commitOn` / `error` /
`valid` / `dirty` and the `commit()` / `revert()` verbs without restating them.
Not instantiable: write the concrete control.

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

## commit()
Commit the current draft into the bound dataset field, if it validates — for a
`commitOn = "manual"` field or a Save button (`onClick() { field.commit() }`). A no-op on a
field that is not `<->`-bound.

## revert()
Discard edits — reset the field to the committed dataset value.
