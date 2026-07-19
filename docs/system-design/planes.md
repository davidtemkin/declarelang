# Layers — the presentation system over one App

**Status: DESIGN, converged in discussion 2026-07-18 (David + assistant), pre-implementation.**
This replaces the earlier research draft. The model below emerged from a
use-case-driven discussion (the register at §12 holds what remains open);
implementation proceeds by the sequence in §11. The earlier `plane` ATTRIBUTE
rejection stands; the word "plane" is retired in favor of **layer** — the
compositor lineage is the honest description.

## 1. The governing model

**A layer is a whole view hierarchy. App is the base layer.** The runtime
owns the one REAL total z-order — a small layer tree flattened depth-first —
while the developer sees hierarchies:

```
content   — App itself (today's entire world, unchanged)
floating  — anchored transients: tooltips, menus, popovers; light-dismiss
modal     — dialogs; input-blocking scrim; focustrap
notice    — toasts; above modal; never takes focus by default
```

The three upper layers are **implicit**: every App has them, empty until
something manifests into them, never declared, never named in ordinary app
source. A layer-shaped app (a desktop simulation, §11) may declare
ADDITIONAL structural layers as named members of App — the expert tier.
(Ruled: layers are members of the one App, never peer declarations — one
`location`, one `width`/`dark`, one fact-space.)

**Order is an ordinary slot.** Within a layer, stacking is promotion order
whose DEFAULT is declaration order — the declared-default / runtime-write
metaphysics every other property already follows, finally applied to the one
property that lacked it. Reordering is a verb (`raise()`-shaped, plane
children only), never a number: the no-z-index ruling survives intact, and
content-layer stacking remains pure source order.

**No isolation.** Layers govern paint order and input strata — nothing else.
One scope space, one reactive graph: a dialog's attribute may constrain
against a base-layer element, the dock may magnify from the pointer's
position over content. It's an app, not an operating system — it sees its
own runtime objects, even when it looks like an operating system. (Contrast:
iframes wall this off; React portals strain context across; we get it free
because layers are presentation, not ownership.)

## 2. Visibility: the authoring tiers

The layer system is deliberately near-invisible. The authoring surface is
the same ladder as everything else in Declare:

1. **An attribute** — `tip = "Saves the draft"`. The floor, and the acid
   test: if a tooltip costs more than one attribute, the design failed.
2. **A component** — `Menu [ items = … ]`, Select, Dialog. The component
   manifests into the right layer; the author sees records and verbs.
3. **A service verb** — `app.notify("Saved")` → the notice layer's queue.
4. **A declared structural layer** — the expert move, for layer-shaped apps
   (windows, a desktop). The only tier where "layer" appears in source.
5. **The create-API** — imperative instantiation into a layer (§7). The
   power tool, shared substrate with everything above.

Developers DO see layers in tooling: `inspect()` renders the layer tree and
what is currently manifested in each. Visible in the debugger, absent from
typical source — that asymmetry is the design.

## 3. Floating — the one class that knows layers exist

The fifth library base (beside `Control`). A `Floating` is a PRESENTATION
MEMBER: declared where it belongs (inside its owner — a button's menu, an
App's dialog), following the `Spring`/`State`/`Dataset` precedent of members
whose brackets are not painted boxes. Closed, it is a small dormant node —
attributes and constraints, no view tree. Its contract, handled once:

- **Layer election** — per subclass: Tooltip/Menu/Popover → floating,
  Dialog → modal, Toast → notice. A class-level fact, not a use-site choice.
- **Presence** — a slot (`opener: View = null`, or `open`), written by verbs
  (`openAt(view, e)`, `close()`), derivable by constraint. Presence follows
  declared-default/runtime-write like every other slot.
- **Manifestation** — at open, the surface is BUILT into the layer (from
  item records, or later from a declared body) and torn down at close.
  Laziness lives here: a thousand rows share one dormant menu node and zero
  menu views.
- **Anchoring** — `attachTo` a view's live root-space box (the FocusRing
  follower machinery's second consumer: root-space position as a reactive
  fact), or point-positioned from an event (the context-menu case — snapshot
  is correct there). Edge flip/clamp written once, inherited by all.
