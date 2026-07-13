# States — modes as override bundles

A **state** is a named, reversible bundle attached to a view: a set of attribute
**overrides** *and* a **conditional subtree** of children, all switched by one
boolean. It replaces imperative mode-toggling and hand-wired enter/exit logic with
one declaration.

```declare
App [ textColor = black,
    open: boolean = false,
    onMouseDown() { open = !open },
    card: View [ x = 28, y = 26, width = 300, height = 72,
                 cornerRadius = 10, fill = white,
        Text [ x = 16, y = 16, fontWeight = bold, text = "Summary" ],

        big: State [ applied = { open }, height = 184, fill = lightsteelblue,
            Text [ x = 16, y = 54, width = 268, textColor = darkslategray, wrap = true,
                   text = "height, colour, and this whole line swap in together" ] ],
        ],
    ]
```

Flip `open` and three things change *together* — the card's height, its colour,
and an extra line of text appearing — and all three **revert the instant the mode
turns off**. You wrote no enter code and no exit code.

## A state is an ordinary member — no new grammar

A `State` is a typed child member, like an `Animator` or a named `View`. Its body
is a view body with two kinds of entry, told apart by shape:

- **`name = value`** entries are **overrides**, checked against *the enclosing
  view's* schema (so `big` above overrides `card`'s `height` and `fill`).
- **`id: Type [ … ]`** entries are **child views**, instantiated into the
  enclosing view only while the state is applied.

The one reserved control attribute is **`applied`** — the boolean that switches
the whole bundle.

## Why this beats setting properties by hand

The property that makes states worth having: **an attribute's value is a pure
function of its base plus the active states targeting it.** There is one
declarative owner per slot, and no imperative write to clobber it — so the classic
"set it on enter, forget to unset it on exit" bug is *unrepresentable*, not merely
discouraged. When the predicate lifts, the slot resumes exactly the value it would
otherwise have (a literal, a prevailing follow, or a live constraint — the base
can itself be reactive).

## `applied` — read anywhere, one provider

`applied` follows the same discipline as every slot: **read freely, written by
exactly one provider.** You get that provider two mutually exclusive ways:

- **A declarative gate** — `applied = { expr }`. A constraint owns it; you flip
  its *inputs*, never `applied` itself. This is the common case (the examples
  here).
- **Imperative verbs** — `apply()` / `remove()` / `toggle()`. Drive it from code
  for sequencing or a dynamically chosen target.

It is one or the other per state (a raw `edit.applied = true` is rejected with a
pointer to `apply()`). And any sibling can *read* `.applied` to react to a state —
that is how a state coordinates views it doesn't own (below).

## Overrides + precedence: a button

Several states can target one view; when more than one is active, **later-declared
wins** — static declaration order, readable from source, so you can encode intent
by ordering:

```declare
class Button extends View [ width = 120, height = 32, cornerRadius = 4,
    fill = royalblue, textColor = white,
    label: string = "", enabled: boolean = true,
    hovered: boolean = false, pressed: boolean = false,
    onMouseOver() { hovered = true }, onMouseOut() { hovered = false },
    onMouseDown() { pressed = true }, onMouseUp() { pressed = false },

    hover: State [ applied = { hovered },  fill = royalblue ],
    press: State [ applied = { pressed },  fill = royalblue ],
    off:   State [ applied = { !enabled }, fill = slategray, textColor = slategray ],  // declared last → wins

    caption: Text [ text = { classroot.label }, width = 120, y = 9 ],
    ]
```

`off` is declared last, so a disabled button stays greyed even while hovered or
pressed. No precedence flags, no z-index for state — just source order.

## Conditional children: a disclosure

The capability states uniquely add over a constraint ternary is a **subtree that
exists in one mode and not the other**. The children occupy the state's declaration
position, so layout reflows around their presence or absence:

```declare
class Disclosure extends View [ width = 260, title: string = "", open: boolean = false,
    layout: SimpleLayout [ axis = y ],
    header: View [ width = 260, height = 28, fill = whitesmoke,
        onClick() { classroot.open = !classroot.open },
        arrow: Text [ text = { classroot.open ? "▾" : "▸" }, x = 8, y = 6 ],
        label: Text [ text = { classroot.title }, x = 24, y = 6 ],
        ],
    opened: State [ applied = { open },        // children lay out right after the header
        detail: Text [ x = 8, y = 6, width = 244, text = "Detail, present only while open." ],
        rule:   View [ x = 8, width = 244, height = 1, fill = silver ],
        ],
    ]
```

State children are instantiated **fresh on each apply** and destroyed on remove —
so they never go stale, but they also don't retain edits. The pattern that follows:
**durable data lives on the base view; the state's children bind to it.** That is
exactly the edit-in-place shape next.

## Verbs, durable data, and the sibling rule: edit-in-place

A state governs *its own view and its own children* — it does **not** reach into
existing sibling children. Siblings that must react do so with their own
constraints reading the state's `.applied`. Here the displayed label hides itself
by reading `edit.applied`, and the edit box binds to durable `draft` on the base:

```declare
class Editable extends View [ width = 240, height = 28,
    label: string = "", value: string = "Portland", draft: string = "",
    name:  Text [ text = { classroot.label }, x = 0, y = 6, width = 80 ],
    shown: Text [ text = { classroot.value }, x = 84, y = 6,
        visible = { !classroot.edit.applied },     // sibling reacts by READING .applied
        onClick() { classroot.draft = classroot.value; classroot.edit.apply() } ],
    edit: State [
        fill = ivory,
        box: TextInput [ x = 84, y = 4, width = 96, text = { classroot.draft } ],
        ok:  Button    [ x = 186, y = 4, label = "OK",
            onClick() { classroot.value = classroot.draft; classroot.edit.remove() } ],
        ],
    ]
```

`edit` here is verb-driven (`apply()` / `remove()`), because entering edit mode is
an action, not a predicate. Note the flow: `apply()` builds the box bound to
`draft`; `OK` commits `draft` back to the durable `value` and calls `remove()`,
tearing the box down.

## States declare *where*, not *how*

A state's overrides are **end-states** — where a slot goes, not the path it takes
to get there. The transition between old and new (a tween, a spring) is the
runtime's or the animation API's job, layered on top; an animator sits *above*
states, so animating toward a state-driven target just works. See
[Animation](30-animation.md).

> **A note on syntax.** The form above — `name: State [ applied = { … } ]` — is
> the implemented one. The [language spec](../../design/declare-language.md#10-states)
> also shows a `state name when { cond } [ … ]` reading of the same idea; treat
> `State [ applied = { cond } ]` as the current, compiling surface. What happens
> when two states collide on a slot beyond simple declaration order (mutual
> exclusion, discriminated state groups) is still being settled.

---

**Next:** *how* children arrange — [Layout](25-layout.md).


<!-- demo: State -->
