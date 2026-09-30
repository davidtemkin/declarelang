# Data in the tree: binding, faceless classes, projections, and the way back

**Status: OPEN — a discussion record, 2026-09-27.** Nothing here is built except where it says
so. It records a discussion between DT and Claude that began when a digest (an agent-facing
condensation of the guide) taught a model class holding state plus verbs, with views calling
the verbs — a Java-shaped model of encapsulation. The corpus analysis it rests on is
[data-flows-2026-09.md](data-flows-2026-09.md): every shipped app's data flow, read for what it
does rather than graded against a rule. Eval runs and eval reference solutions are not
evidence here: they show what an author produced under a brief, not the form to follow.

## 1. What is agreed

DT's statements and rulings in the discussion, in his words where they matter:

- **A view hierarchy binds to data, and writes it.** "A view hierarchy, even in a properly
  factored data-driven app, is still meant to have data binding." Views bind with `datapath`,
  replicate with `:rows[]`, and write with `:field = v`, `<->` and `d.set(…)`. Writing is
  standard form and is how client state is managed.
- **What the views bind to is a choice.** It may be a server-fetched dataset, a working copy or
  excerpt of one (a page of records), a derived dataset, or a created one. All four are
  legitimate.
- **Editors edit through indirection** — a bound control changes the dataset through a
  client-side step that allows cancellation and validation (`Editor`'s own draft with
  `commitOn` and `validate`; or a working-copy dataset committed on Save).
- **Writes do not reach the server — yet.** A dataset that represents the server's data (or an
  excerpt) has to be told of changes, and the app adapts its local reflection to the server's
  response. Today that is a `DataSource` per write and a reconciling `onLoad`.
- **A client app managing a client dataset is fine.** The calendar writes its fetched document
  directly; there is no server to reconcile with, so there is no buffer and no simulated
  server. "I am ambivalent about adding a faceless class when not needed or simulating a server
  that does not exist. That said a client only app can most definitely have faceless classes."
- **Two write shapes, one of them method-intermediated, is wrong.** On a row bound to a
  projection having to send its id to a method: "that sure complicates the model … The idea of
  two different shapes altogether, one of which is method-intermediated, is pretty lousy."
  Back-mapping writes from a projection to its source is to be built **sooner rather than later**
  (§5).
- **The persistence direction (§7) is recorded, not decided.** It is to be written into the
  persistence design as a potential direction once the decisions here lock.

## 2. The statement

The form the discussion converged on, pending the decisions in §8:

1. **Data lives in the tree, where its scope is** — on the App, or on the node whose subtree uses
   it. Paths are relative to it. Where data lives is part of the program's structure, not
   hidden behind an object.
2. **Views bind to it and write it.** A row bound to raw data writes its own record.
3. **Four kinds of data can be bound:** server-fetched, a working copy or excerpt, derived, and
   created.
4. **Editors edit through indirection:** `Editor`'s draft for a text field; a working-copy
   dataset, committed on Save, for a whole form.
5. **Verbs exist where a write cannot land directly** — today on projections and toward a
   server; §5 and §7 aim to remove both. What remains are real actions (Save), structural
   changes (add, remove, move) and invariants (closing an issue sets `closedAt`).
6. **A faceless node is for a record's rules, a service, shared state with invariants, or a
   roster of things with behaviour** (§3). It exposes datasets for views to bind to; it is
   never a wrapper that hides them.

The corpus already works this way: truth on the App or a scoping node, views binding and
writing, the guide's own first app writing `:done = v` from a checkbox. The state-plus-verbs
class enters through two guide examples (ch05 `Cart`, ch14 `Log`) and the digest that copied
them.

## 3. Faceless classes

A class with no `extends` is a `Node`: state and behaviour with no box. In the shipped apps
there are four (desktop's `DesktopApp`, `WinManager`, `Launcher`; marketmap's `Market`), and
they do different jobs:

