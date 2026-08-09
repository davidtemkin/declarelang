# Divergence register — things that should be the same and aren't

Companion to `chrome-standardization.md`. That document is the plan; this one is
the evidence, gathered as the phases uncover it.

**The rule.** Where two places express the *same concept* with different values,
names, or geometry, and no reason survives inspection, they get normalized. A
pixel change is not an objection — it is the point. What a pixel change means is
that the fix belongs in a **normalization pass**, not in a phase whose contract
is a pure rename.

**How it lands.** Each phase decides its normalizations when the evidence is in
front of it, then applies them as a marked second pass, so its diff separates the
mechanical part (zero-pixel, mechanically checkable) from the deliberate part
(listed, reviewed, re-blessed). Anything unresolved collects here for a final
sweep.

The register also records divergences that are **justified**, so nobody
"normalizes" them later and quietly makes something worse.

---

## The rules this produced

Four, each earned by something that went wrong. They live at their point of use
as well — an author hits them where they would break them — and are collected
here so there is one place to read them.

**1 · Glyphs are for content, not chrome.** A font glyph is fine when the
character IS the content — `key: "⌘K"`, the tracker's `⌫`/`↵` legend, "1200×800"
in prose. Never for a state indicator or an affordance. The real test is
mechanical, not semantic: `"⌘K"` is one string with the symbol *inside a word*,
and the row right-aligns off that Text's measured width, so drawing it means
reimplementing text layout beside it. If a glyph rasterises badly the fix is a
font stack, not an icon.
*The same character can fall on both sides:* tracker's `↑`/`↓` stay text in the
keyboard rail (key names) and are drawn in the sort toggle (a state indicator).
Split by role, not by codepoint.
→ `library/icons/icon.declare`, `library/menu.declare`

**2 · A component's icon dependencies are closed and enumerable.** A library
component names its own icons statically, so they cost the app nothing — no
`use [ … ]`, no ceremony, and the keep-list retains exactly what is reachable.
If a component appears to need an OPEN set, the openness is coming from app
data, and both the icons and their `use [ … ]` belong to the app.
→ `library/icons/icon.declare`

**3 · Chrome vocabulary is not identity.** A mark meaning *close*, *expand*,
*checked*, *this is the dark theme* belongs to the icon set, at a size its host
states. A mark meaning *this is Calendar* does not. The line is not drawn-versus-
typed — the desktop's dock art is drawn too, at 56px, polychrome, with an
animated width; all three disqualify it. Desktop is the clarifying case because
it has both: its menu rows take icons from the set, its dock keeps `DockIcon`.
→ `library/icons/icon.declare`

**4 · Spring presentation, never the value.** A click writes state and every
dependent fact flips in the same frame; only geometry springs. `Segmented`'s pill
springs a normalised LANE — a float index — so a resize recomputes the segment
width and the pill SNAPS, where springing pixels would send it skating across the
bar on every layout change.
→ `library/segmented.declare`

**And one about the instrument itself:** baselines do not photograph behaviour.
Three times in this work the pixels were green while focus, keyboard activation,
or a menu API were broken — each caught by `components.test.mjs`. A visual suite
proves a design did not move. It cannot prove a control still works.

---

## Palette

**D1 · The accent is one hex digit off in docs.**
House, calendar and viewer all use `0x2E6FE0` for the light accent. Docs uses
`0x2F6FE0`. The dark accent (`0x4C8DFF`) agrees everywhere. No design intent
survives one digit. → **Normalize to `0x2E6FE0`.**

**D2 · The teal accent is two names and four values.**
`accentTeal`: `0x12A594`, `0x37E0C8`. `accent2`: `0x0D8F86`, `0x12A08D`,
`0x2DD4BF`, `0x37E0C8`. Both names agree on the dark value and disagree on
everything else. → **One name, one value per palette.** Name to be chosen with
the rest of step 2's naming pass.

**D3 · Calendar's dark palette diverges from house — MEASURED, and it is intent.**
Light matches house San Francisco exactly. Dark does not, and the pattern is
systematic rather than random: `text` and `accent` are *identical*, while every
surface and muted tone sits deeper — `control` ΔE 9.0 (ΔL* −8.2), `textMuted`
ΔE 7.8 (−7.8), `surface` 3.6, `line` 2.6, `bg` 1.1 — with `controlActive` the
lone exception, 4.0 L* **lighter**.

The structure is the point. How far each palette spreads its own surfaces:

| | bg → surface | surface → control |
|---|---|---|
| calendar | ΔE 2.6 | ΔE 2.5 |
| house | ΔE 5.4 | ΔE 7.7 |

