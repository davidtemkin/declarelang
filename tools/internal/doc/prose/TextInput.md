An editable text field, realized as a **native** editable element (a DOM input in-box, a
positioned overlay on canvas) so caret, selection, IME, and accessibility are the
platform's, not reimplemented. It fires `input` on every edit and `enter` on a single-line
submit, and inherits View's focus and keyboard events.

It is also the first **Editor**: bind `text <-> :path` to edit a dataset record two-way — the
field reads the datapath, commits edits back into the dataset, and reseeds when the cursor
moves to a new record. The dataset owns the committed value; the field owns the *edit session*
— its draft plus `valid` / `error` / `dirty`. Supply a `validate(v: string)` method for a domain rule
beyond the schema type (return an error message, or `null` when valid); an invalid draft is
held and never written.

```declare
App [ fill = white, textColor = black,
    contact: Dataset { { "email": "ada@example.com" } },
    form: View [ x = 20, y = 20, datapath = { app.contact.value },
        email: TextInput [ width = 240, height = 30, padding = 6, cornerRadius = 6,
            fill = gainsboro,
            text <-> :email,
            validate(v: string) { return v.includes("@") ? null : "not an email" }
            ]
        ]
    ]
```

## text
The field's contents. With `text <-> :path` it is the **draft** of a two-way edit session over
a dataset record (see the intro). Otherwise: **bind** it (`text = { model }`) for a
**controlled** field, or leave it unbound (or seed it with `initial`) for a field the user
edits freely.

A controlled field is the way an app **drives** a text field — the shape to reach for when
something other than the keyboard must be able to change it (a reset button, a preset, a
value arriving from elsewhere):

    who: string = "",
    f: TextInput [ text = { app.who }, onInput(v: string) { app.who = v } ],

The keystroke never writes `text` directly — the binding is the value's source, so an edit
that diverges from it reverts. It arrives as **`onInput`** instead, and the handler writes
the slot the binding reads; the value returns through the constraint. That round trip is
what makes `app.who = ""` clear the field, which nothing else can do.

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

## onInput
Fires on every edit, carrying the new text — for live validation or search-as-you-type. On a
`<->` field the draft is already committed (per `commitOn`) by the time this runs.

## onEnter
Fires when the user submits a single-line field (Return). On a `multiline` field Return
makes a newline and this never fires.


## select()
`select(at, end?)` — place the caret or select a range; the write half of the native
selection (the read half — selection facts — is not modeled yet). One verb, because a
caret **is** a zero-length range: `select(7)` puts the caret at 7, `select(3, 9)`
selects the range, and the word forms need no lengths — `select("start")`,
`select("end")`, `select("all")`. Numbers clamp to the text, like a scroll write.
Applied immediately while the field holds focus; otherwise **held** and applied at the
next non-pointer focus (Tab, or a program's), re-resolved against the text of that
moment — so `field.select("start")` on a freshly loaded draft puts the caret at the
top instead of the platform's end-of-value default. A pointer click into the field
keeps the clicked caret: a deliberate click names a spot, and outranks a held
selection by the platform's own ordering.