- **Dismissal policy** — light-dismiss (outside press, observed at the input
  stratum — never bubbling), Escape, or explicit-only; defaulted per
  subclass, stated in each component's contract.
- **Focus policy** — trap-and-restore (Dialog), roving (Menu), never-take
  (Tooltip); notice never steals focus.
- **Material** — scrim, shadow, translucency from THEME TOKENS (working set:
  `scrimColor`, `planeShadow`, `planeMaterial`), so the four cities' layer
  looks are data: SF flat shadowed cards, Mountain View elevation + scrim,
  Cupertino translucency, Redmond Acrylic. Canvas approximates blur honestly
  (dim without blur) — recorded, not hidden.

**The portal door stays shut**: only Floating subclasses manifest outside
their declaration site. A plain `View` can never be portal'd — the reader is
never deceived, because `menu: Menu [ … ]` asserts "this button HAS a menu"
(true), not "this box sits here" (which would be false).

## 4. The component shape: records, and the one-line criterion

**RULED (2026-07-18): no component may REQUIRE datasets or `:path`** — data
remains the optional top rung of the ladder (literal → binding → `:path`),
for values AND for structure. And the shape question resolves to one rule:

> **If a component arranges it, it takes records (with named classes for
> custom content). If you arrange it yourself, it isn't a component — it's
> views, SimpleLayout, and replication.**

- Menu/Select/Combobox items, toolbar items, List/Table rows: RECORDS. Every
  native platform's menu is records (`NSMenuItem`, `UIAction`,
  `MENUITEMINFO`); Ant Design deprecated children-Menu for an items prop;
  UITableView's register-cell-class-by-name is the record door at OS scale.
  The component owns arrangement and rendition — which is what makes
  per-city fidelity airtight.
- TabSlider panes, Dialog bodies, Window interiors: CHILDREN (regions —
  author-arranged, arbitrary trees). TabSlider is the existing hybrid proof:
  `label` is data the component renders; the pane is the author's region.
- Replication remains the data door for author-arranged content (a Tab per
  record, a row per record) — visible template, eager instances. Records are
  the data door for component-arranged collections — no template at the use
  site, lazy build at open. The criterion keeps the doors from overlapping.

**The standard menu-item record** is richer than strings and CLOSED:
`{ id, label, icon?, key?, enabled?, checked?, divider?, submenu? }` — this
covers real OS menus (icons, disabled items, separators, key equivalents,
cascades) with no custom anything. The customization staircase:

