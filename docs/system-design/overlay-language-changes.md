# Overlay build — changes to the base language, for review

Every change the overlay build (planes.md §16) makes to the language or the runtime's
semantics, kept here for review after the fact. The rule: minimize them, and when a
library-level answer exists, use it instead. Library classes and docs are not listed.

## From the design (planes.md, ruled before the build)

| Change | Where | Step |
|---|---|---|
| `focusScope = none \| stop \| capture \| region \| modal`; `focusTrap` and `escapeFocus` removed | schema.ts, view.ts, focus.ts | 1 |
| `Focus.focusIn(v)`, `Focus.nextRegion(dir)`; F6 / Shift-F6; Enter enters a region; Esc closes an entered member | focus.ts, scaffold.ts | 1 |
| Keys an open overlay uses (Esc, Enter, arrows) reach only `Keys` members inside it | keys.ts | 1 |
| `paintsIn = { view }` — paint parent apart from the logical one; `travelWith` now writes it (retire in step 6) | view.ts, interaction.ts, layout.ts | 2 |
| `outsidePress`, `scrollBelow`, `onOutsidePress` | schema.ts, outside.ts, input.ts | 3 |

## Made during the build — not in the design text

1. **`defaultPlacement` places views only.** A subclass's or use site's non-view members
   (Spring, Animator, State, Keys, Dataset, Node) stay on the instance instead of going into
   the placement target. Before, `class DeskWindow extends Window [ tiltSpring: Spring
   [ attribute = tiltA ] ]` drove the *content pane's* `tiltA` — silently nothing — once
   `Window` named `content` its placement; every Dialog/Sheet/Popover subclass with a
   member of its own had the same trap. The checker already resolved such members against
   the instance, so this brings the runtime in line with it. `runtime/src/instantiate.ts`
   (`into`). **Ruled 2026-10-16: kept.**
2. **Blocking is per context.** `outsidePress = block` and `scrollBelow = block` hold back
   input only inside the overlay's context — the nearest `focusScope = region` above where
   it paints, else the program (a window-modal sheet). `dismiss` stays global.
   `runtime/src/outside.ts`.
3. **An overlay's keyboard claim holds only while focus is not in another context**, and
   `Keys.claimant()` (new static) names the overlay the keys go to now; the library's Esc
   and Enter use it. `runtime/src/keys.ts`, `services.ts`, `scaffold.ts`, `effects.ts`.
4. **`Focus.holds(v)`** (new static): is focus on `v` or inside it, crossing from a
   hosted program's root to its island. The library `Window.holdsFocus()` walked
   `parent` only, so with focus on a control of a program hosted in the window it
   said no, and a press in the window called `Focus.focusIn` on it. Declare has no
   other way across an island (`$hostIsland` is internal). `runtime/src/focus.ts`,
   `scaffold.ts`, `capabilities.ts`. Alternative: expose the island crossing some
   other way, or leave a hosted program's focus invisible to the host.
5. *(documentation only)* `View.rootTransform().rotation` is in radians; the reference did
   not say. No behavior change.

6. **`overlays` — a provided name that makes a context** (library convention, step 3–4):
   a view that declares `overlays: View? = { … }` makes every `Floating` below it open in
   that view — the library `Window` provides its `layer`. Works by name, as `provided`
   does; undocumented for programs until step 8.
7. **`View.transformTo(other)`** (new method, step 5): the similarity from this view's
   frame to another's, crossing islands (a hosted program's root frame is its island's
   frame; an oversized tenant's panning inside its box is not counted). How a hosted
   program's overlay is placed against its host's layer. `runtime/src/interaction.ts`
   (`outerAffine`, `transformBetween`), `view.ts`, `scaffold.ts`, prose `View.md`.