House dark is **stepped**; calendar's is **flat and deep with a bright selection**.
That suits what it renders: a month grid is a 2D tiling of 42 equal cells, and
stepped surfaces there read as corduroy. `textMuted` dropping follows
necessarily — on a flatter field, secondary text must go darker to hold the same
hierarchy.

Counter-evidence considered: **tracker uses house directly**
(`Themes.sanFrancisco(darkUI)`, no bespoke palette) and it is the densest app in
the corpus. But tracker is a *list* — rows divided by rules — not a 2D tiling, so
it has no corduroy to avoid. Calendar is the only 2D-tiled surface here.

→ **Keep the palette; state the reason in the source.** The divergence fails the
bar only because it is unexplained, not because it is wrong. Do **not** promote it
to a second house preset on a sample of one — if a second 2D-grid app appears,
promote it then.

**D4 · `chevron` is a near-duplicate of `textMuted`.**
Calendar declares `chevron` at `0x9AA5B0` / `0x6C7C89` against `textMuted`
`0x6C7A88` / `0x8A9BA6`. Close enough to be unintentional, different enough that
folding it in moves pixels. → **Resolve when the nav arrows become icons.**

**D5 · `hover` — half a gap, and weaker than it first looked.**
The library's convention is `hovered ? theme.control : null`. Viewer and docs
each invented a `hover` token instead. On inspection the two cases differ:

- **Docs had no `control` at all** — its `hover` *was* the control fill, under a
  private name. → **Renamed to `control`.** Zero-diff, one invented token gone.
- **Viewer has both**, and they are genuinely two roles: `control` is a
  segmented-track well, `hover` a transient tint, and its light `hover`
  (`0xEAEEF2`) is *darker* than its `control` (`0xEEF1F4`). House conflates them.

So the house vocabulary really does lack a hover role — but one app needing it is
not a pattern, and inventing `controlHover` values across four presets × two
modes when nothing consumes them would be speculation, not normalization.
→ **Viewer keeps `hover` as a documented app token.** Add `controlHover` to the
house presets when a second app or a library component actually needs it.

*(Recorded because I overstated this initially: two apps having the same token
name is not by itself evidence of the same need.)*

→ **Superseded by D8.** The second consumer turned out to be the library itself,
which was improvising a hover tint in three components and disagreeing with
itself about it. `controlHover` is now a house token. Viewer's `hover` folds into
it when the components migrate in step 3.

---

## Drawn marks

**D6 · The checkmark has two geometries, both in the library.**
`Checkbox.mark`: authored at 14, stroke **2.5**, default cap/join.
`Menu.check`: authored at 12, stroke **1.8**, **round** cap/join.
Normalized to a common box the two paths agree within ~0.2px — the same intended
tick, drawn twice, diverging only in the parameters nobody reconciled. A third
rendering is tracker's `"✓"` glyph. → **One `CheckIcon`.**

**D7 · The chevron has at least six renderings.**
`Combobox.disc` (stroke 1.6, round) · `Menu.arrow` (stroke 1.8, default) ·
`Sampler`'s appearance door (stroke 1.6, round, its own 9×6 box) ·
`Inspector`'s disclosure triangle (drawn privately, with a source comment saying
the glyph "jitters") · `DataGrid`'s `▼`/`▲` **glyphs, inside the library** ·
five `▾` baked into button *label strings* in tracker and sampler.
→ **One `ChevronIcon`,** with the angle as the primitive.

---

## Justified — do not "fix" these

**J1 · Icon size differs by host: 16 in a menu row, 18 in a button.**
Contextual and correct. `iconSize` is a prevailing default the host states, not
a constant.

**J2 · Ink differs per site.**
`Menu.check` and `Menu.arrow` flip to `menuHlText` on the hot row; `Checkbox.mark`
is always `accentText`. Unify the geometry, keep the ink local — that is what the
`ink` slot is for.

**J3 · Key legends stay text.**
`key: "⌘K"` and the tracker's `⌫`/`↵` rail. Not because they name keys — that
argument is weak — but mechanically: the glyph sits *inside a word*, and the row
right-aligns off the Text's measured width. Drawing it means splitting the string
and reimplementing text layout beside it. If a glyph rasterizes badly the fix is
a font stack, not an icon. Revisit if the legend ever becomes its own laid-out
column.

**J4 · `↑`/`↓` split by role, not by character.**
Tracker's keyboard rail keeps them as text (key names); tracker's sort-direction
toggle at `tracker.declare:1339` does not — it is a state indicator, the same
concept as DataGrid's `▼`/`▲`, and it gets drawn.

---

## D8 · The interaction ladder — the library contradicted itself

