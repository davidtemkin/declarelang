# Declare Tracker — Design Review of the Merged Direction
**Base: Take B ("modern & expressive") with grafts from Take A ("calm density")**
Reviewed against rendered output at 1000px, 1280px, and 2200px, light and dark, with the inline editor, bulk bar, modal, and empty states exercised.

Files: `design-b-expressive.html` (base), `design-a-calm.html` (graft source). Line references are to those files.

---

## 1. Critique of the merged direction

### Header
- **The logo mark must go and hasn't.** B ships a 28px gradient squircle with a "D" glyph (`.mark`, B:65–69, 422–426) — a direct violation of the ruled convention (gradient "Declare" + plain "Tracker", no icon block). Its shadow is also hardcoded purple `rgba(74,58,167,.5)` in both themes.
- **The theme control is the wrong control.** B offers a two-state moon/sun toggle (B:449–453) and — worse — **never reads `prefers-color-scheme` at boot** (`color-scheme:light` on `:root`, no `matchMedia` anywhere in B's script). A user on a dark OS gets flashed with a light app. The ruling requires a three-way light/system/dark appearance control; neither take has one. A at least boots from the system preference (A:1064–1065).
- **The header monospace perf line is rejected and is also duplicated.** `.perf` (B:87–93, 439–441) must be deleted — but note the same monospace readout appears a second time in the rail hero (`.hero-perf`, B:299–302, 480). The rejection should kill both instances; the rail one gets rebuilt in A's quiet style (see grafts).
- **The scale gauge is a simulation control cosplaying as product UI.** It sits in the production header between the perf line and the theme toggle, explained only by a `title` attribute. The control itself is approved; its placement gives it the information scent of a real feature (page size? zoom?). It belongs in the rail next to the perf readout, where the demo apparatus lives together.
- **Seven items in one header row** (brand, search, perf, gauge, theme, New issue) is crowded at 1280 and will not survive the added appearance control. Removing the mark and the perf line, and relocating the gauge, pays for the three-way control exactly.
- Good: the live count in the search placeholder ("Search 10,230 issues…") is excellent scent — but it only updates on scale change, not on create/delete (B:966).

### Filter row
- **A dead CSS rule betrays a broken theming intent.** `.chip.on .sicon{color:var(--bg)!important}` (B:132) does nothing: `statusIcon()` bakes `stroke="var(--s-open)"` etc. inline (B:599–606) rather than using `currentColor`. On the black active chip you get a colored icon that was meant to invert. Refactor icons to `currentColor` so states can restyle them; this also unblocks any hover/pressed icon treatments.
- **No global "clear filters."** The only reset lives inside the empty state (B:691). With three filter species (status chips, assignee menu, label chips) plus search, an active-filter summary with a one-click clear belongs at the row's right end.
- **The Sort/Group controls read as static text.** `.ctl` is a borderless ghost with no chevron on "Group" (B:740); until hover there is zero affordance that these are menus/toggles. Sort at least has an icon.
- **Label chips are colorless.** A gave every label a stable hue dot (A:406–407); B's labels are uniform gray pills in both the filter row and rows. In a tracker, label color is identity — the merged design should carry A's hue dots into B's chips.
- Good: live counts inside status chips, derived from the current search/assignee/label basis, are the best information scent in the design. Keep them, and make them roll (see physics).

### List rows
- **Right-cluster anatomy fights wide screens.** The grid (B:174) anchors labels/priority/comments/avatar/time to the right edge. At the 1600px cap the list column is ~1280px; a short title leaves a ~500px dead zone between the title and its metadata, so the eye does a long saccade per row. The client's "unreadably wide rows" concern is only half-solved by the max-width cap. Fix: labels should hug the title (left-cluster, as GitHub does), leaving only fixed-width meta (P-pill, comments, avatar, age) on the right rail of the row.
- **Priority is separated from status.** A put status + priority adjacent at the row's left so triage is a single fixation column; B floats the P-pill mid-right. For a triage tool that ordering matters. At minimum, P0/P1 deserve a left-side echo.
- **Rows are unreachable by keyboard.** Rows are `div`s with click handlers; no `tabindex`, no `role`, no Enter-to-open, and B has **no `:focus-visible` styling at all** (A has a global rule, A:53). The mock's own dataset contains #4655 "Screen reader announces status icons as 'unlabeled button'" — B fixed the icons (`aria-label` present) but shipped a list a keyboard user cannot open. Indefensible for a top-tier team.
- **Muted meta text fails contrast.** `--mut` #898781 on #f7f7f5 is ≈3.3:1, used for 11–11.5px ids, timestamps, and comment counts — below AA for text this small. Step it to the ink2 tier or enlarge.
- **P0/P1 pills are borderline-to-failing.** White on #d03b3b is ~4.8:1 (barely passes); in dark, white on #e05252 is ~3.8:1 — fails AA at 10.5px. P1's red-on-12%-red-tint hovers around 4:1. These are the two most important glyphs in the product; they should be the most legible.
- Long titles get an ellipsis but **no `title` tooltip** on `.ttl` (only prio and comment have one) — issue #4348's 200-character title is unrecoverable without opening the row.
- Good: `.cmt.zero{visibility:hidden}` preserving column rhythm, tabular numerals throughout, the 44px row height, and the hover-revealed checkbox that stays revealed while any selection exists (`.selecting`) are all correct, disciplined choices.

### Group headers
- Sticky-with-blur inside the scroller is right, and defaulting Closed to collapsed (B:585) is a genuinely good editorial choice.
- **Group counts don't animate.** `gcount` is plain `textContent` on rerender; when a bulk action moves 3 rows between groups, both counts teleport. A's dataset literally files this as an issue (#420) and B's own data has #5019 about count derivation. This is the flagship physics opportunity (below).
- The uppercase 12px/700/.06em group name plus a count pill plus an icon plus a chevron is one element too many; the count pill's `--surface2` fill disappears against the sticky header's blurred wash in dark.
- Collapsing a group gives no residual information — A kept counts visible; B does too, fine — but there's no "collapse all," and arrow-key navigation over headers doesn't exist (B's own closed issue #430 in A's data flags exactly this pattern).

### Inline expanded editor
- **Silent draft destruction — the worst flaw in the design.** Three separate paths discard an edited draft with zero warning: clicking the row line (B:905), pressing Escape (B:1010), and — most egregiously — **typing a single character in the search box** (B:853 `if(S.expanded){S.expanded=null;draft=null;}`). A explicitly guarded this: dirty drafts refuse to collapse without Save/Cancel/Esc (A:933) and show an "Unsaved draft" pip (A:239–243). The editor's own placeholder promises "Drafts commit on Save" — the design breaks its own contract.
- **No dirty indicator.** Nothing distinguishes "open" from "open with pending edits." Graft A's amber pip.
- **The title appears twice, 8px apart.** The row line (with the same title) remains fully rendered directly above the card that repeats it as an input. It reads as a rendering glitch. Either de-emphasize/suppress the row content while expanded, or make the row visually become the card's header (A grows the row to 48px and neutralizes it).
- **The property editors are the least expressive part of an "expressive" design.** Status and priority are bare native `<select>`s — status loses its icon and color exactly where the user changes it. A's segmented controls with glyphs (A:215–222) are strictly better and should be grafted.
- **Labels are edited as comma-separated free text** (B:671) that silently truncates at five (B:911, `slice(0,5)`) with no feedback. Everywhere else labels are chips; here they're a CSV field. Graft A's chip-with-remove + add-select pattern (A:228–235).
- **Focus causes layout shift.** `.ddesc:focus` adds 6px horizontal padding (B:240), nudging the text on every focus; `.dtitle`'s focus wash has zero left padding so the highlight clips the first glyph (B:234). Small, but this is exactly the kind of jank that reads as cheap.
- The card indents 44px left / 24px right — an asymmetry aligned to nothing (title starts ~132px in). Align the card's left edge to the title column or to the status icon, deliberately.
- Save is a black ink button while the app's primary identity (New issue) is the gradient — two competing "primary" grammars. Pick one; ink is fine, then New issue shouldn't be the only gradient element left.
- 31 comments are promised in the meta line; the editor has nowhere to read even one. A dead-end scent — at minimum label it as a count-only ("31 comments · opens in panel" or drop the count from the card).

### Bulk bar
- The inverted-ink floating pill with spring entrance is the best-executed surface in B. Menus opening upward, Escape-to-clear, hover-to-hold toast — all correct.
- **No "select all."** B implements neither ⌘A (A:1042) nor ⌫-to-delete (A:1047), and offers no "Select all 4,433 matching" affordance while the group headers loudly advertise thousands of rows. The bulk bar's count says "3 selected" against a fiction of 10k — the gap between the two numbers is where a real feature is missing.
- The bar occludes the last visible row; the scroller needs bottom padding while the bar is shown.
- The count doesn't roll as selection grows (see physics).
- Dark mode: the bar inverts to near-white — striking and fine — but delete's `#a33` on near-white is muddy next to the light theme's clear `#ff9d9d` on black. Tune the dark pair.

### Rail
- **The hero number changes meaning under your feet, and disagrees with its own neighbors.** The hero counts `visible()` (status-filter applied) while "By status" and "Workload" count `baseFiltered()` (status chips ignored — deliberately, so the rows remain clickable toggles). Turn on the "Open" chip: hero says 4,433, the status list below still shows all four statuses summing 10,230, and the caption flips from "indexed · nothing filtered out" to "matching · of 10,230 indexed." Two bases within 60px, distinguished only by an 11px caption. State the basis explicitly per section ("By status — before status filter") or visually mute the non-participating rows.
- **Workload counts closed work as workload.** `baseFiltered` never excludes closed issues, so "Mara 2,046" includes everything she ever finished. A labeled its section "Workload · open work" and filtered accordingly (A:692). This is a data-honesty bug, not a style choice.
- **The rail's best feature is a secret.** Status rows and workload rows are click-to-filter (B:937–942) — genuinely great — with zero affordance beyond `cursor:pointer`. They look like static stats. Add an explicit signifier: a hover-revealed "filter" chevron, checkbox semantics, or at least an active-state echo in the filter row so the user learns the mapping.
- The `hero-perf` monospace block is the rejected readout style and carries marketing copy ("every stat below is a live derivation") — cut both; the quiet A-style block replaces it.
- The 44px gradient hero is handsome, but when scale flips 10,230 → 1,023,000 the digit count changes and the whole rail below reflows with a jump (see physics for the fix).
- Sparkline (ruled: stays): hover dot + tooltip are good. Its values are hardcoded (B:751) — in the merged build it must derive from actual closed events, or it's the only dead number on a page that brags about live derivation. Tooltip can clip above the rail's top edge for the first section; give it flip logic.
- Percent labels flash "0%" mid-roll while counts are still settling (visible in the empty-state capture: counts 2/2/6/10 alongside 0%/0%/0%). Derive the pct display from the same rolled value, or don't roll percentages.

### Empty states
- **There is only one, and it's wrong half the time.** `renderList` shows "Nothing matches / Clear search & filters" whenever zero rows are visible — including when the dataset itself is empty and no filters are active (A correctly splits "inbox zero" from "no results," A:639–648). Clear-filters as the only action on an empty database is a dead button.
- **The copy brags.** "the index checked every one of 10,230 in under a millisecond" is the header perf line reincarnated as prose — the exact register the client rejected. Empty states should help: name the active filters as removable chips, offer to clear just the search vs. all filters.
- The skeleton-rows illustration is appropriately quiet. Keep it.

### List footer
- "30 of 10,230 matching rendered — the rest are virtualized" is (a) debug-speak and (b) false in the mock. Once the shortcut hints move to the rail (per the ruling), the footer has no remaining job; delete it and return the height to the list.

### Dark theme (checked separately)
- **Boot bug:** ignores OS preference entirely (covered above). This is the first thing a dark-mode user will notice.
- **B filed its own dark bug and didn't fix it.** Issue #4990 in B's dataset: "Dark mode: label chips lose contrast on hover." Verified real: row hover paints ≈#1b1b1a; label chips sit on `--surface2` #232322 — a ~1.06:1 difference; chips melt into the hovered row. The dataset even prescribes the fix: "Needs a stepped token, not an alpha."
- P0 pill fails AA in dark (~3.8:1, above).
- The modal scrim is a constant `rgba(20,20,18,.32)` — near-invisible over the #111110 background; the dialog floats on border alone. Step the scrim per theme (≥.55 alpha in dark).
- The gradient wordmark and hero re-step correctly in dark (`--grad` redefined) — good. The `.btn-new` purple glow shadow does not re-step and vanishes.
- Native selects inherit `color-scheme:dark` correctly.
- The near-white inverted bulk bar and toast in dark are a deliberate, confident inversion — keep, with the delete-color fix noted above.

### Width behavior
- **1280px:** comfortable. Header is at capacity (see above). Filter row holds on one line; at 1000px it wraps and the right controls drop a line — acceptable, but note **B has no responsive breakpoint at all**: the rail is a fixed 320px track forever (A hides it below 1120px, A:364). Below ~1100px the list starves.
- **2000px+:** the 1600px `.app` cap does its job — rows never exceed ~1280px and the client's readability fear is contained. Two residual problems: (1) the floating app slab has no outer definition — `border-top` starts at the list/rail line, so at 2200px the header and filter row hover over raw background with no frame; add hairline app edges or a full-height rail border. (2) The dead middle of short-title rows (see List rows) is at its worst here — the left-cluster label fix is the real answer, not a tighter cap.

---

## 2. The A-grafts — where each lands in B

**1. Separate scroll regions (list + rail).**
B's architecture already has this — `.scroller{overflow-y:auto}` (B:146) and `.rail{overflow-y:auto}` (B:284) inside a fixed-height `.app`. The graft is therefore about finishing, not plumbing:
- Add `overscroll-behavior:contain` to the rail (the scroller has it; the rail doesn't, so rail scroll chains to nothing but should be symmetric).
- Add scroll-edge affordances to both regions — a top hairline/shadow that fades in once scrolled (the sticky group headers partly do this for the list; the rail has nothing, and with the grafted sections below it will definitely scroll).
- Give the scroller bottom padding when the bulk bar is visible so the last row isn't occluded.
- Keep the header + filter row fixed (they already are, via `flex-shrink:0`) — do not let them scroll away; they're the app chrome.

**2. The rail's quiet load/search millisecond readout.**
Source: A's `.speed-line` rows and `.speed-cap` (A:311–314, 707–709) — label left in the UI font, value right in tabular numerals with a small unit suffix, no monospace, no status dot.
Landing: a new **Performance** section at the bottom of B's rail (after the sparkline), containing: the relocated scale gauge (10k/100k/1M — the control is approved), then "Initial load — 12.4 ms" and "Last search — 0.4 ms" speed-lines, then one caption line in A's factual voice ("30 rows live in this mock · 10,230 simulated at scale"). Delete B's header `.perf` element and the rail `hero-perf` block entirely. The ms values roll on the same spring as every other rail number (A already does this via `data-fmt="ms1"`, A:504). Drop "every stat below is a live derivation" — demonstrate it, don't say it.

**3. Keyboard-shortcut equivalents documented in the rail.**
Source: A's `.keys` block (A:315–317, 710–716) — kbd + label rows above a hairline, pinned as the rail's last section (below Performance).
Landing in B, with one hard prerequisite: **B must implement the shortcuts before documenting them.** B currently binds only ⌘K, `/`, and Escape (B:1004–1014). Add: `N` new issue, ⌘A select-all-in-view, ⌫ delete selection (all exist in A, A:1040–1060), and Enter-to-open on a focused row once rows are focusable. Document: ⌘K / `/` search, N new, ⌘A select all in view, ⌫ delete selected, Esc close · deselect. Then delete the `.lfoot` hint strip — its job moves here, and the rejected instructional banner stays dead; the self-teaching surface is this quiet, always-present list plus visible kbd hints in the search field.

**4. Header convention (from the ruling, styled per A's restraint).**
Remove `.mark`. Wordmark: gradient "Declare" + regular-weight muted "Tracker" (both takes already have the text treatment; B's is fine once the icon dies). Add a three-way appearance control — a compact segmented control or menu (light / system / dark), defaulting to system, honoring `prefers-color-scheme` at boot and live-tracking OS changes while in "system."

---

## 3. Declare-physics opportunities

B already rolls its rail numbers. The platform animates any attribute on springs, holds 60fps at 100k mixed-height rows, and re-derives stats instantly. Additional uses that earn their motion — each is cause-and-effect legibility, not decoration (and all gated on `prefers-reduced-motion`):

1. **Group migration as a visible transaction.** When Save or a bulk action changes status, the affected rows glide (FLIP-style position spring) out of their group and into the new one, while both `gcount` pills roll their deltas. Why: today rows teleport and counts snap — the user gets no receipt that "3 moved to Closed." The dataset itself files this gap (A's #420). This is the single highest-value physics add.

2. **Row departure and undo return.** Delete (single or bulk) springs each row's height to 0 as the list closes over it; Undo re-inserts the rows springing open at their original indices, synchronized with the toast. Why: makes destruction feel reversible-by-design and makes Undo's effect self-evident — you watch the exact rows come back.

3. **Live sparkline tail.** Closing an issue makes today's point spring upward and the area fill re-interpolate in place. Why: connects the individual act of closing work to the team trend within 300ms — the sparkline stops being a chart and becomes a receipt. (Requires the sparkline to derive from real closed events, which the merged build needs anyway.)

4. **Search as subtraction, not replacement.** On each keystroke, surviving rows keep identity and glide upward into vacated space while removed rows collapse; the matching count rolls in the rail hero and filter-chip counts. Why: today the list blinks to a new innerHTML — filtering reads as a page change. With identity-preserving springs, it reads as the same list being sieved, which is the truth. (The platform's 100k-rows-at-60fps claim makes this safe at scale.)

5. **Hero width settling on scale change.** Switching 10k → 1M rolls the number (already) but the digit count changes and the layout jumps. Spring the hero's container width alongside the roll so 10,230 → 1,023,000 grows smoothly and the rail below never jolts. Also roll the two ms speed-lines to their new values rather than swapping strings. Why: the scale gauge is the demo's showpiece moment; a layout pop undermines exactly the polish it's meant to prove.

6. **Distbar as a connected legend.** Status-row hover springs its distbar segment's height 8px → 10px (and dims the others slightly); toggling a status filter springs segment widths (currently a CSS transition — move to the spring so rapid toggles chain naturally). Percent labels roll from the same driven value. Why: binds legend rows to bar segments without adding a single pixel of standing UI, and advertises the rail rows' clickability (fixing the affordance gap in §1).

7. **Bulk-bar count with felt weight.** "n selected" rolls as selections accumulate, with a subtle scale pulse (1 → 1.04 → 1) on each change; shift-click range-selects roll fast through intermediate values rather than jumping. Why: during rapid multi-select the user's eyes are on rows, not the bar — a peripheral pulse plus a rolling figure confirms each addition without requiring a glance.

8. **Editor status change previews its consequence.** Choosing a new status inside the expanded editor immediately morphs the row's status icon (color/shape crossfade on a spring) while the draft is still uncommitted, and the destination group header briefly shows a ghost "+1" on its count pill. On Save, physics #1 completes the move; on Cancel, the icon springs back. Why: it converts "Save and find out" into "see where this will go," reinforcing the draft model instead of hiding it.

---

## 4. Top-10 prioritized punch list

1. **Stop destroying drafts silently.** Gate collapse of a dirty editor behind Save/Cancel/Esc-with-confirm; never discard on row click or on a search keystroke (B:853, 905, 1010). Add A's "Unsaved draft" dirty pip. This is a data-loss bug wearing a design costume.
2. **Make the list keyboard-operable and focus-visible.** Focusable rows, Enter-to-open, a global `:focus-visible` ring (graft A:53), and implement N / ⌘A / ⌫ — then document them in the rail keys block per the ruling.
3. **Rebuild the header to convention.** Delete the logo mark and the monospace perf line; gradient Declare + Tracker only; add the light/system/dark appearance control and honor `prefers-color-scheme` at boot.
4. **Land the rail Performance block.** A-style speed-lines + caption at the rail's bottom, scale gauge relocated into it, `hero-perf` deleted, ms values rolling; kill the "virtualized" footer debug line.
5. **Unify rail semantics.** One declared basis per section; hero labeled against it; Workload = open work only (exclude closed) and say so; fix the 0%-during-roll flash.
6. **Upgrade the editor's property row.** Segmented status/priority controls with glyphs (graft A:215–222), chip-based label editing with explicit max-5 feedback (graft A:228–235), fix the focus layout shifts (B:234, 240), and suppress the duplicated row title above the card.
7. **Fix contrast failures.** P0 pill in dark (≥4.5:1), P1 tinted pill in both themes, muted 11px meta text (#898781 on #f7f7f5 ≈ 3.3:1), and the dark hover/label-chip melt the team already filed as #4990 — stepped tokens, not alphas. Refactor status icons to `currentColor` so `.chip.on` inversion actually works (B:132 is dead code).
8. **Re-anatomize the row for width.** Labels left-clustered after the title; fixed meta (P-pill, comments, avatar, age) right; keep the 1600px cap, add outer app edge definition at ultrawide, and add a sub-1100px breakpoint that collapses the rail.
9. **Advertise the rail as a filter surface.** Hover-revealed filter affordance on status/workload rows, pressed states, and an echo of rail-applied filters in the filter row with a global "Clear filters."
10. **Split and rewrite the empty states.** Distinct inbox-zero vs. no-results states; delete the perf brag; show active filters as removable chips with targeted clear actions.
