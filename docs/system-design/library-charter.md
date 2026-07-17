# The library charter — the component set for real apps, and what it stands on

Status: **RATIFIED with amendments** (2026-07-17). The ordering of work is
David's ruling (§8): styling fidelity first, ResponsiveLayout second (research
before build), the network rewiring third, components + planes last. The strategic premise (David):
the missing table-stakes piece before LLMs can be tested on REAL apps —
ordinary web apps, forms-on-data, a typical SaaS app, end-to-end — is a robust
component set. This charter fixes the target: the ratified component list
(§3), the two substrate designs the components stand on (§4 planes, §5
writes), the form conventions that bind them (§6), and the definition of done
— a new eval task family whose brief demands the whole set (§7). Companion
rulings: components-baseline.md (the four contracts), islands.md (environment
boundary, themeMode), capabilities.md.

## 1. The archetype is the checklist

"Robust component set" is a vibe until an app shape forces it. The forcing
archetypes, in order of coverage:

- **A1 — the CRUD console**: a list over records (filter, sort, select), a
  detail/edit form, create and delete with confirmation. The issues-tracker /
  admin-panel shape. Forces: Table, Select, Dialog, form conventions, writes.
- **A2 — the settings surface**: grouped forms, every input kind, save/revert.
  Forces: Tabs, PasswordField, NumberField, Select, validation display, Toast.
- **A3 — the dashboard**: cards, summary figures, a data table, filters.
  Mostly composition over A1's parts (the eval corpus already has its shell).

Every component below is on the list because an archetype forces it; nothing
is on the list for completeness's sake.

## 2. Standing rules (inherited, restated)

Every component lands under components-baseline.md's four contracts:
data-agnostic values; derive-down / deliver-up (`value = { app.x }` +
`input(v) { app.x = v }`); flat theme with explicit-base spread; `Control`
base with the four states. Plus: auto-include by bare tag (the manifest), a
reference chapter with runnable demos, verify R1–R3 probes per component, and
keyboard behavior specified at design time, not retrofitted (the Focus
machinery — focustrap, `onEscapeFocus`, contained Tab — already carries most
of it).

## 3. The component set

**Tier 0 — unblocked, build immediately:**

| component | note |
|---|---|
| `PasswordField` | `TextInput [ secure = true ]` — native `type=password` on DOM; masked drawing on canvas. A capability flag plus a Field pairing, not a new control. |
| `Tabs` | the doc names the gap today (§11 "compose those"). Segmented header + one visible pane; the modes eval task is its behavioral spec. |
| `Card` | promote the homepage-local class to the library (title/body/footer slots). |
| `List` selection conventions | not a new class — a documented pattern over keyed replication: `selected` state, roving arrow-key focus, `onSelect` delivery. |

**Tier 1 — blocked on planes (§4), in dependency order:**

| component | note |
|---|---|
| `Menu` / `MenuItem` | the first `Floating` client: anchored, promotion-ordered, light-dismiss, arrow-key roving, submenu = nested promotion. |
| `Select` | Field + Menu composed; the single most load-bearing form control. Typeahead later. |
| `Dialog` | the modal plane: input-blocking scrim, focustrap on open, focus RETURNS on close (the `noteDiscarded` machinery half-provides), Escape = cancel. `Confirm` is a one-line specialization. |
| `Tooltip` | `Floating` + hover-intent delay + never-focusable; anchored to any view. |
| `Toast` | the notice plane; a queue with timed dismissal, `app.notify(…)`-style service action. |

**Tier 2 — the two deliberate builds:**

| component | note |
|---|---|
| `Table` | the RECORDS BROWSER (an interface component over a Dataset, NOT a layout mechanism — layout-tables are rejected outright; arrangement belongs to layouts/constraints): declared `Column [ field, label, width ]` grammar, header row, sort as one reactive attribute, row selection per the List conventions, keyed replication underneath. Cells are ordinary COMPOSED views (chips, buttons, avatars) — flexible, honest to ~thousands of rows. Extraction bonus: semantically a table, so the crawler document emits real tabular markup. |
| `Grid` | the THROUGHPUT SHOWCASE (the hypergrid class): same outer Column grammar as Table — one idea at two scales — but cells are PAINTED via `draw()` over the visible window, virtualized by constraint (`firstRow = { Math.floor(scrollY / rowH) }`), holding a million rows. The cell contract is the honest dividing line: composed views (Table) vs a painter vocabulary (Grid), converging at the focused cell where Grid overlays one real view for editing, spreadsheet-style. Resizable columns are attribute writes from a drag. The demo joins the homepage metrics idiom: a million rows, N hundred lines, zero by hand. |
| `DateField` | distilled from the calendar app (the flagship already solves the hard rendering); field + floating month popover. `NumberField` (stepper) rides along as a small sibling. |

