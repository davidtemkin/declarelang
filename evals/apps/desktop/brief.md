# The Desktop — a brief

Build a working Mac-style desktop that runs in a browser: a wallpaper, a menu bar, a dock,
and windows you open, drag, resize, zoom, minimize into the dock and close — a file
browser, a document viewer, sticky notes, About boxes, and windows that run other,
separately built programs. It is called **Declare Desktop**.

This is not a picture of a desktop. The point is behaviour: which window is in front, what
the menu bar belongs to, how far the dock has swelled under the pointer, where a window
goes when it is minimized and how it comes back — all of it true at once, while the person
drags, resizes and clicks. And it is not only behaviour: the look is specified to the
pixel, colour and millisecond, and a build that gets the behaviour right but the finish
wrong has not done the job. The two are one: a shadow that deepens when a window comes to
the front *is* the front window.

Every behaviour below is numbered (**D-1**, **D-2**, …) so it can be checked. Where this
brief gives a number — a size, a colour, a duration — that number is the
requirement. Where it describes a behaviour by a familiar convention, the behaviour stated
is the requirement, not the convention. Visual requirements sit beside the behaviours they
belong to and are numbered with them. Section 15 lists acceptance checks derived from
them. Reference screenshots of some states may be supplied; where they disagree with a
number here, the number wins.

Conventions used throughout:

- **Points.** All sizes are CSS pixels. "x, y" positions are measured from the top-left of
  the named box. *Screen* means the whole desktop stage; *the windows layer* is the stage
  minus the 32-px menu bar (its y = 0 is screen y = 32).
- **Colours** are hex (`#RRGGBB`, or `#RRGGBBAA` with alpha), or `rgba()`. "Light / dark"
  gives the value in each appearance mode.
- **Shadows** are written *(x-offset, y-offset, blur, colour)*.
- **Motion** is specified by what a person sees: start and end values, how long it takes,
  its shape, whether it overshoots, and what it does if its destination changes partway.
  Durations and settle times are ±15 %. Unless a motion says otherwise it is
  **interruptible**: if its destination changes while it is moving, it turns toward the new
  destination from where it is, with no jump in position or speed, and never restarts from its
  beginning. Motion that follows the pointer tracks it continuously, with no visible stepping
  between pointer events. After each motion's description, a pointer names its entry in
  Appendix B, which gives the motion's exact definition (as the original produces it): build
  to that definition — any implementation that produces the same motion is fine.
- **⌘** is the command key on a Mac (Ctrl elsewhere); **⇧** is Shift.
- *Front window* means the one window the desktop considers active. There may be none.

---

## 1. The stage

**D-1 · Size.** The desktop fills the browser window and follows it as it resizes. It has a
floor of 800 × 600: in a smaller browser window the stage stays 800 × 600 and the browser
pans the page; the desktop itself never scrolls. Anything past the stage's edges — a
window dragged half off — is clipped where it lies, never moved back.

**D-2 · Paint order**, back to front: a solid ground `#0A0612` (seen only before the
wallpaper paints); the wallpaper (§3); the windows layer (§5–§6); the menu bar (§4); the
hold-⌘ shortcut panel (§10); the dock (§7); the "not included" alert (§9). Menus opened
from the menu bar paint above all of these. A menu or popup opened *inside* a window paints
in that window's own overlay layer (D-60). A minimized window paints inside the dock (D-101).

**D-3 · Type.** One face throughout: the platform UI font (`system-ui, sans-serif`;
`-apple-system` on a Mac). Sizes and weights are given where each text appears.

**D-4 · Two appearances.** The desktop has a light and a dark appearance (§13). Every
surface below names its colour by one of these tokens, which take these values:

| token | light | dark |
|---|---|---|
| background | `#F5F5F7` | `#1E1E1E` |
| surface | `#FFFFFF` | `#2C2C2E` |
| line (hairlines, separators) | `#C6C6C8` | `#48484A` |
| text | `#1D1D1F` | `#F2F2F7` |
| textMuted | `#6E6E73` | `#98989D` |
| textFaint | `#AAB4BE` | `#AAB4BE` |
| accent | `#007AFF` | `#0A84FF` |
| accentPressed | `#0066D6` | `#3B9DFF` |
| accentText (text on accent) | `#FFFFFF` | `#FFFFFF` |
| controlHovered | `#FFFFFF` | `#3A3A3C` |
| controlPressed | `#E5E5E5` | `#4F4F51` |
| menuFill (translucent) | `#F9F9FBDB` | `#2C2C2EE6` |
| menuShadow | (0, 12, 44, `#00000040`) | (0, 12, 44, `#00000073`) |
| menuHighlight (vertical gradient, top→bottom) | `#1F86FF` → `#0068EE` | `#2B8FFF` → `#0A6FEB` |
| menuTitleHighlight | `#FFFFFF24` | `#FFFFFF26` |
| disabled opacity | 0.5 | 0.5 |

**D-5 · Primary button look** (used by the Files "Open" button and the alert's "OK"):
28 tall, corner radius 6, fill accent (accentPressed while pressed; hover does not change
it), label 13-px semibold in accentText, no border.

**D-6 · Text field look** (the Help menu's search field): fill surface, 1-px border in line,
which turns accent while the field has focus; placeholder in textMuted.

**D-7 · Keyboard focus ring.** When focus arrives by keyboard (Tab, arrows, F6), the focused
control wears a ring: a 3.5-px stroke in accent at 0.9 opacity, hugging the control's own
outline with no gap and following its corner radius. The ring *travels*: moving focus flies it
from the old control to the new, its position, size and corner radius changing together; it
arrives in about 0.5 s with a slight overshoot (roughly a tenth of the distance) and settles,
and a further Tab mid-flight redirects it smoothly. (Exact definition: Appendix B, *focus ring flight*; any implementation that produces the same motion is fine.) A pointer press hides the ring (it stays
where the pointer put focus, invisibly, so the next Tab departs from there). Focus given by the
pointer never shows a ring.

---

## 2. The desktop as it opens

**D-8 · Data.** At startup the desktop fetches the library tree (`docs/declare-model.json`, §14) once.
Until it arrives, Files windows show one empty column.

**D-9 · Boot windows.** Once the stage has its size, two windows open, in this order:
1. the **welcome note** (a Jot, D-80): 400 × 385, at windows-layer x = max(440, stage width
   − 490), y = 120; it carries the welcome text (§14.4);
2. a **Files** window (D-62): 560 × 400 at windows-layer (118, 72).

Files is the front window, the welcome note sits behind it, and Files has the keyboard. The
boot windows play the normal open animation from their own centres (D-46). Neither bounces
a dock icon.

**D-10 · Boot state of the rest.** Files and Jots are running (their dock dots lit, D-94);
no other application is. The menu bar shows the Files application's menus (§4). No window
is minimized. No menu is open. Appearance follows the operating system's light/dark
setting. The wallpaper is seed 7 (§3). The clock shows the current local date and time.

---

## 3. The wallpaper

**D-11 · What it is.** A generated mesh-gradient field, drawn (no image), a pure function of
an integer *seed* that starts at **7**. It is drawn once into a fixed 1920 × 1200 frame and
then scaled, uniformly, to *cover* the stage (scale = max(stageW / 1920, stageH / 1200)),
centred, the overflow cropped. Resizing the browser re-scales it; it is never redrawn for a
resize.

**D-12 · The drawing.** Reproduce this exactly, in a 1920 × 1200 canvas (W × H):

```
seeded PRNG (mulberry32): a = (seed >>> 0) || 1
  rnd(): a = (a + 1831565813) | 0
         t = imul(a ^ (a >>> 15), 1 | a)
         t = (t + imul(t ^ (t >>> 7), 61 | t)) ^ t
         return ((t ^ (t >>> 14)) >>> 0) / 4294967296
hsl(h, s, l) = "hsl(" + (((h % 360) + 360) % 360) + "," + s + "%," + l + "%)"

hue0   = rnd() * 360
scheme = floor(rnd() * 3)            // 0 analogous · 1 triad · 2 split-complementary
hueFor():
  scheme 0: hue0 + (rnd() − 0.5) * 100
  scheme 1: hue0 + [0, 120, 240][floor(rnd() * 3)] + (rnd() − 0.5) * 26
  scheme 2: rnd() < 0.72 ? hue0 + (rnd() − 0.5) * 74 : hue0 + 180 + (rnd() − 0.5) * 40

fill W×H with hsl(hue0, 52, 5)
save; filter = blur(round(max(W, H) * 0.05) px); composite = "lighten"
for each pole [0.17,0.24], [0.82,0.20], [0.50,0.54], [0.20,0.82], [0.83,0.80]:
   px  = (pole.x + (rnd() − 0.5) * 0.18) * W
   py  = (pole.y + (rnd() − 0.5) * 0.18) * H
   r   = (0.36 + rnd() * 0.26) * max(W, H)
   h   = hueFor(); sat = 70 + rnd() * 22; li = 44 + rnd() * 12
   radial gradient at (px, py), radius 0 → r:
       0 → hsl(h, sat, li), 0.5 → hsl(h, sat, li * 0.62), 1 → rgba(0,0,0,0)
   fill W×H with it
restore
vignette: radial gradient from (W/2, 0.45H, radius 0.1H) to (W/2, 0.5H, radius 0.72W):
   0 → rgba(0,0,0,0), 1 → rgba(0,0,6,0.62); fill W×H
top scrim: linear gradient y 0 → 48: rgba(0,0,0,0.30) → rgba(0,0,0,0); fill W×48
```

(The calls are the order of `rnd()` draws; the order matters.)

**D-13 · Cycling it.** Pressing **`** (backtick, no ⌘, not an auto-repeat) adds one to the
seed and the wallpaper redraws at once — no transition. The wallpaper takes no pointer
input of its own: a press on it is a press on the desktop (D-52). The wallpaper is the same
in both appearances.

---

## 4. The menu bar

**D-14 · The bar.** 32 tall, full stage width, at the top. It has **no background**: its
words are drawn straight on the wallpaper, in `#F2F2F5` in both appearances (the
wallpaper's top scrim keeps them legible). A press on an empty part of the bar is a press
on the desktop (D-52).

**D-15 · Titles.** The menu titles start 10 px from the left edge, in a row with 2 px
between titles. Each title is its label in 14-px medium weight (the application title in
**bold**), with 10 px of room either side (a title is its text width + 20 wide). The title
of the open menu wears a capsule highlight: 24 tall (inset 4 px from the bar's top and
bottom), corner radius 6, filled menuTitleHighlight. Titles do not highlight on mere hover.

**D-16 · The brand title.** The first title is not a word but a mark: an 18-px white disc
(`#FFFFFF`) with "[ ]" centred on it in 9-px bold black (`#000000`). Its accessible name is
"Declare".

**D-17 · The clock.** At the right, its right edge 14 px from the stage's right edge,
vertically centred: 13-px medium, `#F2F2F5`, reading e.g. **`Wed Aug 12  10:30 AM`** —
three-letter weekday, three-letter month, day of month without padding, *two* spaces, hour
on a 12-hour clock without padding (12 for noon and midnight), minutes with two digits,
"AM"/"PM". It changes on the minute, exactly at the minute boundary.

**D-18 · The menus, in order.** The bar's menus belong to the **active application** — the
application of the front window, or **Files** when there is no front window (D-50). Each
item lists: label · shortcut · state.

1. **Brand** (the mark):
   - About Declare Desktop — icon: brackets (D-31)
   - *divider*
   - **Dark Mode** · ⌘K — icon: half-filled circle (D-31). Reads **Light Mode** while the
     desktop is dark.
   - *divider*
   - View & Edit Source — icon: code chevrons ‹ › (D-31)
   - Declare Home
2. **The application menu**, titled with the active application's *title* (§8), in bold:
   - About ⟨title⟩
   - *divider*
   - View & Edit Source
   - *divider*, then **Quit ⟨title⟩** · ⌘Q — both absent when the application is Files
     (Files is always running).
3. **File**:
   - New · ⌘N
   - Open… · ⌘O — disabled while the active application is Calendar
   - *divider*
   - Close Window · ⌘W — disabled while there is no front window
4. **Edit** — every item present, shown with its shortcut, and always disabled (nothing on
   the desktop edits): Undo ⌘Z, Redo ⇧⌘Z, *divider*, Cut ⌘X, Copy ⌘C, Paste ⌘V, *divider*,
   Select All ⌘A.
5. **Window** — one row per open window of the active application (About boxes excluded,
   minimized windows included), in stacking order from back to front with minimized windows
   last; each row labelled with the window's title, or the application's title when the
   window has none (a Jot). The front window's row is checked (a radio-style check: these
   rows are one set). When the application has no such windows, one disabled row: **No
   Windows**.
6. **Help**:
   - a search field row (D-29)
   - ⟨title⟩ Help — icon: lightbulb (D-31)

**D-19 · The menus are live.** Every label, enabled state and check derives from the
current state, and stays current *while a menu is open*: if the front window changes under
an open Window menu, its check moves; if appearance flips, the Dark/Light label flips.

**D-20 · What each item does** (picking any item first closes the menu, then acts on the
next painted frame):

| item | effect |
|---|---|
| About Declare Desktop | opens the desktop's own About box (D-83) |
| Dark Mode / Light Mode | switches appearance to the other mode and **locks** it: from then on, the operating system's setting no longer changes it (D-149) |
| View & Edit Source (brand menu) | opens the desktop's source in the Viewer (D-119) |
| Declare Home | the browser navigates to `apps/homepage/homepage.declare` under the site root (§14.1) — the desktop is left (that page need not exist in this build) |
| About ⟨title⟩ | opens the active application's About box |
| View & Edit Source (app menu) | opens the active application's source in the Viewer |
| Quit ⟨title⟩ | quits the active application (D-118) |
| New | the active application's *launch* action (D-115) |
| Open… | if the active application is Files and there is a front window: open that Files window's selection (D-75); otherwise the application's launch action |
| Close Window | closes the front window (D-47) |
| a Window-menu row | brings that window forward — restoring it from the dock if it is minimized (D-108) |
| ⟨title⟩ Help, Edit items | nothing |

**D-21 · Opening and tracking with the pointer.** Clicking a title opens its menu under
it and highlights the title. Clicking the open title closes it. While any menu is open,
moving the pointer onto another title switches to that title's menu (no click needed).
Menus appear and disappear instantly — no fade, no motion.

**D-22 · Dismissal.** A press anywhere outside an open bar menu closes it **and goes on** to
what was pressed: pressing a dock icon with a menu open both closes the menu and opens the
application; pressing a window closes the menu and raises the window. Escape closes it.
Picking an item closes it.

**D-23 · Menu panel look.** A frosted panel: fill menuFill over a backdrop blur of 24 px with
saturation boosted ×1.5 (what lies under the panel is visibly blurred through it); 1-px
border in line; corner radius 13; shadow menuShadow. 5 px of padding above the first row
and below the last. The panel drops from the title's bottom-left, 4 px below the title, and
is moved as little as needed to stay 4 px inside the stage.

**D-24 · Rows.** Each row is 24 tall; a divider row is 11 tall, drawn as a 1-px line in line,
inset 10 px from each side, 5 px down. Labels are 13 px in text; shortcut keys 12 px in
textMuted, right-aligned with their right edge 16 px from the panel's edge. Disabled rows
are drawn at 0.5 opacity and cannot be picked. A row whose menu has a check column shows a
12-px check mark at x = 7 when checked.

**D-25 · Columns and width.** The label column starts at x = 17; at x = 24 when any row in
that menu can be checked; at x = 43 when any row carries an icon; at 50 with both. Icons are
16 × 16, at x = 18 (25 with a check column), vertically centred. The panel's width is the
largest of: 120; any row's stated minimum (the Help search row asks 244); and *label start
+ widest label + (26 + widest key + 16 if any row has a key, else 18)*.

**D-26 · Row highlight.** The row under the pointer (enabled, not a divider) is highlighted:
a rounded rectangle inset 5 px from each side and 1 px top and bottom, corner radius 5,
filled with the menuHighlight gradient; on it, the label, key, check and icon all turn
`#FFFFFF`. Moving the pointer takes the highlight from the keyboard (D-28).

**D-27 · Keyboard into the bar.** The menu bar is one Tab stop (D-127). With it focused,
←/→ move among the titles; Enter, Space or ↓ opens the focused title's menu. Tab lands on the
title last used (the first, at first).

**D-28 · Keyboard inside an open menu.** ↓/↑ move a keyboard highlight over the enabled,
pickable rows (skipping dividers, disabled rows and the search row), wrapping at the ends;
the first ↓ lands on the first row, the first ↑ on the last. Enter picks the highlighted row.
← and → switch to the previous / next title's menu, wrapping around the bar. Typing letters
moves the highlight to the first enabled row whose label starts with what has been typed:
the prefix grows while typing continues and resets after a 1-second pause; typing the same
letter again moves on to the next row starting with it. Escape closes the menu and returns
focus to where it was. While a menu is open it holds the keyboard: its arrows, Enter and
Escape do nothing else.

**D-29 · The Help search field.** A real, typeable text field inside the Help menu's first
row. The row is 48 tall and takes no highlight and no pick. The field is a capsule 30 tall
(corner radius 15), 5 px from the row's top, its left edge at x = 31 in the panel and its
right edge 12 px from the panel's right edge; inner padding 28 px left, 8 px right;
placeholder **Search**; the look of D-6. A 14 × 14 magnifier sits 10 px in from the
capsule's left edge, vertically centred: a 1.5-px textFaint stroke, round caps — a circle of
radius 4.2 centred at (6, 6) and a handle from (9.4, 9.4) to (12.5, 12.5). Clicking the field
focuses it for typing; what is typed is kept while the menu is open and searches nothing.

**D-30 · The bar follows focus.** The application title, the application menu, File's
enabled states, the Window menu and the Help row label all change the moment the front
window changes — including while a menu is open.

**D-31 · The menu icons**, each drawn in a 16 × 16 box in the row's text colour (white on a
highlighted row), round caps and joins, 1.5-px stroke:
- *brackets*: two strokes — (5.4, 3.4) → (3.0, 3.4) → (3.0, 12.6) → (5.4, 12.6), and
  (10.6, 3.4) → (13.0, 3.4) → (13.0, 12.6) → (10.6, 12.6);
