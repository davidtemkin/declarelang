# OpenLaszlo → Declare — the structural gap audit

> **Provenance (2026-07-28).** Measured against the OpenLaszlo 4.9.0 source
> (`lps-4.9.0`: the LFC under `WEB-INF/lps/lfc`, the component tiers under
> `lps/components`, the tag compiler under `WEB-INF/lps/server`) and the current
> Declare runtime/compiler/library at HEAD. Three parallel inventory sweeps plus
> spot verification of every "absent" claim against `runtime/src`; §8's corpus
> proportions measured 2026-07-29 over 1,059 files. This is the *audit*; the
> standing design queue is [declare-language.md](declare-language.md) §13,
> which this doc cross-references rather than repeats.

The question this doc answers: every construct in OL exists for a reason. For
each one Declare lacks, is the reason **dissolved** (the problem no longer
exists), **answered differently** (a better mechanism covers it), or **unmet**
(a real gap)? Two gaps get full design-depth treatment: slots/placement (§6)
and virtualized replication (§7). §8 then asks the inverse question — what it
would take to translate LZX source into Declare source mechanically — because
the answer turns out to depend on this document's own rankings.

---

## 1. The lifecycle constructs, with their real names

OL has no `oncreate` and no `onshow`. The real surface:

| OL event | fires | Declare | verdict |
|---|---|---|---|
| `onconstruct` | end of instantiation, before children | — | dissolved: the two-pass build (construct → install constraints → init) leaves nothing for a pre-children hook to do |
| `oninit` | after `init()`, children first | `onInit` — children-first, after constraints are installed and evaluated once, before first paint | same construct, kept |
| `oninited` | immediately after `oninit` | — | era artifact |
| `ondestroy` | just before destruction | **nothing authorable** (`discard()`/`onDiscard` exist in the runtime, unexposed) | **gap — §5.2** |
| `canvas oninit` | once, when the *whole app* has constructed and initialized | App `onInit` | dissolved: OL needed a separate settled event because instantiation was an async, queued, trickling process (`initstage`, `percentcreated`, `lz.Instantiator`); Declare builds synchronously, so App `onInit` *is* the settled moment |
| `canvas onafterinit` | after canvas `oninit` | — | era artifact |
| `on{attr}` (every attribute change) | on `setAttribute` | constraints; `State` `onApply`/`onRemove` is the sanctioned effect-on-change hook | answered differently, by design |

There is no "everything loaded" event on either side. OL exposed per-view
`onload` and canvas `percentcreated`; Declare's answer is reactive state
(`data.loaded`, `Image.loaded`) — derive, don't await.

### `clickable`

In OL, `clickable` (default false) controls hit-testing, event dispatch, *and*
the hand cursor, at the sprite layer (`LzSprite.setClickable`: when false the
view is hit-test-transparent). The compiler auto-sets it when a mouse handler
appears **lexically in the tag** (`NodeModel.computeDefaultClickable`), with
real traps: handlers declared via `<method>` or attached via `reference=` did
not imply it, nor did the drag events (`onmousedragin` etc.), so authors wrote
`clickable="true"` by hand at the failure points.

Declare's `runtime/src/view.ts` (`inputSink`) names the lineage explicitly:
interactivity **derives from declared handlers** — "LZX's `clickable` intent,
made automatic" — occlusion-correct, pay-per-use, with `pointerEvents = "none"`
as the opt-out and `tip` as the one handler-free way to become
hover-interactive. OL's residual idiom (a handler-less click-blocker) is an
empty `onClick(){}` — the Dialog scrim. **Closed, strictly better**: the
derivation is runtime-truthful rather than compile-time-lexical.

---

## 2. Runtime construct mapping

### Input and pointer

| OL | Declare | verdict |
|---|---|---|
| `onclick/ondblclick/onmousedown/up/over/out` | same set plus the resolved layer (`onClick` slop-gated and withheld during the dbl window, `onHold`) | kept, better |
| `onmousedragin/dragout/upoutside` | pointer capture on press + root-space move/up + `e.canceled` | answered better |
| `lz.Track` (mousetrack groups: menus, DnD) | `hovered` intrinsic (chain-based, live during press) + MenuBar's internal macOS tracking | answered |
| `lz.GlobalMouse` | `app.pointerX/Y`, `pointerDown`, `hovering` — reactive attributes, not events | answered better |
| `showhandcursor`, `lz.Cursor` global lock | `cursor` attribute, `""` = inherit | answered |
| `clickregion` (vector hotspot) | box + `clip` hit rules | close enough; no demand signal |
| **`<contextmenu>` + right-click** (full construct: per-view menus, `onmenuopen`, hide-built-ins) | **nothing** — no button distinction on pointer events, no `contextmenu` in `POINTER_TYPES`; `Menu.openAt` is the answer with no reachable question (`library/menu.declare` even documents `onContextMenu` in its worked example) | **gap — §5.3** |