**Explicitly not in this charter:** rich text editing, file upload, drag-drop
lists, charts, virtualized lists — real, later, not table stakes for the
archetypes.

## 4. Substrate one: planes — SUPERSEDED IN PART, full redesign deferred

David's review rejected the `plane` ATTRIBUTE as incoherent with "the bracket
nesting IS the view tree" — a child that renders outside its parent's clip and
stacking is a child in name only. The agreed direction (final design lands with
the components phase, discussed separately): planes NEVER appear in the author
surface. Two mechanisms instead: (a) STRUCTURAL layers for semantically
top-level things — windows, toasts, app-modal dialogs — as ordinary late
children of the App root (declaration order already stacks); a `windows:` layer
whose `Window` children are keyed replication over a dataset of open windows,
so focus-promotion is a DATA reorder — z-order as data, no numeric z even for
windows; dragging is x/y on the Window, its interior an ordinary subtree.
(b) ENCAPSULATED promotion for anchored transients (Menu, Tooltip, Select's
popover): authored as local children (locality, classroot, data scope
preserved); the COMPONENT'S implementation mounts floating content through a
runtime overlay service — the Flutter model, where authors write Tooltip and
never touch the Overlay. The plane ladder and input strata survive as runtime
internals + component contracts only. The remainder of this section is the
pre-review record:

### 4x. (superseded record) the original attribute proposal

Today stacking is declaration order within ONE plane, and no z-index exists —
a ruling this design keeps. Every mature toolkit converged on the same answer:
a SMALL, FIXED, NAMED ladder of planes, never author-numbered z. (iOS:
window levels + presentation stacks; AppKit: the `NSWindow.level` enum ladder;
Flutter: one `Overlay` with insertion-ordered entries; the web, after two
decades of z-index wars, confessed into the `<dialog>`/`popover` top layer —
promotion-ordered, numberless.)

**Ruling proposed — four planes:**

`content` (the default; today's world) → `floating` (tooltips, menus,
popovers; light-dismiss) → `modal` (dialogs; input-blocking) → `notice`
(toasts; above modal).

- Across planes: the fixed ladder. Within a plane: **promotion order** — the
  moment a view became visible in the plane — which makes nested menus and
  stacked dialogs correct for free, exactly like the web's top layer. No
  numbers anywhere; the no-z-index ruling survives intact.
- **`plane` is a presentation attribute, not a structural location.** The
  tooltip is authored NEXT TO its target — same class body, same `classroot`,
  same data scope, same lifecycle — and the renderer lifts the subtree. This
  keeps authoring local (analyzable: a menu declared inside its button reads
  as what it is) and leaves static extraction untouched (the crawler reads
  the tree, not the compositing).
- **`Floating` base class** (the fifth base, beside `Control`): plane
  membership + anchoring + dismissal policy (light-dismiss on
  outside-pointer, Escape, explicit), handled once.
- **Anchoring needs root-space position as a REACTIVE fact.** `inspect.ts`
  computes `rootX`/`rootY` as snapshots; the runtime work is promoting them
  to reactive intrinsics a `Floating`'s position constrains against. (Naming
  note: `anchor` is taken by location's reveal targets — the relation needs
  another word; `attachTo` is the working candidate.)
- **Input strata**: planes are input layers — a modal plane swallows pointer
  input destined below; light-dismiss is the floating plane observing an
  outside pointer-down. An input.md extension, specified with this ruling.

## 5. Substrate two: the network (writes, requests, connections)

