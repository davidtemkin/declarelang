# Type-driven controls — what sizes a control, and where the theme stops

**Status: research and direction, not a design ruling.** Written 2026-09-22 at DT's request,
to be picked up before any library work. It records why the question came up, what Declare
has today, how other platforms answer it (with sources), and the direction that research
points to. The open questions at the end are DT's to rule on.

---

## 1. How the question came up

The homepage's phone navigation sheet ran off the bottom of the screen. It is a hand-built
panel, not a `Menu`, and it had neither a height cap nor a scrolling body (fixed in place:
the panel now caps at the room below the header and scrolls). Asking why it was not a
`Menu` exposed that **`Menu` is barely themeable**:

- its label is `fontSize = 13` and its key column `12`, hard-coded — the theme has no menu
  text size;
- it has one highlight (`menuHl`) and no pressed state;
- its panel outline and its dividers both read `theme.line`, so neither changes alone;
- its hierarchy is cascading submenus, with no flat indented rows;
- its rows pick an id and cannot be real links.

The first four are token gaps. But making type variable raises the larger question DT put:
if a theme can choose the menu's face and size, then **row height, the key column, and even
icon size ought to follow the type** — and the same logic reaches `Button`, `Segmented`,
`Field`, `Checkbox`, `Tooltip`, `Dialog`. Is that how anyone does it, or do the geometric
tokens simply have to be kept in step with the type by hand?

## 2. What Declare has today

**Font metrics, as reactive facts.** A `Text` exposes `ascent`, `descent`, `capHeight`,
`xHeight` and `baseline`, measured from the effective font (not read from tables).
`measureText(text, style)` measures a run. Both re-derive when the face changes.

**Uses of them — for position, never for size.** `TextLabel` cap-centres its ink from
`baseline` and `capHeight`. `Menu` measures its label and key columns with `measureText`,
at the hard-coded 13 and 12.

**A text-style type.** `TextStyle` (face, size, weight, …) exists as a record, from the
fonts-as-objects work, and the face is a provided value.

**The theme holds type only as scattered per-component sizes** — `tooltipSize`,
`dialogTitleSize`, `dialogBodySize`, `checkboxSize` — **and geometry as fixed numbers** —
`buttonHeight` 28 (Cupertino) / 40 (Mountain View) / 32 (Redmond), `menuRow` 24. No theme
names a face or a style. The consistency between a preset's type and its geometry is kept
by its author, by hand: Mountain View has 40px buttons *and* a 22pt dialog title because
someone set both.

**There is no user text-scale fact.** Nothing in the language corresponds to Dynamic Type or
Windows' "Make text bigger".

## 3. How other systems answer it