| job | example | what views bind to |
|---|---|---|
| a model standing on one record — the rules for a kind of record | ch14 `TaskModel` (`overdue = { :due < app.today }`, `finish() { :done = true }`) | the record itself; the model reads `:field` like a view |
| a read-only data service — decode, derive, answer queries | marketmap `Market` | its derived `table` dataset |
| shared client state with invariants | desktop `WinManager` (window records; an open goes before the minimized tail) | its `list` dataset, each record built as the window class it names (`classFor`) |
| a roster of things with behaviour | desktop `DesktopApp` subclasses (per-kind icon art, launch policy) | a projection of the roster to records, each icon looking its node back up by id |

The last row is a real tension, and not about projections: **records carry no behaviour, and a
view cannot replicate over nodes.** The desktop wants per-kind behaviour on a collection the
dock replicates, and bridges it with a projection plus a lookup by id. Selecting a view class
per record kind (a `State` per kind, guide ch16) answers the view half; the behaviour half has
no record-side answer today.

**Guidance, proposed:** stop teaching "group state and verbs into a class" as the model.
Teach the tree as the home of data, and faceless nodes for the four jobs above. A more native
encapsulation may be to extend the data itself — `class Sessions extends DataSource [ … ]`,
whose members are its derivations and its few server verbs — so the object *is* the document
and views bind to it directly. Not yet explored.

## 4. Class declarations: `extends`

Today a class with no `extends` is a `Node`. DT's concern: the current form leads toward a Java
model of encapsulation, which is not native to Declare. Two options:

- **(a) Require `extends` on every class.** Explicit; no default to misread.
- **(b) Default to `View`**, so a faceless class says `extends Node`. LZX's rule (`<class>`
  defaulted to `view`); matches the dominant case; makes the faceless class the marked one.

The evidence moved Claude's recommendation from (b) to (a). In the shipped apps every view
class already writes `extends View` and every faceless class writes `extends Node`; only the
guide's examples use the bare form. So (a) costs the apps nothing. Under (b), a class meant to
be faceless that forgets to say so silently becomes a zero-size `View` — which a layout then
gives a slot and spacing — while (a) turns the same slip into an error naming both spellings.
(b) could follow later if the explicit word proves to be noise. **Not ruled.**

## 5. Projections and the way back

### What happens today

A derived dataset (`contents = { … }`) usually rearranges records it did not make: filter,
sort, group, slice. A row bound to it cannot write its own record, so a projected row sends
the record's identity to a method that writes the truth (ch14's board `advance(id)`, calendar's
`commitDrop`). The runtime's behaviour underneath, measured 2026-09-27 on the guide's board with
the card writing `:col` directly:

- **Adoption is exclusive.** A dataset tags every container it adopts with its own location,
  one tag per object. Sharing a record with a projection would re-tag it and pull it out of its
  source, so authors copy on purpose — weather's projections say so in a comment — and a copy
  cannot write back.
- **A projection built from `d.value` in a tracked compute stores tracking proxies** of the
  source's records (the adoption unwraps only the top level). A write through it mutates the
  real record but wakes the cells keyed on the proxy: the projection does not regroup and a view
  bound to the source record keeps showing the old value. **This is a bug today, independent of
  any design.**
- A projection built from `d.read(…)` stores the source's own objects and re-tags them to itself.
- A projection of spread copies (`{ ...r }`) takes the write into the copy, which the next
  recompute replaces — silently.

The guide's statement that a projected write "lands in the projection, which the next recompute
replaces" is accurate only for copies.

### What updatable projections need

The rule databases settled for updatable views applies: a view is writable where each row maps
to exactly one base row and each column to a base column; computed columns are not.

1. **Non-exclusive adoption.** A record keeps its home in its source while projections refer
   to it. This removes the reason to copy.
2. **Writes route home.** A write to a shared record goes through the source, so the source's
   readers wake and the projection re-derives; the row may move (the board card changes column).
3. **Annotation without copying.** A projection record is often the source record plus fields
   the projection computed — calendar's `dayRow` and `timeLabel`, lzx-calendar's `lane`. Those
   fields belong to the projection; the rest route home. Without this, authors keep copying to
   annotate and lose write-through.
4. **A declared write-back** for what is not a plain rearrangement: a member on the derived
   dataset that maps a change to the projection onto the source (a formatted field parsed back,
   a split joined back). The escape hatch for computed parts, kept on the dataset it belongs to.
