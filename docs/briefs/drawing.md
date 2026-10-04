# Drawing
<!-- index: draw(), icons, when attributes can't say it -->

**Use when** attributes can't say it: a gauge arc, a sparkline, a chart, a custom mark
or icon.

```declare
class LevelMeter [ width = 160, height = 92,
    level: number = 0,                               // 0–100
    draw(d: Draw) {                                  // re-runs when what it reads changes, never per frame
        const frac = this.level / 100
        d.lineWidth = 12
        d.lineCap = "round"
        d.strokeStyle = 0xD6DCE2
        d.beginPath()
        d.arc(d.w / 2, d.h - 8, 62, Math.PI, Math.PI * 2, false)
        d.stroke()
        d.strokeStyle = frac > 0.8 ? 0xC23528 : 0x2E6FE0
        d.beginPath()
        d.arc(d.w / 2, d.h - 8, 62, Math.PI, Math.PI * (1 + frac), false)
        d.stroke()
        },
    pct: Text [ x = center, y = 50, fontSize = 22, fontWeight = bold,
        text = { "" + Math.round(classroot.level) + "%" } ]
    ]

App [ width = 340, height = 200, fill = white,
    level: number = 62,
    g: LevelMeter [ x = 20, y = 16, level = { app.level } ],
    s: Slider [ x = 20, y = 130, width = 300, value = { app.level }, input(v: number) { app.level = v } ]
    ]
```

**Rules**
- A view that paints itself defines `draw(d: Draw)`. It's an ordinary method a
  constraint calls: it re-runs when what it read changes, never per frame. No redraw
  call, no animation loop.
- Draw only the part that is really a shape; the box, position, size and clicks stay
  attributes and layouts.
- `d` is shaped like Canvas2D (`fillStyle`, `beginPath`, `arc`, transforms…), but
  colours are numbers (`0x2E6FE0`). `d.w`/`d.h` are the view's size, and reading them
  re-records on resize.
- Never animate a drawing's size: each frame would re-record and reallocate. Animate
  position, opacity or colour.
- Pictures come from an `Image` view (`d.drawImage(pic, …)`; read `pic.loaded`). Text uses
  `d.fillText(s, x, y, style)` and `measureText`, with a `style` bundle or a record of
  `Text` attributes.
- Small single-colour marks extend `Icon`: author in a 16×16 box, scale by `unit`, stroke
  in `ink` with `weight`. Never a font glyph for an icon.

**Look up** `View.draw`, `Draw`, `Image`, `measureText`, `Icon`, `Icon.ink`.

**Examples** `apps/weather/weather-art.declare`: dials, the moon terminator, drawn skies ·
`library/icons/`: the shipped icon set · `apps/swatchbook/sections/drawing.declare`: every
`Draw` operation.

**Guide** Your own views and drawing § Custom drawing · § Icons.
