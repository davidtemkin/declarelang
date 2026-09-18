A **typeface as an object in the tree**, like an `Image`: create it where it belongs —
usually on the App, so it lives as long as the program — and use it anywhere a family
goes. A `Font` owns its `Face` children, one file each. A Font with **no faces is a
system font**: it names a `family` the machine already has, and there is nothing to
load. Web and system fonts are the same kind of object, so a slot that holds one holds
the other, and switching between them is an assignment: `app.reading = app.ui`.

`fontFamily` (and `codeFamily`) takes a Font, a family string, or a list tried in order.
A list that holds a font is a value, so it is written in a `{ }`:
`fontFamily = { [app.brand, "Helvetica", "sans-serif"] }`. A plain list of strings stays
a bare literal.

**Lifetime is placement.** A font on the App lives for the program; a font inside a view
lives with that view, and its faces are unloaded when the view retires. A face's `src`
may be a `{ }` value: set it and the new file loads while text keeps the face it has,
then changes once.

**While faces load**, the font says what waiting is worth: `wait` is how long whatever is
about to change to this font keeps its current look (the app's first paint included),
and `late` decides what a face arriving after that does. Text, layout, drawings and
`measureText` follow a face landing with no code — reading the font is the dependency.

```declare
App [ width = 320, height = 100, fill = white, textColor = black,
    serif: Font [ family = "Georgia" ],
    sans: Font [ family = "Helvetica" ],
    reading: Font = { app.serif },
    onClick() { app.reading = app.reading == app.serif ? app.sans : app.serif },
    Text [ x = 20, y = 20, width = 280, fontSize = 20, fontFamily = { app.reading },
        text = "Click to switch the face" ]
    ]
```

## family
The family a **system font** names — `Font [ family = "Helvetica Neue" ]`. Only for a
font with no faces: a font with faces is named by its object, never by a string, and
setting both is refused.

## wait
Milliseconds (default `500`) that whatever is about to change to this font keeps its
current look while its faces load. At start that is the first paint: the app appears
once every font it starts with has arrived, failed, or used up its wait. When a slot
switches to a font still inside its wait, the **slot** holds the new font at once while
the text it drives keeps drawing in the family it had, and changes once, when the font
settles. When a face's `src` changes, text keeps the old face until the new one is ready.
A face that fails ends the wait at once. `0` never holds.

## late
What a face arriving after the wait does: `swap` (the default) changes text to it — one
redraw; `keep` leaves the fallback for the rest of the run, and `loaded` stays `false`.

## loaded
`true` once every face has arrived; a system font is loaded from the start. Read-only.
While loading, both `loaded` and `failed` are `false`.

## failed
`true` when a face could not be fetched — a missing file, an offline viewer, a host that
refuses cross-origin font requests. Text uses the next family in its list. Read-only.