Found while naming `accent2`. Three library components tinted the same four
interaction states with four borrowed tokens, and two of them were *inverted*:

| component | rest | hover | pressed | selected |
|---|---|---|---|---|
| `Button` | `control` | `controlActive` | `controlActive` | — |
| `Segment` | none | `control` | `line` | `surface` |
| `TableRow` | none | `surface` | — | `control` |

`control` was Segment's **hover** and TableRow's **selected**; `surface` was
TableRow's **hover** and Segment's **selected**. `Button` could not tell hover
from press at all. `Segment` already needed four distinct treatments and had no
names for any of them.

The house record named only two rungs — `control` and `controlActive` — and
`controlActive` was being read as *pressed* by the library and as *selected* by
calendar, viewer and docs. A token meaning two things is the divergence, not a
symptom of one.

**Ratified:** a four-rung ladder, one vocabulary, used identically everywhere.

```
control          resting fill of a filled control
controlHover     hover — a filled control brightens, a bare one gains this
controlPressed   transient, while the pointer is down
controlSelected  persistent — on / current / chosen     (was controlActive)
```

Values derived rather than invented: hue held exactly, lightness stepped −4 L*
(hover) and −9 L* (pressed) from each preset's own `control`, direction flipped
in dark mode. That lands hover at ΔE ≈ 4 — just past the just-noticeable
threshold — and pressed at ΔE ≈ 9, clearly distinct from it, in all four presets.

Noted: San Francisco's `controlHover` (`#DCE0E6`) sits almost exactly on its
`line` (`#DBE1E9`). Coincidence, not a decision; the table is two constants and
is cheap to nudge.

**Not yet done.** The tokens exist and nothing reads them. Migrating `Button`,
`Segment` and `TableRow` onto the ladder is a deliberate pixel change and belongs
to the component work in step 3 — where `Button` gaining a real hover, distinct
from its press, is the visible win.

Also renamed here: `accent2` → **`accentSecondary`**. A digit is not a role, and
a hue name (`accentTeal`) would lie the moment a preset wants an orange
secondary.

---

## D9 · The selected segment is white in the library and blue in two apps

Surfaced while putting `Segment` on the ladder. One role — *this segment is
chosen* — has two looks:

| | selected treatment |
|---|---|
| `library/Segment` | `surface` — the raised white pill of the Cupertino segmented styling, with a `line` hairline |
| calendar's tab pill | `controlSelected` — a blue tint (`#D3E2FC` light) |
| viewer's mode pill | `controlSelected` — the same blue tint |

Both are defensible and they are not compatible: one says *raised*, the other
says *tinted*. Whichever wins, the other two sites change visibly, so this is a
design call rather than a rename and it does not belong in a migration pass.

**RESOLVED (David, 2026-08-03) — and it is a synthesis, not a pick.** The
library's *look* wins: the chosen segment keeps the raised `surface` pill with its
hairline. Calendar's *motion* wins: the highlight slides from segment to segment
rather than popping, which is the one thing the bespoke tab strip does better than
the library component.

Neither app was wrong about the half it got right, which is why picking one
wholesale would have lost something. `Segment.on` therefore stays `surface`
(already the case); the sliding lane is the Segmented enhancement's work.

**Consequence to expect at the app migration:** calendar's tab pill and viewer's
mode pill go from a blue tint to the raised white pill when they adopt
`Segmented`. That is a visible change to the flagship's bar, intended, and it is
what makes the four switches finally read as one control.

---

## D10 · The docs Guide/Reference pair is a segmented control that isn't one

`docs.declare:501` — `class ModeTab extends View`. Not a `Control`, so it has no
focus, no tab stop, no keyboard activation and no press state; two of them sit
gapped at half width each, hand-styled with `modeOn` for selected and `control`
for hover.

It is a segmented control in every respect except being one. → **`Segmented` with
two `Segment` children at the app migration.** The delivery seam already fits:
`Segmented` carries `value` + `input(v)`, and this pair's value is `app.mode`
deriving from `app.location`, so the tab stays a single source of truth that
back/forward walk for free — which is what its own comment already says it wants.

Ruled in scope 2026-08-03: the docs app is subject to the whole standardization,
not just the theme split.

---

## D11 · The menu row still has three ways to say "icon" — ON THE LIST

Deferred out of the library-icon pass on purpose: this one is **app-facing**, so
it moves with the app migration rather than under it. Recorded in full so it is
not lost.

`menu.declare:8` — the row record carries **two** icon fields, and one of them has
a hardcoded special case:

