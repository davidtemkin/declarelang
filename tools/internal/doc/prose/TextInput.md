An editable text field, realized as a **native** editable element (a DOM input in-box, a
positioned overlay on canvas) so caret, selection, IME, and accessibility are the
platform's, not reimplemented. It fires `input` on every edit and `enter` on a single-line
submit, and inherits View's focus and keyboard events.

Bind `text <-> :path` to edit a dataset record two-way — the field reads the datapath,
commits edits back into the dataset, and reseeds when the cursor moves to a new record. The
dataset owns the committed value; the field owns the **edit session** — its draft, when the
draft commits (`commitOn`), and whether it is any good (`valid` / `error` / `dirty`).

**`validate(v)` is a method you declare** on the field. It is called with the field's text
whenever that changes, and before every commit. Return `""` when it is good, and otherwise the
message to show. The message becomes `error`, `valid` follows it, and on a two-way field a
draft that fails never reaches the dataset. Keep it pure: it judges the value it is given (and
whatever else it reads, such as a field it must match).

**Any field can be judged**, two-way or not. A `text <-> :path` field also commits and keeps
`dirty`; a field the program fills itself (`text = { app.found.address }` with `onInput`) has
nothing to commit, and is judged the same way: `validate`, `error`, `valid`, `judgeOn` and
`judge()` all apply, and a screen reader hears `error` with the field.

**A field that regroups as it is typed** (a card number in fours) writes its text from
`onInput` and then puts the caret back with `select()`: `selectionStart` there is the caret
after the keystroke, and a `select()` made in the handler lands once the new text is shown.
Where the value can wait, tidying it when the field is left or the value commits is simpler.

```declare
App [ fill = white, textColor = black,
    contact: Dataset { { "email": "ada@example.com" } },
    form: View [ x = 20, y = 20, datapath = { app.contact.value },
        email: TextInput [ width = 240, height = 30, padding = 6, cornerRadius = 6,
            fill = gainsboro,
            text <-> :email, accessibilityLabel = "Email",
            validate(v: string) -> string { return v.includes("@") ? "" : "That is not an address" }
            ]
        ]
    ]
```

## text
The field's contents. With `text <-> :path` it is the **draft** of a two-way edit session over
a dataset record (see the intro). Otherwise: **constrain** it (`text = { model }`) for a
**controlled** field, or leave it unbound (or seed it with `initial`) for a field the user
edits freely.

A controlled field is the way an app **drives** a text field — the shape to reach for when
something other than the keyboard must be able to change it (a reset button, a preset, a
value arriving from elsewhere):

    who: string = "",
    f: TextInput [ text = { app.who }, onInput(v: string) { app.who = v } ],

The keystroke never writes `text` directly — the constraint is the value's source, so an edit
that diverges from it reverts. It arrives as **`onInput`** instead, and the handler writes
the attribute the constraint reads; the value returns through the constraint. That round trip is
what makes `app.who = ""` clear the field, which nothing else can do.

## placeholder
The grey prompt shown while the field is empty.

## multiline
Makes it a multi-line area rather than a single line — and then **Return inserts a newline**
instead of firing `enter` (unless `enterSubmits`). Left unsized, a multi-line field is as
tall as its text; to let it grow only so far and then scroll, cap it as any box is capped —
`height = { Math.min(contentHeight, 120) }` — since its `contentHeight` is its text's.

## enterSubmits
For a `multiline` field: **Return submits** — fires `enter`, and commits a field with
`commitOn = "enter"` — and **Shift-Return types the line break**, as in a chat composer.
`false` by default (Return is a line break). A single-line field always submits on Return.

## spellcheck
Toggles the native spell-check underline. A field whose `purpose` is not prose (an
email, a code, a card number) is never spell-checked, whatever this says.

## purpose
**What the field holds**, said once, so the platform can help with it: the browser's
autofill and a password manager recognise the field and offer to fill it, a phone brings
up the keyboard that suits it, and capitalization and autocorrection are left alone where
they would get in the way. The tokens:

