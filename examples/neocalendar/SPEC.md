# neocalendar — behavioral contract (Stage 0)

**What this is.** The extraction of the original Laszlo Calendar's behavior, appearance, and animation
— from the *running app* (screenshots in `oracle/`, taken 2026-07-05 against the DHTML build at
`examples/calendar/`) and from its LZX source *read for intent only*. neo implements **this document**,
never the LZX structure. That is the anti-transliteration firewall: the original is 3,955 lines across
17 files, littered with Flash-VM-era hacks (pooling, id-string arithmetic, hardcoded timers, dead code);
the rewrite is a ground-up neo-idiomatic app that matches what the user *sees and does*.

**Parity policy (ratified):** geometry **exact**; chrome **"or better"** (drawn hairlines/gradients may
differ per-pixel while looking strictly sharper). Interaction **bugs are fixed, not replicated** — every
deliberate deviation is listed in §12 so nothing drifts silently.

---

## 1. Frame & anatomy

Canvas **835×600**, background `#1E3A49`. Font Verdana 10px throughout (pixel-locked in the original).

- **Top panel** (x20, w806): menubar strip `#354D5B` with logo (bitmap, keep), view buttons
  **day | week | month** (shear-capped, icons), month controller **‹ July 2026 ›** (bold white title,
  drop shadow = offset copy in original → neo `textShadow`), **Add Event** button at x496.
- **Daynames bar** below (`#354D5B`, h26, 1px `#708A94` rule at bottom): Sun…Sat labels, each
  **centered over its grid column live** (constraint to the column's cell — they track the slider
  animation). Hidden per-mode: all visible in month/week; only the open day's in day mode (§12-D fixes
  the original's garbling).
- **Grid area** `cal_interior`: x20 y57, **810×516**, clipped.
- **Info panel**: width 203, lives at the right edge (slides in from x830 → 602). Grid contracts to
  make room (−208 width), *snap* (no animation) while the panel *slides* (500ms).

## 2. The grid model

One grid of **42 day cells** (7 cols × 6 rows), spacing 4. A month displays **5 or 6 rows**: start =
Sunday of the week containing the 1st; if 5 weeks cover the month the 6th row is hidden. Cells hold
real dates (leading/trailing days belong to adjacent months, rendered dimmed).

**Cell geometry is a pure function** of `(W, H, rows, mode, openIndex)`:

- `cw = ⌊(W − 4·6)/7⌋`, `ch = ⌊(H − 4·(rows−1))/rows⌋`
- **month**: all cells `cw×ch`; if a cell is *open*, it gets `+150w, +170h`, and the others shrink by
  the redistribution (`cw − ⌊150/6⌋`, `ch − ⌊170/(rows−1)⌋`).
- **week**: the selected day's row takes the full height; all other rows collapse to 0 (invisible).
  Columns as in month (incl. open-column widening if a day is open).
- **day**: the selected cell takes the full width×height; all other cells 0.