| mechanism | what it holds | rendered by |
|---|---|---|
| `icon` | a **font glyph** (`"◐"`, `"☀︎"`) | `ico: Text` |
| `icon: "lightbulb"` | a magic string, not a glyph | `bulb: LightbulbIcon` — a special case in the row |
| `iconKind` | a **class name** (`"PersonChip"`) | `app.createView` into `icoHost` |

Three paths for one column. The `"lightbulb"` case exists precisely because
somebody needed a mark no glyph could give — the tell that the glyph path was
always the wrong one.

**Target:** one field, `icon`, holding an icon CLASS NAME. `iconKind` folds into
it (it already does the right thing); the glyph path and the `"lightbulb"`
special case both delete.

### The ten sites that migrate

| file:line | value | becomes |
|---|---|---|
| `sampler:181,183` · `tracker:1173,1175` | `"☀︎"` / `"☾"` | `"SunIcon"` / `"MoonIcon"` |
| `sampler:182` · `tracker:1174` · `desktop:2478` | `"◐"` | `"AutoIcon"` |
| `desktop:2508` | `"lightbulb"` | `"LightbulbIcon"` |
| `tracker:1074,1361` | `iconKind: "PersonChip"` | `icon: "PersonChip"` |

### Two that need icons that do not exist yet

- `desktop:2476` — `icon: "[ ]"` on **About Declare Desktop**. ASCII standing in
  for an app-window mark.
- `desktop:2480` — `icon: "‹›"` on **View & Edit Source**. ASCII standing in for
  a code mark.

Both are desktop-only, so by the closed-set rule they are the **app's** icons, not
the library's: `WindowIcon` and `CodeIcon` declared in `apps/desktop/`, kept with
`use [ … ]` since menu records name them dynamically. Drawing them is the only new
design work in D11 — everything else is a string swap.

---

## F1 · FIXED — six dock springs chase NaN forever

Not a divergence; a defect the instrument surfaced. Recorded because it is
invisible by construction and would otherwise stay that way.

`desktop.declare:1457` — `DockIcon.magTarget` reads `this.parent.parent.hotGate`.
That resolves for an icon in the dock row, where the grandparent declares it
(`:2594`). But `DockIcon` is REUSED as a `MiniTile`'s badge (`:1354` — "the app's
own dock icon at badge scale, so the calendar badge carries the live date"), and
there the grandparent is `rowM`, a plain `View` with no `hotGate`. Undefined makes
the expression NaN; a spring whose target is NaN can never pass its epsilon test.

Measured: `mag` and `magTarget` both NaN on all six badges, while `cx0`, `rest`,
`pitch` and `slots` resolve normally.

**Attribution verified** — the pristine `library/` was swapped back in and the
probe re-run: identical. It predates this work, and `desktop.declare` has zero
diff from the fork point.

**Cost:** no pixels — `minis` is gated on `miniSpan > 0.5`, which is 0 at boot, so
the branch never renders. What it costs is *idle*: the desktop never stops asking
for frames, so the runtime's idle-zero-rAF invariant does not hold there.

**Left alone deliberately.** The obvious patch (`?? 0`) is a no-op for real dock
icons and makes the badges settle, but it silently redefines what a missing
`hotGate` means inside a system that took a lot of iteration to tune. The better
question is whether a badge should be a `DockIcon` at all, rather than what to
substitute when its parent chain doesn't hold — and that is the dock's owner's
call, not this project's.

Desktop's baselines work around it: no `settleMotion`, a fixed settle window,
determinism confirmed by three consecutive compares.

---

## F2 · FIXED — the focus ring paints in the wrong space over a scroller

Reported in review: in sampler, click *Primary* then press Tab — the ring lands
on empty card header, ~53px above the *Secondary* button it is meant to hug.

**Measured.** Ring painted at root y≈67; target at root y≈120. The gap is 53px,
which is the sampler bar's height — i.e. exactly the scrolling content area's own
root offset.

**Cause.** `focusring.declare:91` — `const homed = classroot.travelWith(g.scroller)`.
`View.travelWith` (`runtime/src/view.ts:669`) returns **true only when it actually
re-hosts** the ring's surface into the scroller's, so the ring then positions with
`g.homeX/homeY`, the scroller's CONTENT coordinates. The painted result is short
by precisely the scroller's root origin, so the surface is not living in the
coordinate space the coordinates assume. Both backends implement `travelWith`
(`dom-backend.ts:1328`, `canvas-backend.ts:1163`), so this is not the documented
"backend without the ride" fallback — that path returns false and uses root space,
which would be correct.

**Attribution verified** — reproduced with the pristine `library/` AND pristine
`apps/sampler/` swapped in: byte-identical numbers. It predates this work.