- *half-filled circle*: a circle of radius 5.4 at (8, 8), stroked, with its left half
  (from 90° to 270°) filled;
- *code chevrons*: (6.4, 4.2) → (2.6, 8.0) → (6.4, 11.8) and (9.6, 4.2) → (13.4, 8.0) →
  (9.6, 11.8);
- *lightbulb*: a filled bulb outline (a rounded bulb whose sides taper into a neck at
  y ≈ 12.5) with a separate thin bar beneath at y ≈ 13.6 and a rounded tip ending at
  y = 16 — any clean, filled 16-px lightbulb glyph.

**D-32 · Shortcuts are the menu items.** Every item's shortcut works from anywhere in the
desktop, exactly while the item is present in the bar, with exactly the item's effect, and
not while the item is disabled. So ⌘Q exists only while the application menu shows a Quit
item; ⌘O does nothing while Calendar is active; ⌘W does nothing with no front window; the
Edit shortcuts never fire (and are not taken from a focused text field, where ⌘C/⌘V/⌘X/⌘Z/⌘A
keep their usual editing meaning). A shortcut taken by the desktop is not also performed by
the browser.

---

## 5. Windows — what every window has

There are five kinds of window (§6): **Files**, **Markdown viewer**, **Jot** (sticky note),
**About** box, and **hosted** (running a separately built program). They share everything
in this section; §6 gives what each adds. A Jot has its own chrome (D-93) but the same
behaviour.

### The frame

**D-33 · Frame.** A window is a rectangle filled surface, with a 1-px border in line,
corner radius 10, clipped to its rounded shape. Default size 560 × 400 unless its kind says
otherwise.

**D-34 · Shadow says which window is front.** The front window floats on (0, 12, 26,
`#0000006B`); every other window sits on a lighter, tighter (0, 5, 14, `#00000047`). The
change is immediate when the front window changes.

**D-35 · Title bar.** 35 tall, across the top. In the front window it is a vertical gradient
— light `#FAFAFC` → `#E6E6EA`, dark `#3B3B40` → `#2E2E32`; in any other window it is the
flat background token. A 1-px separator in line runs along the bar's bottom (y = 34) in both
states. The title is centred on the window, 13-px semibold, single line, in text when the
window is front and textMuted otherwise; it is as wide as its words but never wider than
the bar's width − 152 (− 280 when the window has back/forward arrows), cut short past that.

**D-36 · Window controls ("traffic lights").** Three 14-px circles, 20 px apart, in a block
54 × 14 at x = 13, y = 10.5 of the title bar: close, minimize, zoom. Each is filled, with a
0.5-px rim:

| | fill | rim | glyph ink |
|---|---|---|---|
| close | `#EC6A5E` | `#D25349` | `#7B1006` |
| minimize | `#F5BF4F` | `#D9A340` | `#8F5B00` |
| zoom | `#61C554` | `#4CAF45` | `#145E14` |

They are *lit* (coloured) while the window is front **or** while the pointer is anywhere
over the 54 × 14 block. Unlit, each is a flat gray — light `#D2D2D6`, dark `#54545A` — with a
barely-there rim `#00000014`. While the pointer is over the block (and only then), the lit
circles also show their glyphs, drawn in the circle's 14-px box in its ink colour with round
caps: close, an × of two 1.6-px strokes (4.5, 4.5)→(9.5, 9.5) and (9.5, 4.5)→(4.5, 9.5);
minimize, a 1.8-px bar (3.5, 7)→(10.5, 7); zoom, two filled triangles (4.1, 4.1), (8.5, 4.1),
(4.1, 8.5) and (9.9, 9.9), (5.5, 9.9), (9.9, 5.5). Hovering the rest of the title bar does
nothing.

**D-37 · The controls act directly.** Clicking close closes the window (D-47); minimize
minimizes it (D-105); zoom toggles its zoom (D-44). A click on a background window's control
acts on that window **without** bringing it forward first. On an About box, minimize and
zoom look the same but do nothing.

### Moving

**D-38 · Dragging.** Pressing anywhere on the title bar (outside its controls and arrows)
and dragging moves the window, following the pointer exactly. With a mouse the press itself
brings the window forward (D-49), so press-dragging a background window raises and moves it
in one gesture. The window is kept within reach: its left edge stays between −200 and
stage width − 60, its top (in the windows layer) between 0 and stage height − 90. A drag the
browser takes back (a touch that turns into a page pan, an interrupted gesture) puts the
window back where it started. Double-clicking the title bar does nothing.

**D-39 · Touch.** On touch, a quick swipe across a window is not taken by the window (on a
floored, panning page it pans the page); a press-and-hold on the title bar raises the window
and starts the drag; a tap raises it.

### Resizing

**D-40 · The resize band.** Every window except an About box (and a shaded Jot) can be
resized from all four edges and all four corners. The grabbable band straddles the frame:
from 6 px outside the window's edge to 3 px inside it — 9 px wide — all the way round. The
band wins over whatever the window holds there (scrollbars included) but only within those
3 inner px; inside that, the window's content takes the pointer. Its inner edge is rounded
at the corners with radius 9 (the window radius − 1), so the band follows the window's
rounded corners.

