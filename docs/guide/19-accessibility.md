<!-- nav: Accessibility -->
<!-- part: Building -->

# Accessibility — what a screen reader hears, and what you add

A Declare program is usable with a screen reader and with the keyboard alone, and
most of that comes with the classes you already use. Every view that means something
— a button, a checkbox, a menu, a row in a table, a dialog — tells assistive technology
what it is, what it is called, and what state it is in, and keeps telling it as things
change. You add what only you know: the name of a control that shows no words, and what
your own drawn controls are.

This chapter is what you get, what you add, and how you check it.

## What you get

**The library's controls describe themselves.** A `Button` is a button named by its
label; a `Checkbox` says whether it is checked; a `Slider` gives its value and its range
and steps with the arrow keys, as a screen reader's own gestures step it; a `Segmented`
and a `TabBar` are a group of choices with the chosen one marked. The
[Controls](declare-docs:guide:controls) table says what each is to a screen reader.

**Overlays behave.** An open `Dialog` or `Sheet` is announced as a dialog and holds the
focus; what is behind it is out of reach to the keyboard and to a screen reader alike;
when it closes, the focus goes back where it came from. A `Menu` holds the focus while it
is open and names the item the arrow keys are on. A `Toast` is announced when it appears,
without taking the focus. Shift+F10 and the Menu key open a context menu at the focused
view.

**Lists and tables say where you are.** A virtualized list builds only the rows near the
screen, but a screen reader still hears "row 4,012 of 30,500". A `Table` and a `DataGrid`
name the row or cell the keyboard is on, say whether more than one can be selected, and a
`DataGrid`'s column headers are headers that say how they sort.

**Text is text.** A `Text` is read as what it says; a control made of text takes its name
from it, so `Button [ Text [ text = "Send" ] ]` is a button called "Send" with no more
said. Views that are only layout — a row, a column, a padded box — say nothing and cost
nothing.

**What is out of sight is not read.** A view hidden with `visible = false`, or faded to
`opacity = 0`, is passed over. Clipping, a size of 0 and a place off screen are geometry,
not absence: what they hide is still read and still reached by Tab. A view that collapses
to hide what it holds says so with `visible` as well — `visible = { this.height > 0 }` —
and the compiler asks for it where it sees the collapse.

**Focus is one fact.** Tab order is child order. The focus the keyboard sees, the ring
that is drawn, and the focus a screen reader follows are the same focus.

## What you add

**A name where nothing shows one.** An icon-only button, a `Switch`, a `Slider`: nothing
on screen is the name, so give one.

```declare-fragment
Button [ accessibilityLabel = "Close", CloseIcon [ ] ],
Switch [ accessibilityLabel = "Wi-Fi", checked = { app.wifi } ]
```

The compiler warns, with a fix, when a control has no name to give. A field inside a
`Field` is named by the field's label; a field elsewhere takes `accessibilityLabel`. So
does a control whose words are shown apart from it — a checkbox beside the text of its
row has no `label` of its own, and is named with that text:

```declare-fragment
View [ datapath = :items[], layout: SimpleLayout [ axis = x, spacing = 8 ],
    Checkbox [ checked = :done, accessibilityLabel = :title, input(v: boolean) { :done = v } ],
    Text [ text = :title ]
    ]
```

**One control at a time.** A control holds no other control: a checkbox inside a button is
read as part of the button's name, and a screen reader that takes a button as one element
(VoiceOver does) never reaches it. Lay the two side by side in a plain `View`, which says
nothing; the compiler warns where one is written inside another. A list's row is not a
control in this sense: a row that opens into an editor holds its fields and buttons, each
reached on its own, and the row is named by its own words, not theirs.

**A hint, where the name is not enough** — `accessibilityHint` is read after the name and
the value: what pressing will do, or what a field expects. A control with a tooltip uses
the tooltip as its hint.

**What a field holds.** [`purpose`](declare-docs:TextInput.purpose) says it: `email`,
`password`, `cardNumber`, `postalCode` and the rest. The browser's autofill and a password
manager use it to fill the field, a phone to choose its keyboard, and a password is hidden
and never read aloud.

