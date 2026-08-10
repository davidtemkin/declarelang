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
**Read-only.** The current validation message for the draft, or `""` when valid — the edit
session recomputes it on every edit, so what you own is `validate()`, not this slot. Bind
a label to it (`text = { app.field.error }`) to present the error.

## valid
**Read-only.** Whether the draft passes `validate()` — recomputed by the session per edit,
like `error`. A form-wide "can save" is just a constraint over several fields' `valid` (no
form object needed).

## dirty
**Read-only.** Whether the draft differs from the committed dataset value — the session
maintains it; `commit()` and `revert()` are what clear it. For enabling a Save affordance
or an unsaved-changes prompt.

## commit()
Commit the current draft into the bound dataset field, if it validates — for a
`commitOn = "manual"` field or a Save button (`onClick() { field.commit() }`). A no-op on a
field that is not `<->`-bound.

## revert()
Discard edits — reset the field to the committed dataset value.

## focused
**Read-only.** True while this editor holds keyboard focus — the runtime maintains it, and
assigning it (a compile error) would not have moved platform focus anyway:
**`Focus.focus(view)` is what moves focus**. It is published so an author who displaces
the default field chrome (by assigning `fill` or `stroke`) can still draw the focus
affordance themselves.