1. Standard records — ~95% of menus, including cascading submenus.
2. **Per-item content class** — `{ kind: "SignatureItem", … }`: the
   component instantiates the named class as the row's CONTENT region,
   record as its data context (replication's handoff convention reused).
   Behavior stays the component's: the row wrapper owns highlight, pick,
   keyboard; content classes render, never behave. (AppKit's own escape
   hatch — `NSMenuItem.view` — validates the split.)
3. Custom row class — subclassing the row base, behavior included. Expert.

Checkability splits on the literal/dynamic seam: literal item arrays are
compile-checked (record keys against the item schema; `kind:` names against
known classes — positioned errors); data-fed items fail loudly at runtime.

## 5. Worked example 1 — replicated rows + per-row context menu

The hard case, assembled entirely from settled pieces. ONE menu declared at
App level (mirroring the OS truth that one context menu exists); rows carry
one handler line, stamped by replication; the OPENER back-reference binds:

```
rowMenu: Menu [
    items = { opener == null ? [] : [
        { id: "open",   label: "Open " + opener.name },
        opener.locked ? { id: "unlock", label: "Unlock" }
                      : { id: "lock",   label: "Lock" },
        { divider: true },
        { id: "delete", label: "Delete", enabled: !opener.locked },
    ] },
    picked(id) { opener.perform(id) },
    ],

// inside the replicated row template:
onContextMenu(e) { app.rowMenu.openAt(this, e) },
```

Per-row variation with zero per-row instances: `items` is a constraint over
`opener` — live even while open (a native menu needs `validateMenuItem`
callbacks to fake what the reactive graph does for free). Behavior routes
back to the row (`opener.perform`), which holds its own datapath cursor.
`opener` is declared on the Menu BASE (`opener: View = null`), written by
`openAt`, nulled on dismissal; open-state ≡ `opener != null`.

## 6. Worked example 2 — the menu bar

A content-layer component (it arranges titles → records) whose dropdowns
manifest in floating, internally. Static and data-driven parts interleave in
one constraint, because `{ }` is TypeScript:

```
bar: MenuBar [
    menus = { [
        { title: "File", items: [
            { id: "new",  label: "New",   key: "⌘N" },
            { label: "Open Recent",
              submenu: app.recent.map(f => ({ id: "r:" + f.path, label: f.name })) },
            { divider: true },
            { id: "save", label: "Save", key: "⌘S", enabled: app.dirty },
        ] },
    ] },
    picked(id) { app.command(id) },
    ]
```

Bar menus have no external invoker — `opener` stays null; the contract
requires it nowhere. Granularity note (docs must carry it): the `menus`
constraint re-derives whole on any tracked read — fine at menu scale, wrong
for large data feeds (the record door's big-collection answer is lazy build
at open, not eager array churn).

## 7. Imperative creation

**Affirmed: real apps need to create views imperatively.** The primitive:
create-by-class into a layer (or a parent), instance returned, opener wired
as an ordinary typed attribute. The machinery half-exists — the registry's
tag→class table plus the `use [ … ]` keep-list were designed for
create-by-name (instantiation.md §8); what's missing is the public runtime
call, which the Menu family's per-item classes need too. One mechanism, all
customers. Dataset-fed structure (replication) is built ON imperative
creation internally — the ladder's rungs are the real dependency order.
Lifecycle rules to specify with it: spawner discard cascades dismissal (the
`noteDiscarded` pattern); a dismissed handle is inert.

## 8. Input strata

Resolved in the ROUTER, top layer first — a system walk, not bubbling:

- **notice**: passes input through except over its own content.
- **modal**: swallows everything below; Escape routes to the top modal.
- **floating**: observes outside-pointer-down → light dismiss (delivery
  policy — swallow vs deliver below — is an open ruling, §12).
- **content**: today's routing, unchanged. Strata are per-App (a page may
  hold several island Apps, each with its own layer tree).

This closes the catch-all/click-outside family — bubbling's strongest
remaining claim — at the stratum where it is actually about layers.

## 9. Keys — the Newton model

Adopted as the keyboard direction (Newton's design; revived by iPadOS's
hold-⌘ panel): **shortcuts are declared DATA with user-facing labels** —
records (combo + label + action) declarable on any view, a form, or App.
Resolution is a SERVICE walk from the focused view up the parent chain over
declarations, nearest wins — the mirror of prevailing attributes (styling
flows down; key resolution walks up from focus), and like Tab traversal it
is a walk over declared facts, not event propagation: the no-bubbling ruling
is reinforced, not bent. **One registry**: a menu item's `key:` field IS a
shortcut declaration (the menu bar is the shortcut table — the Mac
architecture derived); standalone view-level shortcuts use the same record
shape. The hold-⌘ HUD — an overlay listing the resolved set, grouped by
origin — is nearly free BECAUSE shortcuts are data, and is itself an early
layer deliverable. Sequencing: `key:` display-only with Menu; live registry
+ HUD with the desktop's menu bar.

STATUS (2026-07-18, proven at APP level in apps/desktop): the registry is
one constraint over the menu-bar records (`flatMap` of items with `key:` —
nothing declared twice), the dispatcher is a raw-Keys subscriber matching
`⌘`+key against it (enabled respected, open menus own the keyboard), and
the hold-⌘ HUD derives its grouped columns from the same array. The
promotion to a language/library service (the focus-walk, view-level
records) remains open (§12.7). One host finding for that design: a
BROWSER host reserves some combos outright (Safari will not deliver ⌘N/⌘W
to the page) — the registry must be able to carry a shortcut as display
truth even where the host refuses delivery.