**D-41 · Zones and cursors.** On the band, the edges resize one way and the corners
diagonally: a grab on a side band within 25 px (measured from the band's outer corner) of a
corner is that corner. Cursors: left/right edges `ew-resize`; top/bottom `ns-resize`;
top-left and bottom-right corners `nwse-resize`; top-right and bottom-left `nesw-resize` —
shown in 16 × 16 squares at the band's four outer corners, and the edge cursor along the
rest of each side.

**D-42 · Resizing.** Dragging a zone resizes the window, following the pointer: a right or
bottom drag moves that edge; a left or top drag moves that edge while the opposite edge
stays put. Width never goes below the window's minimum width (340 by default) and height
never below its minimum (120 by default); there is no maximum, and a window may be resized
past the stage's edges. A top-edge resize never pulls the window's top above the windows
layer's top. Starting a resize brings the window forward.

**D-43 · Grip.** In the window's bottom-right corner (a 16 × 16 box at the corner), two
diagonal 1-px strokes in textFaint: (6, 14)→(14, 6) and (10, 14)→(14, 10). Art only — the
band does the resizing. Hidden on About boxes and shaded windows; not drawn on a Jot (which
resizes all the same).

### Zoom

**D-44 · Zoom.** The green control (and a Jot's zoom widget) toggles *zoom*: the first press
remembers the window's position and size and sets it to windows-layer (12, 8), width stage
width − 24, height stage height − 130 (leaving the dock clear); the next press puts back
what was remembered. The change is instant — no animation. Zoom does not bring the window
forward.

**D-45 · Shade** (Jots only, D-81): collapses the window to its 12-px strip; again restores
its height. Instant. While shaded, the resize band and grip are gone.

### Opening and closing

**D-46 · The open zoom.** A new window grows into place: its scale goes from a small start to
1 in **230 ms**, fast at first and easing into place (about 70 % of the growth is done in the
first third of the time; no overshoot), about a *pivot point*. When the window was opened
*from* something on screen — a dock icon, a Files row or the Open button, i.e. the view the
person pressed — the pivot is that view's centre, expressed in the window's own coordinates,
and the start scale is **0.15**: the window appears to grow out of what was pressed. (Its
position is taken *with* scroll offsets: a row in a scrolled list is where it shows, not
where it would be unscrolled.) If the origin's x relative to the window is negative (the
origin lies left of the window) the window instead starts at **0.85** with the pivot's x at
the window's centre; independently, a negative origin y puts the pivot's y at the centre.
A window opened with no origin — from a menu, a shortcut, a context menu, or the boot —
starts at **0.85** and grows about its own centre. Only these opens have an origin: dock
icons of Markdown and the hosted applications; a Files row (double-click or Enter) or the
detail column's Open button opening a document or a Documentation place. (Files, Jots and
folder windows open with no origin; see D-48 for a folder window's close.) The window is
fully opaque throughout and usable at once. (Exact definition: Appendix B, *window open*; any implementation that produces the same motion is fine.)

**D-47 · The close zoom.** Closing runs the open in reverse: the window shrinks from its
current scale to **0.15** in **200 ms**, starting slowly and accelerating to the end, about
the same pivot, then is gone (no
fade; it vanishes at 0.15). If the window was opened from a view that still exists on screen,
the pivot is recomputed at close time to that view's current centre (it may have moved or
scrolled) — the window shrinks back into what it came from. A window closes with the close
control, Close Window / ⌘W, its application's Quit, or (About boxes) dismissal. A second
close request during the animation is ignored. (Exact definition: Appendix B, *window close*; any implementation that produces the same motion is fine.)

**D-48 · Folder windows close into their row.** A Files window opened from a folder row
(double-click or Enter) opens from its centre (D-46) but remembers the row: when closed while
that row is still on screen, it shrinks toward the row.

### Front window, stacking and the keyboard

**D-49 · Activation.** A window becomes the front window when: a mouse button goes down
anywhere on it (title bar, content, band); it is tapped or press-and-held (touch); a resize
starts on it; it is chosen from the Window menu or brought forward from the dock; or it has
just opened. Becoming front:
1. raises it to the top of the stack of normal windows (D-51);
2. if it is not an About box, closes every open About box (each with its close zoom);
3. gives it the keyboard (D-53).

**D-50 · No front window.** Closing or minimizing the front window leaves **no** front
window: nothing else is promoted. Every remaining window draws inactive (gray lights, flat
bar, light shadow), the keyboard focus is cleared, and the menu bar shows the Files
application's menus (Files is the fallback active application).

**D-51 · Stacking.** Windows stack in one order, which is also the order they paint in.
Opening a window puts it on top of the normal windows. Raising moves it to the top of the
normal windows. Minimized windows (D-105) are kept after all normal windows, in the order
they were minimized (the latest last). Tab and the Window menu read this same order.

**D-52 · A press on the desktop.** A press that lands on nothing that takes it — the
wallpaper, the empty menu bar, the dock's plate between icons — closes every open About box.
It does not change the front window.

**D-53 · The keyboard follows the front window.** When a window comes to the front, keyboard
focus goes back to the control that last had focus inside it, else to its first focusable
control; if it has nothing focusable, focus is cleared. A hosted window instead hands the
keyboard to the program inside it (D-136). This happens however the window came to the
front.

**D-54 · First click only activates.** While a window is not front, its content area (below
the title bar) does not receive presses: the first press on it only brings the window
forward (and gives it the keyboard). A Files row, a button, or a hosted program in a
background window does not react to that first press at all — the next press does. The
title bar, its controls and the resize band stay live on background windows.

### The window eggs

**D-55 · Tilt.** Pressing **r** (no ⌘, not an auto-repeat) swings every window — those open and
those opened later — to its own random lean, a fresh uniform random angle in [−30°, 30°) per
window; **r** again re-rolls all of them; **R** (Shift-r) levels them all. Each window swings to
its new angle with a small wobble: it overshoots by roughly 12 % of the swing, swings back, and
settles within about 0.6 s; a re-roll mid-swing redirects it smoothly. A tilted window turns
about its own centre. Everything keeps working on a tilted window: dragging; resizing along
the window's own (turned) edges, with the opposite edge staying planted; menus and popups
opened inside it turn with it. A tilted window straightens on its way into the dock (D-106),
so thumbnails park straight. (Exact definition: Appendix B, *tilt and egg scale*; any implementation that produces the same motion is fine.)

**D-56 · Zoom egg.** **s** sends every window to a random scale, uniform in [0.55, 1.45) per
window, with the same wobble and timing as the tilt; **s** re-rolls; **S** returns all to 1. A
scaled window scales about its centre; resizing a scaled window follows the pointer in screen
pixels (each window pixel covers *scale* screen pixels). The egg scale fades out of the
window's size as it goes into the dock, so it parks at exactly its thumbnail size. (Exact definition: Appendix B, *tilt and egg scale*; any implementation that produces the same motion is fine.)

**D-57 · When the egg keys work.** r, R, s, S and ` are heard whenever the desktop itself has
the keyboard — but not while a text field has focus (typing into the Help search types the
letter), not while a hosted program has the keyboard (its window is front), and not with ⌘
held.

### Windows as places for overlays

**D-58 · Shapes of input.** On a window, a mouse press activates at the press; a tap at the
click; a press-and-hold at the hold.

**D-59 · Accessible window.** Each window is exposed as a dialog named by its title.

**D-60 · The window's overlay layer.** Menus and popups that belong to a window — a Files
row's context menu, a hosted program's own menus — open in that window's overlay layer:
above the window's content, allowed to hang past the window's edges (never past the stage's,
kept 4 px inside it), and turned and scaled with the window when the eggs are active.

**D-61 · Back / forward arrows.** Windows of the Documentation and 50 Birds applications
carry ‹ and › buttons in the title bar at x = 80, y = 6, 2 px apart: each 26 × 23, corner
radius 6, its glyph in 22-px text (‹ or ›) centred and raised 3 px. Hovering fills the button
controlHovered. A button with nowhere to go is disabled: its glyph in textMuted at 0.45
opacity, and it does nothing. They are keyboard-focusable buttons, named "Back" and
"Forward". Their behaviour is D-134.

---
## 6. The kinds of window

### 6.1 Files — a column browser over the library

**D-62 · What it is.** A Finder-style column browser over the library tree (§14.1): each
column lists one level; selecting a folder opens the next level in a new column to its
right; selecting a document shows a detail column. Default size 560 × 400 (minimum
340 × 120). New Files windows open at windows-layer x = 90 + (n mod 7) × 28, y = 46 + (n mod 7)
× 26, where *n* is the cascade counter (D-114).

**D-63 · Title.** The name of the deepest selected item; with nothing selected,
**Documentation**.

**D-64 · Layout.** Below the title bar the whole body is filled with the background token.
It holds a horizontal strip of columns, laid side by side with no gap, that scrolls
horizontally when the columns are wider than the window. Each column is the full body height,
clipped, filled background, with a 1-px line along its right edge. Every column is 250 wide
unless its *depth* has been resized (D-69).

**D-65 · A list column.** Lists its level's items as rows: the first row 6 px from the top,
1 px between rows, 6 px of space after the last; the column scrolls vertically when they
overflow. A row is 24 tall and as wide as the column:
- folder items show a folder icon (17 × 13) at x = 11; documents a page icon (13 × 16) at
  x = 12; both vertically centred;
- the name at x = 34, 13-px, single line, clipped to the column width − 52, in text;
- folders show a "›" at x = column width − 15, 12-px, in textFaint;
- the **folder icon**: a back tab, rounded rect (0, 0, 7.5 × 4, radius 1.5) `#4E9FEA`; the body
  (0, 1.8, 17 × 11, r 1.5) `#6AB2F5`; a top-lip highlight (0, 1.8, 17 × 3.2, r 1.5) `#8CC4F8`;
- the **page icon**: a white page with a dog-ear — outline (0.5, 0.5) → (8.5, 0.5) →
  (12.5, 4.5) → (12.5, 15.5) → (0.5, 15.5), filled `#FFFFFF`, stroked 1-px `#B4B4BA`; the
  fold triangle (8.5, 0.5), (8.5, 4.5), (12.5, 4.5) filled `#DDDDE2` and stroked the same.

**D-66 · Selection.** The window has one *selection path*: the chain of names from the top
level down to the selected item. Every row on that chain — the selected item and each
ancestor in the columns to its left — is highlighted: a rounded rect inset 4 px each side and
2 px top and bottom (so 20 tall), corner radius 5, filled accent, the row's name and "›" in
accentText. Rows have no hover look. Columns to the right of the selection's own level
are: the selected folder's children (a list column), or, for a selected document, its detail
column (D-68). Selecting an item at some level truncates everything deeper.

**D-67 · Clicking a row.** A click (in the front window) selects the row instantly — the
selection never waits to see whether a double-click follows. **Double-click** is decided by
the desktop, not by row identity: a second click within **550 ms** of the first and within
**6 px** of the first click's pointer position (in both x and y) opens the item that was
clicked first — even if the rows slid under the pointer in between (D-70), and even if the
second click lands on the empty area below the rows. Opening a folder opens a **folder
window** (D-71); opening a document is D-72.

**D-68 · The detail column.** For a selected document: 18 px from the column's left, 20 px
from its top, column width − 36 wide, a vertical stack with 11 px between items — the name
(14-px semibold, wrapping, text); its kind label (11-px, textMuted, e.g. "Markdown file");
its preview (12-px, wrapping, text); and an **Open** button (92 wide, the primary look D-5)
when the document has a file or an inline text. Open opens the document (D-72), growing from
the button.

**D-69 · Resizing columns.** Each column's right edge carries an 8-px wide seam (centred on
the edge, cursor `col-resize`). Dragging it changes that column's width, following the
pointer, between 150 and 460. The new width belongs to that column *depth* in that window:
every column later shown at that depth in that window has it.

**D-70 · The reveal glide.** 440 ms after a column first appears at a new depth (or changes
between list and detail at its depth), if it is not fully visible in the strip, the strip
glides horizontally — **260 ms**, fast at first and easing to a stop — just far enough: to put the column's right edge
at the strip's right edge if it is cut off on the right, else its left edge at the strip's left
edge if cut off on the left. The delay is deliberate: a double-click's second click lands
before anything moves. The glide moves only that strip, never the window or the page. In a
folder window (D-71) the rule is replaced: only the column at the folder's own level glides,
to the strip's left edge. (Exact definition: Appendix B, *Files reveal glide*; any implementation that produces the same motion is fine.)

**D-71 · Folder windows.** Opening a folder (double-click, Enter, Open in New Window, or
File ▸ Open with a folder selected) opens a new Files window at the next cascade position,
with the selection set to that folder, so the columns show the whole path from the top level
to the folder's children. Its title is the folder's name. The column that lists the folder
among its siblings is glided to the strip's left edge (D-70), so the folder and its contents
lead, and the whole path stays reachable by scrolling left. It opens about its own centre
(D-46). Opening a folder window closes any About boxes.

**D-72 · Opening a document.** In priority order:
1. it has a **place** in the Documentation application (`loc`): the Documentation window is
   brought forward and sent to that place, or, if none is open, a new Documentation window
   opens there (D-122);
2. it has **inline text** (`doc`): a Markdown viewer opens on that text, titled with the
   item's name;
3. it has a **file** (`path`): a Markdown viewer opens on that file.

**D-73 · Context menu.** Right-click, or long-press on touch, on a row opens a menu at the
pointer, in the window's overlay layer (D-60). It brings the window forward first; it does not
change the selection. While it is open, the row it serves wears a 2-px accent outline on its
highlight rectangle (unless the row is already highlighted). Items:
- on a folder: **Open in New Window** → a folder window (D-71);
- on a document: **Open** → D-72; **Open as Text** → a Markdown viewer on the document's file,
  even when the document would normally open elsewhere; disabled when it has no file.