**Not fixed here.** This is the focus/scroll geometry, one of the two areas
flagged as delicate, and the fix is a runtime question (why the re-host does not
produce the space its caller assumes) rather than a chrome one. Note the model
tree cannot show it: `inspect().rootY` walks the MODEL chain, which knows nothing
about a re-hosted surface — the bug is only visible in pixels.

---

## D12 · The viewer's dark reading surface does not match the house

Reported in review: desktop's built-in markdown reader and the standalone viewer
render the same content on different backgrounds in dark mode. Light mode agrees.

| | dark | light |
|---|---|---|
| viewer's own `bg` | `#0D1117` | `#FFFFFF` |
| desktop's `Window` fill (`theme.surface`) | `#18212C` | `#FFFFFF` |
| | **ΔE 8.7** | **ΔE 0.0** |

Light matching exactly is why only dark shows the seam — the same signature as
calendar's palette (D3), and the same question: is the divergence intent?

`#0D1117` is GitHub's dark canvas, which is a defensible choice for a
source-reading surface and may well be deliberate. But unlike calendar's, no
reason is recorded, and the inconsistency is visible in one product: the same
document, two shades, depending on which window you opened it in.

→ **Needs a decision.** Either the viewer adopts house dark (its reader lightens),
or desktop's markdown window adopts the viewer's reading surface (the embedded
case matches the canonical one), or the viewer states its reason in source the way
calendar now does.

## F3 · FIXED — the visual baselines depended on the host machine's appearance

Found by accident, at the end of the session: six of seven apps failed the visual
gate at once, ~786,000 channel differences each, with no source change between the
green sweep and the red one. The calendar's `.actual.png` was rendered fully dark.
`defaults read -g AppleInterfaceStyle` answered `Dark`. **macOS had turned itself
dark during the evening**, Chrome inherited it through `prefers-color-scheme`, and
every app that follows the system photographed a different program.

This is the same class of fragility as the unpinned clock fixed in step 0, and it
was hiding in the same place: the harness pinned *time* and left *appearance* to
the machine. A suite blessed in daylight rots at sunset, and the failure looks
exactly like a mass regression.

`openApp` now emulates `prefers-color-scheme: light` by default, and a state that
wants the dark surface asks for it — `scheme: "dark"`, which is how sampler's
`appearance-menu-dark` captures the dark menu. All 28 states pass against the
baselines blessed before the flip; nothing was re-blessed, which is the proof that
the source never moved.

**The general rule this suggests:** anything the capture reads from the host and
not from the program — clock, appearance, locale, timezone, device pixel ratio,
reduced-motion — is an input that must be pinned or the baselines encode the
machine that happened to bless them.


### F2, resolved (2026-08-03)

The cause was not in the ring. `View.raise()` — the verb form of z-order — moved
the view among its model siblings AND re-seated its surface under the model
parent's surface. For a surface that had TRAVELED (`travelWith`, which re-hosts
the ring inside the scroller so the platform carries it with the content), that
second half is a quiet eviction: the element comes home while the ring's position
slots still hold the scroller's CONTENT coordinates, so it paints the scroller's
own origin above its target. Measured at 52px on the sampler — the height of its
bar, which is exactly the scroller's offset.

It bit on the FIRST keyboard focus of a session and no other, because
`onFocusChange` calls `raise()` and raise early-returns once the ring is already
frontmost. One hop wrong, every hop after it right — which is why 27 baselines
and six gates never saw it, and why it read as a mystery rather than a bug.

The fix is a sentence about ownership: a traveled surface's parentage belongs to
its travel host, so `raise()` moves the model order and leaves the seat alone.
`Surface.isTraveling()` is the read half of `travelWith`, implemented in both
backends and registered in `test/seam.test.mjs` (the optional-member count moves
12 → 13 with its reason). Guarded by the sampler's `focus-first-tab` state.

### D12, resolved (2026-08-03) — the viewer uses the house dark

Ruled: the viewer adopts the house palette rather than the two houses keeping
their own dark. It was spreading the San Francisco preset and then laying a full
second palette (GitHub's, ported) over the top, which is why the same markdown
read `#0D1117` in the viewer and `#18212C` in the desktop's reader window.

The override is gone. What remains is two domain names the house does not have:
`codeBg` (defined AS the house backdrop — a code well is the page recessed, which
is the same relationship in both modes and needs no value of its own) and
`accentSecondary` (the far end of the brand gradient; the house has one accent).

The retone that actually closes the gap: **a reader's page is a sheet**, so it
paints `surface` — the token a Window paints — and the chrome around it recedes
to `bg`. That is the relationship the viewer's LIGHT mode always had (page
`#FFFFFF`, bar `#F6F8FA`), which is why light already matched at ΔE 0.0 and only
dark had drifted. Both mounts now read `#18212C` in dark and `#FFFFFF` in light.
Guarded by the viewer's `reader-dark` state — the suite had no dark viewer at all.


