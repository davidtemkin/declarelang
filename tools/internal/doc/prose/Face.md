One **file of a `Font`**: where its bytes come from, the weight or weights it covers, and
whether it is the italic. A Face lives only inside a Font and has no children; a Font
picks among its faces at the use site by the run's `fontWeight` and `italic`, the way
CSS matches `@font-face` rules — a face whose weight range covers the asked-for weight
is an exact match, which is how one variable file serves every weight.

Compiling never reads a face's file, so a font can never fail a compile. A relative
`src` names a file beside the program and ships with a build; a remote URL is fetched
from its host (in a browser that host must allow cross-origin font requests); a `{ }`
source is fetched when the app sets it.

```declare
App [ width = 320, height = 100, fill = white, textColor = black,
    body: Font [
        Face [ src = [local("Georgia"), local("Times New Roman")] ],
        Face [ src = [local("Georgia Bold"), local("Times New Roman Bold")], weight = bold ]
        ],
    Text [ x = 20, y = 20, fontSize = 20, fontFamily = { [app.body, "serif"] }, text = "Regular" ],
    Text [ x = 20, y = 54, fontSize = 20, fontWeight = bold, fontFamily = { [app.body, "serif"] }, text = "Bold" ]
    ]
```

## src
Where the face comes from: a URL string (`"brand-700.woff2"`, a path, or a full
`https://…`), `url("…")` saying the same explicitly, `local("Work Sans Bold")` naming a
face installed on the machine, or a list tried in order —
`[local("Work Sans Bold"), "ws-700.woff2"]` prefers the installed face and downloads
otherwise. Required.

## weight
The weight this face is: a name from `thin` to `black` (default `regular`), a number
from 1 to 1000, or `range(lo, hi)` for a **variable** font file, which then answers every
weight between — one file instead of one per weight.

## italic
`true` for the italic face (default `false`).
