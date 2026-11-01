# The Presentify API

A local HTTP service that stores presentations. It defines the document format, and it is
the only place a presentation is kept. **You do not write or modify this server.** It is
given, it is running, and it is the only backend that exists.

It answers at `http://127.0.0.1:8360`. It answers any origin.

Every refusal is JSON with an `error` code and a one-sentence `message` meant for the
person. Writes take a moment (about a quarter of a second), as a real service's do.

---

## The format

A presentation is a **deck**, and its slides are stored **one by one**. A slide is saved on
its own, so saving one slide never touches another.

### Deck

```json
{ "id": "d1", "title": "Field notes from the coast", "version": 3,
  "updatedAt": "2026-11-02T09:00:03.000Z",
  "slideOrder": ["s1", "s2", "s3"], "thumbnailSlideId": "s1" }
```

`slideOrder` is the slides in order. `thumbnailSlideId` is the first of them, the slide
that pictures the presentation in a list.

### Slide

```json
{ "id": "s2", "deckId": "d1", "version": 1, "background": "#F6F4EF",
  "elements": [ … ] }
```

A slide is **1280 × 720 points**, origin top left, y downward. Every position and size is in
slide points.

### Elements

`elements` is in stacking order, **back to front**. Every element has a unique `id` (unique
within its slide, groups included) and a `kind`.

| kind | fields |
|---|---|
| `rect` | `x`, `y`, `width`, `height`, `fill`, `stroke`, `cornerRadius`, `keepProportions` |
| `ellipse` | `x`, `y`, `width`, `height`, `fill`, `stroke`, `keepProportions` |
| `line` | `x1`, `y1`, `x2`, `y2`, `stroke` |
| `text` | `x`, `y`, `width`, `height`, `keepProportions`, `text` |
| `group` | `children` |

- **`x`, `y`, `width`, `height`**: the element's box. A size is never negative.
- **Colours** are `"#RRGGBB"`, or `"#RRGGBBAA"` with an alpha.
- **`fill`** is a colour, or `null` for none.
- **`stroke`** is `{ "color": "#1F2328", "width": 2 }`, or `null` for none. A line's stroke
  is never `null`.
- **`cornerRadius`** is in points; `0` is square. It is a length, not a proportion: it does
  not change when the rectangle is resized.
- **`keepProportions`**: when `true`, resizing keeps the element's width-to-height ratio.
- **`text`** is one block with one style:
  `{ "content": "Three sites", "font": "Georgia", "size": 48, "weight": 700,
  "italic": false, "color": "#0E3B43", "align": "left" }`.
  `size` is in points; `weight` is 100 to 900 (400 regular, 700 bold); `align` is `left`,
  `center` or `right`. The text wraps within `width`. `height` is the box's height as last
  laid out.
- **A group** holds two or more elements (groups may nest). Its children keep their own
  slide coordinates; a group has no box of its own, so its bounds are its children's.

A field the format doesn't define is refused, so a slide always reads back exactly as it
was saved.

---

## Presentations

### `GET /api/decks`

```json
{ "decks": [ { "id": "d1", "title": "Field notes from the coast",
  "updatedAt": "2026-11-02T09:00:03.000Z", "slideCount": 8, "thumbnailSlideId": "s1" } ] }
```

Most recently changed first. A deck's `updatedAt` moves on whenever it or any of its slides
is saved.

### `POST /api/decks`

Body `{ "title": "Untitled presentation" }` (the title is optional). Returns `201` with the
new deck and its one empty slide: `{ "deck": Deck, "slides": [Slide] }`.

### `GET /api/decks/:id`

The deck.

### `PATCH /api/decks/:id`

Changes the title, the slide order, or both: `{ "version": 3, "title": "…",
"slideOrder": [ … ] }`. `version` is the deck's version as you last read it. `slideOrder`
must list exactly this deck's slides. Returns the deck, its version moved on.

### `DELETE /api/decks/:id`

Deletes the deck and its slides. `204`.

---

## Slides

### `GET /api/decks/:id/slides`

`{ "slides": [Slide, …] }`, in the deck's order.

### `POST /api/decks/:id/slides`

Adds a slide. Body `{ "after": "s2", "background": "#FFFFFF", "elements": [ … ] }`: every
field is optional. `after` is the slide to follow (absent or `null` puts it last); a new
slide is empty and white unless you give it content, which is how a duplicate or a paste is
made. Returns `201` with `{ "slide": Slide, "deck": Deck }`, the deck's order and version
already moved on. No deck version is needed.

### `GET /api/slides/:id`

The slide.

### `PUT /api/slides/:id`

Saves a slide whole: `{ "version": 1, "background": "#FFFFFF", "elements": [ … ] }`.
`version` is the slide's version as you last read it. Returns the slide, its version moved
on.

### `DELETE /api/slides/:id`

Deletes a slide. Returns `{ "deck": Deck }`, its order and version moved on. A deck's last
slide can't be deleted (`409`, `"last_slide"`).

---

## Refusals

- **`409` `"conflict"`**: the `version` you sent is not the current one. Someone saved this
  slide (or deck) since you read it, in another window or on another device. The body
  carries the current copy as `current`:
  `{ "error": "conflict", "message": "This slide was changed somewhere else.", "current": Slide }`.
  Nothing you sent was saved.
- **`422` `"invalid"`**: something in the body isn't in the format. `field` points at it
  (a JSON pointer into what you sent) and `message` says why:
  `{ "error": "invalid", "field": "/elements/3/width", "message": "A size can't be negative." }`.
- **`404` `"not_found"`**: no such deck, slide or endpoint.
- **`503` `"unavailable"`**: the service didn't take the write. Nothing was saved; the same
  request can be sent again.