5. **Loud refusal.** A write to a part with no home and no write-back is refused with an error
   that says so — never the silent landing-and-vanishing of today.
6. **The proxy leak fixed** regardless: a derived dataset never stores tracking proxies.

### What it would remove, and what it would not

From the analysis's inventory of method-intermediated writes:

| why the verb exists | instances | after updatable projections |
|---|---|---|
| the row is on a projection | calendar `commitDrop`, the guide's board `advance`, lzx-calendar's steppers (their target), sampler's `resort` (it reorders the truth because a sorted projection's cell edits would be lost) | **gone** |
| a field merge on one record | desktop `patchWin` | gone, given a record-merge verb |
| an action (Save, Apply, create from a form) | tracker `commitDraft`, lzx-calendar `applyText`, dashboard `saveNew` | stays — but the find-and-copy inside is a missing **record-level draft** |
| a structural change | tracker delete/undo, desktop add/remove/raise | stays — but each converts a record to an index first: **identity-based verbs** are missing (`remove(record)`, `merge(record, fields)`) |
| an invariant | tracker's `closedAt`/`updated`, desktop's window order, lzx-calendar's duration clamps | stays — the real business rules (declared invariants on a record: a later question) |
| arrival | tracker `adopt`, marketmap's decode | stays |

The design note for this should cover the adjacent gaps together: identity-based verbs and a
record-level draft (commit and revert a whole record, as `Editor` does for one field).

## 6. Cursor roots: replication over a computed list

About half the derived datasets in the corpus are not projections of a truth. They are
declared data wrapped around a computed list so a view can replicate over it — docs' `words`,
`parts` and `hits` ("the navSource idiom"), homepage's `navSource`, weather's `pageset` and
`deskSet`, desktop's `Launcher.data`, the inspector's four lists — because a `datapath` points
only into declared data. This is the separate, queued topic of replicating over a computed
array. It meets §5 at one point: a cursor root over records the method created is exactly the
case with no way back, so it must refuse writes (§5.5) or declare one (§5.4).

## 7. A potential persistence direction

Projection-to-source and client-copy-to-server are the same shape: **a document derived from
another, with a declared way back.** If the language had one concept for that, the server sync
§1 calls "not yet" could be the same mechanism with a network step in it: edits to the working
copy become requests, the response reconciles the copy, a refusal rolls it back or marks it.
Views would bind and write as they do everywhere else, and both reasons verbs exist today would
go, leaving one shape: bind and write.

This meets the persistence design (Design C of the September persistence discussion, whose
note is not in the repository — it lived in an untracked app, since removed) at its *sync
arrow* — the local replica written through the dataset verbs, one protocol to a local store or a
server, patches keyed by record, refusals returned as data — and leaves its *command arrow* (a
`DataSource` POST for what needs authority or an effect) as it is. DT: record it as a potential
direction in the persistence design once the decisions above lock; §5 is to be built before it.

## 8. Open questions

1. **`extends`:** (a) required, or (b) default `View` (§4).
2. **Faceless state-plus-verbs classes:** teach against them, and with what example in their place
   (ch05 `Cart`, ch14 `Log`)? Is extending the data (`class X extends DataSource`) the native form?
3. **Records and behaviour:** is there a record-side answer to the desktop's roster, or is a
   faceless node the answer (§3)?
4. **Updatable projections:** the design note (§5) — non-exclusive adoption, routing, annotation,
   write-back, refusal, plus identity-based verbs and a record-level draft.
5. **The proxy leak** (§5): fix as a bug now, or with the design?
6. **Cursor roots** (§6): replicate over computed lists directly?
7. **The persistence direction** (§7), after 1–4.

## 9. A related gap: what `Control` provides

The guide's rule for controls is to be reworded as: *anything that would be a button — anything a
keyboard user must be able to reach and press — is a control.* That is what `Control` delivers:
a tab stop, Space and Enter reaching the same `press()` a click does, a focus ring, and leaving
the tab order when disabled. It does not deliver screen-reader semantics: no role and no
accessible name are exposed (the runtime's only ARIA is on links and virtualized rows). So
"accessibility-ready" is not yet a claim the rule can make; exposing a role and a name from
`Control` would make it one.
