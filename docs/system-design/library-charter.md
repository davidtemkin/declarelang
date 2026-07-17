# The library charter — the component set for real apps, and what it stands on

Status: **DRAFT for ratification** (2026-07-16). The strategic premise (David):
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
| `Table` | the forms-on-data centerpiece: column declarations, header row, sort state as one reactive attribute, row selection per the List conventions, keyed replication underneath. Virtualization explicitly OUT of v1 (native scroll + a few hundred rows is the honest v1 envelope). |
| `DateField` | distilled from the calendar app (the flagship already solves the hard rendering); field + `Floating` month popover. `NumberField` (stepper) rides along as a small sibling. |

**Explicitly not in this charter:** rich text editing, file upload, drag-drop
lists, charts, virtualized lists — real, later, not table stakes for the
archetypes.

## 4. Substrate one: planes (the layering ruling)

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

## 5. Substrate two: writes (data leaves the app)

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

## 6. Form conventions (the connective tissue)

Designed WITH the components, not retrofitted after: validation display over
the existing schema seam (invalid = a reactive fact a Field renders, never an
imperative "show error"); submit/disabled patterns (a form's submittability
DERIVES from its fields); error and empty states as first-class layout
states. One reference form in the docs becomes the canonical example all
Tier-0/1 components appear in.

## 7. Definition of done: the real-app eval family

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

## 8. Sequencing

1. Tier 0 now (PasswordField, Tabs, Card, List conventions) — no blockers.
2. Planes ruling + `Floating` + reactive root-space + input strata — one
   runtime pass (§4), immediately after ratification.
3. Tier 1 components as fast library follow-ons, in the table's order.
4. Writes design note in parallel with §4 (compiler/runtime track, not
   library track); implementation before the tracker task lands.
5. Tier 2 (Table, DateField) — each a deliberate build with its own demos.
6. The eval family (§7) closes the loop; the SaaS-app claim is measured, not
   asserted.

## 9. Open questions

1. `Floating`'s anchoring relation name (`attachTo`?) — `anchor` is taken.
2. Does `notice` sit above `modal` (toasts over dialogs — iOS says yes)?
3. Table column declaration shape: children-as-columns
   (`Column [ field, label, width ]`) vs a data-driven `columns` attribute —
   leaning children-as-columns (the tree stays the structure).
4. Whether Tier-1 components ship light/dark-aware via islands.md's
   `themeMode` from day one (leaning yes — they read `theme` tokens anyway).
