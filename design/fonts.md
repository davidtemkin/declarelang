# Fonts

A `font` names a family and holds its faces. Text picks a face at the point of
use via the prevailing `fontWeight`/italic; `fontFamily` is an ordered fallback
list. The model is CSS's `@font-face` / `font-family` split, in the container
shape (a family owns its faces) that OpenLaszlo's own `<font><face/></font>`,
Android's `FontFamily`, and Flutter's `pubspec` all use — chosen over CSS's
flat, string-grouped `@font-face` rules because a named container is clearer and
has no hidden grouping rule.

## Declaration

```
font Display [
    Face [ src = "disp-400.woff2",  weight = regular ],
    Face [ src = "disp-700.woff2",  weight = bold ],
    Face [ src = "disp-700i.woff2", weight = bold, italic = true ],
]

font UI    [ family = "Helvetica Neue" ]          // system: a family, no faces

font Brand [
    Face [ src = [local("Work Sans"),      "ws-400.woff2"], weight = regular ],
    Face [ src = [local("Work Sans Bold"), "ws-700.woff2"], weight = bold ],
]
```

- **`font Name [ … ]`** declares a named family. `Name` is the handle you use as
  `fontFamily = Name`.
- **`family = "…"`** is the CSS family string the name resolves to. It
  **defaults to the declaration name**, so a web font never writes it; you set it
  when the CSS family differs — which is exactly how you **name a system font**
  (`font UI [ family = "Helvetica Neue" ]`).
- **`Face [ src, weight?, italic? ]`** children are the faces you pin.
  - `src` — where the bytes come from. A bare string is a URL
    (`"disp-700.woff2"`, a path or a full `https://…`); `url("…")` says the same
    explicitly; `local("Name")` names an **installed** face; a list
    `[local("…"), "…"]` tries each in order (prefer-installed-else-download).
  - `weight` — one of the formalized tokens `thin extralight light regular
    medium semibold bold extrabold black`. Defaults to `regular`.
  - `italic` — `true` for the italic face. Defaults to upright.
- **No `Face` children → a system font.** Its faces are the OS's — not shipped,
  not enumerable (they depend on what's installed), and resolved at the use site.
- A font must carry **either** a `family` **or** at least one `Face` (a bare
  `font X [ ]` is an error).

## Use

```
App [ fontFamily = [Brand, UI, "sans-serif"] ]
    …
    Text [ text = "12°", fontWeight = bold ]     // selects Brand's bold Face here
```

- **`fontFamily`** is an ordered **fallback list**. Each item is a declared font
  **name** (resolved to its `family`) or a **string** (a raw family or a generic
  like `"sans-serif"`). A single name or string (no brackets) is the one-item
  case. An undeclared name is an error (typo-catch); strings pass through. It
  resolves — **statically, at instantiate** — to a comma-joined CSS family
  string, so the render seam still carries a plain string and the backends are
  untouched.
- **`fontWeight`/italic select the face**, at the use site, for web and system
  fonts alike: against your `Face` set for a web family, against the installed
  faces for a system one. A missing face is the browser's to resolve — nearest
  match or faux bold/oblique. That uncertainty is inherent to system fonts and
  the model owns it rather than pretending to enumerate around it.
- `fontFamily`/`fontWeight`/italic are **prevailing** (declared on `View`): set
  them on a container and descendants inherit until one overrides.

## Loading

Web faces (any `Face` with a downloadable or `local()` source) are collected and
loaded **before first paint** (`index.ts → loadFonts`), so text measures against
real metrics, not a fallback. A system font (no faces) loads nothing.

## Not in v1 (extends without breaking)

Per-face `stretch` (condensed/expanded), variable-font axes, multiple `url()`
format alternates, and `unicode-range` subsetting are all further `Face`
attributes when needed — the container makes them additive. Semantic type
*roles* (`body`/`heading` that bundle family+size+weight and scale with user
settings, à la Dynamic Type) are deliberately **not** the font primitive's job —
they live in the stylesheet / prevailing channel.