| system | the developer chooses | the system supplies | a control's size comes from |
|---|---|---|---|
| **macOS (AppKit)** | a size class: regular, small, mini, large ([NSControl.ControlSize](https://developer.apple.com/documentation/appkit/nscontrol/controlsize)) | the font *for* that class ([systemFontSize(for:)](https://developer.apple.com/documentation/appkit/nsfont/systemfontsize(for:))) | a fixed height per class — the class drives the font, not the reverse |
| **iOS / SwiftUI** | a text *role* (`.body`, `.headline`, …) and at most a `controlSize` hint, which "just conveys intention" ([Fleeting Pixels](https://fleetingpixels.com/articles/2022/control-size/)) | the font per role, scaled by the user's Dynamic Type setting — 12 sizes, 7 standard and 5 accessibility ([guide](https://medium.com/design-bootcamp/a-product-designers-guide-to-dynamic-type-in-ios-a105dda39a95)) | measured content plus padding, the padding itself scaled with text ([UIFontMetrics](https://developer.apple.com/documentation/uikit/uifontmetrics), [scaledValue(for:)](https://developer.apple.com/documentation/uikit/uifontmetrics/2877387-scaledvalue), [@ScaledMetric](https://www.avanderlee.com/swiftui/scaledmetric-dynamic-type-support/)) |
| **Material 3 (Compose, Flutter)** | a role (`labelLarge`) and a density | the type scale; a *minimum* height; a touch-target floor | content plus padding, never below the minimum — Flutter's M3 button: `minimumSize` 64×40, horizontal padding 24 that falls to 12 and then 6 as the font grows past 14 and 28 ([ElevatedButton.defaultStyleOf](https://api.flutter.dev/flutter/material/ElevatedButton/defaultStyleOf.html), [ButtonStyle.minimumSize](https://api.flutter.dev/flutter/material/ButtonStyle/minimumSize.html)); density takes about 4dp off height ([Material density](https://m3.material.io/foundations/layout/grids-spacing/density)) |
| **Windows (WinUI)** | nothing, or a density dictionary (standard / compact) | theme resources — `ControlContentThemeFontSize`, `ControlHeight`, … — that density swaps as a coordinated set ([compact sizing](https://help.syncfusion.com/winui/common/compact-sizing)) | auto-sizing. The user's text size (100–225%) scales **text only**; "controls and containers must also resize and reflow", and "hard-coded control heights" are named as what breaks ([Text scaling](https://learn.microsoft.com/en-us/windows/apps/design/input/text-scaling)) |
| **Qt** | little | the style's margins and pixel metrics | measured text (`fontMetrics`) handed to `style()->sizeFromContents`, which adds the style's chrome ([QPushButton source](https://dreamswork.github.io/qt4/qpushbutton_8cpp_source.html), [QStyle](https://doc.qt.io/qt-5/qstyle.html)) |
| **GTK / CSS** | CSS | the theme's `min-height` and padding ([Adwaita menu heights](https://mail.gnome.org/archives/commits-list/2016-February/msg05549.html)) | content plus padding, with a minimum |

## 4. Where they draw the line

1. **Nobody exposes free metrics.** The developer picks a *role* or a *class* — body, label
   large, a small control, compact — never a point size for a control's text. The platform
   owns the font per role; the user owns the scale.
2. **A control is its measured content plus padding, with a floor.** Heights are *minimums*
   content can exceed. macOS is the exception — fixed heights per class — and is also the
   platform with the weakest user text scaling.
3. **The sync problem is solved by bundling, not by deriving from metrics.** Density and
   size classes swap a *coordinated set* of values (WinUI's compact dictionary, Material
   density, AppKit's control sizes). Nobody computes a row height from the font's ascent and
   descent; they measure the content and add padding.
4. **User text scaling is what forces it.** Once text can grow to 225%, a fixed height
   breaks, so controls must be content-driven — and something has to give when text grows:
   Flutter shrinks padding, iOS scales it, Windows reflows.
5. **Icons split.** Apple ties SF Symbols to the text style, so they scale with type;
   Windows advises *not* scaling font-based icons with text.

## 5. The direction this points to

Less than full derivation from font metrics — what everyone ships, and simpler:

- **Roles in the theme.** A theme names text *roles* — `menuText`, `buttonText`,
  `tooltipText`, … — as `TextStyle` records, replacing the scattered per-component sizes.
- **Content-driven sizes with floors.** A control sizes to its measured label plus the
  theme's padding; today's `buttonHeight` and `menuRow` become *minimums*.
- **Density as a coordinated set.** One setting moves padding and minimums together, so a
  preset cannot drift out of step with itself.
- **Pinnable numbers.** An explicit number still wins, so a preset that must reproduce a
  platform's measurements exactly (Cupertino's menu rows) can pin them rather than hope a
  formula lands on them.
- **A user text-scale fact**, if accessibility scaling is wanted — the thing that makes the
  rest necessary rather than nice.

The `Menu` token pass sketched in conversation becomes this work's first consumer rather
than a standalone fix: `menuText` (and a key style), `menuPressed` defaulting to `menuHl`,
`menuStroke` and `menuDivider` defaulting to `line`, and two record fields — `indent`
(flat hierarchy, one tap) and `link` (the row becomes a real anchor while `picked(id)` still
fires: the handler runs, then the link is followed; the crawl reads live `link` values off
the settled tree). With those, the homepage's navigation sheet can be a `Menu`: 44px rows,
16pt medium text, no outline, a pressed tint, link and indent records, and a scrim composed
from the theme's existing `scrimColor` / `scrimOpacity`, shown by the menu's own `shown`.

## 6. Open questions for DT

1. **Which model?** Roles, content-driven sizes and floors (iOS, Material, Windows) — the
   expected default for a web-first, cross-platform language — or macOS's fixed heights per
   class, which only the Cupertino preset would need and which it could keep by pinning.
2. **A user text-scale fact** — in scope, or later?
3. **Icons** — scale with the text role (Apple), or stay put (Windows)?
4. **Scope of the first pass** — `Menu` alone, or `Menu`, `Button` and `Segmented` together,
   so the pattern is proven on more than one component before the presets are re-expressed?
5. **Calibration** — each preset re-expressed as roles, padding and floors must reproduce its
   current measurements; is a visual diff per preset the acceptance test?