| purpose | for | a phone's keyboard |
|---|---|---|
| `text` | anything else (the default) | text |
| `name` | a person's full name | text, capitalized words |
| `email` | an email address | email |
| `username` | a sign-in name | text |
| `password` | a password being entered | text, hidden |
| `newPassword` | a password being chosen | text, hidden |
| `oneTimeCode` | a code sent by text or email | digits |
| `tel`, `url` | a phone number, a web address | phone, URL |
| `digits`, `decimal` | a whole number, a number with a point | digits, decimal |
| `cardNumber`, `cardName`, `cardExpiry`, `cardCode` | a payment card's number, name, expiry and security code | digits (text for the name) |
| `addressLine1`, `addressLine2`, `city`, `region`, `postalCode`, `country` | a postal address; `region` is a state or province | text |

```declare-fragment
TextInput [ purpose = email, placeholder = "you@example.com" ],
TextInput [ purpose = password, accessibilityLabel = "Password" ],
TextInput [ purpose = cardNumber, accessibilityLabel = "Card number" ]
```

The purpose says what the field is for, not what may be typed: a `cardNumber` field still
takes whatever the person types, and checking it is the field's `validate` or your own
rule. A screen reader is told the field's name by its label as ever.

On a web page the field carries the standard autofill name for its purpose, as both its
`autocomplete` and its `name` (`cc-number` for `cardNumber`, `postal-code` for `postalCode`),
and the keyboard hint as its `inputmode`. That is all a browser or a password manager
matches on: fields need no form around them, and a page of them fills as one. A browser
offers saved payment cards only to a page served over HTTPS.

## concealed
**What is typed is hidden**, as a password is. It follows `purpose` — `password` and
`newPassword` are concealed, every other purpose is not — until it is set, which is how a
"show password" control works: the field keeps its purpose, so a password manager still
knows it, and only what shows changes.

```declare-fragment
showing: boolean = false,
pw: TextInput [ purpose = password, concealed = { !app.showing } ],
Checkbox [ label = "Show password", checked = { app.showing },
    input(v: boolean) { app.showing = v } ]
```

A concealed field's text is never said by a screen reader, nor counted in the name of what
holds it.

## wrap
For a `multiline` field, whether long lines wrap (`true`) or scroll horizontally (`false`) —
a code field wants `false`.

## padding
**Where the text sits inside the field** — the field's content box, as `View.padding` is
any view's: one number insets all four sides; four are `[top, right, bottom, left]`. An
auto-sized field (`height` unset) counts the top and bottom insets in its height, and a
wrapping one wraps to its width less the side insets. Unset, it is the theme's
`fieldPadding`.

## initial
An **uncontrolled seed** — React's `defaultValue` to `text`'s `value`: `text` starts at
`initial`, then holds the user's edits. For a field pre-filled from a value that must stay
freely writable (an editor seeded with source). A **bound** `text` is the controlled form
instead; **don't set both** — pick controlled *or* seeded.

## disabled
Inert: the field takes no focus and no edits, and a screen reader hears that it is disabled.
The same word, and the same meaning, as a `Control`'s `disabled`. Its text still shows; style
it from `disabled` as you would a control's (`textColor = { disabled ? … : … }`).

## commitOn
For a `text <-> :path` field, **when** a valid draft commits into the dataset: `"input"`
(live, on every edit — the default), `"blur"` (on losing focus), `"enter"` (on Return), or
`"manual"` (never automatically — only when you call `commit()`). Point the datapath at the
real record for autosave, or at a working copy you commit on a Save button for a transaction.

## error
**Read-only.** The current validation message for the field's text, or `""` when valid —
recomputed whenever the text changes, so what you own is `validate()`, not this attribute. Show
it with a label that reads it (`text = { app.field.error }`).

## valid
**Read-only.** Whether the text passes `validate()` — recomputed with `error`. A form-wide "can save" is just a constraint over several fields' `valid` (no
form object needed).