**Pictures that carry meaning.** An `Image` with an `accessibilityLabel` is read; one
without is decoration and is skipped.

**Decoration that is text.** Text that only repeats what the words around it say — a
glyph beside a word that says the same thing — is noise when read aloud. Mark it
[`accessibilityHidden`](declare-docs:View.accessibilityHidden): it is still seen, and a
screen reader skips it and all it holds. Never on a control: the keyboard still reaches it.

**The shape of a page.** A view whose text is a heading says so —
`accessibilityRole = heading, accessibilityLevel = 2` — so a screen reader can move from
heading to heading. The large regions of a screen can be landmarks (`navigation`, `main`,
`search`, `banner`, `complementary`), which a screen reader's user jumps between.

**What changed, when nobody is looking at it.** A view whose changes should be heard —
a status line, a count of results — sets `accessibilityLive = polite`. For a one-off,
with no view to say it from, `Accessibility.announce("Message sent")`.

## Your own controls

A control you draw is pixels to a screen reader until you say what it is. Give it a role,
and the role tells you what else it needs: a `slider` must say its value and range and
know how to step. The compiler checks that it does, by name and type, as it checks the
library's own `Slider` — a missing member is an error that names it.

```declare
class Rating extends Control [ width = 140, height = 28, stars: number = 3,
    accessibilityRole = slider, accessibilityLabel = "Rating",
    accessibilityMin = 0, accessibilityMax = 5, accessibilityValue = { stars },
    accessibilityValueText = { stars + " of 5 stars" },
    accessibilityIncrement() { stars = Math.min(5, stars + 1) },
    accessibilityDecrement() { stars = Math.max(0, stars - 1) },
    draw(d: DrawContext) {
        for (let i = 0; i < 5; i++) {
            d.fillStyle = i < stars ? 0xF2A516 : 0xDCE1E8
            d.beginPath()
            d.arc(14 + i * 28, 14, 10, 0, Math.PI * 2, false)
            d.fill()
            }
        }
    ]
App [ width = 220, height = 80, fill = white,
    Rating [ x = 20, y = 26 ]
    ]
```

A screen reader says "Rating, 3 of 5 stars, slider". Its swipe up sets four stars, and so
does the right arrow: the keyboard and the screen reader call the same method. A control
that is pressed has `press()` already; a `button` role needs nothing more than a name.

The roles are a closed set — `button`, `checkbox`, `slider`, `tab`, `listbox`, `option`,
`dialog`, `heading` and the rest; `declare-help View.accessibilityRole` lists them — and a role
is fixed for a view's lifetime.

## The person's settings

`provided("accessibilitySettings")` — on the App itself, `accessibilitySettings` — holds
what the person has asked their system for:
`reduceMotion`, `increaseContrast`, `reduceTransparency`. It is live — it changes when
they change the setting. Nothing in Declare acts on it for you; a program that wants its
motion to stand still, or its theme to raise its contrast, reads it where it decides.

## Checking it

- **The compiler** warns about a role with no name, a control inside a control, content
  clipped to a size of 0 that is still read, and a drawn view that takes the focus and says
  nothing, in the same loop as type errors — in every file of the program, not only the
  one it starts from.
- **`declare-look app.declare --semantics`** prints what a screen reader is given — the
  tree of roles, names, values and states — with no browser and no screen reader. Click,
  type and press keys first to see it in any state.
- **Scripted checks find views by their names**: `find("app.toolbar.Save")` in a
  `declare-verify` script reaches the view a person would call "Save".

## Where it applies

All of this is realized on the DOM renderer, the default: the browser's accessibility tree
is what this chapter describes, and VoiceOver, NVDA and the rest read it. The canvas
renderer draws one opaque element, and does not yet carry the tree; ship the DOM renderer
where accessibility matters, which costs nothing, since the same program runs on both. The
Mac host's text fields are the platform's own; the rest of its tree is still to come.

A program with nothing to say to a screen reader — an arcade game — can leave the layer
out of its build with `accessibility = false` in its `defaultFlags`.