8. **An `AppIsland` passes the overlay layer down by default** (step 5, DT discussion
   2026-10-15): its program's overlays open in the nearest `overlays` up the whole chain —
   the island's own ancestors, then its host's host — and take the program's scale and turn
   relative to that layer (`Floating.baseScale`/`baseRotation`; `Sheet` and full-window
   presentations keep the window's). No context above: they stay in the program, as before.
   `AppIsland.containOverlays = true` keeps them in the box. The runtime adds `overlays` to
   the island's provides when the island declares `containOverlays` (= an `AppIsland`) and
   it is false; `islandProvision` falls through to the island's own program's host value for
   that one name. Not a security boundary (a hosted program runs in the host's realm and
   could already draw anywhere); a design choice the island can reverse.
9. **A hosted program's presence in its host ends when its island unlinks**: its views
   painting in host layers come home, its open overlays and keyboard claims go
   (`withdrawPaintGuests`, `withdrawOpen`, `Keys.releaseProgram`, run first in
   `linkIslandTenant`'s undo). A torn-down claimant or open overlay is also dropped where
   they are read.

10. **`View.travelWith()` removed** (step 6, as ruled in §16 step 2): `paintsIn` replaces it.
    Its two callers were library-only (`api: false`): `FocusRing` writes `paintsIn` to the
    scroller it rides, and `DataGrid`'s header declares `paintsIn = { classroot.parent }`
    (its `escaped` member and the deferred retry are gone). The backend seam's surface
    `travelWith` stays — `paintsIn` is built on it.
11. **Focus reveal is the focus service's own** (step 6, §14): Tab scrolls each scroller
    that carries the focused view, innermost first, by the least that shows it with ring
    room — passing over scrollers it ignores the scroll of, ending at a modal scope, and
    waiting out a user's scroll. Replaces native `scrollIntoView` for focus (which walked
    to the document). The DOM backend focuses a native field with `preventScroll`.
12. **The App's overlay layer ignores scroll** (`OverlayStrata.ignoreScroll`): overlays stay
    in the viewport of an App that scrolls as a document.
13. **The ring rides only a scroller that overflows**, and draws inset where the scroller it
    rides would cut it off (§14 room at the clip); it shows for focus inside the overlay that
    holds the keys (a dialog's own controls), standing down only for what lies behind.

14. **Shortcuts as declared data** (step 7, §9). New library class `Shortcuts` (a `Node`:
    `items` of `{ id, key, label, enabled }`, `on`, `title`, `picked(id)`), registering with
    the new `Keys.declareShortcuts`. A key press first looks for a declared shortcut, from the
    focused view outward through islands into hosts, nearest first; one found takes the key —
    it is **not also delivered to `Keys` members**, and the browser's default for the chord is
    stopped. Not while an overlay holds the keyboard; a key with no command modifier not while
    a text field has focus (a typed symbol's Shift is implied: `"?"` matches ⇧/). `MenuBar`
    declares its items' `key:` for its whole program. New `Keys.shortcutsInForce()` (the
    resolved set, for a panel) and `Keys` member event `onCommandHeld(on)` (the command key
    held alone ~0.7 s — every program hears it). `runtime/src/keys.ts` (`comboOf`,
    `normalizeCombo`), `services.ts` (`focusChain`, `typing`), `schema.ts`, `sources.ts`,
    `scaffold.ts`, `capabilities.ts`; prose `Keys.md`; `library/shortcuts.declare`,
    `menubar.declare`. The desktop's own `keyRegistry` and ⌘ dispatch are gone; it gains the
    hold-⌘ panel.

15. **Reveal lands clear of pinned chrome** (focus stress page, §14). A scroller's children
    that ignore its scroll, are visible, take the pointer and stand against an edge — a
    header bar, a footer, a side rail, under half the frame — cover that edge: Tab reveals a
    control past them, not under them (CSS's `scroll-padding`, read from the tree rather
    than written). An overlay stratum (full-frame, `pointerEvents = "none"`) is not chrome.
    `focus.ts` `pinnedEdges`. Only focus reveal: `View.scrollIntoView()` is unchanged (its
    DOM path is native).
16. **`FocusGeometry.homeRot`** (new field on the shared interface): the focused view's turn
    in its home scroller's content space, in degrees. When it is not 0, `homeX`/`homeY` are
    the turned box's origin corner and `homeW`/`homeH` its own scaled size (they were the
    upright bounds); unturned, nothing changes. The ring uses it to ring a tilted window
    turned. `focus.ts`, `scaffold.ts`.
17. **The ring stacks beneath the page's pinned chrome** over a control in the scrolled
    content (above it for a control in the chrome or an overlay): a control scrolled under a
    toolbar takes its ring under too. `FocusRing.restack()`; riding a pane, the pane's
    pinned chrome paints over the ring on every backend (the DOM pane's sticky frame now
    lifts above a paint guest, `zIndex` 2).
18. **`FocusGeometry.scroller` skips a scroller across its pinned chrome**: a control in a
    pane's `ignoreScroll` header is not carried by that pane's scroll, so its geometry names
    the next scroller out (the page), and `homeX`/`homeY` are given there. Before, the ring
    rode the pane's scrolled content at the header's frame position: once the pane had
    scrolled, it sat out of view and under the header (stress page §6, Outer 7 → Header
    button: focus there, no ring). `focus.ts` (the follower's scroller walk). With it, in
    the library only, the ring's outline holds to the visible frame of the scroller it
    rides, so the arrival overshoot flattens at a pane's edge instead of being clipped
    (`FocusRing.draw`; no surface change).
19. **`Focus.focus()` from a key's handler is keyboard focus.** It used to clear keyboard
    modality always (the pointer/programmatic path). Now, called while a key is being
    dispatched (`Keys.inKeyDispatch()`, internal), it sets keyboard modality instead — the
    web's `:focus-visible` rule for script focus during keyboard use. Every group control
    that roves with `Focus.focus` from its arrow handler (`Segmented`, `RadioGroup`,
    `MenuBar` titles) used to snap the ring to the next member and fade it out, as if
    clicked (sampler page switch, Cupertino). `keys.ts` (dispatch depth around
    `keyDown`/`keyUp`), `focus.ts` (`focus()`, `deliverKeys` hands the focus service its
    key service). A pointer press or code run outside a key handler is unchanged.
20. **Every library look value is a theme token** (library vocabulary, no language
    surface). An audit found no per-theme logic in any class, but found look values that
    were literals or borrowed another part's token. Each now reads an optional token whose
    default is the old literal, so a theme that does not set it looks as before:
    - roles that collided (one token, two parts): `trackFill` (segmented, slider and
      progress tracks, switch off, gauge rail; default `control`), `segmentedSelectedFill`
      (the pill; default `surface`), `switchThumbFill` and `sliderThumbFill` (default `surface`),
      `accordionHeaderFill` (default `control`), `segmentDividerColor` (new: dividers
      between unselected segments; none by default);
    - overlay chrome: `dialogCornerRadius`, `dialogShadow` (were borrowed from the menu's),
      `popoverCornerRadius`, `popoverShadow`, `sheetCornerRadius`, `sheetShadow`,
      `toastCornerRadius`, `toastShadow`, `toastFontSize`, `tooltipCornerRadius`,
      `dragShadow` (DataGrid's column ghost); Popover's scrim now reads `scrimOpacity` like
      Sheet and Dialog; Toast wears `tooltipStrokeColor` and Tooltip's fallbacks;
    - metrics: `segmentedHeight`, `segmentedCornerRadius`, `segmentedFontSize`,
      `menuFontSize`, `menuKeyFontSize`, `menuHighlightCornerRadius`, `menuBarHeight`,
      `menuBarFontSize`, `menuBarTitleCornerRadius`, `accordionHeaderHeight`,
      `accordionFontSize`, `comboboxHeight`, `gridRowHeight`, `gridHeaderHeight`,
      `gridFontSize`, `gridHeaderFontSize`, `gridCellCornerRadius`, `radioSize`,
      `progressBarHeight`, `sliderTrackHeight`.
    Two changes of look: `Gauge` drops its fixed colours for `accent` / `trackFill` /
    `textMuted` and the theme's corner radius, and DataGrid's select cell hovers with
    `controlHovered`/`controlPressed` (it borrowed `control`). Presets: Cupertino sets the
    Mac's grey well, white pill, dividers, and light switch and slider knobs in dark; every dark record
    sets `segmentedSelectedFill` lighter than its track (the pill was darker than the track
    in all four). Library-only; `docs/declare-model.json`'s theme-token table is measured
    from the sources. Still literals by intent: structural geometry (2px insets, the
    slider's thumb arithmetic, row margins, the sheet grabber), and the platform apps'
    (inspector) own palettes, which are programs, not library classes.
21. *(withdrawn)* An `App.regionKey` attribute was added and removed the same day (DT
    2026-10-16): the region key stays **F6, fixed**, accepting that some browsers take it.
    Making it configurable waits for the conventions record, a provided record parallel to
    `theme` (`docs/system-design/conventions-record.md`). No surface change remains.

### After the design assessment (2026-10-16)

An independent assessment (`~/Desktop/declare-overlay-design-assessment.md`) and an audit of
the last evals' findings (`my-apps/evalaudit/STATUS.md`) led to these.

22. **Focus inside the overlay that holds the keys keeps them.** Design step 1 withheld an open
    overlay's keys (Enter, Space, the arrows, Home/End, Page keys) from the focused view
    always — right for a menu, which roves while focus stays on its opener, but every control
    *inside* a popover, sheet or dialog went deaf (the guide's own popover slider). Now the keys
    are withheld only when focus is outside the claimant. `focus.ts` (`deliverKeys`,
    `focusInClaimant`). With it, in the library: a dialog's Return picks the default only when
    the focused view does not take Return itself (a control presses itself; a multi-line field
    types the break) — `Dialog.returnTaken()`.
23. **A modal overlay's dismissal keeps to its context** (revises #2). A press in another
    window used to close a sheet open on its window — and be swallowed. A `focusScope = modal`
    overlay with `outsidePress`/`scrollBelow = dismiss` now lets a press or scroll outside its
    context go on, and stays. A menu still closes on a press anywhere. `outside.ts`.
24. **A text field keeps its editing chords** (revises #14): while a field has focus, ⌘A,
    ⌘C/X/V, ⌘Z, ⇧⌘Z, ⌘Y and the caret's ⌘/⌥ arrow moves stay the field's, whatever a program
    declares (the Mac's first-responder order). Other ⌘ shortcuts still fire from a field.
    `keys.ts` (`FIELD_CHORDS`).
25. **Esc then Tab leaves a region** — Shift-Tab back — beside F6 (the way out every browser
    leaves to the page; CodeMirror's rule). An Esc with nothing open to close arms it; any other
    key but a lone modifier disarms it. Esc alone still never leaves a region. `focus.ts`.
26. **`focused` is every view's fact, and `Focus.getFocus()` is a tracked read.** A read-only,
    reactive `View.focused` (a cell per view that is read); `Control` and `Editor` lose their own
    `focused` (Control's was library-written in `onFocus`/`onBlur`). A constraint over
    `Focus.getFocus()` follows focus. `view.ts` (`noteFocused`), `focus.ts`, `schema.ts`,
    `text-input.ts`, `control.declare`; prose View, Focus, Editor, Control.
27. **`TextInput`: the selection's read half, Return-to-send, and growth.**
    `selectionStart`/`selectionEnd` (read-only; reported by every backend — `edit-selection.ts`
    for DOM and canvas, a selection observer in the Mac host); `enterSubmits` (a multi-line
    field whose Return fires `enter`, Shift-Return the break; DOM, canvas, Mac); and a field's
    `contentHeight` is its text's, so the ordinary cap `height = { Math.min(contentHeight, 120) }`
    is a field that grows, then scrolls. The IME composing range is not exposed.
28. **A provided theme is laid over the library's defaults.** `library/themes/defaults.declare`
    (`theme ThemeDefaults`, not a preset) holds every optional token's default; the runtime
    fills a provided theme from it (`themes.ts withThemeDefaults`, at `provideWrite`), so a
    library read carries no fallback — the 80 `typeof provided("theme").x == "number" ? … : n`
    reads are gone; a token whose default is another token reads `a ?? b`. Presets are served
    filled; a preset lowered into a program stays as authored. Look changes: Popover's scrim
    0.30 → 0.32 (the others' value); `AppearanceSwitch` reads its own `appearanceSwitchSize`
    (32) where it borrowed `buttonHeight`. Token table, `declare-help`, gen-themes updated.
29. **An overlay's `shown` can be state.** `Floating` delivers its opening and closing through
    `input(open)` (the value pattern), and does the open and close work when `shown` changes,
    whoever changed it — so `shown = { app.editing }, input(open: boolean) { app.editing = open }`
    opens and closes with the state, and Esc or a press past it writes the state back. With it,
    in the checker: **a use site that constrains an attribute its class's own `input(v)` writes
    (`shown`, a control's `value`) without an `input` override is a compile error naming the
    fix** — before, the first Esc, drag or pick failed at run time. `floating.declare`,
    `check.ts` (`checkControlledInput`).
30. **The library's records are typed.** `schema MenuItem`, `MenuBarMenu`, `DialogButton`,
    `Shortcut`; `Menu.items`, `MenuBar.menus`, `Dialog.buttons`, `Shortcuts.items` take them, so a
    misspelled field (`lable`) is a compile error. A schema cannot name itself, so `submenu` is
    `any`.
31. **A press on content that takes no focus clears focus** (2026-10-17, DT: "go with web
    rule"; keyboard-follows-focus.md §9). When nothing on the pressed view's chain can take
    focus, focus is cleared — the keyboard returns to the program pressed in — and the next
    Tab or Shift-Tab starts from the pressed spot, inside the cycle that holds it (a dialog's
    plain content keeps Tab in the dialog). A press on a control, or inside a focusable view,
    is unchanged. `focus.ts` (`pressAt`, `precedes`, the start point in `move`),
    `services.ts` (the router's press hook), `outside.ts` (`leafAcross` exported).
32. **A hold or a context menu goes to the nearest view that declares it** (2026-10-17;
    Murmur 7's "hold anywhere on the bubble"; DT: current behaviour was inconsistent with
    pinch). The pressed view used to take every gesture, so a child that took a tap blocked
    its ancestor's `onHold`. Now each of hold and the context gesture resolves up the hit
    chain to the nearest declarer, as pinch already did (`HitTarget.hold`, `.context`;
    `scene-walk.ts` for canvas and the Mac, `dom-backend.ts`), and a hold that went to an
    ancestor suppresses the release's click on the child. Nothing bubbles: each gesture is
    answered once, by one view. `input.ts`; guide 10, View prose.
33. **Focus fixes from the tab-order review** (2026-10-17):
    - the reveal frames the page App by the window (`hostWidth`/`hostHeight`), not its own
      content-tall size — Tab now scrolls a long page to the focused control (`frameExtent`);
    - focus moved by code shows the ring when the person's last input was the keyboard (the
      web's rule) — so an overlay giving focus back a turn after Esc keeps the ring (revises
      #19's "only while a key is being handled"); `Focus.lastInputKeyboard`;
    - focus does not stay on what can no longer be reached: the focused view hidden, made
      unfocusable or disabled, or dropped by an ancestor's `tabOrder()` clears focus after
      the settle, the next Tab starting from where it was (`Focus.reachable` watch);
    - Tab with an overlay holding the keys while focus is outside it (a menu) closes it, as
      Esc would, then moves;
    - an overlay that takes focus and holds nothing focusable focuses itself
      (`Floating.holdFocusItself`), so Tab cannot reach what is behind it;
    - `Combobox` is one Tab stop (its entry).
34. **In a `stop`, the arrows move among the members by default** (2026-10-17, DT: "yes";
    no `grid` — moving by position stays each program's own code, known right for its case).
    The base `onKeyDown` every view has: Right/Down to the next member, Left/Up to the
    previous, wrapping, Home/End to the ends; never with a modifier, never in a text field.
    A member takes the keys it wants and hands the rest to `super.onKeyDown(e)` — inheritance,
    not propagation: no ancestor's handler sees the key (declare.md rule 6 stands).
    `super.onKeyDown` now resolves on any view (`View` lists it among its runtime methods; the
    checker's scaffold makes it a required member). The default lives in the focus module
    (`setKeyDefaultHook`), so a program with no focus carries none of it. `Control` hands on
    what it does not take. `Segmented.roveFrom`, `RadioGroup.step` and `MenuBar.stepTitle`
    are gone (a radio still checks where the arrow lands; a segment that is a place is still
    followed). Programs: the desktop dock's own stepping removed; new stops for the tracker's
    status chips, weather's city lists, the birds quiz's choices and the marketmap's eras.
    The desktop's Files columns keep their own Up/Down (they select and do not wrap, as
    Finder's do).

Library behaviour settled alongside (no language surface): `Segmented`'s arrows wrap at
the ends, as `RadioGroup`'s do, and still move focus without selecting (a radio group
selects on the arrow — the web's, Windows' and ARIA's rule; a segmented control is the
Mac's, Space picks). `Accordion`'s pane drew its own focus edge besides the ring; the ring,
shaped to the header (`focusShape`), is now its only indicator. `Menu` has typeahead (2026-10-17):
letters typed while it has the keys move the highlight to the first row whose label starts
with them (the prefix grows while typing continues, the same letter again cycles, Return still
picks); `typeahead = false` turns it off, as `Combobox` does for its list, whose letters are its
field's. Only menus: a group control's few members gain little from it.

## Accessibility (accessibility.md, ruled 2026-10-18)

| Change | Where |
|---|---|
| On View: `accessibilityRole` (a closed vocabulary, fixed for the view's life), `accessibilityLabel`, `accessibilityHint`, `accessibilityLive`, and the contract members `accessibilityValue`, `…Min`, `…Max`, `…Step`, `…ValueText`, `…Checked`, `…Pressed`, `…Selected`, `…Level` — every default null or a string, off the kernel block | schema.ts, view.ts, a11y-vocab.ts |
| A role is a contract the compiler checks (DECLARE2006); a `{ }` role is refused (DECLARE2007); a role written after the view is built throws; a role `createView` passes is checked as the view is created | a11y-roles.ts, compiler/a11y-check.ts, view.ts, instantiate.ts |
| Warnings: a Control with no role (DECLARE4016), a role that needs a name with none (DECLARE4017), a drawn focusable view with no role (DECLARE4018) — not in merged library source, not under `accessibility = false` | compiler/a11y-check.ts, diagnostics.ts |
| The semantic tree (`semanticTree`, `formatSemantics`), `__declare.semantics()`, `declare-look --semantics` | semantics.ts, inspect.ts, tools/look.mjs |
| A class body's `accessibility…` facts are the class's defaults (a literal) or live defaults (a `{ }`), not per-instance constraints | instantiate.ts (`synthesize`) |
| The `accessibility` flag (default true): off, the compiler removes every `accessibility…` member after checking, the warnings are skipped, and `__DECLARE_ACCESSIBILITY__` drops the layer from the build | flags.ts, compile.ts, declarec.mjs, server/create.mjs, build-flags.d.ts |
| `methods` the roles call: `accessibilityIncrement()` / `accessibilityDecrement()` (a `slider` must define them; Control's arrow keys call them), `accessibilityShowMenu()` | library/control.declare, a11y-roles.ts |
| Contrast (WCAG AA) in San Francisco: light `textMuted` `#6C7A88` → `#596570`; dark `accent` `#4C8DFF` → `#2F6FE0`, with hover and pressed now stepping darker (`#2B68D8`, `#2762D0`) so white labels keep 4.5:1; both menu highlights `gradient(#306FE6, #2563D6)` | library/themes/sanfrancisco.declare, themes-data.ts (generated) |
| A theme token `linkColor` (optional, no default: a reader falls back to `accent`): the blue of links on the page, which in a dark theme must be lighter than the accent behind white labels. Rich text's links read it. San Francisco sets `#2062D6` light, `#4C8DFF` dark | rich-text.ts, prose/RichText.md |
| Programs: readable text moved off `textFaint` (left for decoration and disabled) onto `textMuted` in sampler, tracker, calendar, desktop; slight darkenings of their own muted tones in docs and birds, the tracker's tag hues, and the guide's done-task grey. The homepage and Market Map palettes are unchanged (DT) | apps/…, docs/guide/01, docs/briefs |
| `TabBar` (library/tabbar.declare): a `Segmented` that is heard as tabs (role `tabList`, each segment a `SegmentedTab` with `tab` and `accessibilitySelected`), with a `Segmented`'s keys: the arrows move among the tabs and Space or Enter picks, so a pane changes only when asked. `Segmented` itself no longer follows a linked choice on the arrow; Enter follows it, as a link. No panel class: a pane is the program's own view, `accessibilityRole = tabPanel` with its tab's label. Its own file and its own rows, so a program with a `Segmented` and no tabs carries none of it. The sampler's page switch and the docs' Guide/Reference switch are `TabBar`s | library/tabbar.declare, segmented.declare, apps/sampler, apps/docs, guide 08 |
| New library controls, each in its own file (a program pays only for those it names): `Disclosure`; `Stepper` (role `spinButton`); `Toolbar`, `ToolButton`, `ToolbarDivider`; `Breadcrumb`, `Crumb`, `CrumbLink`, `CrumbHere`; `Tree`, `TreeRow`; `Splitter` (a focusable `separator` with a value); `DatePicker`, `MonthCalendar`, `CalendarDay`, `CalendarArrow`. `Window` now has a frame by default — surface, title bar, close button (`WindowClose`), dragging, `resizable`, Esc, `open`/`input`, brought forward when pressed — and `frame = false` is the bare window it was (Desktop's `DeskWindow` sets it; its `title` is now Window's). Its role is `dialog` named by `title`, where it was `group`. Shown on the sampler's More page | library/*.declare, autoincludes.json, apps/sampler, guide 08 |
| Role `spinButton` (ARIA `spinbutton`): value, min, max, increment/decrement; Control's Up and Down step it. A `separator` may carry a value and range, and takes increment/decrement as actions where it has them (`mayMethods` in a contract: actions that are not required) | a11y-vocab.ts, a11y-roles.ts, semantics(-dom).ts, control.declare |
| `accessibilityPosInSet`, `accessibilitySetSize` on View: an item's place among its siblings, over the one its replication gives — a tree's rows, replicated flat | schema.ts, view.ts, semantics(-dom).ts, prose/View.md |
| The semantic tree reads as the browser does: no text inside a role whose content is presentation (button, checkbox, tab, slider, …); no text that only repeats a node's value; a place ("2 of 4") only on the roles that have one. A heading with no level says level 2 on the DOM | semantics.ts, semantics-dom.ts |
| Library names now taken by the new controls: a program's own class may not reuse one. Two in this tree did and were renamed: lzx-calendar's `Stepper` → `Nudger`; the guide's and brief's custom-control example `Stepper` → `Counter` | apps/lzx-calendar, docs/guide/17, docs/briefs/your-own-control.md, library/control.declare |
| `Control` is a `button` by default: a control is something pressed, and says so with no word from the program. A control that is something else names its own role. The compile warning for a Control with no role (DECLARE4016) is gone with it | library/control.declare, compiler/src/a11y-check.ts, runtime/src/diagnostics.ts |
| A wordless control takes its name from its `tooltipLabel`, else from a named mark it shows: `CloseIcon` is "Close", `PlusIcon` is "Add". Words always win, so "Add" beside a plus is "Add". The no-name warning (DECLARE4017) accepts a tip or a named mark | semantics.ts (`contentOf`, `nameOfContent`), semantics-dom.ts, library/icons/core.declare, a11y-check.ts |
| A view faded to opacity 0 is not read: pruned from the semantic tree, and `aria-hidden` on its element while it is at 0 (written at the crossing only). Opacity stays paint for input, as ruled | semantics.ts, dom-backend.ts (`setFaded`) |
| The role contracts no longer ship: the semantic tree keeps three small role sets (named by content, pressed, stepped), a test holds them to the contracts, and `createView`'s contract check is a development check. **Size** | semantics.ts, instantiate.ts, test/accessibility.test.mjs |
| **In main too.** The Themes preset table ships only the presets a program names (a subset capability, like the schema table); the cutter reads a table wrapped in `Object.freeze`. Calendar: −2.1 KB gzip | compiler/src/capabilities.ts |
| Apps: no `accessibilityRole = button` remains in any app; the weather and marketmap labels that repeated a tooltip are gone; the calendar's `Ev` is a `Control` with its action in `press()` (it was a view with pointer handlers and its own Enter key) | apps/* |

Also built: `Accessibility.announce`, `accessibilityExpanded` (ruled), `App.language`,
`firstVisibleRow` / `lastVisibleRow`, `SearchField`. Not yet built: `accessibilitySettings`,
`ignoreReduceMotion` (phase 4).

## Flags (2026-10-18)

| Change | Where |
|---|---|
| One registry for all three surfaces: `name=value` in a program's `defaultFlags`, a URL and `declarec`, with the same names and values; booleans are `true`/`false`. Removed: `--canvas`, bare `--crawler`, `--no-<name>`, `--render canvas`, bare `?crawler`, `=1`/`=0` | runtime/src/flags.ts, compiler/src/flags.ts, parser.ts, declarec.mjs |
| `declarec` refuses a switch it does not know | tools/declarec.mjs |
| `render=mac` and the `?program` request removed (the Mac host compiles on device; nothing asked for either) | flags.ts, reqtypes.ts, server/create.mjs, mac-host |
| A production program no longer carries its `defaultFlags` (spent at build) | tools/declarec.mjs |
| **Not accessibility; merge with the rest.** The sizes report: `declarec --sizes` (text; `--json` for the report alone) and the dev server's `?sizes` request (JSON, cached while the program's files are unchanged). The parts are measured (program, runtime, kernel, page); every file says how it came in (`include`, auto-included for a tag and named where, provided); declarations are weighed by what removing each would save; modules carry their capability and reason. A compile now records how each file came in (`Compiled.sources`). The Viewer presents it in a Sizes tab, `?viewer=sizes` (request `sizes-tab`): the total and its parts as one bar, every file with how it came in and a link to the reader, every runtime module with its reason, the stand-ins, what is left out and what is fetched beside. The tab switch now fits between the brand and the right-hand controls, and the type-size stepper steps aside below 520px. Below 520px the tabs are a menu opened from a button naming the tab; the header's line counts wrap beneath the filename, phrase by phrase; the include page's "Edit …" line is a link (built from its location, as a segment's is) rather than an `onClick` writing `app.location`. The Sizes tab's files are two folds, Program (the program's own files) and Library, and the runtime a third, shut by default, each line summing its fold (`Disclosure.detail`, new: a summary at the line's right end) on a band of its own. New library control `TextSizeSwitch` (a `Segmented` of three reading sizes, its A's drawn by `TextSizeIcon` and `TextSmall/Medium/LargeIcon`) replaces the hand-made A buttons in the Viewer and docs; three presets in place of the old 0.1 steps; a sampler specimen, a guide row, demos | tools/declarec.mjs, compiler/src/compile.ts, runtime/src/include.ts, compiler/src/reqtypes.ts, server/create.mjs, server/toolchain*.mjs, browser/mac-boot.js, service-worker.js, library/platform-apps/viewer/viewer.declare (and its baselines), test/reader-flow.test.mjs, docs/operational/building.md, dev-server.md, requests.md, assemble.mjs |

## Programs changed (for review with the merge)

- **`apps/desktop`**: `DeskWindow extends Window` (step 4); the dock is one Tab stop; a Files
  row context menu in the window's layer; minimized windows `paintsIn` the dock's parked
  layer (step 2); **the tracker replaces the Write placeholder in the dock** (DT 2026-10-15,
  "for now"; `WriteApp` kept, out of the roster); the ⌘ registry and dispatch replaced by the
  menu bar's declared shortcuts, and a **hold-⌘ panel** (`ShortcutRow/Line/Head`); the Help
  menu's search is a `TextInput` that is the capsule.
- **`apps/tracker`**: its data resolves through `hostProvided("base")` (so it runs hosted);
  ⌘K and `/` are a `Shortcuts` set (the `typing` fact went with the hand-made guard); uses
  the library `Toast` (step 3).
- **`apps/docs`**: the search pill is the `TextInput` itself (§14 ring shape).
- **`skill/SKILL.md`** (and `.claude/skills/declare`): overlay row names every kind and the
  window; keyboard row names `Shortcuts`; drift check names the hand-built overlay and
  shortcuts as key-test chains. Guide 09 § Keyboard shortcuts, 18 § Overlays that belong to a
  window, 24 (the boundary is transparent) — neutral examples, nothing shaped like an eval.

## From the outside evaluation (2026-10-19)

| Change | Where |
|---|---|
| **Browser focus follows the runtime's through overlays.** The browser refuses focus to an element that is inert or not yet built, silently: an opener behind a closing modal, a dialog's button in the settle that opens it. Focus is applied again when a modal releases `inert`, and retried after the settle and for a few frames while the runtime's focus is still there. Dialog, Sheet and Popover hand focus back on Esc, by key or pointer; an alert opened from either has the browser's focus | runtime/src/semantics-dom.ts |
| **`accessibilityActiveItem`** (new, View): the item a composite's keys are on while the focus stays on the composite, written as `aria-activedescendant` and marked `active` in the semantic tree. A `Menu` now holds the focus while open (`takesFocus`, holding it itself, named by its opener, its own `onKeyDown` so a menu bar's group does not walk it) and names its highlighted row; a `Combobox`'s field names the suggestion; `Table` names its active row and `DataGrid` its active cell, each reported by the row or cell itself (`trackChanges`), so a recycled row takes itself back | runtime/src/view.ts, schema.ts, semantics.ts, semantics-dom.ts; library/menu.declare, combobox.declare, table.declare, datagrid.declare |
| `aria-selected` for `option` and `treeItem` | semantics-dom.ts |
| Tab in a menu holding the focus closes it and moves on from its opener (not for a modal that holds the focus itself, which keeps Tab); an overlay hands the focus back on close only if it has not gone somewhere since | runtime/src/focus.ts, library/floating.declare |
| **The keyboard's context menu**: Shift+F10 and the Menu key open the context menu of the focused view, or of the item it names, by a press at that point (the right-click's route); the browser's own menu for the key is not delivered twice | runtime/src/input.ts, focus.ts |
| A tip shows for keyboard focus as for hover; a tip that is not the name describes (`aria-description`, a `hint` in the tree) | runtime/src/view.ts, focus.ts, semantics.ts, semantics-dom.ts |
| Toast: its action is a Tab stop; held open while hovered or its action is focused, going 1.5 s after it is let go; announced once (`say`), no longer also a `status` region | library/toast.declare |
| Slider: Home, End, Page Up, Page Down | library/slider.declare |
| Popover is a `dialog` named by its opener (was a `group` with `aria-modal`); a Dialog is described by its `message` (`accessibilityHint`). `alertdialog` for `ask()`/`error()` is not done: a role is fixed for a view's lifetime, and both reuse one Dialog | library/popover.declare, dialog.declare |
| MenuBar: Right past a menu's own levels and Left at its top open the menu beside it (`Menu.sideways`, nothing by default) | library/menu.declare, menubar.declare |
| A separator taller than wide is `aria-orientation="vertical"`; a drawing's `<canvas>` is `aria-hidden` (its view says what it is) | semantics-dom.ts, dom-backend.ts |
| **`columnHeader`** (new role, named by content) and **`accessibilitySort`** (new: none, ascending, descending). A DataGrid's header row is a row of column headers stating their sort; Up from the first row goes into it, Left/Right move along it, Enter or Space sorts, Down returns (`inHeader`); the header the keys are on is outlined as the active cell is. Its edit and check cells' controls are named by their column; a field inside a container contributes its value to the container's name, not its label | a11y-vocab.ts, a11y-roles.ts, semantics*.ts, view.ts, schema.ts; library/datagrid.declare |
| The App's overlay layers are the window's size, not the App's, so an App that is a scrolling page opens its sheets and dialogs on screen (Cadence 14); an overlay's fallback frame is the window's, the App's headless | library/overlaystrata.declare, dialog/sheet/popover/toast.declare |
| DECLARE4017 counts a `label = ""` as no words | compiler/src/a11y-check.ts |
| DECLARE4017 judges a name by what the use site leaves it: a `label` left empty (a `Checkbox`, `Button`, `Radio`, `ToolButton` with none) is no words, though the class's caption shows it; an `accessibilityLabel` that reads an attribute left empty (`{ label }`, `{ provided("fieldLabel", "") \|\| placeholder }`), or is `""`, is no name; an icon a use site names (`iconLeft = "CloseIcon"`) is a named mark. A `TextInput` with no name, placeholder or `Field` is warned of. A class with a `label` is told to give one, or `accessibilityLabel` when its words are shown apart from it | compiler/src/a11y-check.ts, runtime/src/diagnostics.ts |
| DECLARE4020 (new warning): a control inside a control — a pressed or stepped role, or a field, inside another, written there or brought in by a plain view's class | compiler/src/a11y-check.ts, runtime/src/diagnostics.ts |
| DECLARE4021 (new warning): a view that clips its content to a size of 0 (a literal 0, or 0 as an arm of a choice) with no `visible`: what it hides is still read and reached | compiler/src/a11y-check.ts, runtime/src/diagnostics.ts |
| The accessibility warnings cover the program's own included files, not only its main file (only the class library is left out) | compiler/src/compile.ts (`inLibrary`) |
| A view faded to opacity 0 names nothing: a control's name from its content skips it, as the tree does | runtime/src/semantics.ts (`contentOf`) |
| **An icon is placed like any view**: `Icon` and `IconHost` no longer declare `y = center`, so one sits in a row whose layout centers its children (Murmur 9: a library icon in `SimpleLayout [ align = center ]` was refused). Every use that relied on it says `y = center` itself (81 uses; the icon reference demos use a centering row instead); nothing moved (the visual baselines hold) | library/icons/icon.declare; library/tree, button, viewer; apps/calendar, tracker, docs demos, games; docs/guide/17-your-own-views.md |
| `ask()` and `error()` stay `dialog`s: named by the title and described by the message, a listener hears both as one opens; `alertdialog` would need a role per open, against §12.3 | |
| **`App.accessibilitySettings`** (new): the person's preferences, fed live from the browser (`reduceMotion`, `increaseContrast`, `reduceTransparency`; `textScale` 1), read as `provided("accessibilitySettings")`. The motion system's automatic reduced motion (springs and TweenLayout landing at once) was built, measured with it forced on, and parked: see accessibility.md §8 | runtime/src/view.ts, schema.ts, boot.ts |
| **`accessibilityMultiselectable`** (new; listbox, grid, tree): `aria-multiselectable`; `Table`/`DataGrid` set it from `selects == "multi"` | view.ts, schema.ts, a11y-roles.ts, semantics*.ts; library/table.declare |
| A `Combobox`'s list is a `listbox` of `option`s: the Menu is made with the role at creation and `asList` (new, Menu), its rows showing an option view (selected by its record's new `selected`) in place of the menu item | library/menu.declare, combobox.declare |
| DECLARE5000 offers `<Program><Class>` (`CadenceSheet`) | runtime/src/include.ts, compiler/src/compile.ts |
| Apps: the sampler's grid is named "Tasks"; the two-way dial's slider "Hue" | apps/sampler, apps/two-way/dial.declare |
| Gzip, accessibility on: calendar 137,257 → 138,278 (+1,021; text `wrapWidth` included), tracker 154,766 → 156,321, weather 141,574 → 142,721. Raw runtime: semantics-dom +1,137, input +656, attributes +327 (the theme fix), focus +239, text +174 | |

## Teaching, from the evals (2026-10-19)

| Change | Where |
|---|---|
| `declare-help` prints a method's whole signature on its entry (`insert(path, index: number, v: unknown): void`), and an interface's inherited members (`WheelEvent` shows `deltaX`/`deltaY` from `PointerEvent`); `WheelEvent`'s description says the amount is `deltaX`/`deltaY` | tools/declare-help.mjs, compiler/src/scaffold.ts |
| `declare.md` §5: only a change notifies (an equal value wakes nothing; a new array or record is a change); a constraint or computed default is worked out once and kept, and re-derived only when what it reads changes | docs/declare.md |
| Spring: a spring built later (a row made when its data arrives) starts at its first target too | doc prose Spring.md |
| `flexes`: flexing children share the room equally; equal widths by arithmetic is a drift-check tell | guide 06-layout.md, skill/SKILL.md |
| The guide's `Swatch` example overrides `press()` at the use site instead of declaring an empty `picked()`; the empty pass-on method is a drift-check tell | guide 04-structure.md, skill/SKILL.md |
| A form in a sheet: a generic example (a new page, its address suggested by its title until edited, a taken address refused): the form is a class that `exists` while the sheet is open, so each opening starts fresh; a suggestion is a computed default, shown with `initial` | guide 14-data.md |

## Checking tools, from the evals (2026-10-19)

| Change | Where |
|---|---|
| A press in a check is a person's: a view below the fold is scrolled into sight first, and a press on a view something else covers fails, naming what it would reach (it used to land elsewhere in silence) — `drive.click`/`drag`/`wheel`, so `declare-look` too | tools/internal/verify-behave.mjs |
| A path step may name a view by what it says — its label, accessible name or text (`app.seg.Two`, quoted with a dot or a space: `app.menu."Save As…"`); a member's name and an index still come first | runtime/src/inspect.ts `find` |
| `declare-look`: `--call 'PATH.METHOD(ARGS)'`, `--set PATH.ATTR=VALUE`, `--read` past the view (`app.col.childViews.length`), and a run that goes well prints only what was asked for (the R1–R5 ladder only on failure) | tools/look.mjs |
| verify.md: the checks' virtual clock (a hold fires on `drive.wait`, not on real time), the whole `drive`/`expect` vocabulary in one table, and what the "statically wired" count means (information, not a task) | docs/operational/verify.md |
| `clip = { … }` checks: the slot's type in a body is `Shape \| boolean \| null`, as its bare literal always was (Murmur 9) | compiler/src/scaffold.ts, test/scaffold.test.mjs |
| Collections guide: a record whose `id` changes on screen is keyed on a `ref` of the client's own (`key = :ref`); a small fixed set is replicated from a literal `Dataset`, and a set where one is chosen is a one-stop group | guide 16-collections.md |
| A `datapath` to a fresh value stays refused (a cursor points into declared data, and rows' writes would land nowhere); DECLARE3006 and the runtime's refusal now both offer the derived form, `items: Dataset [ contents = { … } ]`, for records computed per view (Murmur 9 built one per row without being told) | runtime/src/diagnostics.ts, data.ts |
| `repeat = { Infinity }` documented as the way to loop for good, which `settleMotion` does not wait for (Murmur used a large finite count, which it does) | doc prose Animator.md |

## Text (2026-10-19)

| Change | Where |
|---|---|
| **`wrapWidth`** on `Text` and rich text: where a run with no width of its own wraps, and it then takes the width of its widest line (a chat bubble as wide as "ok", or as its longest line up to the limit). `Text`'s default is 0 (one line, as before); rich text's is 640, the reading measure it always had, now settable. A width given wins. Greedy wrapping at the widest line breaks where wrapping at `wrapWidth` did, so every renderer, wrapping at the box, draws the same lines. Murmur's bubbles needed `measureText` for this | runtime/src/text.ts, rich-text.ts, schema.ts, doc prose Text.md and RichText.md, guide 12-text.md, test/unit.test.mjs |
| Words that must not part ("3h 40m") use a no-break space: a sentence in 12-text.md. Cadence's shrink-the-figure workaround needed nothing more; no construct added | docs/guide/12-text.md |

## Text fields: what they hold (2026-10-19)

| Change | Where |
|---|---|
| **`purpose`** on `TextInput` (`text`, `name`, `email`, `username`, `password`, `newPassword`, `oneTimeCode`, `tel`, `url`, `digits`, `decimal`, `cardNumber`, `cardName`, `cardExpiry`, `cardCode`, `addressLine1`, `addressLine2`, `city`, `region`, `postalCode`, `country`): what the field holds, told to the platform as its `autocomplete` name (autofill, password managers), its `inputmode` (a phone's keyboard), capitalization, and no spell-check or autocorrection where they get in the way. WCAG's "identify input purpose". A commerce form had no way to say any of it | runtime/src/purpose.ts (the one table), text-input.ts, backend.ts, dom-backend.ts, canvas-backend.ts, mac-backend.ts, schema.ts; doc prose TextInput.md; guide 08-controls.md |
| **`concealed`** on `TextInput`: what is typed is hidden (`type = password`; the Mac host's `NSSecureTextField`). Follows `purpose` (`password`, `newPassword`) until set, so a "show password" control changes what shows and the field stays a password to a password manager. A concealed field's text is never in the semantic tree, nor in the name of what holds it | text-input.ts, semantics.ts, mac-host Overlays.swift; test/unit.test.mjs, accessibility-browser.test.mjs |
| Guide chapter **19, Accessibility** (the later chapters renumbered); the FAQ, guide 01 and 24, and SATOR-7 updated to match | docs/guide/19-accessibility.md, apps/homepage/declare-faq.md, docs/tenets/1 SATOR.md, skill/SKILL.md |

## Runtime bug fixes found on the way (no semantic change intended)

- **The focus ring stayed after a press on the control that had keyboard focus** (focus.ts): the press changed how focus was had, not where, so nothing told the ring. The focus service now tells its listeners when a press flips the keyboard modality on the same view. Test: accessibility-browser.

- **A spring whose target is no number ticked forever** (spring.ts): `Infinity − Infinity` never lands, so a NaN target — a size nothing has measured — kept the frame loop running and the focus ring chasing ±∞. It now sleeps where it is until a real target wakes it. Test: inspect.test.

- `input.ts`: a press with a mouse's secondary button (a right-click) fired `onClick` on the
  view under it as well as the context gesture. It fires no click now, as on the web; the
  raw `onPointerDown` still hears every button. Found probing #32.

- `compile.ts`: a `script` block whose last line ended in a `//` comment lost every name it
  declared — the bindings tail went on that line (the open-list must-fix, also in main).
  Transpiled script now drops comments. Regression test in script-block.test.

- `replicate.ts`: the reconcile attached earlier instances to the parent's stale stand-in
  surface when a later instance (one holding a `TextInput`) brought a deferred parent in
  mid-loop — the first DataGrid column never drew. Regression test in deferred-dom.test.
- `view.ts`: discarding a `paintsIn` guest wrote its constraint-bound `paintsIn`.
- `focus.ts`: the geometry follower was never kept (`this.follower = k` missing), so
  no focus change disposed the last one, and every view that had held focus went on
  pushing its geometry to the ring. **Main has the same bug** (254fad3f); there it
  makes the ring answer stale views. In the overlay, `paintsIn` re-arranging the
  ring's parent on each host change turned it into a settle that never closed
  (Tab through the tracker's header: "afterSettle re-armed"). `view.ts` now also
  re-arranges the parent only when the paint host really moved. Regression test in
  unit.test ("the view that lost focus pushes no more geometry").
- `browser/host-islands.js`: a DOM or canvas island discarded with its window never
  disposed the program it hosted, nor undid the link — **in main too** — so every closed
  desktop window left its program running (clocks, fetches), and, with step 5, its open
  menu holding the keyboard. Now `onDiscard(island)` undoes the link and disposes the app,
  as the Mac host already did on its island surface going (`mac-boot.js`). `onDiscard`
  is exported from `host-api.ts` for it.
- `canvas-backend.ts`: a surface coming home from a host it rode (`travelWith(null)`) was
  inserted at home but never removed from the host — painted twice. The focus ring left a
  ghost in a pane focus moved out of. **In main too.**
- `focusring.declare`: the ring snapped to a control whenever its geometry was delivered
  again for the same control — meant for a target that moves under a resting ring (a
  dragged thumb) — and the follower re-delivers as a focus change settles, so every Tab
  landed the ring instead of flying it. It snaps now only when the target really moved.
  Main has the same rule (`prev == g.view`). Regression test in focus-ring.test.
- `canvas-backend.ts`: the native field of a focused `TextInput` scrolled under a pinned bar
  painted over the bar (its overlay clip knew the scroller's box, not its frame chrome); it
  is now cut where the scroller's pinned chrome covers it, as paint is. **In main too.**
- `attributes.ts` / `bind.ts`: a view whose `theme = { { ...provided("theme"), … } }` extends the
  theme above it kept its first answer: once its provision existed, its own re-run read it
  ("its own provision is checked first") instead of the value above, so it never followed a
  light→dark change (declare.md §9 promises `provided(…)` walks up, never to itself). While a
  provision derives, a read of that name on that node now starts at the parent. Calendar
  +45 B gzip. **In main too.**
- `compile.ts`: the link registry's warnings were moved onto the author's files twice, so a
  line of the program was read as a line of the merged text and the warning named a library
  file (the Viewer's showed `library/control.declare:254`). Moved once now. **In main too.**
- `tools/declarec.mjs` `minifyBodies`: a method's parameters are `{ name, type }` now, and the
  wrapper joined them as strings (`function __d([object Object])`), which esbuild refused, so
  every method that takes a parameter kept its comments and indentation. The precompiled
  bundle minified them again, so a page's total was unaffected; island programs and the
  Inspector's program, which ship bodies as text, carried them. **In main too.**
- `dom-backend.ts`: moving an element blurs a focused field inside it, and the blur cleared
  Declare's focus — Tab in a dialog jumped to the page once a sibling re-ordered (the ring
  re-hosting). Moves now keep focus (`keepingFocus`), and a blur a move causes is not
  passed on.

## After the merge

- `scaffold.ts` (`shapeFieldTsType`): a schema field that is a list of words —
  `cargo[]: "flipper" | "pulsar" | "fuseball"` — was typed `"flipper" | "pulsar" |
  "fuseball"[]`, which TypeScript reads as one word or a list of the last. An item read
  from the list arrived as a plain string, and a bare word written to the list
  type-checked. The words are now bracketed, `("flipper" | "pulsar" | "fuseball")[]`;
  nothing else changes. A program that wrote a word where the list belongs now gets a
  DECLARE6001. The casts Tempest and Vortex needed for their tanker cargo are gone.
- `text.ts` (`$ownWidth`): a Text took any yielding rule on its width for its own
  auto-size, and a width constraint in a class body is yielding (a class's default place,
  which a layout may take over). So a Text whose class constrained its width never
  wrapped: the homepage's `BannerHead` and `BannerLead` ran off a phone's edge. The run
  now knows its own auto-size rule, and any other rule on its width is a width given it.
  Regression test in text.test.