## 10. Extraction, crawl, verification

Layers are ephemeral chrome: absent at t=0, excluded from the crawled
document by construction (the `visible = false` rule). A dialog whose
content should be crawlable is mis-modeled — that content is a location.
Verify walks every layer's hierarchy as it walks App (same program, more
roots); `inspect()` grows the layer tree view (§2).

## 11. Implementation sequencing — demonstrable complete components

Ruled approach: each step lands a COMPLETE, demoable component in the
component sampler (click-invoked), with four-city fidelity screenshots as
the recurring gate — the styling arc's proven rhythm. Substrate is built
only as each component demands it (no speculative machinery):

1. **Tooltip** — forces the minimal substrate: manifestation into floating,
   live anchoring (reactive root-space box), never-focus, flip/clamp. One
   attribute (`tip`) at the use site.
2. **Menu** (context + attached) — the record schema + typecheck, `opener`,
   light-dismiss stratum, roving keyboard (closes the Redmond radio-group
   fidelity gap), per-item content classes (rung 2), `key:` display.
3. **Dialog** — modal stratum, scrim (material tokens), focustrap, focus
   restore, `app.confirm()`. Toast/`app.notify()` rides the same wave if
   cheap.
4. **The desktop** — a new app: high-fidelity Mac desktop under the
   Cupertino theme. Dock (continuous presence — magnification as a
   pointer-derived constraint; icons drawn in Declare and/or openly-licensed
   — real Apple artwork is copyrighted and this repo is public MIT), menu
   bar (live keys registry + hold-⌘ HUD), Finder windows with column view,
   N Markdown-viewer document windows reading the distro's own .md files
   (`format = "text"` — no invented fixtures), windows layer as a declared
   structural layer with `raise()`, window activation + move/close (resize
   as a follow-up). Two real apps: "Finder" and "Markdown Viewer".
   This exercises every ruling in this document at once; the honest claim
   for the demo is the RATIO (fidelity per line — the calendar's 415-vs-874
   precedent, scaled), not impossibility elsewhere (web desktops exist —
   daedalOS, Puter — at tens of thousands of lines with hand-managed
   z-order).

   STATUS (2026-07-18): 1–3 landed in the sampler; 4 is standing — windows
   (move, edge/corner resize, shade, zoom, activation-as-slot), Finder over
   the real docs, Markdown viewers, dock magnification-by-layout, MenuBar
   (a library component: whole menus as records, one live Menu, macOS
   tracking; Menu.place() now works nested), live keys registry + hold-⌘
   HUD, real dark mode. Remaining passes: plane material (vibrancy),
   openly-licensed icon harvest, and the input primitives the desktop
   registered (cursor attribute, dblclick/contextmenu, drag).

## 12. Open rulings

1. Light-dismiss delivery: swallow-and-dismiss (Mac menus) vs
   dismiss-and-deliver (most web).
2. `raise()` scope: layer children only (the lean — content stays pure
   source order) — confirm.
3. `opener` typing: narrowing at the declared instance
   (`rowMenu: Menu [ opener: InvRow ]`-style) — checker design.
4. Floating's node kind: Dataset/State-like member with a manifested
   subtree — does it OWN a detached View, or does the layer own the root?
5. Policy attributes on declared structural layers (input policy, material)
   — the small schema.
6. Multi-select context-menu convention (`opener` = clicked row; actions
   consult `app.selection`) — document as convention.
7. Newton-keys record schema + registration timing — the app-level proof
   (§9 STATUS) fixes the record shape (`key:` on menu items, one derived
   registry, HUD grouped by owning menu); open is the promotion to a
   service (focus-walk resolution, view-level records) and how the
   registry expresses host-reserved combos (display-only under browsers).