Picks from this menu open with no origin (D-46). A press outside the menu closes it and is
*swallowed* (it does not reach what was pressed). Escape closes it. It is keyboard-navigable
exactly like a bar menu (D-28), except ← and → do nothing. The menu panel is D-23/D-24.

**D-74 · Keyboard.** Each list column is one Tab stop, entered at its selected row (else its
first row). On a focused row: ↓/↑ move focus to the next/previous row *and select it*
(nothing at the ends); → on a folder selects it and moves focus into its children's column,
selecting that column's first row; ← moves focus to the previous column's selected row,
leaving the selection as it is; **Enter** opens the item (folder → folder window, growing from
nothing (D-48); document → D-72, growing from the row).

**D-75 · File ▸ Open (⌘O) on Files.** With a Files window front: if the selection is a
document, open it (D-72, no origin); if it is a folder, open a folder window for it; if
nothing is selected, nothing happens.

**D-76 · Files and the library.** A Files window always reflects the library tree as
fetched; there is no editing, renaming or moving.

### 6.2 Markdown viewer

**D-77 · What it is.** A window that renders a Markdown document: either a file it fetches
(the title is the file's name, e.g. `declare.md`) or inline text handed to it (the title is
the name it was given). Default 640 × 460. New viewers open at windows-layer x = 160 + (n mod 7)
× 28, y = 36 + (n mod 7) × 26.

**D-78 · Reading.** The body below the title bar scrolls vertically. The text is selectable.
Margins are the scroll content's own: 40 px above and below, 48 px left and right, so the
scroll ends with the same room it starts with. Prose wraps at a 560-px measure; code blocks
use the full column width. Line height 1.6 × the font size. Body ink light `#2E3B46`, dark
`#C4CFD8`. Code blocks sit in a tinted box — light `#E9EFF4`, dark `#35393F` — with a teal bar
down the left edge, light `#12A08D`, dark `#37E0C8`. Headings, lists, emphasis, inline code,
tables and links render as Markdown does. The rest of the window is surface.

**D-79 · Loading and failure.** While a file is loading: "Loading…" in 13-px textMuted at the
top-left of the content area. If it fails: "Could not load — you’re offline." when the
browser is offline, else "Could not load — try again in a moment." (13-px textMuted,
wrapping).

### 6.3 Jot — a sticky note

**D-80 · Look.** Default 300 × 250, minimum 160 × 90. Square corners; paper `#FEF49C`; a
0.5-px rim `#4E4E52`. Shadow when front (0, 10, 26, `#00000052`), else (0, 3, 9, `#00000038`).
No standard title bar: a 12-px **strip** across the top, `#FEEA3D` while the note is front and
the paper colour otherwise (so an inactive note is chromeless).

**D-81 · Strip widgets** (shown only while the note is front), 1.4-px `#DBC501` lines over
`#FFF49C` fill:
- a **close box** at x = 11, y = 2.25, 7.5 × 7.5 — closes the note;
- a **zoom** widget at (width − 33, 2.25), 8 × 8: a right triangle (0.7, 7.3), (7.3, 7.3),
  (7.3, 0.7), filled and outlined — toggles zoom (D-44);
- a **collapse** widget at (width − 21, 2.25), 8 × 8: a square (0.7, 0.7, 6.6 × 6.6) with a
  line across at y = 3.1 — toggles shade (D-45).

**D-82 · Behaviour.** The strip is the title bar: drag by it (D-38), press-and-hold on touch.
The note resizes from every edge and corner (D-40) with no grip art drawn. The note's text is
Markdown, rendered on the paper — x = 12, y = 18, width − 24 wide, height − 28 tall, clipped,
at 0.82 × the normal text size (13 × 0.82 ≈ 10.7 px), line height 1.45, ink `#1D1D1F` in both
appearances (the paper does not change with dark mode). It is read-only. New notes read
*A new note.* (italic) and open at windows-layer x = 480 + (n mod 5) × 26, y = 90 + (n mod 5) × 24.
A note has no title: its label is the application title, "Jots".

### 6.4 About box

**D-83 · What it is.** A small, fixed window describing one application (or the desktop
itself): 280 × 380, the standard frame with an empty title, not resizable (no band, no grip),
not minimizable or zoomable (those controls do nothing), closed only by its close control,
Close Window / ⌘W, its application's Quit, or dismissal (D-49, D-52, and any window opening
from New, a launch, a folder or a document). It opens at windows-layer x = (stage width − 280)
/ 2 + (n mod 3) × 16, y = 110 + (n mod 3) × 14, and comes to the front. Opening it does not close
other About boxes. While it is front, the menu bar belongs to its subject: its application
menu is that application's (for the desktop's own box, "Declare Desktop", whose application
menu has a Quit item that closes the box).

**D-84 · Content**, below the title bar, padding 22 top/bottom, 24 left/right, a centred
vertical stack 10 px apart:
- the application's icon (D-104) at 96 × 96;
- its title, 17-px bold, text;
- "Version pre-1.0", 11-px, textMuted;
- 2 px of space; its blurb (§8), 11-px textMuted, centred, wrapping;
- 8 px of space; "Built in Declare · MIT · © 2026 David Temkin", 10-px, textMuted.

### 6.5 Hosted window

**D-85 · What it is.** A window whose whole body (below the 35-px title bar, full width) is a
separately built program running live (§11). Default 880 × 560. Its title is the name the
program reports, or the application's title until the program has reported one. Hosted
windows of Documentation and 50 Birds have back/forward (D-61, D-134). Opening positions
are in D-121.

---

## 7. The dock

**D-86 · Placement.** The dock is centred horizontally at the bottom of the stage. Its
**plate** is 88 tall with its bottom 5.5 px above the stage's bottom (plate top at stage
height − 93.5), corner radius 27. The plate is as wide as the icon row plus 16 px on each
side, plus the minimized section when there is one (D-99). It stays centred as it widens.

**D-87 · Plate look.** Filled light `#FCFCFE`, dark `#2A2A30`, at **0.4 opacity** (the
wallpaper shows through; no blur). Over it, at full strength: an outer 1-px hairline (a
rounded rect inset 0.5, radius 26.5) light `rgba(112,124,148,0.22)`, dark `rgba(0,0,0,0.34)`;
and a top-lit inner rim, a 1.5-px stroke of a rounded rect inset 1.4 (radius 25.6) painted
with a vertical gradient — light `rgba(255,255,255,0.62)` at the top, `0.13` at 42 % down,
`0` at the bottom; dark `0.30`, `0.05`, `0`.

**D-88 · The icons.** Twelve icons in one row, in the roster order of §8, 16 px apart, the row
starting 16 px inside the plate. At rest each is 56 × 56, its bottom 16 px above the plate's
bottom (21.5 px above the stage bottom), so 16 px of plate shows above it.

**D-89 · An icon's look.** A rounded square (corner radius 0.23 × its edge), clipped, filled
with a vertical gradient from the application's first hue (top) to its second (bottom), with
either its text glyph (white `#FFFFFF`, semibold, at 0.42 × the edge, centred) or its drawn
face (§8). Over it, a glossy rim: a 1-px stroke of a rounded rect inset 0.5 (radius
0.23 × edge − 0.5), painted with a vertical gradient `rgba(255,255,255,0.42)` at the top,
`0.07` at 34 %, `0` at the bottom. When magnified, the whole icon scales smoothly — no
shimmer, no stepping of the glyph.

**D-90 · Magnification — the size-by-distance curve.** When the pointer is near the bottom of
the stage the dock swells under it like a lens. Each icon has a *resting centre* — its centre
with nothing magnified and no minimized section:
*cx₀ = stageW / 2 + (index − 5.5) × 72 − (minimized-section width) / 2*, where 72 is the pitch
(56 + 16) and 5.5 is the middle of 12 icons. While the dock is magnifying, an icon's size is
56 × **m(d)**, where d = |pointer x − cx₀| and m is piecewise linear between these points:

| d | 0 | 72 | 144 | 216 | ≥ 288 |
|---|---|---|---|---|---|
| m | 1.55 | 1.35 | 1.18 | 1.06 | 1.00 |

Distances are always to the *resting* centres, never to where magnified icons have moved. An
icon stays bottom-anchored, so it grows upward; the row is laid out with the real, magnified
widths, so neighbours are pushed aside and the plate stretches to hold them.

**D-91 · Where it magnifies.** The dock magnifies while the pointer is inside the browser
window and below the line 100 px above the stage's bottom. Once it is magnified, that line
rises to 132 px above the bottom (past a magnified icon's crest), so hovering the top of a
swollen icon does not collapse the dock under the pointer; it drops back to 100 px once the
dock has subsided. Moving above the line, or out of the browser window, ends the
magnification and every icon returns to 56.

**D-92 · How the swell moves.** Sizes follow the pointer continuously: as the pointer slides
along the dock the swell travels with it with no visible stepping and no lag beyond about one
frame, and when the pointer stops the sizes settle within about 120 ms with no visible
overshoot. Entering the band, the swell grows in from rest over about 120 ms rather than
snapping; leaving it, the dock subsides over about 120 ms. Each icon redirects smoothly
whenever the pointer moves mid-motion. (Exact definition: Appendix B, *dock magnification*; any implementation that produces the same motion is fine.)

**D-93 · Label pill.** Hovering an icon (no delay) shows its application's *label* in a pill
above it: one shape — a stadium body 22 tall (fully rounded ends) with a small triangle tail
under its centre, 7 tall on a 16-px base — filled light `rgba(242,242,246,0.88)`, dark
`rgba(46,46,51,0.9)`, outlined 1 px light `rgba(196,196,204,0.85)`, dark `rgba(0,0,0,0.35)`, no
shadow. Its text is 13-px, light `#1D1D1F`, dark `#F2F2F5`, centred in the body; the pill is
the text width + 26 wide. Every pill's top sits at the same height — 151.5 px above the stage
bottom, whatever the magnification — so pills never ride the swell. It disappears the moment
the pointer leaves the icon.

**D-94 · Running dot.** Under each running application's icon, a 4-px dot (radius 2) in the
text token, centred, 6 px below the icon. It does not bounce.

**D-95 · Launch bounce.** When an application is launched for the first time (D-116), its
icon bounces twice, like a ball: it rises 30 px, decelerating to a stop at the top (about
300 ms), falls back, accelerating until it lands (about 260 ms), then does it once more —
1.12 s in all. The bounce is not interrupted by the pointer or by magnification (the icon
bounces at whatever size it is). The running dot stays put; the pill, if shown, rides with the
icon. (Exact definition: Appendix B, *launch bounce*; any implementation that produces the same motion is fine.)

**D-96 · Clicking an icon.** (Also Enter or Space on a focused icon.) First, any open bar
menu closes. Then:
- if the application has normal (not About, not minimized) windows open, **all** of them come
  forward, keeping their order among themselves, and the topmost of them becomes the front
  window;
- else, if it has minimized windows, the one minimized last is restored (D-107);
- else, the application's launch action runs (D-115), opening from the icon (D-46).

**D-97 · Keyboard.** The icon row is one Tab stop; ←/→ move among the icons; Enter or Space
opens the focused one. Each icon's accessible name is its label.

**D-98 · Touch.** A tap is a click; nothing else.

### The minimized section

**D-99 · Divider and tiles.** While any window is minimized, the plate grows a section to the
right of the icons: 16 px after the last icon, a 1-px vertical divider 65 tall (its top 77 px
above the dock area's bottom, i.e. it spans the plate from 11.5 px below its top to 11.5 px above
its bottom), light `#00000042`, dark `#FFFFFF48`; then, starting 34 px after the last icon's
right edge, one tile per minimized window, 8 px apart. A tile's resting size fits the window's
shape so its longer side is **64** (e.g. an 880 × 560 window becomes 64 × 41), rounded to whole
pixels.

**D-100 · The section opens and closes smoothly.** The section's resting width is
34 − 8 + Σ(tile width + 8) (0 with no tiles). The plate widens to admit a tile and narrows when
one leaves, smoothly, in about 250 ms with no visible overshoot, redirecting without a jump if
another window is minimized or restored meanwhile; the whole dock stays centred as it does.
The divider fades in with the widening: its opacity is min(1, section width / 26). The section
is absent while its width is below 0.5. (Exact definition: Appendix B, *minimized section width*; any implementation that produces the same motion is fine.)

**D-101 · The thumbnail is the window.** The thing in the tile is the window itself, live,
scaled down — not a snapshot. Its content keeps updating (a hosted program keeps running).
It is centred vertically on the plate's centre line (49.5 px above the stage bottom) at rest,
with corners rounded 3.5 px (at thumbnail scale), and paints above the plate but below the
icons and the badges.

**D-102 · Tiles ride the swell.** Tiles magnify with the icons, by the same curve (D-90) about
their own resting centres, in the same band (D-91), following the pointer as smoothly as the
icons (settling within about 130 ms, no visible overshoot, no stepping). A magnified tile grows
rightward from its left edge (it never crosses the divider) and upward from a baseline 19 px
above the stage bottom: its centre is at 19 + 30.5 × m px above the stage bottom for
magnification m, and its size is m × its resting size. Neighbours are pushed right; the plate
widens by the extra width. (Exact definition: Appendix B, *tile magnification*; any implementation that produces the same motion is fine.)

**D-103 · Badge and pill.** Once the window has settled into its tile, the tile shows its
application's icon (D-89 art) as a **badge**, 20 × 20 at rest (× the tile's magnification),
its right edge 2 px inside the thumbnail's right edge (× m), its bottom on the 19-px baseline
(so a short, wide thumbnail's badge hangs below it). The badge appears only when the window has
landed — its visual width equals the tile's to within half a pixel — and vanishes the instant
a restore begins. Hovering a tile shows a pill (D-93) with the **window's** title (or the
application title for an untitled window), its top at the shared pill height. Clicking a tile
(its badge included) restores that window (D-107).