### Instantiation and structure

| OL | Declare | verdict |
|---|---|---|
| `initstage="late"/"defer"`, trickle, `completeInstantiation()` | States (children materialize on apply = `defer` reborn); synchronous build retires the rest. Already queued as "lazy/deferred instantiation" in §13 | dissolved / see §7 |
| `visibility="collapse"` | the explicit `visible`/opacity ruling | answered by design |
| `<class extends>` | `class X extends Y` | kept |
| `<mixin with=>`, `<interface>`, `<trait>` | single inheritance only | OL shipped exactly **one** mixin (boxmodel) in its life; already §13 "watch" item |
| `<attribute type= when=>` | typed reactive declarations + real TS typechecking | answered better (`once` timing already §13) |
| `<setter>` | the `input(v)` seam / value contract | answered; accessor form already §13 |
| `<state apply()/applied>` | `State` (`applied`-only; imperative verbs unreachable, by ruling) | kept |
| `<animator>/<animatorgroup>` | `Animator`/`AnimatorGroup` + `Spring`, richer motion vocabulary | kept, better |
| layouts: simple/constant/resize/stableborder/reverse/wrapping | SimpleLayout/WrappingLayout/ResponsiveLayout + `Spacer` + constraints | answered (stableborder was 3-slice-art machinery — era-dead) |
| **`placement` / `defaultplacement`** | **nothing** | **gap — §6** |
| multi-frame `<resource>`, `frame`/`play`/`stop` | `draw(d)` + reactive constraints replace icon-state flipping | answered differently; asset story still §13 |
| `<splash>`/preloader | — | dissolved (synchronous fast boot) |
| `<switch><when runtime=>` | build flags (`render = dom\|canvas`) | answered enough |
| `<passthrough>` | `script { }` | answered |

### Data

| OL | Declare | verdict |
|---|---|---|
| XML datasets + XPath + `$path` | JSON `Dataset`/`DataSource` + `:path` cursors | modernized; standards plan in [data-paths.md](data-paths.md) |
| two-way `$path` + `updateData()` | `<->`, editors only | answered by design, deliberately narrower |
| multi-match replication + pooling | `:arr[]` + `key=` keyed reuse (`replicate.ts` cites the OL pool idea) | kept |
| **lazy / resize replication** (create only what fills the mask) | **nothing** — keyed replication still materializes every record | **gap — §7** |
| `<connection>` / `<connectiondatasource>` (server push) | `DataSource` is request/response only | **open stance needed — §5.6** |
| `<datapointer>` cursors | `read/set/insert/removeAt/move` mutation API | answered |
| `autorequest` (refetch on param change) | `auto = true` loads; refetch-on-change unstated | minor, fold into data work |
| RPC tier (soap/xmlrpc/javarpc) | — (already §13: "await a TS function" stance) | era-dead |

### Services

| OL | Declare | verdict |
|---|---|---|
| `lz.History` + back button | `app.location` — two-way reactive URL slice, crawler-indexable | answered, much better |
| `lz.History.setPersist`, cookies dance | no construct; `localStorage` **is** in the compiler's known-globals (`compile.ts` BROWSER_GLOBALS), so handlers reach it | soft gap: capability open, doctrine absent |
| `lz.Browser.setClipboard` | no construct; `navigator` reachable in handlers | soft gap, same shape |
| `lz.Timer` / `lz.Idle` | `setTimeout`/`setInterval` / `Heartbeat` | answered — but "cancel it yourself" collides with no-teardown, §5.2 |
| `lz.ModeManager` (modal stack, event locking) | Dialog scrim (geometric modality) + `focusTrap` | answered differently |
| `lz.Focus`, `focusable/focusTrap`, `getNextSelection` | `Focus` service, same attrs, `tabOrder()`; no numeric tabindex | answered, better |
| `lz.Keys.callOnKeyCombo` | `Keys` source; chords implemented (`keys.ts`) but not in `LANGUAGE_STATICS` | exposure gap, small |
| `lz.Audio` + `<audio>` assets | **nothing**; `DOMIsland` cannot reasonably host a click sound | **gap — §5.7** |
| Flash a11y attrs (`aaname`…) | native text editables only; no ARIA surface in `runtime/src` | structural flag — the canvas renderer can't ride the DOM for free |

### View visuals