### F1, resolved (2026-08-03)

Measured before touching anything: `settleMotion` on the desktop **times out** —
the harness's own "this never settles" signal — with 6 of the tree's 24 springs
carrying a NaN target. The same probe against the step-0 pristine checkpoint
reports exactly the same thing, which is what makes this pre-existing rather than
ours.

`DockIcon` is hosted in two places. In the dock row, `parent.parent` is the dock
and carries `hotGate`. As a `MiniTile` badge, `parent.parent` is the minis row and
carries nothing, so the gate reads `undefined`, `1 + (w - 1) * undefined` is NaN,
and no epsilon test can ever pass. It cost no pixels — a badge takes its size from
its tile, never from `mag`, and `minis` is gated on `miniSpan > 0.5`, which is 0 at
boot — only a frame loop that never parked.

The fix asks instead of assuming: `gate()` returns the host's `hotGate` when there
is one and 0 when there is not, which is the value the arithmetic already produces
for every icon the pointer is nowhere near. The dock's own numbers are untouched —
`desk` and `brand-menu` re-capture **byte-identical** to their pre-fix baselines.

The dividend is that the dock became testable. Its states had to wait a fixed
1400ms and call determinism proven by three lucky compares, because settling was
impossible; they now settle motion, and a new `dock-magnified` state photographs
the magnification wave at rest — the most iterated motion in the corpus, and until
now the only major surface with no baseline at all.

## D13 · The menu's icon column crowded its labels (2026-08-03)

Reported on sight: our icons sat too close to the row text. The COLUMN MODEL
was not the problem and is unchanged (check column always, icon column iff
icons, one text edge) — the gap was.

The tell was UNIFORMITY, not just tightness. Marks drawn to fill their 16px
box put every row's ink at the same tight distance from its label at once,
and a column of identical gaps reads mechanical — a set with natural side
bearing varies, and the eye reads the AVERAGE air, not the minimum. Ruled:
`textEdge` 46 → **50**, which is 9px of box gap and 11–12px of ink — enough
air that the tightest glyph no longer sets the tone for the column.

Four baselines moved, all of them menus with icons. Two more tracker baselines
differ only inside the masked perf rectangle — `cmp` sees it, the pixel diff
correctly does not.

## D14 · The tracker's toolbar clusters overlapped at 1024px

Found while checking D13's fallout, and not caused by it: the tracker's filter
cluster and its action cluster **collide by 24px at 1024×768**, the Grouped
checkbox painting over the Label button's disclosure. Measured against the
pristine checkpoint, where the overlap is 28px — so it predates this work and
was slightly worse before.

It was invisible until now for a precise reason: the old disclosure was a `⌄`
glyph inside the label STRING, sitting mid-button, well clear of the contested
edge. Standardizing it to a real chevron at the button's right edge moved the
mark into the overlap. The standardization did not create the bug; it stopped
the bug from hiding.

The row already knew the answer — its own comment says it wraps into two rows
"instead of letting the clusters collide in the middle" — but the trigger was
`app.width < 640`, a breakpoint, where the question is a measurement: both
clusters size to their own text, so a longer assignee name or a wider locale
moves the meeting point without moving the window. `tools.wrap` now asks whether
they would actually collide (chips + acts + margins > width), and `contentY`
derives from the row's real height instead of restating the 56/96 pair. The
toolbar needs 1064px, so 1024 wraps and 1100 does not; `list` and the new
`list-wide` state pin both sides of that line.

## F4 · FIXED — a gate that was passing by 1%, and what it hid

The tracker suite began aborting with `FATAL ERROR: Reached heap limit`, which
took the whole `npm test` chain down with it (`&&`), silently truncating the run
at 12 suites of 23. Everything past it — `docs`, `format`, `prewarm`, `crawl` —
had not run for however long the abort had been there. Three real failures were
hiding behind it (see below).

**Not an architecture change.** Nothing this session altered how the tracker's
rows work. `IssueRow` declares `card: EditorCard`, so every materialized row
brings an editor whether or not it opens — ~36 in normal windowed use, 46.8% of
the live app's nodes, against `app.expandedId`, which admits exactly one open row.
That is pre-existing and, ruled here, acceptable: the editor is a child of the row
precisely so it inherits the row's datapath and rides with it when the list
scrolls, and 36 idle editors is not a cost worth an architecture to avoid.

