A named bundle of overrides that snaps on and off **together**. Its body is not ordinary
children: a `name = value` entry is an **override of the enclosing view's own attribute**
(checked against *that* view's schema, not the State's), applied while the state is on;
an `id: Type [ … ]` entry is a conditional subtree that exists only while applied. Because
attribute reads compose as a **precedence stack**, the base values return *exactly* when
the state turns off — there is no manual undo to write, and no drift.

```declare
card: View [ height = 72, fill = white,
    open: State [ applied = { expanded }, height = 184, fill = lightsteelblue,
        Text [ text = "shown only while open" ] ],
]
```

## applied
Whether the state is on. Bind it to a condition (`applied = { expanded }`) and the whole
bundle snaps in and out as that flips — the base values restore themselves when it turns
off. The declarative alternative to the `apply()` / `remove()` / `toggle()` verbs.

## onApply
Fires when the bundle turns **on** — after the overrides compose onto the stack, so reads
in the handler already see the state's values. Use for a side effect that must ride with the
state (focus a revealed field), not to mutate what the state already declares.

## onRemove
Fires when the bundle turns **off**, the partner of `onApply` — after the base values have
restored. For tearing down whatever `onApply` set up.

## apply()
Turns the bundle **on** imperatively — the verb form of `applied = true`. Prefer binding
`applied` to a condition; reach for `apply()` only when the toggle is truly event-driven and
has no natural boolean to bind.

## remove()
Turns the bundle **off**, restoring the base values via the precedence stack (no manual undo).
The partner of `apply()`.

## toggle()
Flips the bundle on/off from its current state — a one-call switch for a handler
(`onClick() { panel.toggle() }`) when you don't want to thread a boolean.