**D-104 · One icon everywhere.** Anywhere an application's icon appears — the dock, an
About box (96 px), the alert (64 px), a tile's badge (20 px) — it is the same art: the D-89
rounded square, gradient, rim and glyph or face, drawn at that size. The Calendar's face
carries the live date wherever it appears (D-113).


### Minimize and restore

**D-105 · Minimizing.** The yellow control (not on About boxes) minimizes a window:
1. the window is noted as minimized, with its label (its title, else its application's
   title) and its current size, and moves to the end of the stacking order — it gets the
   rightmost tile;
2. if it was the front window, there is now **no** front window (D-50);
3. it flies into its tile (D-106). The section widens to admit it (D-100).

**D-106 · The journey in.** The window flies into its tile in **260 ms**, starting slowly and
accelerating into the dock. From its first frame it paints in the dock (above the plate, below
the icons and badges). Everything moves together, in step: its top-left corner travels in a
straight line from its free position to its tile's top-left; its size shrinks to the tile's
(scaling about its own top-left corner); its corner radius goes from 10 to the thumbnail's
3.5 px (in dock pixels, × the tile's magnification); a tilt or egg scale fades to none. The tile
is live during the journey: if the dock swells or shifts, the window's destination moves with
it and the window follows without a jump. (Exact definition: Appendix B, *minimize journey*; any implementation that produces the same motion is fine.)

**D-107 · Restoring.** Clicking a tile, choosing the window from the Window menu, or
clicking its application's dock icon when it has no normal windows (D-96) restores it:
1. any open bar menu closes;
2. the window becomes the front window **at once** (shadow, lights, menu bar), though it is
   still in the dock;
3. the window flies from its tile back to where it was, at the size it was, in **260 ms**,
   fast at first and easing into place, about the same top-left pivot (the journey in, run
   backwards); its badge vanishes as it
   leaves; the tile keeps its place until the window is home;
4. on arrival it leaves the minimized order, rejoins the top of the normal windows, its tile
   is released (tiles to its right slide left; the section narrows, D-100) and it is
   activated again (D-49).

A minimize or restore started while the other journey is under way stops that one and runs
from where the window is; a restore requested while one is already running is ignored.
A minimized window cannot be minimized again. (Exact definition of the flight home: Appendix
B, *restore journey*; any implementation that produces the same motion is fine.)

**D-108 · Bringing a window forward, from anywhere.** Whenever the desktop brings a
particular window forward — the Window menu, a link a hosted program follows (D-135), a
document sent to the Documentation window (D-122) — a minimized window is restored (D-107)
and any other window is activated (D-49).

**D-109 · Closing a minimized window.** A minimized window can be closed only by its
application's Quit: it stays at its thumbnail size where it sits for the 200 ms of its close,
then vanishes; its tile goes, and the section narrows. After a window has once been minimized, its later close zoom pivots on its own
top-left corner unless it has an origin view still on screen (D-47).

---

## 8. Applications

**D-110 · The roster.** The dock shows twelve applications, in this order. Hues are the icon's
gradient, top → bottom. *Kind*: **built-in** applications open windows of the desktop itself;
**hosted** applications run a separately built program in a window (§11); **inert**
applications are not included and show the alert (§9).

| # | id | label (dock) | title (menus, About) | kind | hues | glyph / face |
|---|---|---|---|---|---|---|
| 1 | files | Files | Files | built-in, always running | `#59B0F6` → `#1D6FD1` | face: folder |
| 2 | markdown | Markdown | Markdown | built-in | `#8E7CE8` → `#5A46B8` | glyph "M↓" |
| 3 | viewer | Declare Viewer | Declare Viewer | hosted | `#2E6FE0` → `#12A594` | glyph "[  ]" (two spaces) |
| 4 | docs | Documentation | Declare Docs | hosted, back/forward | `#FFA94D` → `#F7811E` | face: open book |
| 5 | calendar | Calendar | Declare Calendar | hosted, cannot Open…, clears the dock | `#FFFFFF` → `#EFEFF2` | face: live date |
| 6 | jots | Jots | Jots | built-in | `#FCF4A7` → `#F3E27E` | face: note |
| 7 | birds | 50 Birds | 50 Birds | hosted, back/forward | `#66C95F` → `#2C9243` | face: bird |
| 8 | marketmap | Market Map | Market Map | hosted | `#1C1E22` → `#1C1E22` | face: treemap |
| 9 | tracker | Tracker | Tracker | hosted | `#8E7CF0` → `#5B45C9` | face: list |
| 10 | mail | Mail | Mail | inert, quip "Nope." | `#1E8CFB` → `#1667D9` | face: envelope |
| 11 | music | Music | Music | inert, quip "Nah." | `#FB5C74` → `#FA233B` | face: eighth note |
| 12 | terminal | Terminal | Terminal | inert, quip "Never." | `#3A3D44` → `#16171B` | face: prompt |

A thirteenth, **the desktop itself** — title "Declare Desktop", glyph "[  ]", hues `#4AA8E8` →
`#35C4B5` — is not in the dock; it is the subject of About Declare Desktop and the brand
menu's View & Edit Source, and its launch action is a new Files window.

**D-111 · Blurbs** (the About box's line), verbatim:
- Files — "Browses the live documentation model — every chapter, every element."
- Markdown — "Renders the real files, and reference pages synthesized from the model."
- Declare Viewer — "Reader, source, and live editor over any Declare program — here, hosted as
  an embedded app."
- Declare Docs — "The actual apps/docs — the guide and the reference — hosted as an embedded
  app."
- Declare Calendar — "The actual apps/calendar, running as an embedded child app in this
  window's island."
- Jots — "Small paper notes with their own window chrome — built into this program."
- 50 Birds — "The actual apps/birds — Audubon's plates as a field guide — hosted as an embedded
  app."
- Market Map — "The actual apps/marketmap — the S&P 500 as a treemap through the years — hosted
  as an embedded app."
- Tracker — "The actual apps/tracker — ten thousand issues to list, filter and edit — hosted as
  an embedded app."
- Mail, Music, Terminal — (they have no About box: they never become active).
- Declare Desktop — "A Mac desktop, declared. Windows, dock, and menus are views and records,
  all drawn — no bitmaps, no borrowed art."

(The six hosted slots keep the original applications' names, icons and blurbs; in this build
each runs the Handbook test program, §12.)

**D-112 · Faces**, each drawn in a 48 × 48 box scaled to the icon's edge, over the gradient
plate (all fills `#FFFFFF` unless stated):
- **Files** — folder: rounded rect (9, 13.5, 14 × 8, r 2) and (9, 16, 30 × 19, r 2.5) in
  `#D9E7FA`; over them (9, 20, 30 × 15, r 2.5) in white.
- **Docs** — open book: page block polygon (24, 16.5) (9.5, 14.5) (9.5, 35.5) (24, 38.5)
  (38.5, 35.5) (38.5, 14.5) in `#FCE3C4`; two white pages — left: from (23.4, 14.8) a quadratic
  curve (control 18, 11.4) to (11.5, 12), line to (11.5, 33.4), quadratic (control 18, 33) to
  (23.4, 36.2), closed; right: its mirror about x = 24.
- **Calendar** — white square (0, 0, 48 × 48); a red band `#FB4238` (0, 0, 48 × 13); the
  weekday, three capital letters ("WED"), white, bold 7.5-px, centred at (24, 7); the day of the
  month, `#1D1D1F`, 27-px regular, centred at (24, 31). It shows today and changes at midnight,
  wherever the icon appears (dock, badge, About box).
- **Jots** — a band `#F3DC49` (0, 0, 48 × 10); three ruled lines, 2-px `#E0CE66`: (8, 19)→(40, 19),
  (8, 27)→(40, 27), (8, 35)→(26, 35).
- **50 Birds** — a perched songbird facing right, one white silhouette: from the beak tip
  (41.5, 16.5) to (34.6, 13.4); cubic (33.2, 8.6) (26.4, 7.2) → (22.8, 10.8) [crown]; cubic
  (17.5, 15.8) (12.2, 25.4) → (8.5, 37) [back]; line to (16.2, 34.2) [tail notch]; cubic
  (21.5, 36.6) (28.4, 36.4) → (32.4, 32.2) [belly]; cubic (35.6, 28.8) (36.2, 23.6) → (34.9, 19.6)
  [breast]; close. An eye, a disc of radius 1.6 at (30.2, 14.6), and a folded wing, a 1.6-px
  round-capped stroke from (24.5, 18.5) quadratic (control 17.5, 22.5) to (14.8, 30.5) — both
  in the plate's first hue.
- **Market Map** — a treemap edge to edge: rectangles `#34C759` (0, 0, 27 × 30) and
  (27.8, 0, 20.2 × 13); `#C0352C` (0, 30.8, 15 × 17.2); `#248A3D` (15.8, 30.8, 11.2 × 17.2),
  (27.8, 24.8, 11 × 23.2), (39.6, 37, 8.4 × 11); `#FF453A` (27.8, 13.8, 20.2 × 10.2),
  (39.6, 24.8, 8.4 × 11.4); then over all a vertical gradient `rgba(255,255,255,0.16)` →
  `rgba(0,0,0,0.18)`.
- **Tracker** — three rows at y = 14, 24, 34: a dot of radius 3.2 at (13, y) — filled on the
  first row, a 1.6-px white ring on the others — and a bar, a rounded rect (20, y − 2, 20 × 4,
  r 2) (15 wide on the last row).
- **Mail** — a white rectangle (9, 15)–(39, 34) with a flap, a 1.6-px `#B9C6DB` stroke
  (9.5, 15.8) → (24, 26) → (38.5, 15.8).
- **Music** — an eighth note: a head, an ellipse at (19.4, 34.2) with radii 7 × 5.3 rotated
  −0.42 rad; a stem (23.4, 10, 3.8 × 23.6); a flag from (27.2, 10), cubic (28.6, 15.5)
  (36.8, 16.8) → (35.6, 27.5), cubic (35.2, 22.8) (31.2, 20.2) → (27.2, 19.6), closed.
- **Terminal** — a chevron, a 3-px round-capped, round-joined white stroke (12, 16) → (19, 23)
  → (12, 30); a cursor bar (23, 28.5, 12 × 3).
(The Calendar's face is D-113.)

**D-113 · The live date.** The Calendar face (D-112) reads the same clock as the menu bar
(D-17): the weekday and day change together with it.

**D-114 · The cascade counter.** One counter, starting at 0, counts window opens that cascade:
every New / launch / folder window / document / hosted window / About box adds one *before*
placing its window, and the window's position uses the new value *n* (the formulas in each
kind). The boot's welcome note does not count (the boot Files window is n = 1).

**D-115 · Launch actions** (what New, Open… for non-Files, and a dock click on an application
with nothing open do):

| application | launch |
|---|---|
| Files, Declare Desktop | a new Files window, no selection (closes About boxes) |
| Markdown | a Markdown viewer on `docs/declare.md` (first-launch rule, D-116) |
| Jots | a new note, "*A new note.*" (first-launch rule, D-116) |
| each hosted application | a new hosted window of its program (first-launch rule, D-116) |
| Mail, Music, Terminal | the alert (§9) |

Every launch of a built-in or hosted application also closes open About boxes.

**D-116 · First launch.** An application that is neither running nor already launching is
*launched* the first time it is opened: it is marked launching, its dock icon bounces (D-95),
and **900 ms** later it becomes running (its dot appears), and its window opens (mid-way through
the second bounce). Any later open of a running application is instant, with no bounce. If a
second open request arrives while it is still launching (a double-click on the icon), the window
opens immediately at that second request, and the pending delayed open is called off — one
window, not two. If the application is quit while launching, the launch is called off and no
window opens. Files is always running and never bounces; Jots is running from the boot.

**D-117 · Running is not window count.** Closing an application's last window leaves it
running — its dot stays lit, and its next open is instant. Only Quit ends it.

**D-118 · Quit.** Quit ⟨title⟩ (⌘Q) closes every window of the active application — its
normal windows, its minimized windows and its About boxes — each with its own close zoom, and
marks it not running (the dot goes out; the next open bounces again). Files has no Quit.

**D-119 · View & Edit Source.** Opens a new **Viewer** hosted window whose program is told,
as its *subject*, the address of the source file of the application in question: for the
brand menu, the desktop's own main source file; for the application menu, that of the active
application — the desktop's main source file for Files, Markdown and Jots, and the test
program's main source file (§12) for the six hosted applications. (It goes through the
Viewer's first launch like any hosted open, and opens with no origin.)

**D-120 · Opening About boxes.** About ⟨title⟩ opens that application's About box; About
Declare Desktop opens the desktop's. Each request opens a new box (several may be open).

**D-121 · Hosted window placement.** A hosted window opens at windows-layer
x = 110 + (n mod 5) × 30, y = 24 + (n mod 5) × 22, 880 × 560 — except **Calendar**, which clears
the dock: width = clamp(stage width − 80, 480, 920), height = clamp(stage height − 32 − 28 −
168, 420, 600), x = round((stage width − width) / 2), y = 28.

**D-122 · Places in Documentation.** Opening a library item that has a Documentation place
(D-72): if a Documentation window is open (the front-most one, if several; minimized or not),
it is sent to that place and brought forward (D-108); otherwise a new Documentation window
opens at that place, from the row or button pressed (first-launch rule, D-116).

---

## 9. The "not included" alert

**D-123 · When.** Clicking (or Enter/Space on) the dock icon of Mail, Music or Terminal shows
the alert for that application. It appears instantly (no animation) and nothing else opens.

**D-124 · Look.** Over the whole stage, above everything but the bar menus: a scrim
`#00000026` (15 % black). On it a panel 300 × 422, centred horizontally, its top at one third of
the leftover height ((stage height − 422) / 3); corner radius 20; fill menuFill (translucent,
no blur); a 1-px `#FFFFFF80` border; shadow (0, 16, 50, `#00000059`). In the panel, absolutely
placed:
- the application's icon (D-104), 64 × 64 at (118, 26);
- a **caution badge**, 30 × 30 at (162, 70), overlapping the icon's bottom-right: drawn in a
  48-unit box, a rounded triangle with corners (24, 5), (44, 41), (4, 41) and corner radius 6,
  filled with a vertical gradient `#FFD426` → `#F5B800` (y 3 → 43), over a white halo (the same
  triangle grown by 2.6 units with radius 7); an exclamation mark in `#3A2E00`: a bar
  (22, 17, 4 × 13) and a dot of radius 2.3 at (24, 34);
- the quip ("Nope.", "Nah.", "Never."), 15-px semibold, text, centred, at y = 112;
- the message **"Declare Desktop doesn't include Mail."** (with the application's title),
  12-px textMuted, centred, wrapping, in a 260-wide box at (20, 136);
- the picture `rick.jpeg` (§14.5), stretched to 256 × 160 at (22, 184), corner radius 10,
  clipped, with a 1-px border light `#0000002E`, dark `#FFFFFF2E`;
- an **OK** button (D-5) at x = 16, y = 376, width 268.

**D-125 · Behaviour.** The alert is modal to the pointer: every press on the scrim does
nothing, and nothing beneath can be pressed. OK dismisses it at once. It takes the keyboard
while it is up: focus moves onto OK, Tab and ⇧Tab stay on it, Enter or Space presses it, and
Escape dismisses it, as OK does; when it goes, focus returns to where it was. Its look does not
change with focus when it was opened by a click.

---

## 10. The keyboard

**D-126 · Global keys** (when the desktop has the keyboard):

| key | effect |
|---|---|
| ⌘K | Dark Mode / Light Mode (D-20) |
| ⌘N | New (the active application's launch action) |
| ⌘O | Open… (when enabled) |
| ⌘W | Close Window (when there is a front window) |
| ⌘Q | Quit the active application (not Files) |
| ⌘Z ⇧⌘Z ⌘X ⌘C ⌘V ⌘A | nothing (shown in the Edit menu, disabled) |
| ` | next wallpaper (D-13) |
| r / R | tilt all windows / level them (D-55) |
| s / S | scale all windows / reset (D-56) |
| Escape | closes the open menu, if any; nothing else |
| Tab / ⇧Tab | next / previous Tab stop (D-127) |
| F6 / ⇧F6 | next / previous region (D-127) |

The ⌘ shortcuts are the menu items' (D-32). When a hosted program has the keyboard, its own
keys come first and the desktop's ⌘ shortcuts are still reached by any ⌘ key it does not
take (D-136).

**D-127 · Tab and regions.** Tab reads the screen top to bottom: the menu bar (one stop,
D-27), then the windows from the front window back, then the dock's icon row (one stop,
D-97). Each window is a *region*: Tab enters it at the control that last had focus there
(else its first), Tab and ⇧Tab then cycle among that window's own controls, and **F6** / ⇧F6
(or Escape followed by Tab / ⇧Tab) move on to the next / previous region or stop. Moving focus
into a background window with the keyboard brings it to the front, as a click in it would. A Files list column
is one stop (D-74); the ‹ › arrows and the Open button are stops; a hosted program is one stop
holding the program's own focus.

**D-128 · The shortcut panel.** Holding ⌘ **alone** for **700 ms** shows a panel listing the
keyboard shortcuts in force where the focus is; releasing ⌘, pressing any other key, or pressing
the pointer hides it (a press before 700 ms means it never shows). Look: 340 wide, centred
horizontally, its top at max(52, (stage height − its height) / 2); padding 8 top, 18 sides, 14
bottom; corner radius 14; fill surface; shadow (0, 16, 50, `#00000059`). Content, top to bottom,
grouped: a **heading** row per group (28 tall, the group name in 11-px semibold textMuted, its
baseline 3 px above the row's bottom), then a **line** per shortcut (24 tall: the item's label,
13-px, text — textFaint if the shortcut is disabled — at the left; its key as the keyboard spells
it, 13-px textMuted, at the right). A group is the menu the shortcut sits in ("Declare", the
application title, "File", "Edit"), or for a hosted program's own shortcuts the name of that
program's set (§12: "Handbook"). Groups appear in the order their first shortcut does, nearest
to the focus first — so a hosted program's own shortcuts lead. Each key appears once (the
nearest declaration wins). The panel shows the state as the hold began.

---

## 11. Hosting a separately built program

The desktop runs other programs in its windows. A *program* is built separately — its own
code, its own build — and is identified by an **address** (a URL path, or a module path that
resolves to one). The desktop must be able to load any such program into a window at run
time, given only its address. In this build, the six hosted applications each name an address
(§12.1), and all six addresses run the one test program the builder also writes (§12). Iframes,
module federation, a dynamic import, a web component — the mechanism is the builder's; the
behaviours below are the requirement, and several of them (D-138) rule out a mechanism that
cannot let a program's popups extend past the window.

**D-129 · Mounting.** A hosted window mounts the program in its body, below the title bar, full
width and height, and the program fills that box and follows it live as the window is resized,
zoomed, shaded or minimized. Closing the window (or quitting) unmounts the program. Each window
is its own running instance: two windows of the same program do not share state.

**D-130 · Its name, upward.** The program reports a name; the window's title follows it live
(e.g. it changes as the program navigates). Until the program has reported one, the title is
the application's title.

**D-131 · Values, downward.** The window provides the program three named values, which it
reads at any time and which update live: **dark** (true while the desktop is in dark
appearance — flipping appearance re-themes every hosted program at once), **base** (the
application's home address, a string), and **subject** (the program the Viewer is asked to show,
D-119; empty otherwise).

**D-132 · Where it is, both ways.** The program has a *location* (a string naming the place it
shows; "" is its start). The window can start the program at a location, and can send it to a
location at any time; the program reports every change of its location (from its own links or
keys) back to the window.

**D-133 · Where the person was.** When the program leaves a location it reports its *departed
place* — how far each of its scrolling areas was scrolled — as an opaque value. Handed back
with a location, the program returns to that location *and* to those scroll positions once it
has laid out.

**D-134 · Back and forward.** A window whose application has back/forward (Documentation,
50 Birds) keeps a *trail* of stops, each {location, place}, and a current index (−1 at first;
both arrows disabled).
- When the program's location changes from *prev* to *now* — by the program's own navigation
  or by the desktop sending it somewhere — and the change was not caused by an arrow: drop the
  stops after the current one; if the trail is empty, add {prev, ""}; set the current (last)
  stop's place to the departed place; add {now, ""}; the current index is the last stop.
- **‹** (disabled at index ≤ 0) and **›** (disabled at the last stop) step the index by one and
  send the program to that stop's location *with its place*, so it returns to where the person
  had scrolled. When that arrival lands, the stop that was left records its departed place, and
  no stop is added.

**D-135 · Links out of the program.** The program may ask the desktop to open an address (a link
it follows that leads out of it, or a request to open something in a new window). Each request
carries the address, and, when the address names a program, that program and a location in it.
The desktop decides:
1. no program named → the browser follows the address (the desktop is left);
2. a window already running that program is open (the front-most, if several) → that window is
   sent to the location and brought forward (D-108);
3. one of the roster's hosted applications runs that program → a new window of that application,
   at that location (through its first launch, D-116);
4. otherwise, a new hosted window of that program belonging to the application whose window made
   the request, at the next cascade position (D-121's formula, 880 × 560), titled with the last
   segment of the address until the program reports a name.

**D-136 · The keyboard.** When a hosted window comes to the front, the program gets the keyboard,
and focus lands where the program last had it. While it has the keyboard: its own key handling
comes first; plain keys never reach the desktop (so r, s and ` do not touch the desktop); a ⌘
chord the program does not take goes on to the desktop's shortcuts (⌘W closes the window, ⌘N is
New, …); the desktop's ⌘K, ⌘Q etc. work as usual. The hold-⌘ panel (D-128) lists the program's
own shortcuts first, then the desktop's.

**D-137 · The pointer.** A press in the program's area of the front window goes to the program,
and (with a mouse) also keeps the window front. In a background window the first press only
activates (D-54); the program does not see it.

**D-138 · The program's popups.** Menus, popovers and dialogs the program opens appear in the
window's overlay layer (D-60): above the program, free to hang past the window's edges (kept on
the stage), and turned and scaled with the window under the eggs.

**D-139 · Live thumbnails.** A minimized hosted window keeps its program running and visibly
updating inside its dock tile (D-101).

---
## 12. The test program: Handbook

Write this small program separately from the desktop — its own source and its own build —
so that the desktop loads it only through §11's capability. It is deliberately plain; what it
exercises is the hosting.

### 12.1 Addresses

The six hosted applications each run Handbook at their own address, and provide it these
values (D-131):

| application | program address | base | subject |
|---|---|---|---|
| Declare Viewer | `hosted/viewer` | `hosted/viewer/` | (see D-119; empty unless opened by View & Edit Source — a Viewer opened from the dock gets the desktop's main source file) |
| Declare Docs | `hosted/docs` | `hosted/docs/` | "" |
| Declare Calendar | `hosted/calendar` | `hosted/calendar/` | "" |
| 50 Birds | `hosted/birds` | `hosted/birds/` | "" |
| Market Map | `hosted/marketmap` | `hosted/marketmap/` | "" |
| Tracker | `hosted/tracker` | `hosted/tracker/` | "" |

The same Handbook build may be served at all six addresses by any means. Two addresses name
the same program when they are equal after removing leading `./` and `../` segments and a file
extension. An address is resolved against the desktop's own address.

### 12.2 What Handbook shows

**D-140 · Places (its location).** "" — the **contents**; `chapter/<id>` — one of five chapters;
`source` — the subject's source text; any other location — such as the places the Files
library sends to the Documentation window (`guide/06-layout`, `reference/Button`, …) — a
*place page*. Handbook starts at the location the window gives it; with
none, at `source` if it was given a non-empty subject, else at the contents.

**D-141 · Its name** (reported up, D-130): "Handbook" on the contents; "Handbook — ⟨chapter
title⟩" on a chapter; "Handbook — Source" on the source page; "Handbook — ⟨location⟩" on a place page.

**D-142 · Look.** Its own surface fills the window body: light `#FFFFFF` with text `#1D1D1F`,
muted `#6E6E73`, links `#007AFF`, rules `#E5E5EA`; dark (when the provided *dark* is true)
`#232326`, text `#F2F2F7`, muted `#98989D`, links `#0A84FF`, rules `#3A3A3C`. It switches the
moment the desktop's appearance does. A **toolbar** 36 tall runs across the top (it does not
scroll), with a 1-px rule under it: at the left (12 px in) a "‹ Contents" link, hidden on the
contents page; at the right (12 px in) a **Text Size** button (13-px, 24 tall, corner radius 6,
1-px rule-coloured border, a "▾" after the label). Below the toolbar the page scrolls vertically,
with 24 px of padding all round; body text is 15 px by default with line height 1.5.

**D-143 · The Text Size menu.** Pressing Text Size opens a menu directly below the button
(4 px gap), right-aligned to it, in the window's overlay layer (D-138): three rows **Small**,
**Medium**, **Large**, one checked (they are one set; Medium at first), giving body text 13, 15
or 17 px. It uses the desktop's menu look (D-23 – D-26) and keyboard (D-28), closes on a pick,
Escape, or a press outside. It must be able to hang past the window's bottom edge: with the
window resized to its minimum height, the menu extends below the window.

**D-144 · Contents page.** "Handbook" (22-px semibold); a muted 12-px line **"Base: ⟨base⟩ ·
Subject: ⟨subject, or —⟩ · Appearance: ⟨Dark or Light⟩"**; then the five chapter titles as
links, one per line; then, only when the subject is non-empty, a **Source** link; then a heading
"Elsewhere" (13-px semibold muted) with two links:
- **Calendar’s handbook, at The Keyboard** — asks the desktop to open program `hosted/calendar`
  at `chapter/keyboard` (D-135);
- **An outside address** — asks the desktop to open `https://example.com/` (no program).

**D-145 · A chapter page.** The chapter title (22-px semibold); its paragraph (§12.3); a
heading "Notes"; a numbered list of forty lines, "Note 1 of ⟨title⟩." … "Note 40 of ⟨title⟩."
(enough that the page scrolls in any window); then a row of links: "← ⟨previous chapter
title⟩" (absent on the first), "⟨next chapter title⟩ →" (absent on the last), and **Open in
Documentation**, which asks the desktop to open program `hosted/docs` at this chapter's location.

**D-146 · Source page.** Fetches the subject address as text and shows it in 12-px monospace,
lines preserved, wrapping long lines; "Loading…" while it loads; "Could not load ⟨subject⟩."
if it fails. A **place page** shows the location string as its title (22-px semibold), a muted 12-px
line "The original's documentation app shows this place here.", and the same forty numbered
lines as a chapter ("Note 1 of ⟨location⟩." …), so back/forward and scroll return work on it.

**D-147 · Navigation.** Following a contents, chapter, previous/next or "‹ Contents" link
changes Handbook's location internally (and reports it, D-132); each new page starts scrolled to
its top unless the window hands back a place (D-133, where the place is the page's scroll
offset).

**D-148 · Keys.** Handbook declares a shortcut set titled **"Handbook"**: **J** "Next Chapter"
(from the contents, the first chapter; nothing on the last), **K** "Previous Chapter" (from the
first chapter, the contents; nothing on the contents), and **⌘E** "Go to Contents". J and K are
plain keys; ⌘E is a chord the program takes. They appear in the hold-⌘ panel's "Handbook" group
first (D-128).

### 12.3 The chapters

| id | title | paragraph |
|---|---|---|
| `windows` | Windows | Every window can be dragged by its title bar, resized from any edge or corner, zoomed to fill the desktop and minimized into the dock. The window in front casts the deeper shadow, and the menu bar belongs to its application. |
| `dock` | The Dock | The dock magnifies under the pointer like a lens: the icon beneath it swells the most and its neighbours make room. Minimized windows wait at its right end as live thumbnails, wearing their application's badge. |
| `menus` | Menus | The menu bar follows the front window. Every item's shortcut works from anywhere, and a disabled item's shortcut does nothing. Menus open with a click and follow the pointer across the bar while one is open. |
| `keyboard` | The Keyboard | Tab moves from the menu bar to the windows to the dock. F6 moves between windows. Hold the command key for a moment to see every shortcut that applies where you are. |
| `hosting` | Programs in Windows | A window can run a program built separately. The program fills the window, follows its size, reports its name for the title bar, and opens its own menus past the window's edge. |

---

## 13. Appearance, size and access

**D-149 · Light and dark.** At first the desktop follows the operating system's light/dark
setting, live (changing it while the desktop is open changes the desktop). Choosing Dark Mode
or Light Mode (⌘K) switches to the other mode and locks it there: later system changes are
ignored until reload. The switch is instant everywhere, with no transition. It changes every
token of D-4 and every surface that names a light/dark pair: window frames, title bars,
unlit traffic lights, menus, Files, viewers, the About box, the alert's panel and picture border,
the shortcut panel, the dock's plate, rim, divider, pills and dots, and hosted programs (through
*dark*). It does **not** change the wallpaper, the menu bar's titles and clock (`#F2F2F5` always),
Jots (always yellow with dark ink), the application icons, or the lit traffic-light colours.

**D-150 · Resizing the browser.** Everything anchored to an edge re-derives at once: the menu
bar's width and the clock's right edge, the dock's centring and bottom seat, the wallpaper's
cover scale, the alert's centring, the shortcut panel's centring. Windows keep their positions
and sizes (a window may end up partly off the stage, clipped). Zoom, Calendar placement and
the welcome note's position use the stage size at the moment they are computed. Below the
800 × 600 floor see D-1.

**D-151 · Accessibility.** The menu bar is exposed as a menu bar; each title as a menu item
with its expanded state; the brand title is named "Declare"; open menus as menus, rows as
menu items (the Window menu's rows as radio-style items with their checked state; checked
items report it), dividers as separators. Each window is a dialog named by its title. The ‹ ›
buttons are named Back and Forward. Each dock icon is named by its label. Every interactive
element reachable by pointer is reachable by keyboard: menus (D-27, D-28), the dock (D-97),
Files (D-74), the ‹ › buttons, the Open and OK buttons, hosted programs (D-136).

**D-152 · No persistence.** Nothing survives a reload: windows, positions, appearance lock,
wallpaper seed and egg states all return to D-9/D-10.

---

## 14. Data

### 14.1 The library tree — `docs/declare-model.json`

The files of §14 are given at their repository paths (ASSETS.md) and are served under one
*site root* with those paths kept: the desktop's model at `docs/declare-model.json`, the guide
chapters at `docs/guide/…`, and so on. The desktop fetches `docs/declare-model.json` once at
startup (D-8). It is a large file (about 15 MB) with many top-level keys; the desktop reads only
its `browse` array:

```
{ "browse": [ Node, … ], …other keys, ignored… }
Node = { "name": string,              // shown in the row; unique among its siblings
         "subtitle": string,          // (not shown)
         "kind": string,              // "category" (a folder) | "doc" | "tenet" | "form" |
                                      //   "element" | "reference"
         "label"?: string,            // shown in the detail column: "Markdown file",
                                      //   "Guide chapter", "Tenet", "Language form", "Class",
                                      //   "Built-in element", "Page API", "Reference"
         "path"?: string,             // a Markdown file, relative to the site root
         "doc"?: string,              // inline Markdown, already assembled
         "loc"?: string,              // a place in the Documentation application
         "preview"?: string,          // plain text shown in the detail column
         "children"?: [ Node, … ] }   // non-empty ⇒ a folder
```

An item is a **folder** exactly when it has a non-empty `children`; every other item is a
document. Missing string fields count as "". The top level is five folders — **Language**,
**Guide**, **Reference**, **Vocabulary**, **Operational** — 27 folders in all and 212 documents,
at most three levels deep:

| where | items | fields |
|---|---|---|
| Language | The language (`docs/declare.md`), FAQ, Getting started — and a **Tenets** folder of 5 tenets | files: `path`; tenets: `doc` only |
| Guide ▸ 6 folders (Start here, Building, …) | 31 guide chapters | `path` **and** `loc` (`guide/<chapter>`) |
| Reference ▸ 15 folders (Language forms, Core, Text, Controls, …) | 150 forms and classes | `doc` **and** `loc` (`reference/<Name>`, `language/<form>`) |
| Vocabulary | 7 reference pages (Types and functions, Theme tokens, Enums, …) | `doc` only |
| Operational | 16 operational documents | `path` only |

So every kind of opening occurs: a guide chapter or a reference class opens in the
Documentation window at its `loc` (D-72); a tenet or a vocabulary page opens in a Markdown
viewer on its inline `doc`, titled with its name; a Language or Operational document opens in
a Markdown viewer on its file, titled with the file's name. "Open as Text" is enabled for the
items with a `path` (the files and the guide chapters) and disabled for the rest.

### 14.2 Markdown files

The 50 files the tree's `path` fields name (listed in ASSETS.md) are served at those paths
under the site root, and fetched there. The Markdown application's launch opens
`docs/declare.md` (D-115), titled "declare.md". Links inside these documents and inside inline
`doc` pages (many are written as `declare-docs:` addresses) are not specified: following one
need not do anything.

### 14.3 Sources served as text

The desktop's main source file and Handbook's main source file must each be fetchable as text
at the addresses the builder gives them as *subjects* (D-119), so the Viewer can show them.

### 14.4 The welcome note

The welcome note's text (D-9), Markdown, verbatim:

```
**Hello!** This is a working desktop — windows, menus, a dock — running entirely in your browser.

It's built with **Declare**, a new language for user interfaces. A Declare program doesn't script behavior; it states what the interface *is* — this note's yellow, that window's shadow — and the runtime keeps every relationship true while you interact.

**Try things.** Drag the windows. Open apps from the dock. Minimize something. Browse the language's documentation in the Documentation window.

**Curious how it's made?** Press the `[ ]` icon in the dock to read this desktop's own source.

**Never, ever, press the 'r' or 's' keys.**
```

(The `[ ]` icon is the Declare Viewer; from the dock it shows the desktop's main source, D-119.)

### 14.5 Assets you are given

- `apps/desktop/rick.jpeg` — 212 × 148 JPEG, the alert's picture (D-124), shown stretched to
  256 × 160.
- `docs/declare-model.json` — the library tree (§14.1).
- the 50 Markdown files of §14.2.

Everything else — every icon, the wallpaper, the window chrome, the dock — is drawn; there are
no other images.

---
## 15. Acceptance checks

Each check names the behaviours it exercises. Unless it says otherwise it starts from a fresh
load at 1280 × 800 in light appearance. *Visual* checks compare against the stated values
(colours exact; sizes ±1 px; durations and settle times ±15 %).

**Opening state**
- A-1 (D-9, D-10) Two windows: the welcome note behind, Files ("Documentation") in front at
  screen (118, 104), 560 × 400; the note at screen (790, 152), 400 × 385. Files and Jots show
  running dots; no other dot. The menu bar reads: brand mark, **Files**, File, Edit, Window,
  Help; the clock at the right.
- A-2 *Visual* (D-33 – D-36) Files has the front shadow, the gradient title bar, coloured
  lights; the note has the lighter shadow and a strip the colour of its paper.
- A-3 *Visual* (D-11, D-12) The wallpaper matches the seed-7 drawing; pressing ` changes it
  instantly; reloading returns seed 7.
- A-4 (D-17) The clock reads in the exact format and flips at the minute boundary.

**Menus**
- A-5 (D-21, D-23 – D-26) Click "File": its menu drops 4 px below the title, frosted,
  radius 13; New ⌘N, Open… ⌘O, divider, Close Window ⌘W; title capsule shown. Moving the
  pointer to "Edit" switches menus without a click; every Edit item is at 0.5 opacity.
- A-6 (D-22) With a menu open, clicking a dock icon both closes the menu and opens the app;
  clicking the open title closes it; Escape closes it.
- A-7 (D-27, D-28) Keyboard only: Tab to the bar, → to File, ↓ opens it, ↓↓ highlights Open…,
  → moves to the Edit menu, ← back, Escape closes and focus returns to the title. In the brand
  menu, typing "v" highlights View & Edit Source.
- A-8 (D-18, D-19, D-30) With Files front, the application menu has no Quit; with the note
  front, it reads About Jots / View & Edit Source / Quit Jots ⌘Q, and the Window menu lists
  "Jots" checked. Opening the Window menu and then clicking another window (pointer, with the
  menu open) moves the check live.
- A-9 (D-20, D-149) Brand ▸ Dark Mode switches to dark instantly; the item now reads Light
  Mode; changing the system setting afterwards does nothing.
- A-10 (D-29) The Help menu's search field accepts typing; its capsule, placeholder and
  magnifier match D-29; the "Files Help" row picks to nothing.
- A-11 (D-32) ⌘W closes the front window; with no front window ⌘W does nothing; with Calendar
  front ⌘O does nothing; with Files front ⌘Q does nothing; ⌘C in the Help field copies text
  normally.

**Windows**
- A-12 (D-38) Dragging the title bar moves the window exactly with the pointer; it cannot be
  dragged so its top goes above the menu bar or its left edge past stage width − 60 or before
  −200.
- A-13 (D-40 – D-42) Each of the 8 zones shows its cursor and resizes as stated; left/top drags
  keep the opposite edge fixed; Files stops at 340 × 120; grabbing 4 px outside the frame works,
  and 2 px inside the frame over a scrollbar resizes rather than scrolls.
- A-14 (D-44) Green zooms to (12, 8 below the bar) and stage − (24, 130); green again restores.
  No animation.
- A-15 (D-49, D-51, D-54) Clicking a background Files window's row only raises the window — no
  selection change; a second click selects. A mouse-down on a background title bar raises it
  immediately.
- A-16 (D-37) Clicking a background window's close control closes it without raising it first.
- A-17 (D-36) *Visual* Hovering the light block of an inactive window colours its lights and
  shows the ×, −, and triangle glyphs; hovering the rest of its title bar does not.
- A-18 (D-46, D-47) A Markdown window opened from the dock grows out of the Markdown icon
  (from 15 % to full in ~230 ms, fast then easing); closing it shrinks it back toward the icon
  in ~200 ms, accelerating, then it vanishes. A New Files window grows from 85 % about its centre.
- A-19 (D-50) Closing the front window leaves every window inactive and the menu bar showing
  Files.
- A-20 (D-55, D-56, D-57) r tilts every window with a wobble that settles within ~0.6 s; dragging
  and resizing a tilted window work along its edges; R levels; s/S likewise for scale. With a
  hosted window front, r does nothing to the desktop.

**Files**
- A-21 (D-8, D-62 – D-66) Once loaded, the first column lists Language, Guide, Reference,
  Vocabulary, Operational. Click Reference ▸ Controls ▸ Button: three list columns and a detail
  column (Button · "Class" · its preview · Open); the ancestors are highlighted in accent; the
  title reads "Button"; the strip glides (~440 ms later, over ~260 ms) to reveal the detail
  column.
- A-22 (D-67, D-71) A double-click (two clicks < 550 ms, < 6 px apart) on a document opens it;
  two clicks 600 ms apart do not; a double-click on Controls opens a folder window titled
  "Controls" with the Reference column at the left edge.
- A-23 (D-72) Opening Vocabulary ▸ Enums opens a Markdown viewer titled "Enums"; opening
  Language ▸ The language opens a viewer titled "declare.md"; opening a guide chapter or Button
  opens (or redirects) the Documentation window at that place (Handbook's place page,
  "Handbook — guide/…").
- A-24 (D-73) Right-click on a guide chapter: Open, Open as Text (enabled — it opens the chapter's
  file in a viewer); on Button: Open as Text is disabled; the row is ringed while the menu is up;
  a press outside closes the menu and that press has no other effect.
- A-25 (D-74) Keyboard: Tab into the first column; ↓ selects successive rows; → on Reference
  drills and selects Language forms; ← returns focus without changing the selection; Enter on a
  document opens it.
- A-26 (D-69) Dragging a column seam resizes that column between 150 and 460; deeper columns
  move with it.
- A-27 (D-75) ⌘O with a document selected opens it; with a folder selected opens a folder window.

**Viewer, Jot, About, Alert**
- A-28 *Visual* (D-78) declare.md (the Markdown dock icon): 48-px side margins, 560-px prose measure, code blocks full
  width in the tinted box with the teal bar, in both appearances; the text is selectable.
- A-29 (D-79) With `docs/declare.md` made unavailable, the viewer shows the failure line.
- A-30 *Visual* (D-80 – D-82) The welcome note: square, paper `#FEF49C`; when front, a `#FEEA3D`
  strip with the three widgets; collapse shades it to 12 px; zoom fills; close closes.
- A-31 (D-83, D-84, D-49) About Files opens a 280 × 380 box centred near the top, the Files icon
  at 96; clicking another window closes it with the close zoom; pressing the wallpaper closes it.
- A-32 (D-123 – D-125) Clicking Mail shows the alert with "Nope.", "Declare Desktop doesn't
  include Mail.", the picture and OK at the stated positions; presses on the scrim do nothing;
  OK dismisses.

**Dock**
- A-33 *Visual* (D-86 – D-89) At rest the plate is 880 × 88 with radius 27 at 40 % opacity and
  its rim; icons 56 px, 16 apart, with their faces as drawn.
- A-34 (D-90) With the pointer held still over the 4th icon's resting centre, the icon widths
  of icons 1–8 are 56 × (1.06, 1.18, 1.35, 1.55, 1.35, 1.18, 1.06, 1.00), and the plate is that much
  wider. (Sample after ~150 ms.)
- A-35 (D-91) Moving up out of the band collapses the dock; hovering the top of the magnified
  icon (between 100 and 132 px above the bottom) keeps it magnified.
- A-36 (D-92) Sliding across the dock, sizes change continuously with no visible stepping; on
  stopping they settle within ~120 ms without overshoot; leaving, they subside in ~120 ms.
- A-37 (D-93) Hovering an icon shows its pill at once at 151.5 px above the bottom, whatever
  the magnification; the pill matches the stated shape and colours.
- A-38 (D-95, D-116) Clicking 50 Birds: the icon bounces twice (rise ~300 ms decelerating, fall
  ~260 ms accelerating, 30 px); the window appears ~900 ms after the click; the dot appears then.
  A second open is instant.
- A-39 (D-116) Double-clicking Markdown's icon during its bounce opens exactly one window, at
  the second click.
- A-40 (D-96) With two Files windows behind a viewer, clicking the Files icon brings both forward
  in their order, the upper one front.

**Minimize and restore**
- A-41 (D-105, D-106) Minimize a 50 Birds window: it flies into a tile right of a fading-in
  divider in ~260 ms (slow start, accelerating), straightened and with 3.5-px corners; the plate
  widens smoothly (~250 ms); no window is front; the tile is 64 × 41 and shows a 20-px 50 Birds
  badge only once landed; hovering it shows "Handbook" (the window's title).
- A-42 (D-102) The tile magnifies with the icons, growing rightward and upward.
- A-43 (D-101, D-139) A minimized hosted window's content keeps updating (e.g. switching
  appearance re-themes the thumbnail).
- A-44 (D-107) Clicking the tile restores the window in ~260 ms (fast, easing), front from the
  first frame; tiles to its right then slide left. Clicking the tile again mid-flight has no
  further effect.
- A-45 (D-118, D-117) Closing the 50 Birds window leaves its dot lit; Quit 50 Birds (⌘Q)
  closes all its windows (minimized ones too) and the dot goes out; the next open bounces.

**Hosting**
- A-46 (D-129, D-130, D-141) Opening Documentation shows Handbook filling the body below the
  title bar; the title reads "Handbook"; following a chapter link changes it to "Handbook — …";
  resizing the window reflows Handbook live.
- A-47 (D-131, D-142) Switching appearance re-themes every open Handbook instantly; the contents
  line reads "Appearance: Dark".
- A-48 (D-134, D-133) In Documentation: open "The Dock", scroll halfway, open "Menus" via its
  link; ‹ returns to The Dock at the same scroll position; › returns to Menus; with one stop,
  both arrows are disabled at the start.
- A-49 (D-135) From Viewer's Handbook contents, "Calendar’s handbook, at The Keyboard" opens a
  Calendar window (clear-dock placement, D-121) at that chapter; clicking it again with the
  Calendar window open sends that window there and brings it forward; "An outside address"
  navigates the browser away.
- A-50 (D-136, D-148, D-128) With a Handbook window front: J/K change chapters; r does nothing
  to the desktop; ⌘E goes to contents; ⌘W closes the window; holding ⌘ 700 ms shows the panel
  with the "Handbook" group first, then Declare, the application, File, Edit.
- A-51 (D-138, D-143) Shrink a Handbook window to its minimum height and open Text Size: the menu
  extends past the window's bottom edge, fully visible; with the window tilted (r) the menu is
  tilted with it.
- A-52 (D-54, D-137) A click in a background Handbook window's content only raises it; the link
  under the pointer is not followed.
- A-53 (D-119) Brand ▸ View & Edit Source opens a Viewer window starting at Handbook's Source
  page showing the desktop's main source text.

**Keyboard and access**
- A-54 (D-127) From a fresh load, Tab goes: the menu bar, then into the front window (Files),
  then F6 to the welcome note's region, then the dock; ←/→ move among icons; Enter opens.
- A-55 (D-7) *Visual* Keyboard focus shows a 3.5-px accent ring that flies between controls;
  clicking hides it.
- A-56 (D-128) Holding ⌘ alone 700 ms shows the panel styled as stated; any other key hides it.
- A-57 (D-151) A screen-reader tree shows the menu bar, windows as dialogs named by title,
  dock icons named by label, Back/Forward names.

**Size**
- A-58 (D-1, D-150) At 700 × 500 the stage stays 800 × 600 and the page pans; widening the
  browser re-centres the dock and moves the clock without moving any window.

---

## Appendix B — How the original does it (for reference, not required)

These are the techniques the original implementation used for the motions specified above.
They are recorded so the numbers in the brief can be traced; **no build is required to use
them**, and any technique that produces the specified observable motion is equally correct.
Springs are given as stiffness / damping with mass 1.

| motion | original technique |
|---|---|
| focus ring flight (D-7) | springs on position (220 / 16), size (220 / 18), radius and rotation (220 / 20); opacity spring 90 / 20 |
| window open (D-46) | timed, 230 ms, cubic-out (1 − (1 − t)³) |
| window close (D-47) | timed, 200 ms, cubic-in (t³) |
| tilt and egg scale (D-55, D-56) | one spring per window, 160 / 14 (rest thresholds 0.01° and 0.002) |
| Files reveal glide (D-70) | scroll animation, 260 ms, cubic-out |
| dock magnification (D-90 – D-92) | each icon's size on its own spring toward the curve value, 1300 / 62, rest 0.002; the band's in/out as an instant 0/1 factor in the icon target; a second, smoothed copy of that factor on a spring 3600 / 120 for the tiles and the band hysteresis |
| tile magnification (D-102) | pointer x smoothed by a spring 1300 / 62 (rest 0.5), and the smoothed band factor |
| launch bounce (D-95) | four timed legs: 0 → 30 (300 ms, quad-out), 30 → 0 (260 ms, quad-in), twice |
| minimized section width (D-100) | spring 380 / 34, rest 0.5 |
| minimize journey (D-106) | one 0 → 1 blend value, timed 260 ms cubic-in, which every geometric property interpolates by |
| restore journey (D-107) | the same blend, 1 → 0, 260 ms cubic-out |
| menus and overlays | appear and vanish with no motion |

---

## Delivering it

Write it idiomatically, following the platform's established practices, as code that other
people will read and maintain. Use the ecosystem's established libraries where one fits — a
Markdown renderer, for example — as a maintainer would expect.

Two programs: the desktop, and Handbook (§12), built separately and loaded by the desktop
only through the hosting capability of §11. There is no server of your own beyond serving
static files; the desktop and Handbook, `docs/declare-model.json`, the 50 Markdown files, the
two source files (§14.3) and `rick.jpeg` are all served as files.

Check your work in a real browser, at a desk-sized window and in both appearances. The
automated checks of §15 will drive the desktop by pointer and keyboard and read what is on
screen; they find things by what they say and by their accessible names and roles.