**What changed was size, by 10%.** A text glyph became a drawn icon, which is an
`IconHost` plus the `Icon` it creates where a glyph was one `Text`, and the row
went **60.3 → 66.3 nodes**.

**What that hit was a gate with no headroom.** Criterion 12 turns virtualization
OFF at 10,000 records to prove the windowed and full paths observe the same
state. Measured: the pristine tree peaks at **4,013 MB against V8's 4,048 MB
default ceiling — under 1% of margin.** Both trees settle at ~4.01 GB, so what
decides pass from fail is transient allocation during construction, not resident
size. A gate that close to a limit is not measuring its subject; it is measuring
the machine, and it fails with an out-of-memory that names nothing.

The fix is the count, not the tracker. Measured, the two arms answer `N` very
differently — the windowed arm is FLAT (3,002 nodes at 300 records, at 2,000 and
at 10,000; ~38 live rows), while the OFF arm is linear (20k nodes / 174 MB at
300; 133k / 878 MB at 2,000; ~670k / ~4.0 GB at 10,000). Criterion 12 now runs at
**500**: thirteen viewports deep, so the script still scrolls, sorts and deletes
across window boundaries, at 259 MB instead of 4 GB. Scale belongs to criteria
1–11, which still boot at 10,000 against the windowed path — the one that ships.

**Recovered by clearing it**, each of which had been red and unseen:
- `docs` — 13 undocumented components (the icon set, `Icon`, `IconHost`,
  `SegmentedItem`, `ArrowIcon`). The chain is extract → assemble; only assemble
  had been run.
- `format` — the `use [ ]` added to viewer.declare broke the exemplar's
  byte-exactness.
- `prewarm` — 19 stale artifacts.
- `crawl` — **still open**, and the serious one: see D15.

## D15 · PATCHED — the docs app's reference is no longer crawlable

`crawlLocations` over `apps/docs` emits **0 reference documents; the pristine tree
emits 58.** The guide's 18 chapters still crawl.

Links are extracted statically, and only from ACTIVATION handlers: `links.ts`
attributes a link to an element whose `onClick` writes `app.location`
(`ACTIVATION = new Set(["onClick"])`). The guide rail still qualifies —
`ChapterLink.onClick()` writes it directly. The mode switch no longer does: it is
now a `Segmented`, and its write happens in `input(v)`, which is a value callback,
not an activation handler. So nothing anchors `#reference/…`, and the entire class
reference falls out of the statically built documentation.

The standardization did not break the app — the switch works — it broke what a
crawler can SEE, which is the kind of regression no visual gate catches and only
this one test does.

**Sharper than "the reference is unextractable".** Those 58 `RefTab` links each
carry `onClick() { app.location = "reference/" + cname }` and extract perfectly —
they always did. But the reference rail is `visible = { app.mode == "reference" }`,
and the default location is a guide chapter, so at t=0 those links are not in the
settled tree. The crawl is a graph walk from the default, and the mode switch was
the SINGLE EDGE into that half of the graph: follow it, cold-boot at
`reference/View`, and the rail renders and yields the other 57. Cut that one edge
and a subgraph of 58 disappears.

So the failure mode is not "a link was missed" but "an articulation point was
missed, silently". Nothing in the emitted output says a subgraph went away; the
crawl simply produces fewer documents. `crawl.test.mjs` does assert
`ref.length >= 15` and caught it exactly as designed — the only reason it went
unnoticed is that the tracker's heap abort (F4) had been truncating the chain
before it ran.

**The systemic weakness, stated.** `links.ts` recognises a link only when an
element's handler is literally named `onClick`
(`ACTIVATION = new Set(["onClick"])`), so link-ness is inferred from a HANDLER
NAME. A `Segmented` navigates from `input(v)`; a `Menu` pick, a `Combobox`
choice, a keyboard shortcut and any programmatic redirect navigate from
somewhere else again. All are invisible to extraction, and there is no authorable
way to correct it: `link` is compiler-internal (`el.link` → `_navLink`), not a
View attribute, so an author who KNOWS an element navigates cannot say so.

Indexing every `app.location = …` write anywhere is not the answer — §7 rules
input-driven locations correctly invisible, and a search box writing
`"search/" + q` is unbounded. "Discoverable = linked" is right; what is too
narrow is how "linked" is detected.

Proposed: make `link` AUTHORABLE — `link = { "reference/" + :cname }` — a
declaration of the navigation relation independent of which handler performs it,
with onClick inference kept as the convenience path for the common case. One
change covers Segmented, Menu, Combobox and keyboard navigation, and adds no
vocabulary to any component. Not taken unilaterally: it is new language surface.


