# declarelang-data — the data-system upgrade tree

**A wholly separate working copy** (David's convention, as `declarelang-mac`
was for the mac host): NOT a branch, NOT tracked — `.git` is renamed
`.git-DO-NOT-TRACK` so no git tooling can operate here, by design. Work
proceeds as plain files; the merge back to `declarelang/` is MANUAL when the
project is ready.

## Baseline

Snapshotted **2026-07-30** from `~/Code/OpenLaszlo/declarelang` with the full
test suite green (`npm test` clean immediately before the copy). The
baseline includes work UNCOMMITTED on main's side at snapshot time — the
streams arc (EventStream/Socket + transport tests + the boot-uniform
transport fix + Image.loaded/.failed) and the parallel mac-host session's
in-flight edits. The exact commit + uncommitted-file list at snapshot is
recorded below; the merge-back delta is *everything changed in THIS tree
after the snapshot*, recoverable by diffing against `declarelang` history
plus that list.

## The plan

**docs/system-design/data-project-plan.md** — the ordering + the design-first
work, proposed 2026-07-30. Read it before touching anything.

## Current state (2026-07-30 → 07-31; B1–B7 built, D1–D9 ruled)

D1 + D2 RULED: the capstone is an issue tracker, in-memory loaded-once, no
persistence, search required — the full brief (with the 13 acceptance
criteria, the datagrid + column dragging, and the flagship UX bar: the
Viewer/Calendar header treatment, light/dark, responsive, tab-navigable) is
docs/system-design/issue-tracker-brief.md.

**B1 DONE (both halves — data-paths.md §10 items 1–2, marked there):**
- Scanner refusal turned out ALREADY LANDED in the baseline (datapathTrouble
  + parser + locate errors, tests at unit.test.mjs §":path truncation");
  verified across all three entry surfaces, nothing to build.
- Compile-time path plans landed THIS session: compile() lowers every body
  island to `this.$data(["seg",…])` at emission (Resolver.resolveBody);
  $data/$setData evaluate pre-parsed segments; dep-extract reads the lowered
  form (recompile/serve/prod parity holds — deps keep the `:path` currency);
  datapath bodies are now TYPECHECKED (scaffold gained $data/$setData; the
  net surfaced and fixed a real corpus looseness — calendar's catFill/catText
  now `-> number`); declarec production builds stub the scanner
  (slim-datapath; splitPath stays real). Bundles + prewarm caches + the doc
  model regenerated. Full suite green.

**D3 + D4 RULED 2026-07-30 (David, all points as proposed) — and D7
RATIFIED with D3:**
- D3 (data-paths.md §11): slot-in-pointer leaf writes + array-addressed
  structural verbs; `/-` append adopted; Relative JSON Pointer REFUSED;
  segments = documented currency, pointer strings = interop spelling,
  dot-strings retire in B2 (5 corpus sites + 3 guide lines migrate). D7:
  handler-called dataset methods + `<->` ARE the mutation authoring surface
  (language §13's open design closed).
- D4 (docs/system-design/jsonpath-spelling.md): `:` cursor-anchored, `$`
  refused; `[]` replicates / `[*]` selects (`.*` normalizes); `..` refused
  in v1; subset = name/quoted-name/index/slice/wildcard, filters +
  functions + unions gated with named refusals; the singular/selective
  legality table stands (slice-replication `:rows[2:8][]` in, selective
  refused on `<->` and bare `datapath =`); filter predicates ruled in
  principle to be `{ }`-class expressions with reactive reads (§5a).

**B2 + B3 BUILT 2026-07-30 (same session as the rulings — the full increment
record is data-paths.md §10 items 3–4):**
- B2: segments + RFC 6901 pointer intake across the mutation/read surface,
  `/-` append, escaping, dot-string retirement (corpus + guide + prose
  migrated), pointer-rendered diagnostics, the RFC's own example document as
  a conformance test.
- B3: the ruled v1 selector subset in both grammars, emitted as tagged plan
  segments; the RFC-strict node evaluator (select.ts) with true locations;
  slice replication (`datapath = :rows[2:8][]` — the materialization
  substrate) at real indices; §9 over-approximate tracking; every gated
  feature refusing by name; the D4 legality table enforced at check and
  instantiate; `slim-select` + `usesSelectors` making §7's
  pay-for-what-you-write table real. Full suite green.

**D5 RULED 2026-07-30 (David — see the RULED block in materialization.md
§8):** membership-anchored lifecycle (onInit keeps its name; departure hook
named at D8; instance lifecycle never surface); `windowed` as a permanent
policy slot (auto | true | never | <count>, default never→auto after the
differ proves invisibility); touched keep-alive in v1; childViews refused on
windowed blocks with the live window as kernel API.

**D6 RULED IN FULL 2026-07-30 (David — ledger in selection-model.md §7):**
selection is the collection control's VALUE holding MEMBERS (record when
replicated per the identity ladder, written child when authored — the
RadioGroup practice; no Dataset required); selected-but-hidden under filters
with the true-count obligation (user-facing numbers always full-dataset);
modes `none | single | multi` with single default; Esc carries no collection
meanings (D9); and the three-facts interaction state + full gesture table
(⌘-walk + Space discontiguous parity, range-as-gesture) ratified.

**D9 ADOPTED 2026-07-30 (new design item, drafted:
docs/system-design/focus-scopes.md):** hierarchical focus scopes over the
view tree — Tab traverses within the current scope; entry policy is the
component's declaration (land-as-one-stop for browse collections,
auto-descend-and-capture for entry grids — the spreadsheet/tax-form
convention); Esc universally ascends one level. Gates the grid parts of
D8/B7; dialogs/menus ride it too.

**B5 BUILT 2026-07-30 (v1, per the D5 rulings — full record at the top of
materialization.md):** divergence bit + membership-anchored onInit (general
— keyed re-derivations included); the windowed match behind the
materialization policy slot — `materialize = all | auto | window | <count>`,
default `all` (RULED as `windowed`, RENAMED same day in the naming ruling:
"window" stays prose term of art, leaves the authored surface + kernel API
for Window-the-component; values inverted with the noun) — with
estimate-then-correct uniform extents, logical placement, and the
parent-extent derive; keep-alive retention; honest fallbacks; childViews
refusal + the kernel window API (blocksOf/realized/navigateTo/
materializationInfo); navigate-to-logical-record; aria-rowcount/rowindex
through the Surface seam; the inspector materialization diagnostic; THE
SEMANTIC DIFFER green
(test/materialization.test.mjs) and the bench measured: 0.06–0.11 ms/frame
scroll flat 10³–10⁶ rows, 0.04 ms offscreen edit, ~20 materialized at every
scale. Deferred, noted in the doc: recycling, selective-plan windowing,
layout-aware windowing, focus-as-touched, animator settle-on-dematerialize.

**B6 EARLY PIECE BUILT 2026-07-30:** the structural-equality reconciler
fallback (materialization.md §4 move 2) — on a KEYLESS block an identity
miss falls back to content matching (lazy, miss-set-priced,
JSON-stringify keyed), so a transform-derived recompute reuses unchanged
rows and rebuilds only genuinely-edited records; keyed blocks never consult
it (a declared key IS the identity). Test in materialization.test.mjs.
Full `key` retirement stays gated on the §4 move-1 doctrine (path
selections as the sanctioned derivation — landed with B3) plus the surface
migration.

