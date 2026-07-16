# Declare weather — tabslider & reveal-animation gaps

Frame-by-frame comparison (puppeteer filmstrips) of `examples/weather` (the LZX
original, via `basetabslider`/`basetabelement`) vs `weather` surfaced three
motion gaps. This note records what the original does, why Declare differs, and the
fix. Investigated 2026-07-04.


## The three gaps (verified frame-by-frame)

### 1. Tabs carry their content — the tabslider gap
**Original** (`basetabelement.lzx`): each tab's content lives in a `container`
(`clip="true"`, `y=headerheight`) sized by a `resizelayout` to fill the tab's
animating height. `contentvisible` goes **true as the tab begins to open** and
**false only when the close completes** — so content is present through the whole
open *and* close, revealed / concealed by the **clip** as the height animates. In
a switch, the closing tab's content clips away as the opening tab's is revealed —
simultaneously, height conserved, **never a blank gap**.

**Declare today**: content is direct children with `visible = { parent.sel }` — an
instant pop. No clip, no window. On a switch the old content vanishes (blank
gap), the new pops in, and mid-slide content overflows (unclipped).

### 2. TopBar slides down on reveal
**Original**: `topBar` starts `y=-16 opacity=0`; a `comein` **animatorgroup**
(`y→0` + `opacity→1`, simultaneous, 333ms) runs in `showWeather`; `goout`
reverses on hide.

**Declare today**: `y = { loaded ? 0 : -16 }`, `opacity = { loaded ? 1 : 0 }` — jumps.

### 3. Zip bar slides in / out from the left
**Original**: `zipBtn.animate('x', -2000, 333)` slides the Enter-Zip/OK bar
off-left on submit; `animate('x', 0, 333)` slides it back on return / error.

**Declare today**: `x = { loading ? -2000 : 0 }` — jumps.


## The fix

### Gap 1 → box-clip the tab (new runtime capability + a 2-line app change)
The elegant Declare form is **not** a resizelayout+container reconstruction — it is
to **clip the `WeatherTab`'s own box**. With `clip = true`, all the tab's children
are clipped to `(0, 0, width, height)`: the header (`y < 25`, always within
`height ≥ 25`) is never clipped, the content (`y ≥ 35`) is revealed as height
grows and concealed as it shrinks — exactly the original's reveal, with **no
placement mechanism and no window subview**. `contentvisible` falls out for free
(content at `y ≥ 35` is clipped away when `height = 25`).

- **Runtime (new capability):** `clip = true` on a View clips its subtree (paint
  **and** hit-test) to its box. The backends already clip from a path (canvas
  `ctx.clip` / `clipData`, DOM `clip-path`); box-clip is a **framework-internal
  reactive derive** that feeds them the box rect `rect(0,0,width,height)`,
  **recomputed when width/height change** so it tracks the animating height every
  frame. This is a framework primitive that owns its own subscription
  (constraints.md §3), not a user constraint.
- **App:** add `clip = true` to `WeatherTab` (components.declare); drop the
  `visible = { parent.sel }` on `currentData` / `radarData` / `forecastData`
  (weather.declare) — the clip now conceals them.

### Gaps 2 & 3 → imperative animator drives (LZX vocabulary, like the tab slide)
`DataSource.fetch()` is `async` (`data.ts:272`), so the OK handler can sequence
the animations around the load — the imperative trigger the reactive constraints
can't express (and, post-constraints.md, shouldn't):

- **TopBar:** literal `y = -16`, `opacity = 0` + an `AnimatorGroup comein`
  (`y→0`, `opacity→1`, 333ms) started **after** the fetch resolves; `goout`
  (reverse) on the clear / back path.
- **Zip bar:** literal `x = 0` + an `Animator slideOut` (`x→-2000`, 333ms) started
  on OK click (before / at fetch); `slideIn` (`x→0`) on the clear / back path and
  on **fetch-failure** (so the user can retry).


## Verification
The acceptance harness compares **settled end-states**, so all three fixes must
hold `accept:weather` at **18/18** (end-states unchanged — only the *path*
animates). Frame-capture filmstrips (a fresh ephemeral-port serve) confirm the
motions now match the original.


## The `started = false` requirement (the non-obvious part)