## dirty
**Read-only.** Whether the draft of a two-way field differs from the committed dataset
value — the session maintains it; `commit()` and `revert()` are what clear it. For enabling a Save affordance
or an unsaved-changes prompt.

## judgeOn
**When** `error` first says what is wrong with the draft: `"edit"` (on every edit — the
default) or `"leave"` — not until the field has been left once, or `judge()` asked. A field
marked wrong while the person is still typing in it for the first time is a common annoyance;
`"leave"` waits for them to finish. `valid` is true to the draft either way, so a form's
"can this be sent?" never waits. Once judged, the field follows each edit.

## judge()
Say what is wrong with the draft now, without waiting for the field to be left — for a Save
or a Send that checks every field: `onClick() { form.title.judge(); form.body.judge() }`.
Only matters with `judgeOn = "leave"`.

## validate()
Declare it on the field to judge its draft: return `""` (or `true`) when it is fine, and
otherwise the sentence that says what is wrong — it becomes `error`, and `valid` is false.
`validate(v: string) -> string { return v.includes("@") ? "" : "That is not an address" }`.
A draft that fails it never reaches the dataset. When the message first shows is `judgeOn`'s.

## commit()
Commit the current draft into the bound dataset field, if it validates — for a
`commitOn = "manual"` field or a Save button (`onClick() { field.commit() }`). A no-op on a
field that is not `<->`-bound.

## revert()
Discard edits — reset the field to the committed dataset value.

## onInput
Fires on every edit, carrying the new text — for live validation or search-as-you-type. On a
`<->` field the draft is already committed (per `commitOn`) by the time this runs.

## onEnter
Fires when the user submits the field with Return: always on a single-line field, and on a
`multiline` one that sets `enterSubmits` (where Shift-Return makes the newline instead).
On a plain `multiline` field Return makes a newline and this does not fire.


## select()
`select(at, end?)` — place the caret or select a range; the write half of the native
selection (`selectionStart` and `selectionEnd` are the read half). One verb, because a
caret **is** a zero-length range: `select(7)` puts the caret at 7, `select(3, 9)`
selects the range, and the word forms need no lengths — `select("start")`,
`select("end")`, `select("all")`. Numbers clamp to the text, like a scroll write.
Applied immediately while the field holds focus; otherwise **held** and applied at the
next non-pointer focus (Tab, or a program's), re-resolved against the text of that
moment — so `field.select("start")` on a freshly loaded draft puts the caret at the
top instead of the platform's end-of-value default. A pointer click into the field
keeps the clicked caret: a deliberate click names a spot, and outranks a held
selection by the platform's own ordering.

## selectionStart
Where the selection starts, as an index into `text` — read-only, reported by the field as
the user clicks, drags, types or moves the caret, so a constraint reading it follows along:
`canBold = { field.selectionEnd > field.selectionStart }`. With no range selected it is
the caret's position, and equals `selectionEnd`. Indices count UTF-16 units, as JavaScript
strings do. To move the selection, call `select()` — the field is the truth, and a fact a
program could write would race the user's own typing.

## selectionEnd
Where the selection ends — read-only; equal to `selectionStart` for a bare caret. See
`selectionStart`.

## textColor
The colour of the text being edited. Like the rest of the face it defaults to
the nearest **provided** value, so a field inside a themed region matches the prose
around it without being told.

## fontSize
The size of the text being edited, defaulting to the provided value. Worth
one caution: iOS zooms the page toward any focused field below 16, and back out on
blur, so a small field moves the whole viewport. The checker warns about it.

## fontFamily
The face the field types in — a family string, a `Font`, or a list of
them — defaulting to the provided value so an editor inherits its region's face.

## fontWeight
The weight of the text being edited, defaulting to the provided value.

## letterSpacing
Tracking for the text being edited, defaulting to the provided value.
A field and the label beside it stay in step because both read the same provision.

## selectable
Whether the text can be selected. A field's own content is always
editable and therefore selectable while focused; this is the attribute that opts a
read-only field's text into ordinary selection, or out of it.
