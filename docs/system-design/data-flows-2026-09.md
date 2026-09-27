# Data flows in the apps — a read, 2026-09-27

The evidence for [data-model.md](data-model.md). Purpose: understand what each app's data flow is doing (not grade it against a rule), and
sort every method-intermediated write by why it exists — the evidence for updatable
projections.

Verdict key for a verb: **W** automatic write-through would remove it · **B** needs a
declared write-back · **K** keep: an invariant, an action that is not a field write, or a
structural operation.

## 0. What the runtime does today with a projection (technical check)

Repro: the guide's ch14 board (raw cards → derived columns), with the card writing `:col` itself instead of calling `advance(id)`.

- A derived Dataset holds whatever its `contents` method returns. When the method reads
  the source through `d.value` inside the tracked compute, it gets TRACKING PROXIES, and
  `filter` keeps them: the projection stores proxies of the source's records (the value
  push unwraps only the top level). When it reads through `d.read(...)` (tracker's
  `issuesOf`), it gets the RAW records, and the projection stores the source's own objects
  and RE-TAGS them to itself (one tag slot per object).
- A write through the projection (`:col = 1` on a card) mutates the real record — the
  proxy shares its target — but wakes the cells keyed on the proxy. Result: the source's
  record changed, the projection did not regroup, and a view bound to the source record
  kept showing the old value (it corrected only when an unrelated source write forced a
  recompute of the projection, and the source-bound view never did).
- With spread copies (`{ ...c }`), the write lands in the copy and is lost at the next
  recompute — the case the guide describes.