**Mode switching animates** every visible cell to its new box: **500ms, x/y/w/h simultaneous**
(per-cell animator group). Cells that were hidden snap to final geometry and appear when the motion
completes (neo: animator completion, not the original's hardcoded 600ms timer). Cells becoming hidden
hide immediately. Month-to-month navigation does **not** animate (snap). The info-panel
contract/expand reflow does **not** animate.

**Modes are a state machine** (`month | week | day`) plus an orthogonal `open` day (the in-place
expanded cell in month mode; week mode widens its column; in day mode the open cell IS the view).
Observed transition semantics: switching to week shows the selected day's week; to day shows the
selected day; returning to month **restores** the prior open-cell state. (`oracle/01,03,04,09`.)

## 3. Day cell

Frame: 1px `#7A949E` border effect over `#526C7B`; body (`bgrect`) at x3 y19, inset 8/26.
Day-number top-left, `#DAE3E8` (out-of-month `#7E929F`).

| body state | color |
|---|---|
| weekday, in month | `#9BA9B1` |
| weekend, in month | `#879BA8` |
| out of month | `#768A97` |
| drag-target hilite / selected | `#D3D3D3` |

**Closed** (month/week): events as a **stacked list sorted by start time** (22px bars, in a column).
**Open** (mini-day in month, widened column in week, full day view): an **hour timeline** —
22 px/hour, hour labels `12a…11p` down the left (bold on 12a/12p), half-hour offset zero point
(the grid's first line sits at +11px = 30min), hairline hour rules, **vertical scrollbar** when
content overflows, events positioned/sized by time (§4). Timeline starts scrolled to 12a.
Events area narrows by 38px when open (time gutter + scrollbar).
The original's hour-grid is a bitmap (`tgrid`); neo **draws** it (hairlines) — pixel-matched.

## 4. Events

Data per event: `title (summary), notes, location, attendees, date, startHour:Min, endHour:Min,
category, uid`. Times are minutes-of-day; an event has **no multi-day span**.

**Category colors** (fixed table):

| category | normal (dim) | hover (bright) | gutter (bkgnd) |
|---|---|---|---|
| *default* | `#C6CEDC` | `#DDDDDD` | `#5D84CB` |
| holiday → green | `#CBD1C5` | `#D4DAC8` | `#587457` |
| astro → purple | `#C5C3D5` | `#CDC6DC` | `#4C5E7E` |
| milestone → blue | `#BBC6D1` | `#C6CEDC` | `#4C5E7E` |

Bar: 22px tall closed; 1px white top line, 1px `#555555` bottom line; text `#4B5D6C`.
**Closed form**: `9a  Title` (short time `H[a|p]`, then title). **Open form**: title only at x10; bar
spans `y = startMin·(22/60) + 11px`, `height = max(22, (endMin−startMin)·(22/60))`; a 29px-wide time
gutter at the bar's left in the category gutter color at 30% opacity. Hover swaps to bright color.

**Time formats**: short `1p`; long `1:45p`; date `July 9, 2026` (no zero-padding on hours; minutes
always 2-digit in long form; `12a`/`12p` for 0/12).

## 5. Selection

- **One selected day**, marked by the floating selected-day chrome: beveled frame + header with the
  day number + a corner **`+`/`−` button** (`+` = open this day in place; `−` = close it / back to
  month). It follows the selected cell's geometry live (through slider animation).
- Selecting: click a day (also opens it in month mode — §6), click an event (selects its day too),
  drop an event on a day, Add Event's date arrows. Month navigation selects: **today** when the
  displayed month contains it, else the 1st (§12-A deviation, fixing "always the 1st").
- **One selected event**, marked by the **selector chrome**: white bar with grip texture top/bottom
  (category-tinted), the time label, title, and an **`ⓘ` button** (→ opens the info panel; so does
  double-click). Selecting another event retargets the panel if open; **deselecting** (selected day's
  events hidden, event deleted) soft-closes the panel after 500ms.
- In neo both chromes are per-view `selected`/`open` **states**, not global follower views (the
  original used single global chrome + cross-space constraints as a Flash optimization).

## 6. Pointer interactions

| gesture | where | result |
|---|---|---|
| click day cell | month | select + **open in place** (no animation for the open itself from grid mode) |
| click day cell | week | select + widen its column (animated) |
| click `+` (selected-day chrome) | any | open the selected day |
| click `−` | open cell / day view | close back to grid / month view |
| click event bar | any | select day + select event (does not open the day) |
| click `ⓘ` / double-click event | any | open info panel on that event |
| drag event | see below | move event |

**Drag** (event bar): press-and-hold **150ms** arms the drag (a plain click never moves the bar).
Two coupled modes while tracking (per-frame):
- **Time-drag** (only if the event's day is open): while the pointer stays within ±**30px**
  horizontally of the bar's column, the bar clips into the column and moves vertically only;
  the bar's time label updates **live**; new start = y→time snapped to **15 minutes**;
  at the column's top/bottom edge the day's timeline **auto-scrolls**. Duration is preserved
  (drag never changes duration).
- **Free-drag** (cross-day): outside that tolerance (or if the day is closed) the bar follows the
  pointer; the day cell under the pointer hilites (`#D3D3D3`); on drop the event moves to that day
  (same time), the target day becomes selected, and (if open) drop-y sets the time as above.
  Dropping outside the grid cancels.
Constraints: min duration 15m; end clamped to ≤ 23:45 (clean arithmetic — the original's fudge math
is not carried over).

## 7. Info panel ("Event Info")

Beveled panel (drawn in neo; the original is 9-slice bitmaps), title bar "Event Info" + `x` close.
**Open**: grid contracts (snap), panel slides x830→602 + fades in, 500ms; **focus lands in the title
field with its text selected**. **Close**: reverse slide/fade (500/400ms), then grid expands.

Contents, bound to the selected event:
- **Title** input (commit on blur / Apply).
- **Date** `July 9, 2026` + **‹ ›** = move event ±1 day (updates selection; crosses month boundaries
  by navigating the month).
- **Times** `9:00a to 10:00a` + **‹ ›** each: start ±15m **moves** the event (duration preserved);
  end ±15m **changes duration** (min 15m, max <24h).
- **Accordion tabs** (one open; 200ms slide): **Notes** (open by default) / **Location** /
  **Attendees**, each a multiline text input. Header row 21px `#EEF0EB` (open `#E2E4DF`) with
  bevel hairlines (`#FDFFFF`/`#C6C7C4`) and a disclosure arrow.
- **Apply** (commits title/notes/location/attendees) and **Delete** buttons.

**Cancel semantics**: a panel opened by **Add Event** tracks whether the new event was applied;
closing without Apply **deletes** the new event. A panel opened on an existing event never deletes
on close. Field edits to date/times take effect immediately (spinners/drag); text fields commit on
blur/Apply.

## 8. Add Event

Creates an event on the **selected day**, 9:00a–10:00a, title "New Event", selects it, opens the
panel, focuses the title with text pre-selected (type-to-replace). (`oracle/05–07`.)

## 9. Data

- neo model: an `events` collection keyed by date; replication renders per-day lists. (The original's
  XPath year/month/day tree + node copy/delete surgery collapses to field writes on records.)
- **Month lazy-load**: on displaying a month, fetch any not-yet-loaded visible months from
  `calendardata/vcal_YYYY-M-01.xml` (static files, one per month; already generated —
  `generate-years.mjs`). Merge into the local store; no persistence of edits (in-memory, test data).
- Categories present in data: `holiday`, `astro`, `milestone`, none.

## 10. Startup

Loading still (bitmap, keep) → top panel **slides down** (y −50→0, 500ms) → grid sets current month
→ grid **fades in** (opacity 0→1, 1000ms) → selected-day chrome fades in. Initial month = current;
initial selection = **today** (§12-A).

## 11. Timing table

| motion | duration |
|---|---|
| grid mode change / open / close (per-cell x/y/w/h) | 500ms simultaneous |
| top panel slide-in | 500ms |
| grid fade-up at startup | 1000ms |
| info panel slide in / out | 500ms (fade-out 400ms) |
| accordion tab slide | 200ms |
| drag arm threshold | 150ms hold |
| deselect → panel soft-close | 500ms delay |
| month navigation, info-panel grid reflow | snap (no animation) |

## 12. Known defects → dispositions (fix, don't replicate)

- **A. Selection on load/nav is always the 1st** (never today; today isn't marked). → Select **today**
  when the displayed month contains it; else the 1st. *(Approved direction: fix interaction bugs.)*
- **B. `next`/`prev` in week mode jumps a month and silently reverts to month view**
  (`oracle/15`). → Nav is **mode-aware**: month=±1 month, week=±1 week, day=±1 day; mode preserved.
- **C. `next`/`prev` in day mode renders a garbled hybrid** (broken half-open row, mashed day-name
  labels; `oracle/16`) — the mode machine loses coherence. → Eliminated structurally by B + D.
- **D. Day-name labels garble in day mode** (labels constrained to zero-width hidden cells pile up
  at the edges). → Day mode shows only the open day's label, cleanly.
- **E. Overlapping events paint over each other** in the open timeline (later-drawn wins;
  `oracle/07`). → v1: side-by-side width sharing for overlapping events (the standard treatment);
  closed lists are unaffected (already stacked).
- **F. Scroll-to-first-event is dead code** (computed, then the apply line commented out) — open
  timelines always start at 12a. → Implement the abandoned intent: open scrolls so the day's first
  event is visible (one hour of context above), empty days to 7:30a.
- **G. Drag row-math bug below an open row** (uses column-width where row-height belongs) — mistargets
  drops. → Moot in neo (real hit-testing, no inverse geometry).
- **H. Hardcoded 600ms visibility timer** after 500ms animations (race by construction). → Animator
  completion events.
- Cosmetic keeps (not bugs): selected-event chrome slightly overhangs its cell; info-panel reflow
  snaps while the panel slides.

## 13. Images → dispositions

261 PNGs in the original. neo dispositions:

| family | count | disposition |
|---|---|---|
| button slices (pill/square/circle/btn_rsrcs, 4 shapes × 3 states × 3 slices) | ~129 | **one drawn `CalButton`** (gradient + caps + states) |
| panel/day chrome (infopanel 9-slice, day frames, grab bars, tgrid hour lines) | ~90 | **drawn** (fill/cornerRadius/hairlines/draw()) |
| scrollbar slices | 12 | drawn (neo scrollbar component — harvest) |
| day-name labels, view icons, arrows | ~15 | **text/draw()** (labels are just rendered text) |
| logo, menubar overlay, loading still, splash | ~10 | **keep as bitmaps** initially; revisit later |

## 14. neo architecture sketch (what the rewrite looks like)

| original | LOC | neo replacement |
|---|---|---|
| gridsliderlayout.lzx + per-day animatorgroup + timers | 511+ | `GridSlider` layout: geometry as one pure derive over `(mode, open, W, H, rows)`; per-cell animators; completion-driven visibility (~80–100 lines) |
| cal-data.lzx (XPath surgery) | 505 | `Event` records + a `CalendarStore` `{ }` module: field writes, date-keyed index, month lazy-load (~120 lines) |
| calendar.lzx (42 static cells, glue) | 528 | `App` + `days[]` replication + mode **states** (~150 lines) |
| day.lzx (pooling, showData state) | 247 | `DayCell` with `open` **state** (list ⇄ timeline structural swap) (~100 lines) |
| event.lzx | 208 | `EventBar` with `open`/`selected`/`hover` states (~80 lines) |
| eventselector.lzx (global chrome + idle-loop drag) | 443 | per-event `selected` state + one drag routine (time-drag ⇄ free-drag) (~80 lines) |
| infopanel + basepanel + textbox + tabs | ~500 | `InfoPanel` (TextInput fields, spinners, accordion states) (~150 lines) |
| cal-button (9-slice, 3 states × 4 shapes) | 300 | drawn `CalButton` (~60 lines) |
| vscrollbar | 238 | neo `Scrollbar` (component-library harvest) (~80 lines) |

Target: **≈900–1,000 lines of neo** for behavioral+visual parity — a ~4× reduction, with zero grid
images. The states mechanism, animators, replication, constraints, TextInput/focus, and draw() all
get exercised — this is the showcase app.

## 15. Staging

1. **Shell + data**: frame, top bar, month title/nav, `CalendarStore` + test data. ✅ spec
2. **The grid**: 42-cell `GridSlider`, month rendering imageless, day cells + closed event lists;
   month navigation. Perceptual gate vs `oracle/00`. ✅ **DONE 2026-07-05** —
   `neocalendar.neolzx` (311 lines): store = one `Dataset` days array rebuilt per month
   (replication reconciles 35↔42), cells position by pure constraints (`:col`/`:row` × grid `cw`/`ch`),
   events pre-sorted with display labels in data. Gate: cell frames/colors **pixel-identical** (sampled),
   bar text row-aligned; residual diff = selected-day chrome (Stage 4) + text AA + drawn-chrome
   deviations (§13). Evidence: `verify/stage2-*.png`. Data converter `tools/convert-data.mjs` derives
   dates from TREE position (start-attrs are stale in generated files — e.g. Yom Kippur under
   month9/day25 with month="7" attrs; the original renders by tree). Runtime fix along the way:
   `own()` lets an author binding displace a *yielding* runtime derive (replication attaches before
   bindings finish → auto-extent collided with class width/height constraints).
3. **Modes + motion**: open-cell / week / day states + the 500ms slider animation; daynames tracking;
   mode-aware nav (fix B–D). Gates vs `oracle/01,03,04`. ✅ **DONE 2026-07-05** —
   grid geometry moved from per-cell constraints to one imperative `relayout(animate)` method (the
   honest mirror of the original's gridsliderlayout; dynamic → imperative, per the rulings): computes
   each cell's box as a pure function of `(mode, focusIndex, W, H, rows)`, applied via direct writes
   (snap) or four per-cell animators (500ms simultaneous slide), with hide-now / unveil-at-end for
   cells leaving/entering the visible set (unveil = the animator's completion, replacing the original's
   hardcoded 600ms timer, §12-H). Daynames data-driven off a `cols` array `relayout` maintains (track
   columns per mode; single label in day mode, §12-D). Verified: open-in-place (month snap), week,
   day, mode-aware nav (week=+1wk / day=+1day, mode preserved, §12-B), day-mode nav clean (§12-C),
   month-crossing in day mode, mid-slide motion frame. Week view **0.96% AE in the grid area** vs
   `oracle/03` (residual = text AA + drawn chrome + Stage-4 selection chrome). Evidence:
   `verify/stage3-*.png`. Note: the OPEN cell still shows the closed event LIST — the hour TIMELINE
   is Stage 4 (SPEC §3 open form), so the open-cell interior intentionally differs from `oracle/01`.
4. **Events interactive**: selection chromes, open-timeline (fix E–F), drag (time + cross-day).
   Gates vs `oracle/07,08,12`.
5. **Info panel + Add Event**: panel slide, fields (TextInput), spinners, accordion, apply/delete/
   cancel semantics. Gates vs `oracle/05–07,20`.
6. **Chrome polish**: CalButton, scrollbar, selected-day bevel, startup animation; component-library
   harvest begins here.