An Animator's `started` **defaults `true`** (LZX's auto-start-at-init;
`animator.ts:117`, `autoStart()` `:175`). That default is only right for a
motion meant to run immediately at init — it is **wrong for an on-demand
animator** fired by a handler, and the original knew it: every one of weather's
`comein`/`goout` groups carries `start="false"`.

Left at the default, each of these animators auto-fired at init, with two
visible failures:
- the tab `slide` ran to its default `to = 0` at init → the tab collapsed to
  height 0 and sprang back (a blank transient on reveal);
- `slideOut` auto-started and **latched `running`** — `start()` is a hard no-op
  while running (`:186`) — so the handler's later `slideOut.start()` did nothing
  and the zip bar never moved.

Crucially the **acceptance stayed 18/18 through all of this**: it asserts settled
behavioral state (splash hidden / open tab), not `topBar.y` or `zipBtn.x`, so a
silently no-op'd animation passes. Only the puppeteer value-probes + filmstrips
caught it. The fix is to match the original: `started = false` on `slide`,
`slideOut`/`slideIn`, and the `comein`/`goout` groups — they fire only when a
handler (or `setSel`) calls `.start()`.

### Resolved: it is not a literal-slot stall — it is auto-fired reversible pairs

An isolated repro (`scratchpad/autostart-repro.mjs`, hand-cranked scheduler)
settles the mechanism:

- **A single** auto-start Animator on a literal slot works perfectly — auto-fires
  at init, anchors at `from`, and lands exactly on `to` (`x: 0 → 100 → 200`).
  Auto-start over a literal is **not** broken.
- **A start/reverse *pair* on the same slot** is the bug: `slideout` (`to=-2000`)
  and `slidein` (`to=0`), both children of the same view, **both auto-fire at
  init** and **compose to net-zero** — at `t=0.5` one wants `-1000`, the other
  `+1000`, so `x` stays `0` the whole way. The slot never moves; nothing errors.

The footgun is therefore **any reversible animation pair left at the
`started = true` default** — and weather has *two* (zip `slideOut`/`slideIn`,
topBar `comein`/`goout` on `y`+`opacity`). At the default, all four halves
auto-fire and both slots net-zero at init. `started = false` is the fix, and the
general rule is: **on-demand / reversible animators must be `started = false`**
(the original's `start="false"`, for the same reason). Auto-start (`true`) is
only for a motion meant to run once, immediately, at init — of which weather
has none.

> Language-design question this raises (for a human call, not landed): `started`
> defaults **`true`** (LZX parity), but almost every real animation is
> *triggered*, not init-time, so the default is wrong-way-round and its failure
> is **silent** (net-zero or a one-frame glitch; the acceptance can't see it).
> Options: (a) flip the default to `started = false` — most predictable, nothing
> moves unless asked, but diverges from LZX; (b) keep it, add a compile-time
> warning when two `started` animators target one slot; (c) leave it, documented.
> Leaning (a) on [[language-design-no-magic]] grounds.


## Status — DONE (all three, verified both directions)
- **Investigation:** DONE (filmstrips + LFC source read: basetabslider /
  basetabelement mechanics — `availableheight`, `contentvisible` timing, the
  clipped container).
- **A — box-clip runtime (`src/`):** LANDED. `clip = true` clips a view's subtree
  (paint + hit-test) to its box via a framework-internal reactive derive of the
  box rect, recomputed on width/height; new perceptual test. Gate green.
- **C — topBar + zip animators (`weather.declare`):** LANDED. `comein`/`goout`
  groups (topBar) + `slideOut`/`slideIn` (zip), driven from the fetch / clear
  paths — all `started = false` (see above).
- **B — `WeatherTab clip = true` + drop the content `visible` pops:** LANDED.
- **Verification:** `accept:weather` 18/18; unit 267/0, perceptual 104/0,
  scaffold 11/0. Puppeteer value-probes confirm the motion (topBar y −16→0 +
  opacity 0→1; zip x 0→−2000 and back; tab1 held at 255 — no spurious collapse).
  Filmstrips confirm all three vs the original: tab content clips/travels with no
  blank gap, topBar slides down on reveal, zip bar slides in/out from the left.
