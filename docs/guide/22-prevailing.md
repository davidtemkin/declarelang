# Prevailing — styling that flows down the tree

Some attributes should not be repeated on every node. A font, a text colour, a
palette — you set them once high in the tree and every descendant should follow.
Declare calls such a slot **prevailing**: an unset prevailing slot *follows the
nearest ancestor that sets it*, and keeps following live, until a descendant
overrides it.

```declare
App [ fontFamily = ["Helvetica Neue", "Geneva", "sans-serif"], fontSize = 9,
      fontWeight = bold, textColor = #FFFFFF, zip: string = "94110",

    // none of these Texts repeat the family, size, weight, or colour — they
    // inherit the App's, and would inherit any nearer container's instead

    topBar: View [
        title: Text [ text = "Rain or Shine?" ],
        zip:   Text [ text = { app.zip }, textColor = #CAD0EC ],   // overrides just the colour
        ],
    ]
```

`title` paints in the App's bold Helvetica at size 9 in white; `zip` inherits all
of that but overrides `textColor`. This is the mechanism that keeps a real UI
free of style repetition — and it is why *reskinning a subtree is one edit at its
root*, not a sweep through every leaf.

## The built-in prevailing slots

The text-style quartet plus a couple more are prevailing, declared on `View`, so
any container provides them and any descendant follows:

`textColor` · `fontSize` · `fontFamily` · `fontWeight` · `letterSpacing` ·
`theme` · `stylesheet`

Set any of them on a container and the region below re-styles. (Note `textColor`
is the one text-colour slot — there is no separate `color` alias. A `textFill = {
gradient(…) }` overrides it when you want a gradient instead of a flat colour; see
the [`Text` reference].)

## The `theme` token record

`theme` is a prevailing record of design tokens. Provide it once and every
descendant reads tokens out of it inside `{ }` bodies — so the whole palette lives
in one place, and the entire tree reskins from that one set:

```declare
App [ theme = { ({ text: 0xE7EEF2, muted: 0x8A9BA6, accent: 0x4C8DFF,
                   surface: 0x101E28, line: 0x263D4C }) },
    …
    ]

// anywhere below, a component defaults its colours to the tokens:

class Heading extends Text [ fontWeight = semibold, textColor = { theme.text } ]
class Body    extends Text [ fontSize = 15,          textColor = { theme.muted } ]
```

Two things worth noticing. The theme literal is `{ ({ … }) }` — a `{ }` value
body returning a TypeScript object, so its colours are `0x…` (the body is
TypeScript). And because `theme` is prevailing, a subtree can *provide its own*
`theme` to re-skin just that region, while everything else keeps the App's.

## Declaring your own prevailing attribute

Prevailing is not a framework privilege — it is a contextual declaration modifier,
`prevailing`, that any class can use. It reads before a normal declaration head:

```declare
class Panel extends View [
    prevailing accent: Color = #4C8DFF,        // descendants follow this Panel's accent
    …
    ]

// a child, with no accent of its own, follows the enclosing Panel's:

class Chip extends View [ stroke = { stroke(1, accent) } ]
```

Now setting `accent` on a `Panel` re-tints every `Chip` beneath it, and a nested
`Panel` can set a different one for its own region. The rule mirrors TypeScript's
own modifiers: `prevailing` sits alongside `readonly` (see [Sizing](32-sizing.md))
as a modifier on the declaration, and a member literally named `prevailing` still
parses everywhere else.

## Stylesheets (the external channel)

For a heavier re-skin than a token record — one that restyles *by component class*
— provide a `stylesheet`. It is the reactive counterpart to a static styles list:
supply one anywhere and that whole subtree reskins; swap it and the subtree
re-styles in a single settle. A stylesheet body carries a `theme` record plus
class-keyed entries:

```declare
stylesheet Dark [
    theme: Theme [ accent = #4F8EF7, surface = #101E28 ],
    Button: [ fill = #1C2D39, cornerRadius = 8 ],
    ]
```

Stylesheets are their own topic — the full model, including how it exceeds what
CSS can express, is in [style.md](../../design/style.md). For most apps, the
built-in prevailing slots plus a `theme` record are all you reach for.

## The gotcha: unset means *following*, and the first write flips it

A prevailing slot has one subtlety worth internalizing. While a slot is unset on a
node, it is *following* an ancestor — live, updating when the ancestor changes.
The **first write to it changes what the slot means**: from following to
providing. After you set `textColor` on a container, that container no longer
follows its ancestor — it now *is* the provider for everything below. This is
exactly the behavior you want (set it where you mean to override), but it is why
"inherited" and "set here" are the same slot in two states, not two different
attributes.

---

**Next:** responding to the user — [Events and subscriptions](23-events.md).