- So the storage already shares records for identity-preserving projections. What is
  missing is identity (the source's own object, with its home kept), and routing a write
  on a shared record through the source so its readers wake and the projection
  re-derives. The guide's "lands in the projection, which the next recompute replaces" is
  accurate only for copies.

## 1. Tracker

**Entry:** `src: DataSource` (issues.json) → `onLoad` → `adopt()` sets `db.issues`
wholesale; `regenerate()` does the same from a generator. **Lives:** all on the App.
**Truth:** `db` (typed, one list). **Projections:** `shown` (filter → search → sort →
optional group with header records `{ kind: "hdr" }`), `closedSeries`, `workload`
(computed rows), `counts` (attribute). **Created data:** `draft` (`{ it: record|null }`),
`selection`/`selected` (attributes holding RECORDS), `collapsed`.

**How views touch data:**
- Rows (`IssueRow` over `shown`) never write. A row opens the editor, toggles a group, or
  opens a menu.
- The editor card binds to `draft` and writes it directly: `text <-> :it.title`,
  `<-> :it.description`; facets write `draft` through `setDraftField` (a Menu callback).
- Selection survives re-projection *because* `shown` and `db` share record objects —
  identity-sharing already carries weight.

**Verbs:**
| verb | what it does | verdict |
|---|---|---|
| `commitDraft` | finds the record by id in `db`, copies 8 fields, bumps `updated`, sets `closedAt` | **K** as an action (Save). The find-and-copy is boilerplate: a record-level draft (commit/revert of a whole record, like `Editor`'s for one field) would make it one line; the `updated`/`closedAt` rule is an invariant |
| `bulkSet` | multi-selection field write + the same invariant | **K** (invariant); with write-through the field write itself would be `r.status = v` on each selected record |
| `performDelete` / `undoDelete` | ids → indices → `removeAt`/`insert` | **K** (structural), but most of the code converts records to indices — an identity-based verb (remove *this* record) is missing |
| `adopt`, `regenerate` | load | **K** (arrival) |
| `seedDraft`, `newIssue` | fill the draft | **K** (the draft lifecycle) |

**Reading:** tracker is the fullest statement of "truth, projections, a draft, verbs for
actions". Updatable projections would remove almost nothing here, because its rows don't
edit. What its verbs point at instead: a record-level draft, identity-based structural
verbs, and invariants that are rules about a record ("closing sets closedAt").

## 2. Calendar

**Entry:** `data: DataSource` (events.json, `auto`), host-relative url. It is the client's
store (DT 2026-09-27: a client app managing a client dataset is fine — no buffer, no
simulated server). **Lives:** the App. **Projections:** `cal` (the visible month's grid:
cells, each carrying `events` for its day), `yearCal` (twelve minis, memoized on the year),
per-cell `eventsOn(...)` lists.

**The key detail:** the projection *annotates* records. `buildModel` hands each day
`eventsOn(...).map(e => Object.assign({}, e, { dayRow: row }))`, and `eventsOn` adds
`timeLabel`, `idx`, `dur` the same way. Each annotation forces a COPY, and a copy cannot
write back. So a chip (`Ev`, bound to the copy) cannot move its own event.

**How views touch data:**
- The detail panel binds straight to the source record
  (`datapath = { app.data.value.events.find(e => e.id == app.selectedId) }`) and edits it
  with `<->` — direct, no draft.
- Drag-and-drop goes through `commitDrop`.

**Verbs:**
| verb | what it does | verdict |
|---|---|---|
| `commitDrop` | finds the event by id in `data`, sets `y`/`m`/`d` from the drop cell and `start`/`end` from the drop height | **W** for the writes — they are field writes on the chip's own record, blocked only by the annotating copy; the geometry → date computation stays in the handler (it is input interpretation, not mapping) |
| navigation (`goMode`, `step`, `pickMonth`, …) | UI state | not data |

**Reading:** the requirement calendar adds: **a projection record is often the source
record plus fields the projection computed** (`dayRow`, `timeLabel`, `dur`). Write-through
must treat those as one record with two owners — source fields route to the source,
projection fields are the projection's (read-only, or recomputed) — or authors will keep
copying and lose write-through. Without it, updatable projections would miss the calendar's
main write.

## 3. LZX Calendar (the port)

**Entry:** `data: DataSource` fetched in `onInit`; `onLoad` builds the month and runs the
reveal animators. **Lives:** the App. **Projection:** `cal` is a *created* Dataset that
`setMonth()` rebuilds imperatively (days, each with annotated event copies — `timeLabel`,
`lane`, `lanes` — plus shared `hours`), and `relayout` writes `cal.cols`. Not derived: the
rebuild is called by hand after every change.

**How views touch data:** day cells and event bars bind to `cal` (the copies). The info
panel's date/time steppers bind to the selected *display copy* (`selRec()`); its text
fields are unbound and filled by `syncPanelFields()`; Apply commits them.

**Verbs:**
| verb | what it does | verdict |
|---|---|---|
| `applyText` (Apply) | mutates the SOURCE object's fields directly (`e.title = …`), then `setMonth()` | **K** as an action (Apply = a form draft); the hand-synced fields are what `Editor`'s `commitOn = "manual"` already expresses |
| `moveDay`/`moveStart`/`moveEnd` (steppers) | raw field writes on the source with rules (duration kept, clamps), then rebuild | the rules are **K**; the write target is **W** (the stepper's own record) |
| `addEvent` / `deleteEvent` | raw `push`/`splice` on the source array, then rebuild | **K** (structural) |
| `setMonth`, `relayout` | the hand-maintained projection | disappear with a derived `cal` |

**Reading:** the pre-derivation, imperative form of the same app. Its edits bypass the data
API (raw object mutation, no wakes) and stay correct only because each verb ends by
rebuilding the projection. It is the clearest picture of what derived datasets plus
write-through would replace — and it is a port, so it records how LZX apps were shaped.

## 4. Desktop

Three data flows, two of them in faceless classes.

**Windows as data — `WinManager` (faceless).** `list: Dataset { wins: [] }` holds one record
per window `{ id, cls, appId, mini, props… }`; order is paint order. `WinSlot [ datapath =
:wins[], key = :id ]` materializes each window from its record. `frontId` is an attribute;
`frontWin`, `activeApp`, `miniCount` derive. `miniData` projects the minimized records with
a spread plus `ix` (an annotating copy again) for the dock's tiles.

| verb | what it does | verdict |
|---|---|---|
| `addWin` | insert before the minimized tail | **K** (structural + an ordering invariant) |
| `raiseWin` | id → index, move to the top of the normal band | **K** (invariant); the id → index search is the missing identity verb |
| `patchWin` | id → index, `set(["wins", i], { ...old, ...patch })` | **W**-shaped: a field merge on one record, spelled as a whole-record rewrite because there is no record-merge verb |
| `removeWin` | id → index, `removeAt` | **K** (structural), identity verb missing |
| minimize/restore | `patchWin` + move | invariant (the band order) **K** |

**Applications as nodes — `Launcher` (faceless) + `DesktopApp` subclasses.** Each app is a
Node instance with identity attributes, live state (`running`, `launching`, `count` —
"plain reactive attributes — assignment is the update") and BEHAVIOUR: `face(d)` (its icon
art) and `launch(v)`, overridden per kind (hosted, inert, built-in). The dock cannot
replicate over nodes ("a cursor can only point into a Dataset, and a node reference never
enters data-shaped state"), so `Launcher.data` projects the roster to records
`{ id, ix, running }`, and each `DockIcon` resolves its node back by id.

**Reading:** the tension here is real and not about projections. **Records cannot carry
behaviour; nodes cannot be replicated over.** The desktop wants per-kind behaviour (art,
launch policy) on a collection the dock replicates, and bridges it with a projection plus a
lookup by id. It is the strongest case in the corpus for faceless classes — and it is
object-shaped on purpose ("chrome never switches on an app id"). Whatever the guidance
says, it has to either bless this or offer the record-side answer (a kind field choosing a
view class / State per kind — ch16's new section — does the view half, not the behaviour
half).

**Docs browser (in desktop):** `cols` is a derived Dataset over the docs model — read-only
navigation, no writes.

## 5. Market Map

**Entry:** `Market` (faceless) holds `src: DataSource` (auto, host-relative); `onLoad`
decodes the delta-coded closes and lands everything as plain attributes (`stocks`, `days`,
`industries`, `sectors`, `tree`, `nDays`) plus a hand-set `ready = true`, then calls a
`landed(nDays)` hook that the App's instance overrides (arrival as an overridable seam).
**Projections:** `table` (Dataset over the decoded attributes — the one the map replicates),
`stageRoster` on the App (the records the drill stage needs right now, rebuilt as copies
with `id`). Everything else is query methods over the attributes, called from constraints
with bound fields (`app.market.dayChangeAt(:closes, app.day)`).

**Writes:** none. Read-only analytics; the only state that changes is UI (day, zoom, stage).

**Reading:** the faceless class is a *read-only data service*: decode once, derive, answer
queries. Views still bind to its Dataset. Two things worth noting: state held as untyped
`object[]` attributes rather than a typed Dataset (so the queries cast), and `ready` set by
hand where `src.loaded` would derive it — though here `ready` also means "decoded", which
`loaded` does not.

## 6. Weather

**Entry:** `data: DataSource` (auto). `cities` is an attribute over it; `city`/`cond` derive
from `cityIndex`. **Projections:** `shown` (search-filtered, COPIES of the fields rows
render), `pageset` (copies of `{ id }` — the pager's roster), `deskSet` (zero or one record:
a Dataset used as a build switch for the desktop dialect). **Writes:** none to data; the
search draft is a plain attribute the fields deliver into.

The file states the constraint that shapes every projection in the corpus:

> Both projections hold copies — just the fields their rows render — never the city objects
> themselves. A Dataset adopts every container placed in it, and adoption is exclusive:
> sharing the objects would pull them out of `data`, breaking everything else that reads them.

**Reading:** authors copy *on purpose*, to protect the source from re-tagging (§0). A copy
cannot write back, so exclusive adoption is what makes projections read-only in practice.

## 7. Sampler (the component gallery)

**Data:** `cities` (literal), `gd` (500 generated issues, seeded in `onInit`) — the DataGrid's
rows, edited in place by its cells ("app-owned — seeded once, so cell edits persist").

| verb | what it does | verdict |
|---|---|---|
| `resort(on, dir)` | replaces `gd.rows` with a sorted copy — sorting by REORDERING THE TRUTH | **W**, indirectly: the library's DataGrid says the opposite ("sorting names a derivation … your app derives the sorted dataset"); the sampler mutates the truth because a derived, sorted dataset would make its cell edits land in the projection (§0) |

**Reading:** doctrine and practice diverge exactly where projections can't be written.

## 8. LZX Dashboard

**Data:** three `DataSource`s (contacts, music, videos) as client stores; `chatLog` literal.
**Writes:** `ChatPanel.send()` appends to `chatLog`; `saveNew()` appends a contact built from
five unbound text fields into `contactsData`'s value (no server — the port's stand-in).
Both **K**: creating a record from a form is an action. The form's fields are read by hand
(`form.nameIn.text`, …) — a created draft record the form binds to would express it.

## 9. Read-only apps and the cursor-root pattern

Docs, homepage, birds, lzx-weather, the inspector, the viewer, swatchbook, architecture:
sources and derived Datasets, no data writes. What recurs is a Dataset that exists only to
be a **cursor root** — declared data wrapped around a computed list so a view can replicate
over it: docs `words`, `parts`, `ancestry`, `hits` ("the same list as declared data — the
results page's cursor root (the navSource idiom)"), homepage `navSource`, `appsSource`,
weather `pageset`, `deskSet`, desktop `Launcher.data`, the inspector's `tree`/`slots`/
`deps`/`log`. Roughly half the derived Datasets in the corpus are this, not projections of
a truth. It is the queued "replication over a computed array" topic, and it is separate
from write-through — but the two meet: a cursor root over computed records is exactly the
case with no way back.

## 10. The guide's data examples

The baseline the guide teaches is bind-and-write on the truth: ch01's first app and ch15
(`Checkbox [ checked = :done, input(v: boolean) { :done = v } ]`), `<->` on text fields
(ch08, ch14 forms), `set("/rows/-", …)` appends (ch01, ch03). Projections appear in ch14 ("the
shape of a real app": raw → board, with the rule that a row on a projection sends its id to a
method), ch16 and ch22 (derived Datasets for replication). The state-plus-verbs faceless
class appears in two places only — ch05 `Cart`, ch14 `Log` — plus ch14 `TaskModel`, which is
the other kind (a model standing on a record, reading `:field`).

(Eval runs and eval reference solutions are left out of this read on purpose: they show what
an author produced under a brief, not the form to follow.)

---

# Synthesis — what the corpus is doing

**1. The home of data is the tree, and views bind and write it.** Truth sits on the App (tracker,
calendar, lzx-calendar, weather, sampler, dashboard) or on the node that scopes it (desktop's
browser columns). Views bind with `datapath`, replicate with `:rows[]`, and write with
`:field = v`, `<->` and `d.set`. The guide's baseline teaches exactly this. The faceless
state-plus-verbs class is taught in two guide examples and is not how the shipped apps are
built.

**2. Projections are everywhere, and read-only in practice — because adoption is exclusive.**
A record can belong to one Dataset. So authors copy on purpose (weather says so), annotate
by copying (calendar's `dayRow`, `timeLabel`; lzx-calendar's `lane`), or avoid projecting and
reorder the truth instead (sampler's sort, against the DataGrid's own doctrine). A copy cannot
write back, so every edit from a projected row becomes a verb that finds the record by id and
writes the truth (calendar `commitDrop`, ch14's board `advance`). Where a projection does not
copy, today's behaviour is a latent bug (§0): the write reaches the record but not its readers.

**3. What the method-intermediated writes are for** (shipped apps and guide):

| why the verb exists | instances | would write-through remove it? |
|---|---|---|
| the row is on a projection (copy) | calendar `commitDrop`; lzx steppers (target); board `advance`; sampler `resort` (indirectly) | **yes**, given non-exclusive adoption and annotation |
| a field merge on one record | desktop `patchWin` | yes — with a record-merge verb |
| an action (Save / Apply / create from a form) | tracker `commitDraft`, lzx `applyText`, dashboard `saveNew` | no — but the find-and-copy inside is boilerplate a record-level draft would remove |
| a structural change (add, remove, move) | tracker delete/undo, desktop add/remove/raise, lzx add/delete | no — but every one converts a record to an index first; an identity-based verb is missing |
| an invariant | tracker `closedAt`/`updated`; desktop band order; lzx duration and clamps | no — these are the real business rules |
| arrival | tracker `adopt`, marketmap decode | no |

So updatable projections remove the first two rows — the "two shapes" DT objects to — and
three adjacent gaps account for most of the rest: **identity-based structural verbs**, a
**record-level draft**, and (later, perhaps) **declared invariants on a record**.

**4. Faceless classes, where they exist, do three different jobs** — and all three still hand
views a Dataset to bind:
- a **read-only data service** (marketmap `Market`: decode, derive, answer queries);
- **shared client state with invariants** (desktop `WinManager`: window records + ordering rules);
- **a roster of things with behaviour** (desktop `DesktopApp`: per-kind art and launch). This is
  the one real tension: records carry no behaviour and nodes cannot be replicated over, so the
  desktop projects nodes to records and looks them back up by id.
  Plus the ch14 kind: a model standing on a record (`TaskModel`), binding-native.

**5. About half the derived Datasets are cursor roots, not projections** — declared data
wrapped around a computed list so a view can replicate over it. Separate topic (replication over
a computed array), but it meets this one: a cursor root over computed records is the case with
no way back.

**6. The imperative legacy** (lzx-calendar): a hand-rebuilt projection and raw object mutation
that bypasses the data API, correct only because every verb ends in a rebuild.

## What updatable projections need (from the above)

1. **Non-exclusive adoption:** a record keeps its home in its source while projections refer to
   it. This removes the reason to copy (weather's comment).
2. **Writes route to the home:** a write to a shared record goes through the source, so the
   source's readers wake and the projection re-derives (the row may move — the board card
   changes column).
3. **Annotation without copying:** a projection record is often the source record plus fields the
   projection computed (calendar). Those fields belong to the projection; the rest route home.
4. **Loud refusal** for a write to a part that has no home (a created record, a computed field),
   unless the Dataset declares a write-back.
5. **The proxy leak fixed regardless** (§0): a derived Dataset must never store tracking proxies.

Adjacent, and worth designing in the same note: identity-based structural verbs (`remove(record)`,
`merge(record, fields)`), and a record-level draft (commit/revert a whole record, as `Editor`
does for one field).