| OL | Declare | verdict |
|---|---|---|
| `rotation` (any angle) | `scale`/`pivotX/Y` only | **gap, minor — §5.8** |
| `colortransform`/`tintcolor` | theme tokens, `Themes.tint` | answered |
| `stretches`/`unstretchedwidth` | `Image.stretches` | answered |
| `align`/`valign` (constraint-implemented) | `center`/`end` keywords, layouts, `Spacer` | answered |
| `pixellock` | — | dissolved (DPR is the platform's) |
| shadow quartet | `shadow(dx, dy, blur, color)` | kept |
| `clip` boolean + `mask` | `clip` as arbitrary Shape | kept, better |

---

## 3. Component inventory

OL's shipped tier (`lz/`, 220 auto-included tags overall) against `library/`.
Context for expectations: OL itself never promoted a color picker, rich-text
editor, or validators out of `incubator/` — those were gaps in OL too. And the
current library is explicitly scaffolding
([composition.md](composition.md) §1a: "simple PLACEHOLDERS, to be revisited").

| OL | Declare | status |
|---|---|---|
| button | `Button` | ✓ |
| checkbox | `Checkbox` | ✓ |
| radiogroup/radiobutton | `RadioGroup`/`Radio` | ✓ |
| edittext | `TextInput` | ✓ |
| slider | `Slider` | ✓ |
| scrollbar (h/v) | native `scrolls` (the axis enum: `y`/`x`/`both`) | ✓ different, better |
| modaldialog / alert | `Dialog` | ✓ |
| menubar / menu / menuitem | `MenuBar` / `Menu` (record-driven) | ✓ |
| tooltip | `Tooltip` (auto-provided) | ✓ |
| focusoverlay | `FocusRing` | ✓ better |
| tabslider / tabelement | `Accordion` / `Pane` | ✓ |
| drawview | `draw(d)` member | ✓ better |
| html view | `DOMIsland` | ✓ |
| image | `Image` | ✓ |
| vbox/hbox | `SimpleLayout` | ✓ |
| text / statictext | `Text`, `Markdown`, `HTMLText` | ✓ better |
| six `<style>` themes | four city presets, light+dark, token-complete | ✓ better |
| — | `Switch`, `ProgressBar`, `Spring`, `AppIsland`, `ResponsiveLayout` | Declare-only |
| **combobox / datacombobox** | — | missing |
| **list / listitem / floatinglist** | — (per-app replication + hand-rolled selection) | missing |
| **tabs / tabpane** | — | missing |
| **tree** | — | missing |
| **grid / gridcolumn** | — | missing |
| **datepicker** | — (the calendar *app* is not a component) | missing |
| **window** (drag/resize/close) | — (desktop hand-rolls its own) | missing |
| **form / submit** (+ incubator validators) | `Field` (layout only); `Editor`'s `valid`/`error`/`dirty`/`commitOn` is per-control — no form-level aggregation | partial |
| **charts** (bar/column/line/pie) | — | missing; not the model to copy |
| **videoplayer / av stack** | — (`DOMIsland` escape) | missing |
| selectionmanager / dataselectionmanager | — (each app re-derives selection) | missing as a reusable |

Most of the missing rows are *unbuilt*, not *blocked*: Menu proves the
record-driven pattern scales to this family (items as data, `kind:` for
arbitrary row content). The two that press on a language gap are **grid**
(column templates) and **tabs** (arbitrary pane content) — both stack on §6.
All of it belongs to the deferred library-charter effort, not to this audit.

---

## 4. Dissolved for a reason worth recording

These are the cases where OL's construct answered a problem Declare's
architecture removed — worth recording so nobody "restores" them:

- **`lz.Instantiator` + `initstage` + `percentcreated` + `<splash>`** — an
  entire scheduling subsystem existed because Flash-era instantiation was slow
  and asynchronous; order-independence needed a two-pass queue. Declare's
  synchronous two-pass build with constraints keeps the order-independence and
  discards the scheduler.
- **`on{attr}` events as the reactive primitive** — OL's constraint system was
  *built on* per-attribute events plus compiler-extracted dependency lists
  (`$always` → delegates on `"on"+dep`). Declare's cells subsume the event
  layer; exposing change-events would reintroduce the two-system problem.
- **`clickable`** — a manual/compile-lexical approximation of "has handlers";
  now derived truthfully at runtime.
- **`visibility="collapse"`** — auto-hide on opacity-0/datapath-miss/loading;
  Declare ruled opacity and visibility distinct on purpose (the press-catcher).
- **Event bubbling** — OL had none either (single-view dispatch + explicit
  `lz.GlobalMouse`); Declare's no-bubbling rule is continuity, not a loss.

---

## 5. The real gaps, ranked

1. **Slots / placement** — §6. Already a §13 item; promoted here because the
   component table shows it is the load-bearing blocker under grid, tabs,
   window, and Field's deferred note line.
2. **No teardown hook.** `onInit` has no counterpart. The runtime's
   `discard()`/`onDiscard` machinery is built and used internally
   (`editor.ts`, `heartbeat.ts`, `replicate.ts`) but unexposed. The doc's own
   ruling "a timer does not die with its node, so cancel it yourself" is
   *impossible to obey* inside a replicated instance or State subtree that gets
   torn down. Sources being lifetime-managed covers most cases; timers and
   external handles are the residue. Cheap to close: expose what exists
   (`onDiscard()` handler or equivalent), state the doctrine.
3. **Right-click.** No pointer-button distinction and no context-menu event.
   `Menu.openAt` already implements the hard half. Needs: a resolved
   `contextMenu` event (it is a *command*, not a manipulation — it belongs in
   the resolved layer next to `onClick`), a stance on touch (long-press
   already exists as `onHold`), and a stance on suppressing the browser menu
   (pay-per-use: only a declared handler suppresses).
4. **Virtualized replication** — §7, now designed as invisible
   virtualization in [materialization.md](materialization.md).
5. **The component families** (select/combobox, list, tree, grid, datepicker,
   tabs, window, form aggregation) — library-charter work; grid and tabs gate
   on #1.
6. **Live data.** `DataSource` is request/response; OL shipped `<connection>`
   for push. A modern successor needs a stance even if it is "a handler
   feeding a reactive slot" (WebSocket/SSE in `script { }`, results landing in
   a `Dataset` via the mutation API — which would make this a *doc* item, not
   a runtime one).