**The requirement that governs everything here (David):** a Declare developer
must be able to consume/call ANY endpoint — "your backend has to be limited by
Declare's client capabilities" is a non-goal; there is no Declare jail. The
layering: at bottom the existing TRANSPORT SEAM (the one governed pipe that
keeps headless, crawl, and fixtures honest). Above it, a general **`Request`**
primitive — any verb, headers, auth, body, `format = json | text | bytes` —
with reactive lifecycle, usable STANDALONE. Above that, the conveniences that
feed Dataset: `DataSource` (GET-and-parse; gains `format`, retiring the
JSON-wrap workaround the homepage's language.json embodies), the writes
surface below, and **`Connection`** (WebSocket/SSE, after LzConnection):
`status` reactive (`connecting/open/closed`), `send()` a service action whose
handler TS packs any payload (the 64-byte binary telemetry case: `send(buf)`
from a handler; inbound via the `<-` subscription seam or the reactive
`conn.last`, with write-batching giving one settle per frame), and OPTIONAL
append-into-Dataset for feed-shaped traffic. Raw `fetch`/`WebSocket` in
handler TypeScript remains the always-available floor; the blessed forms exist
for the seam's guarantees, never as a fence. Consumers of today's Dataset
surface do not change.

### 5a. Writes (data leaves the app)

`DataSource` fetches; `Dataset` mutates in memory. "End-to-end" means create,
update, and delete REACHING A SERVER, and Declare currently has no story for
a mutation leaving the app — an LLM building A1 hits this in the first task.
Design direction (to be ratified in its own note, charter-level requirements
here):

- Writes are **service actions with reactive lifecycle**, the same treatment
  reads got: a save is requested explicitly, and `.saving / .saved / .failed`
  are reactive states screens derive from — never a callback chain.
- The editor-session seam (two-way binding's committed-vs-draft split)
  already defines WHAT a save sends: the committed record. The missing piece
  is the transport verb and its lifecycle, not a new data model.
- Headless/crawl discipline extends unchanged: the refusing transport refuses
  writes exactly as it refuses reads — a crawl can never mutate anything.
- The eval fixture story: the dev server (or a fixture transport) accepts
  writes in the sandbox so A1's assert can drive create/edit/delete
  end-to-end.

## 6. Phase one: styling fidelity (the gate on the vocabulary)

**Goal (David's ruling): Material Design AND Apple styling, end to end, high
fidelity, on the EXISTING components — before the component set grows.** The
rig is `component-sampler.declare`: every current component × switchable
themes (switcher via RadioGroup — the missing Menu is the demo's own
evidence). The prevailing-theme + TS-spread mechanism is SUFFICIENT
(hierarchical, composable, per-subtree overridable); the work is COVERAGE:
components read only color tokens today, while design-system identity is
GEOMETRIC — so the theme record grows geometry tokens (`controlRadius`,
`controlHeight`, `density`, border weights…) and the library learns to consult
them. Settled before Tier 0/1 lands, or every new component bakes in more
unsayable geometry.

**Focus indication is part of this phase** (fidelity to either design system
is impossible without it). The ratified model (David), in layers:

1. **The fact** — which control has keyboard focus and whether modality is
   keyboard (`Focus` + `byKeyboard()`; a pointer press clears modality — web
   :focus-visible semantics). Always maintained, independent of rendering.
2. **The rect** — the system renderer, shape-GENERAL: it outlines the
   control's true silhouette (a full text-field outline, a circle for a Radio
   — cornerRadius = size/2, a button's rounded rect) by springing position,
   size, and cornerRadius read from the target's own geometry; `focusShape()`
   overrides odd silhouettes (the macOS mask-path precedent: service draws,
   component shapes). A theme elects its ROLES independently: transitions
   (the traveling flight), at-rest rendition, both, or neither. The flight is
   a flourish — `animateFocusTransitions`, default on, the sampler's toggle,
   honored identically in every emulation.
3. **The component channel** — `Control` grows the reactive `focused` state;
   any component may style it, in ADDITION to or INSTEAD of the rect. A
   component with no focus styling ignores it and the rect covers it.
4. **The one invariant** (the only mandate, and it binds the OUTCOME, not a
   mechanism): at rest, keyboard focus must be visibly indicated by AT LEAST
   ONE channel. A theme may disable the rect's at-rest role only because its
   components carry the rendition. Keyboard focus with no visible indication
   anywhere is illegal — the WCAG floor as a property of the theme+components
   pair, auditable by a later verify-level check.

**Supplemental specs (David, at phase start):** the sampler offers THREE modes
via a three-option RadioGroup — **Declare-native (default), Material, Apple**.
The default is deliberately un-opinionated: a commonly-used modern look, whose
one signature addition is the animated focus rects (elected for BOTH roles —
transitions and at-rest focused rendition). The default must also fix the
TextInput rendition: today a bare field has NO edge; the house look gives text
fields real visual articulation, unfocused and focused. And the styling arc
adds one planes-free component to the mix as it goes: **`TabSlider`** — OL's
basetabslider, the accordion: stacked headers, sprung heights, and
CLIP-CARRIED content (present through the whole open and close, revealed by
the clip as height animates — never a blank gap; the mechanics are already
reverse-engineered frame-by-frame in tabslider-gaps.md).

The sampler proves the matrix: Apple-mode = rect at rest, quiet components;
Material-mode = component-rendered focus, rect for flight or off; the same
machinery satisfying the invariant through opposite channels. RadioGroup
composes as one Tab stop with arrow-key roving; the individual radio carries
`focused`.

**"Matching" a design system means APPEARANCE AND FELT BEHAVIOR — never API
shape or implementation mechanism.** There is one machinery (the prevailing
theme record, the Control states, one shape-general focus renderer), and
"Apple" / "Material" are DATA riding it — token records, not code paths. A
third design system is a new record, zero new mechanism.

## 6a. Phase two: ResponsiveLayout (a named class for responsive intent)

David's ruling over my primitives-first counterproposal, and he is right by
the Spring precedent: motion was always expressible with constraints; the
language earned its story when physics got a NAME. Responsive design today is
`app.width` ternaries scattered across children — locally true everywhere, the
design stated nowhere, spreadsheet-formula spaghetti. `ResponsiveLayout` is a
CLASS (no language surface) that states the design: breakpoints/size classes
and per-break bundles (columns resized or hidden, renditions swapped),
compiled to the States mechanism underneath. Constrainable layout attributes
and the size-class vocabulary become implementation conveniences INSIDE it,
not the author surface. It keys off its own CONTAINER's width, not only the
app's (container-query semantics — free in Declare, every view's width is
reactive), so a region can respond to app-level reshaping with its own rules.
**Sequenced: research FIRST** — how designers actually think/design responsive
behavior, and how native platforms (SwiftUI size classes, rotation, iPad
multitasking resize) model it — then build, then PROVE by adopting it in the
homepage and the calendar. DoD includes a new, deliberately harder responsive
eval task.

## 7. Form conventions (the connective tissue)

Designed WITH the components, not retrofitted after: validation display over
the existing schema seam (invalid = a reactive fact a Field renders, never an
imperative "show error"); submit/disabled patterns (a form's submittability
DERIVES from its fields); error and empty states as first-class layout
states. One reference form in the docs becomes the canonical example all
Tier-0/1 components appear in.

## 8. Definition of done: the real-app eval family

The library is done when a NEW eval task family passes the standard config —
not when N components exist:

- **`tracker`** (A1): list + filter + sort + detail form + create + delete
  confirmation, over fixtures, writes asserted end-to-end.
- **`settings`** (A2): grouped tabs, every input kind, validation, save with
  Toast confirmation.
- Run under BOTH the standard skill×iterated config and the **distro
  bootstrap arm** (the fresh-clone agentic solver, evals/harness — the
  realistic condition: an agent, a downloaded repo, a request). The bootstrap
  arm exists as of this charter; the tracker/settings briefs land with
  Tier 1.

These tasks are to this charter what the calendar was to continuity: the
proof the capability is real, kept green by the same gates thereafter.

## 9. Sequencing — David's ruling (supersedes the draft order)

1. **Styling fidelity** (§6): the sampler, the geometry tokens, the two
   design systems end-to-end on existing components, focus channels included.
2. **ResponsiveLayout** (§6a): research → build → adopt in homepage and
   calendar.
3. **Network** (§5): Request/format/Connection/writes rewired underneath;
   consumers unchanged.
4. **Components** (§3, Tier 0 → 1 → 2) — and the planes redesign (§4) lands
   HERE, as the Tier-1 prerequisite, per the deferred discussion.
5. The eval family (§8) closes the loop; the SaaS-app claim is measured, not
   asserted — under the standard config AND the bootstrap arm (clean-clone
   baseline as of 2026-07-17: 8/9 green, 9/9 compile, answer key stripped).

## 10. Open questions

1. `Floating`'s anchoring relation name (`attachTo`?) — `anchor` is taken.
2. Does `notice` sit above `modal` (toasts over dialogs — iOS says yes)?
3. Table column declaration shape: children-as-columns
   (`Column [ field, label, width ]`) vs a data-driven `columns` attribute —
   leaning children-as-columns (the tree stays the structure).
4. Whether Tier-1 components ship light/dark-aware via islands.md's
   `themeMode` from day one (leaning yes — they read `theme` tokens anyway).