### D15, patched (2026-08-04) — and the direction it argues for

**The patch.** A `Segmented` choice may carry a `location`; `SegmentedItem` binds
it and writes `app.location` in its OWN `onClick`, which is what the existing
extractor reads. No language change, no change to `ACTIVATION`, and inert for
every other Segmented in the corpus — an absent `location` reads as `""`, and an
empty read emits no anchor.

    choices = { [ ({ id: "guide",     label: "Guide",     location: "guide/" + app.guideAt }),
                  ({ id: "reference", label: "Reference", location: "reference/" + app.refAt }) ] }

docs: **0 → 70** reference documents (88 total, against 76 pristine — the extra
twelve are the icon classes documented earlier the same day). And the same bug was
found in the VIEWER, where nothing was testing for it: its Reader/Source/Edit
switch is the same shape, and the app was emitting **1 document instead of 3**,
with Source and Edit unreachable to extraction.

**Why an index was the wrong answer.** §7's escape hatch is "render an index — a
sitemap in the app's own material", and that was the first proposal here. Ruled
out: the docs app's left rail already IS that index, so a second one is literally
duplicate on-page content. The switch is the index's front door; the front door is
what had to say where it goes.

**What the inventory showed.** Every `app.location` write in the corpus, by the
handler containing it:

| where | sites | extracted |
|---|---|---|
| `onClick()` | 6 — docs ClassTab and ChapterLink, homepage ×4 | yes |
| `input()` | 2 — the docs and viewer mode switches | no |
| `showPage()`, a plain method | 2 | no |

So four of ten writes are invisible, and the two shapes that hide them —
a value callback, and a method called from a handler — are both ordinary.

**Could better analysis find them?** Partly, and it should. `extractLinks` receives
the whole `Program`, so same-class call following (`onClick` → `press()` →
`showPage()`) is a few lines and is the highest-value increment available: `Control`
routes EVERY library control's activation through `press()`, so today every
standard control hides its navigation by construction. Cross-class through a named
cast (`(this.parent as Segmented).pick`) is resolvable too.

But it does not reach the case that bit. `Segmented.pick` calls `input(v)`, which
is not defined on `Segmented` at all — it is supplied at the instantiation site —
and the docs body branches on `v`, which does not exist at t=0. Following the call
lands on an expression that still cannot be evaluated; resolving it means EXECUTING
the handler with `v` bound and rolling back, which is speculative execution in a
reactive graph, not analysis.

Two further arguments against leaning harder on inference. **Precision inverts**:
today's rule misses links but never invents them, whereas following calls into
arbitrary bodies finds writes guarded by conditions that do not hold — phantom
locations, static documents for pages no user can reach. And **analysis cannot
produce intent**: the best possible dataflow says "this code path can write
`app.location`", never "this element is a link" in the sense HTML means, which is
also what a screen reader must announce. `<a>` exists because navigability is a
declaration.

**RULED (2026-08-04): move toward explicitly declared internal links.** The patch
above stands for now. The direction is that an internal link is STATED on the
element — the relation is the author's, not something recovered from a handler
body. Written up in full as **declarative-links.md** (`linksTo`), which carries
the design, the measured evidence, the composition rules, the focus prerequisite,
and the open questions. Two things ruled there that are not obvious from here:
inference should be RETIRED rather than kept alongside (23 elements to migrate,
and a declaration is the only thing that can tell a link from a redirect), and
the focus service has a prerequisite bug — a focused view whose `focusable` flips
to false keeps focus, and Tab then restarts at the top of the group.

**Worth doing either way, and cheapest of all: make the failure LOUD.** What bit
here was not narrowness but silence — a handler chain wrote `app.location`, the
extractor attributed no link, and nothing said so; 58 documents left the build
unremarked. A diagnostic — *this element navigates but emits no link* — is a scan
of every method body for `app.location =` cross-referenced against the elements
that got a `link`, and it would have caught docs, viewer and `showPage()` on the
first build.


## F5 · ENVIRONMENTAL — `serve-browser` fails on a codec, not on code

`test/serve-browser.test.mjs` asserts no failed requests through a homepage run and
reports one: `net::ERR_ABORTED` on `apps/homepage/shots/video/calendar.mp4`. The
file is present and the server answers byte ranges correctly (`server/create.mjs`
handles RFC 9110 §14 for every static file). The abort is Chrome's: a headless
build without proprietary codecs cannot decode H.264 and drops the fetch.

Reproducible three runs of three, and unrelated to any source in this work. It is
the same CLASS as F3 — a gate that reads something from the host rather than from
the program, and therefore reports the machine. Left as found; noted so the next
person does not go looking for a server bug.