**B4 BUILT 2026-07-30, RATIFICATION SETTLED same day (record at
data-paths.md §10 item 5):** the shape literal per the weather sketch
(+ `name?:` optional); validate-on-receipt with pointer-path errors (.failed
for a DataSource, loud-at-build for embedded — the RATIFIED
`Dataset [ attrs ] { body }` composition); compile-side static `:path`
checking (typo'd fields die naming the schema's field list; honest
best-effort scope). **Identity ruling REVISED by David in ratification: the
proposed `id!` marker was refused as key-by-another-name — identity is
INFERRED (a record's `id` field, by convention, zero declaration), `key =`
is the sole explicit override, structural fallback beneath, and the
inspector reports the mode (`windowInfo().identity`). The schema is
validation-only. selection-model.md §2's ladder amended to match.**
dataschema.test.mjs proves inference end to end (derived fresh objects,
windowed retention across wholesale replacement, key-over-id precedence);
`slim-dataschema` pay-per-use.

**D8 RULED 2026-07-30 (David accepted all seven §7 points of
component-briefs.md):** the four briefs (Table, Combobox,
ContextMenu, DataGrid — ends and constraints over the ruled contracts and
the landed substrate), plus the parked decisions as proposals: the
axis-scoped drag claim spelled `claim = x | y | both` (full row + deference
in claim-surface.md, per its new-claims rule), the departure hook as
`onRetire`, the keyboard position as `active`, and D9's §4 details
concretized in focus-scopes.md (Enter/F2 descend, capture claims Enter,
`focusScope = stop | capture`, shift-Tab exits backwards, no F6 in v1).
Also verified and recorded: State apply/unapply already follows the
membership-anchored init reading (presence episodes).

**B7 RUNTIME SUBSTRATE BUILT 2026-07-30:** `claim = x | y | both` landed
end to end (schema enum + InputWants.claimAxis + DOM `pan-y pinch-zoom`
realization + canvas dominant-axis latch + the gesture-tier pin —
claim-surface.md updated to RULED/LANDED), and `onRetire` landed (the
`retire` event beside `init`; fires once per presence-end, children-first,
pre-unlink so handlers see live state; window evictions marked and silent;
lazy for never-materialized members — the exact symmetric of lazy init;
tested in the materialization tier incl. retained-row departure). State
apply/unapply verified as presence episodes (recorded in
materialization.md).

**Table BUILT 2026-07-30 (library/table.declare + TableRow — canon,
literate, prose'd, tested at test/table.test.mjs):** the ruled selection
model in component form. Selection is the Table's VALUE (`selected` +
`selection`, holding members — records or written rows; the reconciler's own
id convention), `active` the keyboard position, `selects` the mode (naming
note recorded in-source: the ruled docs used `selection` for both mode and
value; the value keeps the ruled name, the mode rides `selects`). The full
protocol proven: click/toggle/range, arrows/shift/⌘-walk + Space,
delivery-seam ownership, record-anchored survival across reorder — and the
windowing composition: ranges read the DATA (a shift-click spanning 500
unmaterialized rows selects 499 records) and arrow travel scrolls its
destination into existence (uniform extents, the kernel's own v1 model).
Rows carry zero selection wiring. Build additions: the scaffold's Cursor
type gained its honest shape ({data, path}).

**B7 COMPLETE 2026-07-31 — the remaining briefs built (Combobox,
ContextMenu, DataGrid) + the sampler redesigned (all canon, literate,
tested at test/components.test.mjs; autoincludes registered; doc model
regenerated; full suite green):**
- **Kernel enablers landed first (replicate.ts + layout.ts):** a vertical
  SimpleLayout now COMPOSES with windowing (the pass suspends under
  `isWindowedBlock`, its spacing folds into the unit; non-y arrangements
  still fall back honestly) — the suspension has TWO halves: the pass-apply
  skip AND the rearm base-restore skip (found live: every reconcile's
  restore was clobbering the kernel's logical placement). And the window's
  leading offset anchors on the last VISIBLE sibling (`leadingAnchor`),
  skipping invisible members (a DataGrid's Columns) the way SimpleLayout
  does. Table gained its own `layout: SimpleLayout [ axis = y ]` (full-mode
  rows actually stack now); the materialization tier's fallback test became
  the composition test (+ an axis-x case pinning the honest fallback).
- **Combobox (library/combobox.declare):** composition, not invention —
  TextInput entry owning the QUERY, the Menu machinery whole for the list
  (overlay/raise/backdrop/Escape/arrow-rover), matches as a DERIVED
  constraint over the items array (live count free, no rendered-row scans);
  `value` holds the chosen MEMBER, `input(v)` delivery (press-never-writes
  proven); Enter picks the roved row or the first match; a drawn disclosure
  chevron opens the full list.
- **ContextMenu (library/contextmenu.declare):** Menu's machinery whole +
  the gesture entry — `open(v, e)` pointer-anchors via openAt; the serving
  view declares the two-line wiring (`onContextMenu` + `onHold` — the hold
  gate's second consumer, per the brief), placement/dismissal/Escape all
  inherited, zero new overlay machinery.
- **DataGrid / Column / GridRow (library/datagrid.declare):** the Table
  contract + the column model. Columns are written members (invisible
  data-only Views; id = field); order/widths are value-pattern STATE with
  `arrangeInput`/`resizeInput` deliveries (app-ownable, proven); header
  click is the SORT DELIVERY (`sortInput` — sort names a derivation, data
  stays the truth); header drag REORDERS (live midpoint swap; identity
  keeps instances), edge-grip RESIZES (col-resize cursor) — both under
  `claim = x`; cells derive from ONE columnRecords for-of walk (colVersion +
  state as tracked args); GridRow.rec is a derived $data read so cells stay
  live; windowing composes with the header as the leading anchor (10k-row
  test: row 0 at headerH). Deferred with notes: aria-colcount/colindex (the
  Surface seam), narrow-width priority degrade, measured auto-fit (never).
  Table.memberArray hardened to require isTableRow (the header island is
  cursor-bearing).
- **Component sampler REDESIGNED (apps/component-sampler):** the house
  chrome — the Viewer/Calendar bar (brand gradient + "Sampler", hairline)
  with the Light/System/Dark ThemeSeg switch top-right (`themeMode`
  orthogonal to the four stylings); the page scrolls below the bar; the
  control basics in two columns (now incl. Combobox + the ContextMenu
  surface), then Table (cities, multi-select caption) and DataGrid (500
  windowed rows; sort honestly derived — the app's `issueRows(sort, dir)`
  dataset re-derives on the delivery) at full measure. Verified R1–R4 and
  screenshot-proven in light AND dark (headless Chrome).
- Node tests can now instantiate Menu-bearing components: the components
  tier injects the deterministic `approximateMeasurer` through the
  `provideMeasurer` seam (capabilities.md §3) instead of avoiding
  `y = center`.

**Phone/desktop QA round 2026-07-31 (David tested over LAN):** three
defects found and fixed, one relayout:
- **Rows were tab stops** — TableRow inherited Control's focusable, so Tab
  walked every row and a row CLICK focused the row (stranding Table's arrow
  keys — "keyboard nav does not work"). Ruled policy restored: TableRow
  `focusable = false` + a row press focuses the TABLE (Focus.focus(parent));
  GridRow inherits. Arrows-after-click proven live (headless Chrome against
  the dev server) and pinned in table.test.mjs.
- **Menu walks were scroll-blind** — a serving view inside a scrolled pane
  opened its menu displaced by the scroll offset. All four root-space walks
  in menu.declare (openAt/openFor/openSub/place) now subtract each
  ancestor's scrollX/scrollY; pointer-exact anchoring proven live (panel
  top == pointer y) and pinned in components.test.mjs.
- **Focus reveal verified working** (focus.ts move() already scrolls the
  new stop into view — the earlier "tab goes offscreen" experience was the
  row-stop bug inflating the sequence).
- **Sampler relayout:** a PAGE switch in the bar centre (Controls · Table ·
  DataGrid — the ModeSeg pattern); Table and DataGrid live on their own
  pages at viewport-filling heights; the styling rig stays global above
  every page; Accordion joined the Controls page.

**MAIN-TREE PORT + THE GENERAL SCROLL-GEOMETRY FIX 2026-07-31 (David:
"platform scroll isn't reflected in Declare-visible positions — find the fix
in the main tree, make it totally general"):**
- **Ported main's c6feb60 WALK half** ("the walk gains its missing term",
  authored post-snapshot): interaction.ts + inspect-service.ts wholesale
  (both were untouched here — clean copies), the viewAt content-space
  boundary conversion in view.ts, the inspect.ts picker note. The transform
  is complete — parent scroll, ignoreScroll chrome-first probing, scroller
  frame-bounding, translate, scale-about-pivot — and `rootFrameOrigin` is
  the shared origin walk. The commit's four walk unit pins and the dom-walk
  gesture pin ported with it (unit 416, gesture 29). The commit's OTHER half
  (the subtractive selection realization) was deliberately NOT ported — a
  separate ruling, not part of this bug.
- **Generalized beyond main** (main's focus.ts is still scroll-blind):
  the focus follower now rides `rootFrameOrigin` (+ the root's own scroll
  back — ring and control share root content space), with the scroll reads
  TRACKED so the ring follows a scrolling pane live. This was the reported
  focus-ring offset. Pinned in unit.test.mjs and verified live (ring Δ≈2px
  inset at scrollY 0 and 150).
- **The language surface**: `View.rootOrigin()` — the anchor primitive for
  overlays, backed by the same walk (view.ts + scaffold LANGUAGE_API +
  effects.ts purity registry + View.md prose). menu.declare's four
  hand-rolled walks (openAt/openFor/openSub/place) replaced with it — the
  right-click fix now rides the general rule instead of a local scroll
  subtraction. ONE WALK, everywhere: pointer, focus ring, inspector,
  overlays.
- Full suite green end to end (35 tiers, exit 0). Merge-back note: focus.ts
  follower + View.rootOrigin + effects.ts + menu.declare are NET-NEW over
  main and should travel back with the B-series delta.

**QA ROUND 3, 2026-07-31 (David's phone/desktop pass: ring lags scroll,
combobox layering, arrows scroll the page, no viewport awareness, no long
lists, no responsive layout) — all landed, suite green end to end:**
- **The ring TRAVELS WITH platform scroll** (David's prescription: not a
  reactive chase). New primitive `View.travelWith(scroller)` over an
  optional `Surface.travelWith` — DOM re-hosts the indicator's element
  INSIDE the scroll container (the sticky-frame inverse; z above unindexed
  content), so the compositor carries ring and control together. The focus
  follower publishes `scroller` + `homeX/homeY` (the scroller's CONTENT
  coordinates — deliberately NOT reading the scroller's own offset, so
  scrolling triggers zero re-derives); the FocusRing rehomes per target and
  never flies across coordinate spaces (snap on home change). Proven
  same-frame: raw scrollTop write, ring Δ2px before any settle. Backends
  without the ride keep the reactive root-space fallback.
- **Combobox list at the APP LAYER** — the shipped overlay idiom (planes.md
  floating stratum by construction; the door Menu's own cascade uses):
  created lazily via app.createView at first open, items PUSHED per
  keystroke (the driveSub discipline). Paints over everything. This
  surfaced a REAL platform bug: resolveAutoIncludes DROPPED library-
  contributed `use [ … ]` keep-lists (the fold existed in resolveIncludes
  but auto-includes returned the root's uses only) — fixed with an indexed
  pull loop so a component's by-name deps (Combobox → `use [ Menu ]`) keep
  through auto-include. combobox.declare drives the View-typed slot through
  the any-seam (Menu members are invisible across files).
- **Menus are viewport-aware**: openFor flips ABOVE the control when the
  list won't fit below (expectedHeight estimates pre-first-paint); the
  panel CAPS at the viewport and the body scrolls (`scrolls = y`) with the
  keyboard rover revealing its row (scrollIntoView) — the long-list case,
  first cut.
- **Nav keys claimed while a menu is open**: `Keys.navClaim(owner, on)` —
  a claims set beside the focus probe; the DOM listener preventDefaults
  arrows/Space (+Home/End/Page under claim) so roving never scrolls the
  page. Menu claims at open/driveSub, releases at close.
- **The sampler is responsive** (`narrow = width < 660`, minWidth 320): the
  bar grows a second row for the page switch, the rig and the two-column
  grid stack, margins tighten, and the DataGrid takes narrow column widths
  through its `widths` STATE — which surfaced the documented idiom: a
  Column's `width` must stay a PLAIN value (unanalyzed children-walk read);
  responsive widths ride `widths = { app.narrow ? ({ … }) : null }`, a
  tracked dep (recorded in datagrid.declare's header).
- New pins: components 13 (flip, claim lifecycle, long-list cap, app-layer
  list), unit 416 (travel facts: scroller identity, content-space home
  coords, headless fallback). Verified live headless-Chrome over LAN:
  same-frame ring glue, list-over-accordion, arrows-don't-scroll, phone
  layouts (390px) both pages.

**QA ROUND 4, 2026-07-31 (David: breakpoints vs columns, theme controls
into the bar as a MENU with the Finder tint-dots row, controls page
imbalance, grid needs live cells):**
- **The bar is FIXED-HEIGHT at every width.** Brand compacts to "Declare"
  when narrow (the Calendar move); the page switch tightens; the whole
  styling rig left the page for the APPEARANCE MENU behind one affordance
  (glyph + drawn chevron in a bordered pill — reads as a popper): mode rows
  with icons + checks, the four stylings checked, the TintRow accent-dot
  row (the Finder tag-dots idiom, already the sampler's kind-row demo), and
  the animate-focus toggle.
- **The controls page reads as CARDS** (a `Card` class — surface, eyebrow
  label, content-wrapped height) in two balanced columns; breakpoints now
  MATCH the content: `compact` (<640, bar), `narrow` (<940 — where two card
  columns genuinely fit), `gridNarrow` (<760, the grid's narrow width set).
  No overlap at any width.
- **DataGrid grew CELL KINDS** (library/datagrid.declare): `Column.kind =
  text | edit | check | select` (+ `options`). An edit cell is a TextInput
  committing each keystroke into the RECORD through the row's cursor
  ($setData — the instance-free doctrine applied to editing; windowing and
  sort keep every edit); check is a Checkbox over a boolean; select shows
  value + chevron and opens ONE shared app-layer options Menu (the Combobox
  door) whose pick writes the field. `options` is read at GESTURE time from
  the Column (the widths lesson: records never carry unanalyzed reads).
  The sampler grid: Title edits live, State/Owner select, Done checks —
  over OWNED data (seeded once; the sort delivery physically reorders,
  identity keeps instances and edits).
- **Platform fixes surfaced:** (1) `$setData` on non-this receivers
  (a cell writing through its row) joined the effects purity registry;
  (2) TextInput's uncontrolled seed RACED constraint installation on
  windowed creation (late-batch cells attached before `initial` installed —
  fields stayed empty); the guard is now text-side only, race-free.
- **Column drag verified working** mouse AND touch (headless emulation
  drove a real reorder) — the earlier failure was the constraint-widths
  bug's zero-width headers, already fixed.
- Components tier 14 (cell kinds pin: edit/check/select all write the
  record; the shared menu checked-state). Full suite green.

**QA ROUND 5, 2026-07-31 (David: reorder flicker, resize broken, scrollbar
treadmill, header scrolls away, cells not tabbable, can't tab to the page
tabs, ring behind the menu, "what is this pattern?"):**
- **THE VIRTUAL EXTENT (kernel)**: rows as direct children of a scrolling
  Table meant the DOM scroll range ended at the last MATERIALIZED row —
  the extent derive only published when the parent's height was unauthored
  (the content-wrapper arrangement). New `Surface.setVirtualExtent` (DOM: a
  zero-width inert strut): when the authored parent IS the scroller, the
  LOGICAL extent publishes to the surface — the scrollbar spans all N rows
  from frame one (proven: scrollHeight 14,030 = 30 + 500×28 exactly; thumb
  to end lands on rows 498–500). This was the "strange effects / low
  sequence numbers at the end" treadmill.
- **The header is PINNED chrome** (`ignoreScroll` — the sticky frame);
  rows scroll beneath it; the leading anchor keeps windowed geometry.
- **Reorder is DROP-COMMIT**: no live swap (the mid-drag re-derive was the
  flicker); the dragged header LIFTS as an opaque ghost (raise + surface
  fill + edge), the grid's accent INSERTION BAR tracks the would-be slot
  (`dropAt` rides into the bar's constraint as an argument — the tracked-
  args discipline), and the order commits at release
  (dragCol/dropIndexFor/commitDrop replace maybeSwap).
- **Resize works now**: the grip moved to the LEFT edge of the FOLLOWING
  cell (the boundary belongs to the later sibling — topmost-first hit
  probing made a right-edge grip unreachable), 10px wide, resizing the
  PREVIOUS column; absent on the first. Cursor sits on the real boundary.
- **Select cells are CONTROLS** — real tab stops (Space/Enter opens the
  options menu, the Control activation path), styled as quiet buttons.
- **`Segmented` / `Segment` joined the library** (the platform pattern the
  page/mode/theme switches hand-rolled — NSSegmentedControl's shape):
  value-pattern + input delivery, written Segment members, ONE tab stop
  with arrows moving the active segment (radio semantics), and focusShape
  hugging the ACTIVE segment so the ring reads like the pointer
  affordance. The sampler's page switch uses it (first tab stop; arrows
  page). Viewer/Calendar's hand-rolled switches can migrate at merge-back.
- **The ring stands down under an overlay**: `Keys.onNavClaim` (a new
  Keys-source channel firing on claim transitions) → FocusRing hides while
  a menu chain is open — no more ring-behind-the-panel.
- Sampler: grid `widths` became app-owned state (`gridWidths` merged under
  the narrow defaults) so the resize delivery and the responsive constraint
  compose instead of colliding.
- Components tier 15 (drop-commit protocol, Segmented). All verified live:
  extent, pinned header, left-grip resize, ghost + bar + commit, tab-to-
  switch (first stop), arrows page, ring hides under the menu.

**QA ROUND 6, 2026-07-31 (David: tabbable segments, the missing flight
across the bar/page boundary, "scrollbar drag is very slow — repro and
trace"):**
- **RECYCLING LANDED (the kernel move B5 deferred, forced by the bench).**
  Profiled first: a 40-frame scrollbar scrub was 2,852ms — every frame a
  ~72ms long task, 2,137 DOM nodes created + 2,122 destroyed in one drag
  (each window shift discarded and rebuilt full rows: native TextInput,
  Checkbox tree, select Control ≈ 6ms/row). Fix: a window shift's clean
  LEAVERS re-point at its ARRIVERS (the cursor setBound already re-derives
  everything downstream; eligibility = eviction eligibility, so a touched
  row still retains and user state never leaks across records). A recycled
  instance serving a member whose presence episode is new fires that
  member's init (`fireInitTree` — the exact mirror of suppressInit).
  Plus: the surface re-link is SKIPPED when recycling only reordered an
  unchanged set (placement is absolute; rows never overlap). Result:
  2,852ms → 449ms (~11ms/frame, no long tasks in steady scrub, DOM churn
  2,137 → ~190). The keep-alive pin updated to the recycling contract.
- **The cross-home FLIGHT**: crossing scroll homes used to snap (spaces
  differ). Now the ring's current position converts through root space
  into the DESTINATION home's coordinates — same painted spot, new numbers
  — and the springs fly entirely within the new space (correct even if
  that pane scrolls mid-flight). Verified: 20 distinct animation frames
  tabbing from the bar's appearance button into the page.
- **Segmented: every segment is a TAB STOP** (David's ruling — tab to an
  inactive choice, Space/Enter picks it): Segment extends Control (press =
  pick, the activation path), arrows ROVE focus across the group
  (roveFrom → Focus.focus), the ring hugs the focused segment's pill
  (per-segment focusShape). The group is no longer itself a stop.
- Verified live end to end: first five tab stops are the three segments,
  the appearance door, then Primary; scrub 442ms over the wire.

**QA ROUND 7, 2026-07-31 (David: "still surprisingly sluggish — drill
down, Chrome DevTools may yield surprises"). CPU-profiled the scrub via
CDP sampling (0.1ms) — it did yield surprises:**
- **The hottest app-code frame was the PREVAILING walk** (`followRead` —
  theme/font inheritance): it called `declaringOf`, a full prototype-chain
  scan, per ANCESTOR per themed read — O(depth × proto-depth) on every one
  of the thousands of style reads a recycle wave makes. `declaringOf` is
  now MEMOIZED per (table, name) — tables are per-constructor and immutable
  after registration. 145ms of the sampled scrub, gone.
- **`setEditable` hid a fontMetrics MEASURE per push**: syncEditable sends
  the whole spec on any model change, and the DOM side re-applied
  everything — applyEditStyle (with its measureText) included — on every
  recycled editor cell. Now dirty-guarded field-wise against the previous
  spec (style equality over exactly what it writes; scheme gated on fill
  identity). 20ms → 11ms sampled, plus the recalc it was inviting.
- **Result: median 8ms/frame, p90 11ms** across a full-range 40-step
  scrub — smooth 60fps steady-state (from 71ms/frame at the round's start,
  before recycling). Two one-time ~50–70ms frames remain at first touch
  (JIT + first style recalc). The residual steady-state cost is the honest
  economics: ~500 constraint re-runs per big window shift (unlink/track/
  re-derive) plus the browser's style pass for changed texts.

**QA ROUND 8, 2026-07-31 (David: the NSTableView bar — blanks during
momentum drag, the header in the scroll region, arrows-while-editing,
headers jumping on mousedown):**
- **VELOCITY-ADAPTIVE OVERSCAN (kernel)**: the compositor scrolls
  asynchronously — frames paint before JS sees the scroll event — so a
  flick can outrun a fixed buffer and expose blank track even with
  recycling. The window now LEADS in the direction of travel by ~3 frames
  of the observed per-frame delta (capped at 30 rows: a scrollbar TELEPORT
  is one giant delta prefetch can't help; the next frame's window is
  simply correct), decaying to the base buffer at rest. Proven: a
  62-frame exponential-decay momentum flick shows ZERO blank frames. The
  membership-init pin restated to its true invariant (a repeated identical
  round trip refires nothing — wider windows meet first-timers earlier).
- **The header left the scroll region.** A DOM scroller CLIPS at its box
  (overflow is real clipping; ignoreClip is Declare's rule, not the
  browser's), so an in-scroller header can never float above it. The
  header's SURFACE now escapes into the grid's parent element
  (travelWith — the ring's re-homing door, run the other way; retried
  briefly past attach) and positions in parent coordinates; the view tree
  stays put so hit-testing and the column model see nothing move.
  `leadingAnchor` skips ignoreLayout siblings, so rows start at content 0:
  the scrollbar spans EXACTLY the 500 rows (range 14,000 = 500×28), no
  row ever slides under the header, and wheel over the header doesn't
  scroll. Backends without the ride keep an in-box header (recorded gap).
- **Arrows while editing** (David's question answered as the spreadsheet
  expectation): ArrowUp/Down in an edit cell moves the edit to the same
  column one row up/down — `DataGrid.editStep` scrolls the destination
  into existence and focuses its editor a beat later. Left/right stay the
  caret's.
- **The mousedown jump**: the drag position engaged at pointerdown while
  `dragX` was still 0 (only x=0 columns looked right — "some not all").
  The lift now waits for `moved` and dragX seeds at press.
- Verified live: header band above the box (flush bottom), zero blank
  flick frames, unmoved headers on press, ArrowDown moves the edit row
  2 → 3. Suite green.

**QA ROUND 9, 2026-07-31 (David: "thumb drag still very slow — reusing or
regenerating?"). Benched the REAL thumb gesture (full-range jumps per
frame, not the gentle scrub): 18–27ms/frame steady with 118–250ms SPIKES,
and the instance count crept to 78. Two compounding pathologies, both
fixed:**
- **Teleports don't overscan**: the momentum lead (built for flicks) made
  every thumb jump replace ~57 rows instead of ~27 — prefetch can't help a
  discontinuity (the next frame's window is simply correct). A jump past
  the whole viewport now gets the base buffer only.
- **The SPARE POOL**: when the lead flipped direction the window
  shrank-then-grew, DISCARDING clean rows and constructing fresh ones a
  frame later — the spikes. Clean evictions now PARK (hidden, capped 60)
  and the next growth unparks + re-points instead of constructing; the
  pool drains on windowing disengage. Steady-state thumb drags now
  construct NOTHING.
- Result: full-window teleports 10–16ms/frame, no spikes; the momentum
  flick stays at zero blank frames. The residual cost is honest: ~30 rows
  of constraint re-derives + native-input value writes + the style pass
  per full-window jump.
- (Variable row heights: still the v1 uniform-extent model by design —
  the measured-extent ladder remains the deferred increment recorded in
  materialization.md.)

**QA ROUND 10, 2026-07-31 (David's screenshot: a focus ring around a cell
the user never focused — "this state should not be possible" — and the
drag ghost should read as a highlighted card):**
- **FOCUS-AS-TOUCHED LANDED (the last D5 deferral).** The impossible state
  was recycling re-pointing a FOCUSED select cell's row at a different
  record — keyboard focus (and its ring) teleported to an arbitrary row.
  A row whose subtree holds the focus is now touched by definition:
  excluded from the recycle harvest, from parking, and retained alive at
  its logical place when it leaves the window — exactly the divergence
  rule, keyed on Focus.getFocus()'s ancestor chain. Pinned in the
  components tier (focus a windowed select cell, scroll 20,000px: the row
  stays in children, presents ITS record, focus undisturbed) and verified
  live.
- **The drag ghost is a highlighted card**: accent edge (1.5px), drop
  shadow, rounded corners, 0.95 opacity — unmistakably in hand over its
  neighbors, with the insertion bar marking the slot.

**QA ROUND 11, 2026-07-31 (David rules the MENU COLUMN MODEL, resolving
Apple's own unevenness — his screenshots showed the check/icon overlap in
the appearance menu vs Finder's icon column vs the View menu's mixed
check+icon rows):**
- **The ruled model, in menu.declare**: a CHECK column is ALWAYS present
  (fixed leading space whether or not anything is checked or checkable);
  an ICON column exists only when some row in THIS menu carries an icon —
  no icons, no gutter at all; and the TEXT LEFT EDGE is one line for every
  row (`textEdge = hasIcons ? 46 : 24`; check col 7.., icon col 25..).
  Custom (kind) rows' host aligns to the same text edge, so record-driven
  content obeys the columns too.
- **TintRow is dots-only** (ruled: color + the selected ring say
  everything): caption line deleted, height 42 → 22, left edge = the text
  edge via the host. A re-click still clears the tint.
- Pinned in the components tier (iconed menu: every label at 46, check at
  7, icon at 25; icon-less menu: every label at 24 — the check column
  alone leads). Verified in the appearance menu live.

**QA ROUND 12, 2026-07-31 (David: DataGrid on CANVAS — overlays don't
scroll, no scrollbar, the ring floats out of view). Four canvas-parity
gaps closed in canvas-backend.ts:**
- **The overlay reposition pass was missing the SCROLL term** (the paint
  transform subtracts a scrolling parent's offset; the native editable
  overlay walk didn't) — editable titles held still while rows scrolled
  beneath. The walk now rides the same translation, and a SCROLLER
  frame-bounds its overlays exactly as paint does (a scrolled-away field's
  overlay used to float outside the pane).
- **`setVirtualExtent` implemented on canvas** (it was DOM-only): the
  windowed block's logical extent floors every scroll clamp (wheel,
  scrollToY, scrollIntoView) — canvas grids scroll the full 500 rows.
- **Canvas panes have a SCROLLBAR now**: they never had one at all (DOM
  gets the platform's overlay bar for free) — a proportional thumb paints
  on the right edge whenever content overflows, in the frame-chrome layer.
- **`travelWith` implemented on canvas** (surface re-homing in the tree):
  the FocusRing rides the scroller on canvas exactly as on DOM — painted
  inside its clip and scroll translate, so it can no longer float outside
  a scrolled-away grid.
- Verified live (`?render=canvas`): titles track their rows mid-scroll,
  the thumb renders, virtualExtent > 13k, overlays clip at the pane. All
  tiers green (perceptual 111 included).

**QA ROUND 13, 2026-07-31 (David: the canvas scrollbar must mirror the
platforms — proximity widen + grab on fine pointers; no hover on touch,
touch-HOLD grabs and widens until release). All in canvas-backend.ts (the
renderer-layer rule reaffirmed this round holds):**
- The bar's geometry/scrub math moved onto CanvasSurface (barGeom/scrubTo,
  barWide state); the thumb paints 5px thin, 9px + a faint track when
  WIDE.
- The compositor owns the interaction: a mouse within the 16px edge band
  widens the bar (deepest scroller wins — the same frame-space walk as
  scrollBy); pressing the thumb grabs it where held, pressing the track
  JUMPS-TO-SPOT then grabs centered; window-captured moves scrub, release
  restores. Touch: only the THUMB arms, a 250ms hold with <8px wander
  engages the scrub and widens (iOS's grab-the-indicator); a pan before
  the hold stands down and the app's own pan proceeds untouched.
- Verified live both ways (headless Chrome): mouse hover widens + a 200px
  thumb drag scrubbed proportionally; touch hold widened, scrubbed, and
  un-widened at release. All tiers green.

**ROUND 14, 2026-07-31 — THE PRE-TRACKER KERNEL PAIR (David: "yep, do
that"). Both landed, closing the B8 prerequisites:**
- **VARIABLE-EXTENT WINDOWING (the measured ladder, Tracker criterion 1)**:
  the ExtentLedger — an estimate baseline plus IDENTITY-KEYED measured
  heights with Fenwick-indexed corrections (offset/indexAt O(log n); the
  index tree rebuilds only on membership change, beside the reconciler's
  existing O(n) bookkeeping). Rows measure per reconcile (the
  estimate-then-correct loop generalized per-row); a guessed estimate
  yields to the first real measures, thereafter re-baselining on >20%
  drift; corrections ABOVE the viewport's anchor compensate the scroll so
  the view holds still while estimates converge (the honestly-elastic
  scrollbar). Uniform collections never populate corrections and degrade
  to exactly the old i×unit math — proven: all prior pins pass unchanged,
  and the scrub bench holds its 8 ms/frame median.
- **PREPEND ANCHORING (criterion 2)**: on membership change the ledger
  rebuild computes the viewport anchor's offset shift (the member the view
  was resting on) and compensates scrollY — 50 records inserted at the top
  while reading row ~500 leave the row PIXEL-STABLE on screen (pinned).
- New pins: variable heights place exactly among measured neighbors
  (shallow and deep windows), the extent is estimate-honest; the prepend
  pin above. materialization tier 13. materialization.md's deferral record
  updated: recycling, focus-as-touched, layout-compose, and variable
  extents all LANDED this cycle; still deferred: selective-plan windowing,
  animator settle at dematerialization, VirtualLayout beyond vertical.
- Also this round: the desktop-input regression from the canvas bar (the
  claim band stealing the reader's inside-edge resize) fixed — the claim
  is the PAINTED bar's pixels only, the 16px band is hover-widen
  territory; and the suite exit-check now reads npm's real status (the
  earlier pipe-tail check had masked exactly one such failure).

**ROUND 15, 2026-07-31 — MAIN SYNCED INTO THE DATA TREE (David's call:
merge main in, build the Tracker, merge everything back). Main through
07e2ee9 is fully absorbed:**
- The effective baseline is 0cbf712 (the snapshot carried its content as
  uncommitted work). Absorbed: c6feb60's SELECTION half (the subtractive
  user-select realization + stamps + species defaults + the pointerdown
  anchor guard — the walk half was already here), 9889a51 (dom-backend:
  cross axis / raised window / stranded header), 9b5a721 (the mac build
  tree leaves the repo — mirrored by deletion), 07e2ee9 (.gitignore), and
  the app/index/doc absorptions (control.declare's selectable veto,
  homepage, CONTRIBUTING.md, README).
- Method note for the merge-back: blind `patch` on files with overlapping
  hand-absorptions silently REVERTED one (viewAt's content-space
  conversion — caught by the tier, root-caused to a fuzzy hunk). The
  reliable tool is `git merge-file` three-way per file (ours / 0cbf712 /
  main@HEAD): every runtime file merged CLEAN; only the two test tiles
  needed hand-resolution (both trees had added the same walk pins).
- unit 416 + gesture 33 green post-merge (gesture grew main's four
  selection/touch pins).
- **MERGE-MANIFEST.md generated at the tree root**: the one-directional
  merge-back set vs main@07e2ee9 (every entry is this tree's net-new
  work), with the kernel/library/compiler spine annotated and the
  post-copy rebuild recipe.

**B8 IS UNBLOCKED.** The Tracker builds against all 13 criteria with no
known platform gaps; the tree is at main-parity so the eventual merge back
is one-directional; the Tracker's scripted scenarios double as the
LLM-learnability eval's gold tasks.

**B8 BUILT (2026-07-31). The Tracker stands** — apps/tracker/tracker.declare
(~1050 lines, canon-commented, formatter-clean), the seeded generator
(tools/internal/gen-issues.mjs ↔ the in-app script block, synced by hand,
10k shipped as issues.json ~348KB gz), and test/tracker.test.mjs (15
scenarios, all green — criteria 1–10 and 12 plus grouped/collapse,
working-copy honesty, create-at-top/shared-selection; 13 = touch drag is
pinned in the components tier). Architecture is the doctrine end to end:
one truth (`db` + `rev`), projections as derived Datasets (filter → sort →
group with header records), search as a PURE derived hit-set over the data
(WeakMap haystack, Enter jumps materialize on arrival), the detail panel a
draft Dataset with `<->` and honest Save/Cancel, selection lifted and
record-typed, both presentations (windowed list + DataGrid) binding the
same projection. Live numbers on the exemplar box: boot 10k = fetch 65ms +
adopt 8ms; 100k regenerate 145ms, scrub 9ms median across a 7.6M-px
extent, search 20ms/11k hits; phone (400px) reflows to a chip-strip that
scrolls sideways, countless chips, dense rows, push-in detail.

The capstone caught four platform bugs QA never reached — the point of
building it:
- instantiate.ts: script scope now wraps LAZY materialization (construct
  AND finish) — replicated instances compile their bindings late and
  couldn't see `script { }` functions.
- view.ts travelWith: the ROOT is a real destination (home = the view's
  own parent) — the DataGrid header under a root-level grid could never
  escape its clipping scroller before.
- datagrid.declare: an escaped header mirrors the grid's visibility (its
  surface leaves the grid's display subtree, so the platform no longer
  hides it for free).
- tools/format.mjs: top-level `script { }` parses (passes through
  verbatim) — the Tracker is the corpus's first script-block file.

UX rounds after the one-shot: display fields (`labelsText`/`updatedText`)
written WITH the records at adopt/commit (not row-slot hacks — grid cells
read records); the grid reserves its header band below the toolbar;
`rearranged()` — filters/sort/grouping reset scroll to top, twice on
purpose because the kernel's anchor compensation (right for data edits)
re-pins the old row after the projection reconciles; compact = two-row
toolbar + sideways chip strip + desc-less rows.

Suite: full chain green, NPM-EXIT:0, prewarm regenerated. MERGE-MANIFEST
updated with the tracker files and the four fixes.

**Viewer round (2026-08-01, David's dark-mode review).** Three reports, three
real bugs, none of them the Viewer's own code:
- *Source tab empty*: the viewer's `plain` card sizes `hostWidth - 96`, which
  is NEGATIVE at attach; RichText.rebuild's `|| 640` guard only caught 0, so
  the flow built at content width 0 — and the all-`pre` reflow early-out
  (correct that pre content never rewraps) skipped the render that would have
  adopted the real width, leaving the DOM host at `width: 0` forever. Fixed
  both halves: rebuild/relayout guard `> 0`, and the early-out now syncs the
  host box through a new optional `Surface.setRichWidth` (width-only, no
  re-flow — the host box bounds the pre's native horizontal scroller).
- *Reader scrollbar invisible in dark*: browser-drawn scrollbar chrome
  followed the PAGE scheme, not the pane's. Extended the editable-scheme rule
  (dom-backend applyEditScheme — "the box's own background is the thing they
  sit on") to scrolling panes: a scroller's `color-scheme` derives from its
  own resolved fill, so a dark pane gets a light thumb even when the OS is
  light or the app's theme pill overrides.
- *Edit tab app missing*: the source page's `<base>` points at the Viewer's
  directory, so the island Tracker's relative `issues.json` fetch 404'd at
  `apps/viewer/issues.json` and the app sat on its entry screen. The host now
  passes `dataBase` (the VIEWED file's directory) and bootHost installs a
  transport (the provideTransport seam) that re-bases relative DataSource
  urls; absolute urls pass through.
- *Tab click rewrites the URL to apps/viewer/* (follow-up report): the
  location mirror pushed a BARE "#frag", and history resolves its url
  against the DOCUMENT BASE — the same <base> trap, third victim. The push
  now anchors to the page's own path+query (host-client.js), so
  `/declare/apps/tracker/?viewer#source` stays on the viewed file; back/
  forward restore URL and mode together.
Suite green, NPM-EXIT:0.

**Delete + menu-freeze round (2026-08-01, David's triage of the running
app).** Four fixes, three of them platform:
- *Bulk delete no-oped*: the confirm callback gated on ids (`primary`/`ok`)
  Dialog.ask never answers (`cancel`/`no`/`yes`). Now a proper destructive
  confirm (Cancel / Delete) via the open() seam.
- *No Delete key*: Table gained `deleteRequested()` — a delivery seam like
  Menu's `picked`, fired on Delete/Backspace only while the table IS the
  focus (target-only keys, so a field's Backspace can't be confused for
  it); DataGrid inherits. The tracker wires both views to the confirm flow.
- *The menu freeze* (reported as "first assignee pick freezes; mousemove
  unsticks"): profiled to a 3–5 SECOND main-thread task per filter pick.
  Two platform causes, both fixed:
  (1) expr.ts compiled every `{ }` body FRESH per replicated instance —
  no memo — so ~100 minted rows × ~30 bodies priced new Function + the
  datapath rewrite in seconds. compileExpr/compileBody now memoize on
  (script-scope identity, source[, params]).
  (2) `materialize = auto`'s threshold was the untuned placeholder (1000):
  a 10k→143 filter result fell to FULL materialization (~8ms per rich row)
  while the windowed path recycles standing rows in ~80ms. Tuned to 64 —
  just above what a viewport window builds anyway — per the bench the
  threshold comment always promised. Kernel also gained the membership-
  collapse scroll clamp (a real scroller clamps at its box; the abstract
  scrollY now agrees — criterion 4's "position lands sane").
  Measured: 3269/4826/2991ms picks → 233/272/262ms.
- *The RULED design — dismiss-then-deliver*: a pick DISMISSES first and
  delivery runs after the takedown has PAINTED (rAF + tick) — the native
  menu contract (AppKit ends tracking before dispatch; Win32 destroys the
  menu window before WM_COMMAND): transient chrome leaves the screen as
  part of the GESTURE, so a slow action can never freeze an open menu (or
  dialog — same change there) in place. Submenu chains still route
  synchronously to the root; buttons stay synchronous by design (persistent
  chrome; slow handlers are the app's bug). Also fixes the stuck-open menu
  an exception in the app's handler used to cause (delivery ran BEFORE
  close). Two test pins updated to await the deferred delivery.
Full-suite run pending (David held it).

**Design pass (2026-08-01, David: "world-class UX, not engineer design")
— app-only.** The Tracker now reads as a commercial tracker (Linear-class
reference): an ICON VOCABULARY replaces text codes — StatusIcon rings
(hollow open · dotted in-progress · filled+! blocked · check closed),
PrioIcon bar trios, Avatar initials in name-hashed hues, dotted label
pills with a "+n" overflow (the first two ride inline via SLICE
REPLICATION — `:labels[0:2][]`, B3's substrate in an app's hands); rows
are one calm 44px line, the title the single strong element, selection a
3px accent bar; chrome went ghost (quiet chips, capitalized labels, one
primary New-issue button), the bar/toolbar breathe (56px each), the
footer keeps its measured claims but retreats right; the detail panel
got display labels, a 17px semibold title, and a danger-ghost Delete;
an EMPTY STATE breathes in on a spring with one-press Clear all. The
Declare dynamism: chip counts are SPRUNG NUMBERS (`Spring [ attribute =
anim, to = { count } ]` — a spring on DATA; bulk moves roll the tallies),
the toast rises on a spring, the empty state enters on one, the detail
slides on the original. Known papercut: compact titles hard-clip (no
platform ellipsis; translucent-color fade has no authored spelling yet).

**THE MERGED DESIGN BUILT (2026-08-01, David: "Do it") — B-base + A-grafts
+ the critique's punch list, from the two clean-context design agents and
the critic (mockups + design-critique.md in the session scratchpad).**
- **The side panel is GONE — issues edit where they live.** A row's height
  SPRINGS from 44 to 356 and an EditorCard (one class, binding the same
  draft dataset — Save/Cancel/Delete semantics unchanged) rides inside it;
  New issue hosts the same card in a strip above the list. This exposed a
  REAL KERNEL GAP: reconcile's measurement pass is the constraint's APPLY
  (untracked), so an animating height never re-drove the ladder — rows
  below sat still while the editor opened over them. Fix (replicate.ts,
  ~1 line): match() now TRACKS the live window's heights, so the
  estimate-then-correct loop follows motion — height springs re-run match
  per frame and placement glides. The variable-extent showcase is now
  load-bearing UX.
- **The RAIL (B's instrument)**: rolling hero count (basis-labeled), the
  by-status distribution bar + rows, WORKLOAD·OPEN WORK (closed excluded —
  the critic's data-honesty point; identity-hued bars; peak stamped ON
  EACH ROW after two lessons that a row's cursor sees its record, not the
  root — no upward $data paths, D3 refused them), CLOSED·LAST 14 DAYS as
  14 replicated bars off `closedAt`, SCALE gauge relocated from the
  footer, quiet A-style ms readout, and the KEYBOARD block (only the
  shortcuts that exist: ⌘K, ↵, ⌫, esc). Rail rows are Controls — stats
  double as filters.
- **closedAt is truth**: the generator (both copies) stamps it for closed
  issues, and a SECOND seeded stream (main sequence untouched — no test
  churn) clusters ~30% of activity into the last 90 days at the true
  horizon; commit/bulk verbs maintain it.
- **The floating BULK BAR** (B's best surface): dark pill, rolling count,
  Set status ▾ / Delete… / ×, spring entrance. Toolbar bulk chip retired.
- Rolling numbers everywhere via one `Roll extends Text` (spring on the
  VALUE); group-header counts roll (the bulk-move receipt); empty state
  splits inbox-zero from no-match; footer slims to counts.
- Rail: railOn ≥1100px; list capped 1460 against unreadable measures.

**Design round 2 (2026-08-01, David's punch list).** Table view REMOVED
(the list is the product; DataGrid stays a library component, pinned by the
components tier); the SCALE control is a header Segmented (10k/100k/1M);
the rail's SCALE section became PERFORMANCE ("Adopt"→"Ingest" for civilians);
grouped rows INDENT 18px so status rings align under their header's ring;
status filter chips wear their color dot; the toolbar has a bottom hairline
sealing the two scroll regions; contributor names are CAPITALIZED IN THE
TRUTH (a .map on the pools — same literals, same seed sequence); the
assignee menus (filter + editor facet) list ONLY people who hold work,
alphabetized, each rendered as a PersonRow — the Menu `kind` seam: standard
row anatomy and the left check column, authored avatar+name content. The
table-view test became a rail-derivation test (counts re-derive on create;
workload rows carry peak; names capitalized).

**Design round 3 (2026-08-01, David's screenshot round).** His screenshot
caught a REAL KERNEL HOLE the first height-tracking fix left open: match()
tracks the window it LAST saw, so instances born in the following
reconcile of a burst (teleport → regenerate → settle) were DEAF to height
animation — expanding one painted the card over motionless neighbors. Fix
(replicate.ts): any structural change to the instance set pings
measureCell, scheduling one more match that adopts the newborns' heights.
Reproduced with his exact sequence; gap 44→356 with no nudge. Also:
header air between the scale Segmented and the appearance pill; Segment
gained a DISTINCT pressed depth (on=surface, down=line, hover=control);
the team shrank to 12 people (both generator copies; menus/workload
derive from truth so they follow); Grouped is a Checkbox; Sort split into
a field menu + a direction toggle button; the App declares
appName = "Declare Tracker" (the host reflects it to document.title).

**Design round 4 + the clean-artifact pass (2026-08-01).** Behavior:
sort field/direction sit together with the wide gap before New issue; a
multi-selection closes any open editor; opening an issue best-effort
reveals the whole card (post-spring); 10K/100K/1M capitalized; the
Checkbox library class stopped over-specifying its label color (prevailing
textColor now reaches it) and gained `size` — the toolbar restyles it with
plain attributes, no subclass. The assignee menus went back onto the
STANDARD column model via a Menu extension: `iconKind` — an item's icon
may be an authored class (the tracker's PersonIcon extends Avatar) created
into the icon cell, counting toward hasIcons; every label shares the text
edge, the check keeps its column, the row stays standard. The formatter
learned SLICE datapaths (`:labels[0:2][]` — bracket segments glue to the
path). The tracker source then got the top-to-bottom review: newcomer
markdown block comments at every section; the palette named once in
script land (TRK_GREEN…TRK_TEAL) with zero stray hex at use sites (the
bulk bar names its interior inks as its own slots); the row's geometry is
a named column map (colStat/colPrio/colTitle + the grouped indent);
q→query and full-word identifiers throughout (project's params, chrome
children); dead slots removed; every evolutionary/history comment
rewritten in present tense. All tiers green.

**The React control arm (2026-08-01, David's comparison experiment).**
A clean-room agent (no Declare access, neutral workspace) built the same
Tracker from the same functional brief (verbs/nouns/guarantees + S1–S15,
in scratchpad/tracker-react BRIEF.md + PROTOCOL.md), same data, same
measurement protocol. Result: React 18 + Vite, 2 runtime deps, hand-rolled
virtualizer; 1,482 LOC app code vs our ~1,125; 60KB gz wire vs our 98KB
(the un-tree-shaken platform bundle — a real cost to own); thumb-drag frames
8.3ms vs our 126.8ms (SEE BELOW — our number was measured wrong); search @100K 6.8ms median vs our 28ms (they build an
index at ingest — 56ms vs our 8ms; both far under the bar); 118 UI
assertions self-verified green. **SECOND FINDING (from David's Safari observation, confirmed by
re-measurement): our "9ms scrub" was a PROBE ARTIFACT** — setting
scrollTop then awaiting one rAF times rAF latency, not the reconcile,
which the scroll event dispatches afterward. True frame-to-frame cost
during a dragged thumb: 112ms @10K, 127ms @100K (~8fps) vs React's flat
8.3ms; wheel-ish scrolling is fine (13–19ms). Cost is SCALE-INDEPENDENT
⇒ per-window-replacement, not data volume: a teleport misses every
current row and the profile is DOM churn (insertBefore/insertChild), so
recycling is not holding on a total-miss window. FILED as a kernel work
item. Every scrub number in earlier QA rounds used the same flawed probe
and must be re-taken. **FIRST FINDING: Chrome saturates layout at
~33.5M px — they detected and engineered around it; WE HAVE THE SAME BUG
LIVE at 1M** (strut clamps at 33,554,428px; scrollbar reaches only row
~762K of 1M; 100K unaffected). FILED: kernel work item — extent
compression + scroll mapping in the windowed reconciler. Full table:
scratchpad/comparison.md. Caveat recorded: one run per side; maturity
asymmetry runs both ways.

**Search reworked (2026-08-01, David: "filter out non-matched") — app-only,
no platform surface touched.** The query is now ONE MORE FILTER on the
projection (matched before sort, timed inside project(), the ms riding out
on the value — pure): typing narrows the list like a status chip does,
clearing restores. The hit machinery (hits/hitHas/jumpHit/hitAt + the
bold-in-place highlight) retired — an editor bolds its finds, a tracker
hides its non-matches. Enter/omnibox-arrows walk the narrowed rows
(stepHit/enterHit; Enter opens the walked row); the omnibox counts matches;
q changes ride rearranged(). Criterion 6's test now pins the narrowing
(every shown row matches, walk selects+materializes, clearing restores);
the differ script swapped jumpHit→stepHit. 10k search 3ms; 100k cold
45ms (haystack build included).

## The mission (queue item 2 — see docs/system-design/)

1. **data-paths.md** — RULED build order: the scanner-truncation fix FIRST
   (§2), then JSONPath reads per RFC 9535 + JSON Pointer writes + optional
   schemas (§10's order; §9 — the reactive integration — is the actual work).
2. **materialization.md** — invisible virtualization (PROPOSED, David very
   favorable; observer boundary + navigate-to-record + windowing-aware AT +
   the inspector diagnostic RULED 2026-07-30). Companions:
   materialization-antecedents.md (the Apple lineage),
   materialization-field-sentiment.md (the complaint corpus).
3. **Retiring `key`** — materialization.md §4's three moves, gated on
   JSONPath selections landing.
4. Then: CRUD components (combobox/table/datagrid + the axis-scoped
   drag-claim primitive) build on this substrate — a later thread.

## Baseline record

baseline commit: 4e69c50 the gaps audit gains its inverse: what an LZX → Declare transpiler would cost

uncommitted at snapshot:
 M apps/calendar/calendar.declare
 M apps/desktop/desktop.declare
 M apps/docs/chapters/05-space.json
 M apps/docs/chapters/09-data.json
 M apps/homepage/stats.json
 M browser/boot-uniform.js
 M bundles/cache/4436c76292e46980.json
 M bundles/cache/51001e78447f1680.json
 M bundles/cache/8450eddd6ca3b8b2.json
 M bundles/cache/8d49c5d13d61839e.json
 M bundles/cache/adf809679a123c6c.json
 M bundles/cache/f1bc71918611f11e.json
 M bundles/declare-boot.js
 M bundles/declare-compiler-mac.js
 M bundles/declare-compiler.js
 M bundles/declare-mac.js
 M compiler/dist/crawl.js
 M compiler/dist/crawl.js.map
 M compiler/dist/dep-extract.js
 M compiler/dist/dep-extract.js.map
 M compiler/dist/flags.d.ts
 M compiler/dist/flags.js
 M compiler/dist/flags.js.map
 M compiler/dist/headless.js
 M compiler/dist/headless.js.map
 M compiler/dist/reqtypes.d.ts
 M compiler/dist/reqtypes.js
 M compiler/dist/reqtypes.js.map
 M compiler/dist/scaffold.js
 M compiler/dist/scaffold.js.map
 M compiler/src/crawl.ts
 M compiler/src/dep-extract.ts
 M compiler/src/flags.ts
 M compiler/src/headless.ts
 M compiler/src/reqtypes.ts
 M compiler/src/scaffold.ts
 M docs/declare-model.json
 M docs/declare.md
 M docs/guide/05-space.md
 M docs/guide/09-data.md
 M docs/operational/flags.md
 M docs/system-design/claim-surface.md
 M docs/system-design/materialization.md
 M "docs/tenets/1 SATOR.md"
 M index.html
 M package-lock.json
 M package.json
 M runtime/dist/backend.d.ts
 M runtime/dist/boot.js
 M runtime/dist/boot.js.map
 M runtime/dist/canvas-backend.js
 M runtime/dist/canvas-backend.js.map
 M runtime/dist/check.js
 M runtime/dist/check.js.map
 M runtime/dist/dom-backend.js
 M runtime/dist/dom-backend.js.map
 M runtime/dist/image.d.ts
 M runtime/dist/image.js
 M runtime/dist/image.js.map
 M runtime/dist/index.d.ts
 M runtime/dist/index.js
 M runtime/dist/index.js.map
 M runtime/dist/instantiate.js
 M runtime/dist/instantiate.js.map
 M runtime/dist/registry.js
 M runtime/dist/registry.js.map
 M runtime/dist/schema.js
 M runtime/dist/schema.js.map
 M runtime/dist/view.js
 M runtime/dist/view.js.map
 M runtime/src/backend.ts
 M runtime/src/boot.ts
 M runtime/src/canvas-backend.ts
 M runtime/src/check.ts
 M runtime/src/dom-backend.ts
 M runtime/src/image.ts
 M runtime/src/index.ts
 M runtime/src/instantiate.ts
 M runtime/src/registry.ts
 M runtime/src/schema.ts
 M runtime/src/view.ts
 M server/create.mjs
 M test/gesture.test.mjs
 M test/serve.test.mjs
 M test/slim.test.mjs
 M test/unit.test.mjs
 M tools/declarec.mjs
 M tools/internal/bundle-freshness.mjs
 M tools/internal/doc/extract.mjs
 M tools/internal/doc/prose/Image.md
 M tools/internal/sim/drive.mjs
?? apps/probe/
?? browser/bench-core.js
?? browser/mac-boot.js
?? browser/mac-env.js
?? docs/system-design/materialization-antecedents.md
?? docs/system-design/materialization-field-sentiment.md
?? docs/system-design/streams.md
?? mac-host/
?? runtime/dist/mac-backend.d.ts
?? runtime/dist/mac-backend.js
?? runtime/dist/mac-backend.js.map
?? runtime/dist/stream-seam.d.ts
?? runtime/dist/stream-seam.js
?? runtime/dist/stream-seam.js.map
?? runtime/dist/streams.d.ts
?? runtime/dist/streams.js
?? runtime/dist/streams.js.map
?? runtime/src/mac-backend.ts
?? runtime/src/stream-seam.ts
?? runtime/src/streams.ts
?? test/fixtures/dot.png
?? test/fixtures/net-live.declare
?? test/fixtures/net-live.json
?? test/fixtures/sse-live.declare
?? test/fixtures/ws-live.declare
?? test/network-browser.test.mjs
?? test/streams-browser.test.mjs
?? test/streams.test.mjs
?? tools/internal/build-mac.mjs
?? tools/internal/doc/prose/EventStream.md
?? tools/internal/doc/prose/Socket.md
?? tools/internal/doc/prose/Stream.md
?? tools/simdrive.mjs