7. **Sound.** OL had `<audio>` assets + `lz.Audio`. Smallest real runtime gap;
   `new Audio(url)` in a handler works today but is unruled.
8. **Rotation.** `scale`/`pivot` exist; rotation doesn't. Add alongside them
   if/when a real program asks.

**Soft gaps** (capability present via handler TypeScript, doctrine absent):
clipboard, persistence (`localStorage`). **Watch, don't build:** mixins, key
chords exposure, per-target conditionals, charts.

**Cross-cutting flag: accessibility.** OL's a11y was Flash-era MSAA and thin,
so this is not an OL-regression — but Declare's canvas renderer means a11y
cannot ride the DOM for free, and nothing ARIA-shaped exists in `runtime/src`.
Same rank as the top of this list, tracked separately.

---

## 6. Slots / placement — the deep dive

### 6.1 What OL's mechanism actually was

Three attributes and one overridable method, all resolved **once, at
construct** (`LzNode.determinePlacement`; "do not expect to be able to 'place'
a view properly after it has been constructed"):

- **`placement="regionName"`** on a child: the child is *declared* under the
  component but *lives* inside the named subview. `<view placement="title_area">`
  inside a `<window>` physically parents into the window's title bar.
- **`defaultplacement="regionName"`** on a class: where **use-site** children
  land by default. The critical asymmetry: the class's *own* body children
  build the chrome (header, borders, the content region itself) and are not
  rerouted; children written *at the use site* flow into the designated region.
- **`placement="null"` / `ignoreplacement`** — opt-outs, used by chrome that
  must stay at the top level (window.lzx's `_resizeControl`).
- **`determinePlacement(subnode, placement, args)`** — overridable, so routing
  could be computed (menus route items into the floating list; grids route
  columns into the header row).

Corpus reality: `placement=` 612 uses; `defaultplacement` on essentially every
composite in the shipped set — `window` (`wcontent`), `windowpanel`/`tabelement`/
`tabslider`/`list`/`form`/`edittext` (`content`), `tabs` (`borderedcontent`),
`menu` (`mbarcontent`). The **dominant use, by far, is the single-interior
case**: "my chrome wraps your content." True multi-region routing (a child
*naming* a non-default region) is the minority tail.

The cost OL paid: a two-name identity split. A placed child's `parent` was its
lexical declarer while `immediateparent` was where it physically lived, and
every author eventually hit the difference (constraints against `parent.width`
meaning the wrong box). Any Declare design must not reproduce this.

### 6.2 What Declare does instead — three modes, and what each can't do

1. **Children as content, component arranges** (Accordion/Pane, RadioGroup,
   Field): use-site children are direct children of the instance, arranged by
   the component's own `layout`. Pane works because its chrome (the `header`)
   is a *sibling* of the content in the same stack, and the clip + height
   spring do the reveal. The limit is exact: the component **cannot put
   anything around, under, or beside the content region** — no inset panel, no
   scrolling interior (`scrolls = y` needs the content *inside* the
   scrolling view), no fixed footer below the content, no bordered content
   well. The moment chrome must nest content, this mode is out.
2. **Records** (`Menu.items`, `Dialog.buttons`, `MenuBar.menus`): "what a
   component arranges, it takes as records" (declare.md library contract).
   Covers homogeneous, component-owned content perfectly, and `kind:`/`props`
   is the escape for arbitrary *row content* — but the row's container,
   behavior, and chrome stay the component's. Records answer "many items of my
   kind"; they do not answer "your one subtree inside my frame."
3. **Component-typed attribute slots** (`layout: SimpleLayout [ … ]`): the
   existing precedent that an attribute's value can be a declared component
   instance. This *is* a named slot in the type dimension — but its value is a
   component the class consumes, not a view subtree the class places.

The concrete casualties in the repo today: `library/field.declare`'s note line
(deferred, explicitly citing this gap), a real `Window`, `Tabs` with authored
pane content, `Dialog` with a custom body above the standard button row, grid
columns, and — beyond the library — every *app-level* "frame" pattern: a Card,
a collapsible section with a scrolling interior, a Screen with fixed header
over scrolling content. Apps currently hand-assemble these at every use site.

### 6.3 Is a slot model still worth having, given the record doctrine?

**Yes — for the single-interior case, and mostly *outside* controls.** The
record doctrine is right where it is (option lists, menu items, dialog
buttons: homogeneous, data-shaped, component-behaved). What it cannot express
is the *frame*: one authored subtree, wrapped by component chrome. That
pattern is not a control-library nicety; it is how apps factor repetition
(every Screen/Card/Panel in the corpus apps is copy-pasted chrome today), and
it is the difference between `Field` as "label column" and `Field` as the
complete form row (label + control + note/error line).

The judgment this audit supports:

- **Build the single-interior form.** OL's corpus says it is ~all of the
  demand. In Declare's grain the *class* should mark the region, not the child
  name a destination: one internal view designated as where use-site children
  construct — the `defaultplacement` half only. A sketch of the shape (not a
  ruling): a marker attribute on one descendant of the class body
  (`content: View [ interior = true, scrolls = y, … ]`), with use-site
  children constructing inside it. Exactly one region; zero new syntax at the
  use site; the use site cannot even tell.
- **Defer per-child routing** (`placement="title_area"`). The minority tail in
  OL, and Declare has two of its jobs covered already (records for item-shaped
  content; named component-typed attributes for single-component slots like
  `layout:`). If multi-region returns, it should return as *named attributes
  typed as view subtrees*, not as child-side routing strings.
- **Rule the identity questions before implementing** — they are the actual
  design work, and OL's scar tissue marks each one:
  - `parent`: must mean the **physical** parent (the region), one name, no
    `immediateparent` split. The component author chose the nesting; the
    content author's constraints (`parent.width`) must be true of the box they
    actually sit in.
  - The component itself stays reachable as `classroot` from *its own* chrome,
    but use-site children's `classroot` is the **use site's** class — the same
    scoping rule replication already implements for templates
    (`replicate.ts`: classroot = the template's use-site scope). The plumbing
    for "built here, scoped there" exists.
  - States, replication, and datapaths in use-site children must behave as if
    the children were written where they land — which the source-merge +
    construct pipeline already guarantees for replication instances, the
    precedent to lean on.
  - Auto-extent: the region's unsized axes size to the placed content
    (existing `contentWidth/Height` semantics keep working because the
    children really are the region's children — placement is *construction
    routing*, not a render-time redirect).

That last point is the deep simplification available to Declare that OL never
had: because routing happens **once, at construct, into a real parent**, no
runtime indirection survives — after construction the tree is ordinary, every
existing rule (hit testing, layout, focus traversal, replication) applies
untouched. OL paid a permanent two-name tax because its placement *also*
resolved at construct but kept the lexical parent as `parent`. Declare should
route and forget.

Interaction with the record doctrine, stated so the two don't blur: **records
for what the component arranges; the interior for what you arrange inside its
frame.** A component may legitimately have both (`Dialog [ buttons = […],
<your body> ]`).

### 6.4 Imperative creation — which door routes

Declare has two imperative doors at different altitudes, and they should sit
on opposite sides of the routing layer:

- **`app.createView(tag, parent, props?)` routes.** It is the sanctioned
  "declare a child here, from code" door — Menu's `kind:` rows use it
  precisely because instances made this way run the full construct pipeline
  and are indistinguishable from written children ("instances are full
  citizens"). If slot routing is *construction semantics* — part of what it
  means to become a child of a slotted component — createView must honor it,
  or the same `(tag, parent)` pair would produce different trees depending on
  the door used, and "the use site cannot even tell" would be false for
  exactly one caller class. `app.createView("Row", myPanel)` lands in
  `myPanel`'s interior, same as writing `Row [ ]` inside `Panel [ ]`.
- **`insertChild(v, at)` does not route.** It is physical linkage — tree
  surgery below construction semantics. Replication depends on it for
  exact-position splicing (the Replicator's anchor arithmetic computes real
  child indices; routing underneath it would corrupt block positions), and it
  is the natural escape for the one caller who legitimately needs chrome-level
  insertion: the component author, who holds references to the internal views
  anyway.

That split answers "how does the author imperatively add to their own
chrome?" the way Menu already does: target the internal view directly
(`app.createView("Thing", this.headerArea)`). Because routing happens once at
construct into a real parent, a region is just a view — naming it as `parent`
is not an override mechanism, it is the ordinary case. No `placement="null"`
analog is needed, which is exactly the surface OL accreted and Declare
shouldn't.

Consequences to pin with the ruling:

- **Index semantics.** createView appends within the interior; a caller
  needing a precise position uses createView then `insertChild` against the
  region. Declarative use-site children keep source order within the interior
  — and replication works untouched, because the template *and its
  Replicator* are themselves use-site children living in the interior, so the
  anchor logic runs among the interior's real children with no special
  casing.
- **`removeChild` / `discard` stay physical** — a child is removed from where
  it actually lives. No routing on the way out.

### 6.5 Order

The single-interior slot precedes the library charter's composite tier
(window, tabs, grid, full Field) and unblocks app-level frame components.
It slots into §13's "Slots / placement" entry as the resolved scope:
single-interior now, per-child routing deliberately not.

---

## 7. Virtualized replication — the deep dive

### 7.1 How OL did it

`LzLazyReplicationManager` (opt-in: `<datapath replication="lazy">`):

- **A pool sized by the viewport, not the data.** It required a clipped
  ancestor (the "mask"), measured one clone, and created
  `ceil(mask / cloneSize) + buffer` instances — "only as many views as are
  necessary to display underneath the mask."
- **It owned layout.** Replicated views ignored layouts; the manager placed
  them (hence `axis`/`spacing` on the datapath) and faked the total scrollable
  extent.
- **Scrolling re-bound, never re-built.** As the container moved, each pooled
  clone's datapath was re-pointed at a different record and repositioned.
  Pooling was forced on.
- **Uniform sizes** in the lazy manager; `replication="resize"` relaxed that
  (per-record heights, incl. content-sized) at extra cost.

Restrictions authors lived with: mask required, implicit layout, no per-clone
layout participation, positional identity (a clone's state did not follow its
record — the price of re-binding).

### 7.2 Superseded: the design moved to materialization.md

> **2026-07-28, after David's challenge** ("giant datasets should just look
> like a regular dataset"): §7.2–7.4 below described an OL-shaped *visible*
> windowed mode — a pooled reconcile with a state-loss doctrine the author had
> to learn. That stance is superseded by
> [materialization.md](materialization.md): **logical instances, runtime
> materialization** — a record that matches *has* an instance; whether it is
> physically constructed is the runtime's business, like paint. Divergent
> local state is runtime-visible (the reactive graph owns the cells), so
> untouched rows reconstruct invisibly and touched rows are retained
> (human-bounded memory); `onInit` fires per record-membership, not per
> construct. That doc also covers retiring `key`, the four-way performance
> comparison, and the in-memory vs. over-the-wire scope boundary. The
> sections below are kept as the audit trail of how the first answer looked
> and why it was wrong: the burden was an artifact of frameworks that don't
> own layout, scrolling, and state — Declare owns all three.

### 7.3 The superseded first answer (audit trail)

#### What Declare already has, mapped against that

The striking thing is how much of the *hard* part the current architecture
already owns:

- **The window can be a tracked derivation.** The `Replicator` is an ordinary
  `Constraint` whose `match()` returns the item set; its inputs re-derive it.
  `scrollY` is a live, readable attribute (scroll-driven effects are already
  sanctioned), and viewport extent is `height`/`contentHeight`. A windowed
  `match()` — slice the array by scroll position — is the same standing
  computation with two more tracked reads. One reconcile per settle wave and
  rAF-batched surface work already exist.
- **Instance reuse exists.** Keyed reconciliation (`key = :field`) pools
  instances across re-derivations.
- **Native scrolling exists** (`scrolls = y`) — which OL had to fake, but
  which also imposes the one genuinely new obligation (§7.3, extent).

#### The three pieces of real work (as first framed)

1. **The window surface.** Two candidate spellings, converging after the
   JSONPath build ([data-paths.md](data-paths.md)): (a) an attribute pair on
   the replicated element next to `datapath`/`key` (a `window`/range the
   runtime derives from the scroll box), or (b) the RFC 9535 **slice** —
   step 4 of the data-paths order (`[start:end]`), which that doc already
   notes "retires hand-written windowing." The slice is the right substrate
   but virtualization needs **reactive endpoints**, and dynamic paths are
   deliberately refused today. The reconciliation: data-paths already plans
   compile-time path *plans* with filter predicates compiled to closures —
   slice endpoints as compiled, tracked expressions are the same shape, a
   carve-out that keeps the path literal while its two endpoints are cells.
   Then a virtual list is `datapath = :rows[{from}:{to}][]` with `from`/`to`
   derived from `scrollY` — fully declarative, and [data-paths.md](data-paths.md)
   §9's reactive-membership
   machinery (track the container + what the selection reads; over-approximate)
   is built once for slices and virtualization alike.
2. **Extent and placement.** With native scrolling, the full scrollable height
   must be *presented* while only the window is materialized: total extent ≈
   `N × rowHeight` (uniform first, like OL's lazy manager; measured/estimated
   later, like `resize`), and each instance placed at its data-index position.
   This wants a library-authored layout that owns both (a `VirtualLayout` /
   `VirtualList` pairing extent-faking with index-based placement) — precedent:
   every concrete layout is already Declare-authored over the kernel, and OL's
   lesson that the virtual mode must own placement is worth keeping.
3. **Pooling semantics — the one philosophical collision.** `replicate.ts`
   deliberately shed LZX's *positional* re-binding: identity matching keeps
   instance state with its record. Under a moving window that is exactly
   backwards — scrolling by a row should re-bind the exiting instance to the
   entering record (OL's pooling), not discard + construct, or scroll-speed
   materialization becomes the frame budget. So windowed blocks need a pooled
   reconcile mode: within-window records keep identity matching; instances
   scrolled out become the pool for records scrolled in. The consequence OL
   also had: per-instance *non-derived* state does not survive scrolling out.
   That is inherent to virtualization, not a design flaw — but it must be
   stated, and it is why virtualization stays **opt-in** (the default
   replication's identity guarantee is the right default).

#### Verdict on ease (as first framed)

Natural fit. The reactive plumbing — the part OL had to hand-build a manager
around — is already the shape Declare wants (a window is just a derivation;
reconcile is already constraint-driven and batched). The genuinely new work is
the endpoint-reactive slice (rides the data-paths build, order item 4), the
extent/placement layout (library-side), and the pooled reconcile mode
(runtime, contained in `Replicator`). Sequence it **after** data-paths items
1–4, as the step that retires both the "window pattern" workaround and §13's
lazy-instantiation item for the list case. The `resize` analogue (measured
row heights) is a later increment, same seams.

---

## 8. An LZX → Declare transpiler — the scope, measured

The audit above asks what Declare lacks. The inverse question is worth
recording with the same rigor: **what would it take to mechanically translate
LZX source into Declare source that is useful *as source*** — a program a
person would keep and maintain, closely resembling the original?

Not "compile OpenLaszlo to browser JS." That is what OpenLaszlo already did,
and it produces no readable artifact. The target here is the source text.

[declare-implementation.md](declare-implementation.md) §6–§7 laid out the
transform list from the pre-Declare vantage (when this was the plan for
migrating the corpus, with the original compiler as a differential oracle).
That analysis stands, with one detail now stale — it maps `<simplelayout>` to
"a layout child", and a layout has since become an *attribute*
(`layout: SimpleLayout [ … ]`). What this section adds is measurement: the
proportions, taken from the 4.9 corpus, that decide whether the work is worth
doing and in what order.

### 8.1 The proportions that decide it

Measured over 1,059 `.lzx` files (~92k significant lines), counting
`<script>` / `<method>` / `<handler>` bodies and `on*=` attribute values as
imperative and everything else as declarative:

| | |
|---|---|
| declarative content (tags, attributes) | **61%** |
| imperative content (code bodies) | **39%** |
| files whose code calls the LFC | **57%** |
| LFC call sites in code | **5,424** |
| element occurrences with a Declare target, or that are language forms | **~74%** |

That split is the answer in miniature: the declarative majority maps well
because Declare inherited OL's ideas; the imperative minority is where a
transpiler's leverage ends; and roughly a quarter of elements have no target
at all yet.

### 8.2 Four layers of work

**Layer 1 — the file graph.** Resolve `<include>` / `<library>` / `<import>`
into one program, merge into the flat namespace, report collisions
positionally. Table stakes: LZX's corpus is built on these (§13 counts 6,659
and 2,926 files), so a tool that processes one file at a time reduces any real
app to a shell of dangling references. Declare's own `include.ts` already does
the analogous job, so the shape is known. Bounded, ~500 lines.

**Layer 2 — the declarative 61%, which maps genuinely well.** The good news,
and it is better than expected:

- **`$always{expr}` → `{ expr }`** — near 1:1, and the corpus's most-used
  constraint form. The two reactive cores are the same idea.
- `<animator attribute= to= duration=>` → `Animator [ … ]`; `<state>` →
  `State [ applied = { … } ]`; datapath multi-match → `:arr[]` replication;
  `<method>`/`<handler>`/`<attribute>` → methods/handlers/typed declarations;
  `setAttribute('x', v)` → `x = v`. All direct.
- The work is *breadth*, not depth: ~220 tags, several hundred attribute
  renames, type-aware literal coercion (colors, lengths, enum tokens), event
  name + payload mapping, XPath → JSONPath once [data-paths.md](data-paths.md)
  lands. Call it 3–5k lines with tests.

**Layer 3 — the imperative 39%, which splits three ways.**

- *(a) Plain JS/AS3 logic* — math, formatting, array work. Passes into `{ }`
  bodies nearly untouched, and AS3's parameter type annotations are now an
  **asset**, since a written parameter type is required (ruled 2026-07-28) and
  the LZX source already carries one.
- *(b) LFC calls with a direct analogue* — `canvas.` → `app.`,
  `lz.Timer.addTimer` → `setTimeout`, `lz.Focus.setFocus` → `Focus.focus`,
  `lz.Keys` → the `Keys` service, `destroy()` → `discard()`,
  `new LzDelegate(this,'m')` → a method reference. Table-driven; most of the
  5,424 sites.
- *(c) Calls that require restructuring* — the emblematic case is
  `w.animate("y", 30, 700)`, whose Declare answer is a *declared* `Animator`
  sibling plus a `start()`. A transpiler can do this mechanically (synthesize
  the declaration, rewrite the call) and be correct, but the result reads
  mechanically — which is exactly the tension in "useful as source." Same for
  `<datapointer>` cursor walks → the mutation API.

**Layer 4 — no target exists.** Components: `window` (82 uses), `menuitem`
(82), `textlistitem` (79), `tabpane` (44), `stableborderlayout` (71), plus
grid/list/tree/combobox. Language: `placement` (§6), mixins, context menus
(§5.3), audio (§5.7), `remotecall` (72), `<connection>` (§5.6), and
multi-frame resources (`<frame>`, 888 uses — sprite-sheet art, needing an
asset story). **None of this is transpiler work**; it is the library and
language gaps this document already ranks.

### 8.3 The sequencing conclusion

**A transpiler is downstream of the component library.** Every OL app of
consequence is assembled from window/tabs/list/grid. Until those exist, no
quality of mapping yields something that runs or reads well — the translation
has nowhere to send a third of the program. Build the library, and the
achievable output rises with it; build the transpiler first, and it aims at a
target that cannot receive the shot.

### 8.4 Two architectures, one of them a trap

- **Compat shim** — author an OL compatibility library *in Declare*
  (`window`, `tabs`, an `animate()` method, a delegate), then translate
  mechanically onto it. Fastest route to "it runs," and faithful. But it
  yields **OL-idiom Declare** — `setAttribute`, delegates, `initstage` — which
  fails the useful-as-source test outright, and it is a standing maintenance
  burden whose content contradicts the language's doctrine. Rejected.
- **Idiom-targeting** — translate to real Declare constructs, accept that
  Layer 3(c) emits correct-but-mechanical declarations carrying a `TODO`, and
  let a human or an LLM finish the semantic tail. This is the one that
  produces source worth keeping.

### 8.5 Measure retention, never legality alone

A hazard worth recording, because it is easy to build a metric that flatters
the tool: **"how many outputs compile" rewards dropping content.** A program
whose body is discarded compiles trivially — an empty `App [ ]` is legal
Declare. Verified in practice: a 51-line LZX app whose content sat behind two
unresolved includes emitted a legal 5-line `App`, and would have counted as a
success.

Two further traps in the same family:

- **Error counts understate distance.** Diagnostics are phase-ordered, so a
  syntax error stops the compile and hides everything structural beneath it,
  and structure errors hide name resolution and typecheck below *that*.
  Measured: one file reporting a single error reported **20** once that error
  was fixed, with two phases still unrun. "Errors remaining" is not a distance
  metric unless it is iterated to a fixed point.
- **Gap counts are distorted by upstream failures.** Unresolved includes and a
  mis-mapped attribute both manufacture phantom gaps, so the ranked table is
  only trustworthy once Layers 1–2 are accurate.

The honest metric is a conjunction, per app: **content retained × compiles ×
boots** — lines out over lines in, then `declarec check`, then R4. Anything
less can improve while the tool gets worse.

### 8.6 What it would cost, and when it pays

Roughly **6–10k lines with tests**, assuming the library exists, plus a corpus
harness. The honest promise is *"most of your program, in readable Declare,
with everything it could not express flagged in place"* — not "your app runs."

Value scales with volume, and the crossover is real: for two or three apps, an
LLM given the LZX source and the language does the whole job today, including
Layer 3(c), which is the part a rule set cannot reach. For a hundred apps,
mechanical consistency and an audit trail are worth real money — and
flagged-TODO output is the right input for an LLM finishing pass. That
combination, breadth by transpiler and the semantic tail by LLM, is the target
worth aiming at if the volume ever justifies it.

---

## 9. Relation to the standing queue

Items this audit adds or sharpens against
[declare-language.md](declare-language.md) §13 and
[open-items.md](open-items.md):

- **New, not previously queued:** teardown hook (§5.2), right-click/context
  menu (§5.3), live-data stance (§5.6), sound (§5.7), rotation (§5.8),
  clipboard/persistence doctrine (soft), selection as a reusable.
- **Sharpened:** slots/placement — scope resolved to single-interior (§6);
  lazy instantiation — the list case lands as invisible virtualization
  ([materialization.md](materialization.md), which also proposes retiring
  `key`); mixins — demand evidence from OL says watch, don't build.
- **Confirmed already-tracked:** module model, `once` timing, imperative data
  mutation (landed), animation choreography (largely landed via
  Animator/AnimatorGroup), RPC stance, static members, resources/fonts, focus
  model, heterogeneous replication.
