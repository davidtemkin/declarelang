> **Historical record (filed 2026-09-11).** The disposition plan written on 2026-08-11/12 after the Murmur craft run, recovered from that session's transcript and kept as written. It is not a work list: several items have since shipped by other routes (the settle-completion hook as afterSettle/onReady; the scroll contract as the 2026-09 scroll model), and the rest were never re-adopted from here. The run itself: `evals/apps/murmur/`, report `evals/reports/2026-08-11-murmur-declare-1.md`.

# Murmur bugs — dispositions and fixes, item by item

Second pass, after reading the scroll-ownership model properly: `05-space.md`
§Scrolling, `16-gestures.md` whole, `apps/homepage/homepage.declare`, and the
sources (`view.ts`, `dom-backend.ts`, `boot.ts`, `replicate.ts`, `input.ts`).

Reading the ownership model changed item 1's fix substantially — the mechanism it
needs already exists in the runtime and is missing only its trigger. Items 3, 5 and
8 also changed. Nothing here has been implemented.

---

## The scroll-ownership model, as the sources actually have it

Stating this first because four items depend on it.

1. **The app scrolls by default and its scroller is the page** (`05-space.md:131`).
   Not a feature — a consequence of what an App is. Panes open their own scroll
   with `scrolls = y`; the nearest scroller wins.
2. **The platform writes the offset; the author reads it.** `scrollY`/`scrollX`
   are mirrored from the native scroll. `scrollX`'s prose is explicit —
   *"the platform owns it, and assigning it is a compile error"* — and names
   `scrollY` as still lacking that enforcement (`prose/View.md:488`). The
   asymmetry is real: `boot.ts:440` depends on `scrollY` being assignable to land
   declared initial offsets.
3. **The author's only lever is a request.** `scrollTo(y)` and `scrollIntoView()`
   — *"a REQUEST, not an assignment … the platform clamps it to the real scroll
   range"* (`view.ts:760–764`), and `scrollTo(Infinity)` means the far end,
   resolved against the range at application time.
4. **A request is already held.** `SCROLL_WANT` (`dom-backend.ts:374–403`)
   remembers every request per element; `reassertScroll` re-applies it when the
   element becomes able to take one. `Infinity` re-resolves against
   `scrollHeight` *now*, not at call time.
5. **This is the gesture model's scroll half.** A `scrolls = y` view *delegates*
   panning to the browser (`16-gestures.md:92–99`), and the page's own scroll is
   the only tier a browser will upgrade mid-gesture to a pinch. Delegation is the
   point; taking the scroll back is not on offer.
6. **Reading the offset is the sanctioned idiom, and it has a known trap.** The
   homepage drives a backdrop and every reveal spring off `app.scrollY` and never
   writes it — and it carries a clamp with a measured story attached
   (`homepage.declare:882–895`): a view whose geometry read `scrollY` fed the
   scroller's own auto-extent, and the page grew 32 px on every trip to the
   bottom, 5243 → 5412 over six trips.

So an author has no remedy for scroll trouble *by construction*. They own a
request; they do not own the scroll. Anything the platform drops, they can only
re-issue — which is precisely what murmur did, and why the workaround looks the
way it does.

---

## 1 · Native scroll reached implicitly, never explained

**Disposition: fix the platform first, then document. Not a docs bug.**

**What's true.** Two things, both established this pass.

*(a) Browser scroll anchoring cannot operate here at all.* Every view realizes as
an absolutely positioned `<div>` (`dom-backend.ts:3`), and CSS scroll anchoring
does not act on absolutely positioned content. Measured, headless Chrome,
500×500, 60 rows of 100 px, scrolled to 2000, a row far above the reader grown by
200 px:

| realization | scroller | scroll adjusted by | reader's content drifted |
|---|---|---|---|
| normal flow | page | 200 px | 0 px |
| normal flow | pane | 200 px | 0 px |
| **absolute (Declare's)** | page | **0 px** | **200 px** |
| **absolute (Declare's)** | pane | **0 px** | **200 px** |

The report's premise — that the OS owns anchoring and we merely fail to say so —
is false. `prose/View.md:127–131` ("On DOM the OS owns the scroll — overlay
scrollbar, momentum, and rubber-band overscroll") is what licensed the inference,
and it is accurate about everything it names. Position preservation is not among
them.

*(b) The held request is re-asserted on visibility change, never on range change.*
`reassertScroll` fires when a hidden subtree becomes showable. Nothing fires when
the scroll range moves under a request that has not been satisfied. So a
`scrollTo` issued while photographs are still sizing is simply lost.

**Murmur reimplemented `reassertScroll` in Declare.** Its `landing: Heartbeat`
(`murmur.declare:568–594`) watches `contentHeight - height` for change and
re-issues `scrollTo(landY < 0 ? Infinity : landY)` — the same held-request
semantics, including the sentinel meaning "far end," with a hand-rolled 44-frame
budget. Its comment states the contract the platform did not: *"a request is
re-asserted whenever the content changes size … it repeats because the answer
moved, not because the request was wrong."* An agent with no access to
`dom-backend.ts` derived the platform's own data structure and the trigger it is
missing. That is the finding.

### The fix: make the standing request an ordinary constraint, and name the policy

Two changes, and they turn out to be one feature rather than the two I split them
into on the second pass.

**(i) The hold stops being special machinery.** Today it is a `WeakMap` outside
the reactive world (`SCROLL_WANT`), written by `scrollToY`, re-applied by exactly
one bespoke caller (`reassertScroll`, on show). Every gap found so far is a
missing caller — which is the tell that the caller list is the wrong design.

Make it ordinary: the scroller carries the standing intent as a slot, and **one
runtime constraint** computes the realized offset from (intent, `contentHeight`,
frame height) and applies it across the seam via `surface.scrollToY`. Then

- the range moves → `contentHeight` (`view.ts:508`) is a dependency → it re-runs;
- a hidden pane becomes showable → `shown` is a slot → it re-runs, and
  `reassertScroll` *disappears* rather than gaining a second caller;
- an author builds a cycle → the ordinary cycle guard names it.

No timer, no watcher, no frame budget, no new caller list. The hold becomes what
the language already is.

**(ii) Retire `Infinity`; name the policy.** `scrollTo(1e9)` already lands at the
bottom, because the platform clamps — so `Infinity` buys nothing *as a value*.
What it buys is late resolution (`wantY` re-resolves it against `scrollHeight` at
application time), which makes it a **mode flag smuggled through a coordinate
channel**. That is why the model has to refuse to hold it (`view.ts:770`: a
non-finite request "leaves the fact to the mirror alone"). The type lies about
itself to carry the mode, and the mode cannot express its own family — there is no
counterpart for the top, and none for "stay where the reader is."

Name it, as an enum on the scroller in the grain of `scrolls` and `stretches`:

| `keeps` | meaning |
|---|---|
| `offset` | today: the number is the truth, content moves under you |
| `bottom` | hold the far end **whenever the reader is already at the far end** |
| `reader` | hold the reader's content still when what is above it changes size |

`bottom` is the one worth dwelling on: it is a **predicate on the current offset
and range**, not a mode with a lifetime. Nothing has to notice the user scrolling
away and retire an intent — scroll up and it stops holding because you are no
longer at the end; scroll back down and it resumes. That is what every chat log
wants, and it is literally the `atBottom()` helper murmur wrote by hand
(`murmur.declare:555–558`).

`scrollTo(y)` then stays a finite request that retires once satisfied, and
`scrollTo(Infinity)` is retired in favour of `keeps = bottom`.

**Why no frame budget.** Murmur needed 44 frames because it polled from outside
the settle: a `Heartbeat` samples `contentHeight` once a frame and cannot know
when the content stopped moving, so it must guess a stopping rule. A constraint
does not poll — it runs when a dependency changes and never otherwise. The only
way it iterates is a genuine cycle, and that is not a new hazard class: it is the
cycle the runtime already detects at `CYCLE_LIMIT` (`reactive.ts:71`, *"a guard,
not a tuning constant"*), throwing a `DeclareError` that names the constraint.
Under this design the homepage's silent 32 px creep would have been a loud error
naming `GridBg.y`.

This deletes murmur's `landing`, `land`, `landY`, `lastH` **and** `atBottom`.

### The `reader` policy is the hard one (formerly 1b)

`offset` and `bottom` are pure functions of the current offset and range. `reader`
is not: it compares geometry *across* a settle. It is the same slot and the same
constraint, but it needs the delta, so take it deliberately. Generalize what
`replicate.ts:1085–1088` already does:

```ts
if (aboveShift !== 0) {
  const sc = this.findScroller();
  if (sc !== null) setBound(sc, "scrollY", Math.max(0, sc.scrollY + aboveShift));
}
```

Its comment calls it "the viewport-stability anchor … compensates the scroll so
the user's view holds still (Tracker criterion 2)." It is real, tested, credited —
and confined to a `virtualize`d Replicator, to whole-row ledger heights, to rows
inside the materialized window above the anchor, applied one reconcile pass late
(`replicate.ts:1060–1068`). Murmur ran with it engaged (`virtualize = true`,
`murmur.declare:782`), which fits "36 jumps, oscillating ±145 px" better than no
mechanism would. It is documented nowhere.

**The hazard to design against is the homepage's**, and it is worth being precise
about it, because it is author code that closes the loop, not ours. Two sanctioned
facts meet:

- a scroller's range derives from its content — `extentOf` is `max` over visible
  children of `child.y + child.height` (`view.ts:480–494`), which for the App
  feeds `setPageExtent` → the root element's height → the document's range;
- reading `app.scrollY` in a constraint is the idiom the homepage is built on.

So a view's *position* can depend on the offset while its *bottom edge* feeds the
range: `grid: View [ y = { app.scrollY }, height = { app.height } ]`. Scroll down
100 → `grid.y` +100 → its bottom +100 → `contentHeight` +100 → the document is
100 taller → there is 100 more to scroll. That is the homepage's measured bug:
32 px per trip to the bottom, 5243 → 5412 over six trips
(`homepage.declare:882–895`), fixed in the app by clamping the backdrop to the
*content's* extent instead of to the offset.

Today that loop only advances when the **user** scrolls, so it creeps. `reader`
changes who excites it: the runtime writes the offset in response to a geometry
change, so the loop can close with no user and inside a single settle. A shape
that crept 32 px per trip could run away in one frame.

The answer is not a budget — it is where the compensation runs. Compute the delta
from a pre-settle snapshot against post-settle geometry, apply it **once per
settle after quiescence, outside the constraint fixpoint, without re-entering**.
That bounds it to one correction per frame whatever the author wrote, and a
genuine cycle still surfaces as the ordinary `CYCLE_LIMIT` diagnostic rather than
as drift.

**Surface.** `reader` is a value of the same `keeps` slot, not a separate
mechanism. Whether it should also be the *default* — the platform owning reader
stability the way it owns momentum — is the one ruling here. My inclination is
yes, with `offset` available for the app that wants today's behaviour.

### Then the docs

- `05-space.md` §Scrolling: what delegating to the browser buys (momentum,
  overscroll containment, position memory, the pinch upgrade) **and what it does
  not** (position preservation across content changes) — followed by what the
  platform does instead.
- `View.scrollTo` / `View.scrollIntoView` prose: the range is not settled at call
  time; the request is held; here is when it is re-applied. The agent asked
  `declare-help View.scrollIntoView` — a confirmed point of contact.
- Document the Replicator's viewport-stability guarantee wherever it ends up
  living. Today the platform does this silently in one place and silently doesn't
  everywhere else, and says neither.

### Two facts the implementation has to account for

Both found while checking the safety claims I made on the second pass; both were
wrong as I first stated them, and both change the work.

- **The page scroller does not hold anything today.** `reassertScroll` writes
  `el.scrollTop` directly, which is inert on a top-level App root — it wears
  `overflow: clip` and the *document* scrolls it (`dom-backend.ts:1204–1214`).
  Re-application must go through `scrollToY`, which knows about that branch.
- **`App.scrollY` has no pusher.** `View.scrollY` carries
  `push: (v, y) => v.surface?.scrollToY?.(y)` (`view.ts:1024`), but `App`'s own
  table declares `scrollY: { def: 0 }` (`view.ts:1576`) and `defineAttributes`
  shadows per key (`attributes.ts:119`). So for the page, the mirrored offset
  never reaches the surface — which is *correct* under "the platform owns it,"
  but it means a user page-scroll does not update any held state. Under the
  constraint design this stops mattering (the intent is a slot, and `keeps =
  bottom` is a predicate on the live offset), which is a further argument for it
  over patching the caller list.

### Also worth closing

Make `scrollY` read-only-enforced like `scrollX`, and give declared initial
offsets their own path (`boot.ts:440` is the only writer that needs it). The
prose already describes this as a gap; it is small, and it removes the one place
an author can appear to own the scroll.

---

## 2 · Introspection's *why* verbs never reached

**Disposition: fix. The diagnosis is not "the pointer is missing" — it is that the
instrument was found and a quarter of it was used.**

**What the run actually did.** The agent drove a browser, reached the bridge
unaided, and used it constantly: `find` 30, `inspect` 25, `stats` 5, `at` 5.
Reachability was never the problem — **the browser harness is the intended agent
interface, and it worked.** What it never used were `explain`, `explainHit`,
`slots`, `expand`, `dependents` and `evaluate`: 0 each.

The four it used all reveal **shape**, and a console dump makes them obvious. The
five it missed answer **why**, and none of them can be guessed by poking — you
have to be told they exist. So the loss is not access, it is vocabulary.

**Both front doors named it, and neither pointer was followed.** `README.md:43`
opens an "Agents start here" section whose loop bullet (`:59–64`) names
introspection as the third step, and `skill/SKILL.md:127–134` names it at exactly
the right moment. The transcript (`d6e10680…jsonl`) confirms the agent read
**both** and opened `introspection.md` never. A third pointer would do nothing.

**What separates the instruments is form, not prominence.** All three appear in
the same loop sentence at both doors:

| instrument | how both doors present it | used in the run |
|---|---|---|
| `declare-help` | a runnable command (`README:61`, `SKILL.md:94–95`) | **36 queries** |
| `verify` | a runnable command | **40 runs** |
| introspection | a file path (`README:63`, `SKILL.md:134`) | 0 — file never opened |

The two given as commands were run 76 times between them. The one given as a link
was never opened, and its *why* verbs went unused for the whole 88 minutes.

So the fix is to state the vocabulary where the agent already is, and to describe
the bridge as **what it is for** — an agent cannot glance at a screen, and this is
how it looks. `introspection.md` says exactly that in its second paragraph; the
doors do not. Three specific changes, ranked by the evidence above:

**(a) `declare-help` — one `forms` entry in `tools/internal/doc/concepts.json`.**
Currently `declare-help introspection` answers "no entry" and `declare-help
explain` retrieves `View.method.viewAt` by substring. Draft:

```json
{
  "terms": ["introspection", "__declare", "window.__declare", "explain",
            "explainHit", "slots", "dependents", "inspect a running app",
            "why is this value", "what is under the cursor", "debug a running app"],
  "answer": "A running app answers questions about itself. Every top-level app installs `window.__declare` at mount:\n  inspect(path?)        the subtree as data — geometry, slots, rootX/rootY\n  find(path)            the live node\n  explain(path, attr)   WHY a slot holds its value — the expression, its read-paths, their live values\n  explainHit(x, y)      what a press at that point would take, and what the walk stepped over\n  slots(path)           every slot with its value and origin (constraint / set / default)\n  expand(path, attr)    one level of a record/array/Dataset value\n  at(x, y)              { path, kind } of the topmost view at a point\n  dependents(attr)      every (path, attr) whose constraint reads that name\n  evaluate(path, src)   evaluate Declare in a node's scope\n  stats()               { nodes, ownedSlots, motionBusy }\nPaths are dotted from the root: `app.bar.brand`, `app.board.grid.3.4`.\n`explain` and `explainHit` are the two source-reading cannot answer. Full surface: docs/operational/introspection.md."
}
```

`forms` matches exact terms only and answers before retrieval, so this fixes
`explain` too. One collision to decide: `__declare` normalizes to `declare`, so a
bare `declare-help declare` would also land here. Either accept it or drop the
`__declare` term and keep `window.__declare`.

**(b) `verify` — one line at `tools/verify.mjs:272–274`.** When nothing failed and
`climbed === 4`, after the existing "clean through R4" line:

```
  next: it compiles — introspection tells you how it behaves.
        window.__declare.explain(path, attr) · explainHit(x, y) — docs/operational/introspection.md
```

This is the highest-value placement on the list: the agent saw this output 40
times, and R4-clean is definitionally the moment "it compiles but behaves wrong"
begins. R5 and R6 already advertise `--assert` and `--states` from the same
block, so the shape is established.

**(c) The two doors — describe it as the agent's instrument, not as a document.**
`SKILL.md:127–134` and `README.md:59–64` both name a file where they should name
the questions. Replace SKILL.md's closing *"See
`docs/operational/introspection.md`"* with the calls themselves:

> You drive a browser already — the same session answers questions about the
> running program. `window.__declare.explain(path, attr)` gives the expression a
> slot was wired to, its read-paths and their live values;
> `window.__declare.explainHit(x, y)` gives what a press there would take and what
> the walk stepped over. Those are the two source-reading cannot answer.
> `declare-help introspection` has the rest of the surface;
> `docs/operational/introspection.md` has the whole of it.

README's loop bullet wants the same treatment in one clause — it is a routing
table and should stay short, but "ask the running program with introspection"
should say *what you can ask it*, not only where the file is.

Keep the file reference for depth; stop relying on it for reach.

**Not now: a CLI door.** Nothing in `tools/` reaches `window.__declare`, and it
would be easy to read that as the gap. It is not: the browser harness **is** the
intended agent interface, and this run proves it works — the agent built one and
used the bridge 65 times without being told how. A CLI would be a convenience
layer over an interface that is already the right one, and it should be taken on
its own merits later, not as a fix for this.

---

## 3 · No settle-completion hook

**Disposition: agreed — the `setTimeout` is a workaround, and the thing it works
around is not settle timing. Fix that; treat the settle event as separate.**

Your instinct is right, and the source bears it out. Murmur's timer
(`murmur.declare:474–482`) exists because **`raise()` is not durable on a
replicated child**: the reconciler re-links the block in data order on every pass
(`replicate.ts:905–911`), so a raise is undone by the next reconcile. Deferring to
a macrotask just wins the race until the next one. It is not a hook that is
missing at that call site — it is a durable statement of paint order.

**Recommended fix: make paint order declarable.** Stacking is declaration order,
and `raise()` is the runtime verb for changing it (`prose/View.md:612–618`) — but
a verb cannot survive a reconciliation that rebuilds the order from data. Give it
a reactive form: a `raised` slot the reconciler honours when it re-links, or
`above: View` naming a sibling. Either one is a fact the reconciler can preserve
rather than an action it clobbers, and murmur's `raiseRow` becomes a constraint
with no timer in it.

**Then, separately, the settle event.** It stands or falls on PR #2's own case
now that item 1 needs no seam from it.
`reactive.ts:292–313` is a synchronous flush with a clean `finally`; adding a
post-flush callback phase is small, and re-entrancy (a callback that writes, and
therefore re-queues) is the only real design question. What it should look like to
an author is yours to rule; I'd resist a per-node `onSettled()`, which fires far
too often to be the thing anyone wanted.

**Related latent defect, worth its own look.** The `sameSet` fast path
(`replicate.ts:915–919`) skips mirroring child order to the DOM on a pure reorder,
on the stated bet that "placement is absolute and rows never overlap." Murmur's
design — a chip tucked under a bubble's bottom edge — breaks that bet, and when it
is broken, view-tree order and paint order can silently diverge in a virtualized
list. That may be all item 4 actually is.

---

## 4 · Reaction chip painted over by its bubble

**Disposition: app bug, but check the platform first.**

Filed as murmur's. Before accepting that, check the `sameSet` path above: the chip
overlaps the adjacent row's band, which is exactly the case that optimization
assumes away. If paint order and tree order have diverged, it is ours.

If they agree, it is murmur's and the fix follows item 3 — with a declarable
`raised`/`above` the app states the relationship once and no timing is involved.

---

## 5 · Audio player confusable

**Disposition: hypothesis refuted; re-file as open. One real platform bug found
alongside it, which is a candidate but not a reproduction.**

**Refuted.** Murmur guards both divisions (`murmur-talk.declare:171–173`): `secs`
falls back to the payload's `durationMs` when `duration` is 0, and `playFrac`
guards `secs > 0`. All three voice fixtures carry `durationMs`, each within 1.4 %
of the file's true length (6917/7012, 20338/20434, 8728/8824 ms). No zero, no
meaningful mismatch.

**Found instead.** `Media.seek()` (`media.ts:190–194`) drops any seek smaller than
a quarter second:

```ts
if (Math.abs(el.currentTime - this.position) > 0.25) el.currentTime = this.position;
```

The guard exists to stop the runtime's own `timeupdate` writes bouncing back out
as seeks. But it is a magnitude test, so it cannot tell the runtime's echo from an
author's small seek — and an author's small seek is silently dropped *while the
`position` attribute keeps the new value*. Model and transport then disagree until
the next `timeupdate` snaps `position` back. On murmur's 274 px waveform that is a
~10 px dead zone on a 7-second clip, followed by a visible spring-back as `head`
chases the reverted `playFrac`. While the clip is **paused** no `timeupdate` fires
at all, so `position` lies until playback resumes.

**Fix:** replace the magnitude guard with provenance — suppress the seek when the
write came from the runtime's own `timeupdate` (a flag around the `setBound` at
`media.ts:161–164`), and honour every author write exactly. Same anti-stutter
property, no dead zone.

**Docs fix in the same area:** `prose/Media.md:40` demonstrates the progress bar as
`width = { parent.width * (clip.position / clip.duration) }` — an unguarded
division, three sections above the prose saying `duration` is 0 until metadata
lands. Guard the example and say so in `position`'s prose.

**Keep the original symptom open.** The dead zone predicts "confused once early,
fine after," but it has not been reproduced against the hand report. To try: drag
the waveform less than ~10 px and release; repeat on a paused clip.

---

## 6 · `onContextMenu` not surfacing to authors

**Disposition: fix — docs only. The platform is correct, and its rule is one
rule.**

### The rule, and why it needs no exception

`input.ts:263–270` decides delivery and suppression in one branch, which is the
whole design:

```js
const t = resolve(e);
if (t !== null && t.wantsContext === true) { e.preventDefault(); t.sink("contextMenu", t.x, t.y); }
```

> **Claim it, you get it and the system menu is suppressed. Don't claim it, you
> don't get it and the system menu appears.**

`t` is the ordinary resolved target — `resolve()` climbs to the nearest
sink-bearing view exactly as it does for every gesture, and `wantsContext` is
that view's own flag. So an **interactive child is its own claimant**: inside a
`Row [ onContextMenu ]`, a child that declared nothing is skipped by the walk and
the Row gets the gesture, while a child with its own handler, `tip`, or `link` is
the target and — having claimed nothing — leaves the browser its menu.

That reads as a surprise until you see what it buys. **The runtime builds a real
`<a href>` overlay for every linked view** (`dom-backend.ts:1256–1266`) precisely
to keep the native contract: status-bar preview, ⌘-click open-in-tab, and
right-click **copy-link**. A linked view has a sink, resolves as the target,
claims no context gesture — so the browser's menu appears, which is where
copy-link lives. Any scheme that suppressed the menu on an ancestor's behalf
would destroy that affordance on every linked view inside a context-claiming row.
The composition is the point, not a leak.

*(An earlier pass in this document proposed resolving the context gesture to the
nearest claiming ancestor, reasoning from `wantsPinch`'s ancestor walk. Withdrawn.
Pinch walks for a reason peculiar to multi-touch — its own comment: "two fingers
may land on different interactive children of one pinching view" — not because
claims generally cover subtrees for delivery. Declare does not bubble; delivery is
single-target; and the proposed change would have broken copy-link as above.)*

### The documentation gap that was filed

`onContextMenu` appears in `12-above-the-flow.md` (the menu chapter) and the
reference, and **nowhere in `07-interaction.md` or `16-gestures.md`** — confirmed
by grep. The agent read both.

`16-gestures.md` is the ownership chapter, and its claim table
(`16-gestures.md:62–70`) lists `onPointerMove`, `onHold`, `onDblClick`, `onWheel`,
the pinch family, the touch family and `claim` — every gesture whose ownership a
handler decides, except the one where declaring the handler also suppresses the
browser's own menu (`input.ts:264–271`). That is the same rule the chapter exists
to teach, and it is the one instance missing from the table.

**Fix:** add the row to the claim table in 16 (`onContextMenu` → *on a touch
screen: nothing — touch context rides `onHold`; on the desktop: the right-click
menu over this view*), mention it in 07's handler list, and add `context menu` /
`right click` / `two-finger tap` to the concept table pointing at it.

**And one sentence on the composition**, since it is the part that reads as
surprising: an interactive child is its own claimant, so a link inside a
context-claiming row keeps the browser's menu — and that is what preserves
copy-link on the link. It is the same "claim the least you need, on the smallest
view that needs it" rule seen from the other side.

---

## 7 · Two 404s on every app load

**Disposition: fix — small, self-contained, no rulings.**

Both are blind probes.

- **`bundles/cache/<hash>.json`** (`prewarm-cache.js:91`). The committed set is 23
  entries and fully known at build time, but boot asks for a key without knowing
  whether it exists. **Fix: publish the key list** — into `bundles/version.json`,
  which boot already fetches on every load, or a committed
  `bundles/cache/index.json` — and probe only on a hit.

  *(An earlier pass proposed skipping the prewarm tier under the dev server.
  Withdrawn: prewarm is orthogonal to where the compiler runs and where the cache
  lives, and it should work under the dev server too. The freshness check is
  already one shared implementation — `isUpToDate` in `compiler/src/closure.ts:89`,
  re-exported by `compile-node.ts`, used by the browser path and by the server
  worker at `toolchain-worker.mjs:53` — with only the probe differing:
  `diskProbe` on the server, an HTTP/hash probe in the browser. Disabling a tier
  to silence a console line was the wrong instinct.)*
- **`my-apps/demos.json`** (`boot-uniform.js:423–426`).

  *What it is,* since the name explains nothing: a program with a `demos/`
  directory of live-edit example sources needs its editor panels seeded. The
  curated page names them in `boot()`, but the service worker's browse-to-run
  wrapper for a bare `<name>.declare` URL cannot read the filesystem — so
  `bake-app-stubs.mjs:64–76` commits a `demos.json` listing beside the program as
  the fallback.

  **Exactly one exists in the whole tree: `apps/homepage/demos.json`.** The docs
  app is explicitly excluded (its ~50 inline editors seed on demand as the reader
  scrolls). So every other program — every app in `apps/`, and every program an
  author writes in `my-apps/` — probes for a file that by design will never be
  there.

  **Fix:** boot probes whenever `cfg.demos` is empty, which conflates "none" with
  "unknown." Have `bake-app-stubs.mjs` always emit `demos: [...]` (possibly `[]`)
  in the stub, and probe only when the key is **absent** — the one case that
  genuinely cannot know, the browse-to-run wrapper.

---

## 8 · Unknown-attribute diagnostic has no did-you-mean

**Disposition: fix — but the premise is backwards in both directions.**

The compiler **does** do did-you-mean for unknown attributes
(`check.ts:1287–1296` → `attributeMiss` → `nearestName`), and `declare-help` **does
not** answer `src`:

```
$ node tools/declare-help.mjs src
no entry for 'src' — searched reference (757 entries), classes (60), …
$ node tools/declare-help.mjs Image.src
Image has no member 'src' and nothing near it — the member table: declare-help Image
```

Both fail for one reason: `nearestName` (`diagnostics.ts:156–171`) caps the edit
budget at **1** for names shorter than 5 characters, and `src` → `source` is 3
edits. It is a scoring rule that cannot see abbreviations, not a missing feature.

**Fix, two parts, both in the shared `teach.ts` / `diagnostics.ts` path so the
compiler and `declare-help` gain the answer together — which is the property that
module exists to guarantee, and which is currently failing on both fronts at
once:**

- **An abbreviation rule.** If exactly one candidate has the miss as a
  case-insensitive prefix (minimum 2–3 chars), offer it. `src` → `source`; the
  same rule catches `img`, `pos`, `bg`, `col`. Edit distance structurally cannot
  see these; a prefix test costs nothing and yields an unambiguous answer or none.
- **A table entry.** `src` is the canonical HTML spelling, which is what
  `CSS_ATTRIBUTE_HINTS` (`teach.ts:21–71`) is for — *"evidence-driven, entries earn
  their place by appearing in eval failures."* This one just did:
  `src: "an image's file is 'source'"`.

---

## 9 · A reload resumes the session instead of starting fresh

**Disposition: fix — and note this reverses a documented decision, so the prose
changes with the code.** Added 2026-08-11, not from the eval.

### What happens now

Two mechanisms persist across a reload, both deliberate and both commented as
such in `browser/host-client.js`:

- **The waypoint.** `stepOf()` reads `history.state.declare.w` at boot and seeds
  `app.waypoint` from it *before the first settle* (`:76–78`, `:88`). Browsers
  preserve history state across a reload, so the step comes back.
- **The scroll offset.** `pagehide` stamps `scrollY` into the current entry
  (`:163–166`, the comment says "so a reload resumes"), and `:173` restores it on
  load whenever the fragment carries no `@name` reveal.

The guide states the behaviour as intended: *"A **reload or session restore**
resumes both halves, because the entry survives"* (`13-location.md:99–101`), and
the three-kind table gives `waypoint` a **yes** under "survives reload"
(`13-location.md:116–120`).

### Why it is nonetheless wrong

The same page states the contract two sentences earlier: a **pasted URL** carries
the address and *no waypoint* — *"a stranger gets the place and none of the
session, which is the whole contract."*

A reload hands the app exactly what a pasted URL hands it: the URL. Yet it
produces a different starting state. So the contract is not really "a URL carries
the place and none of the session" — it is "a URL carries the place and none of
the session, *unless it is the same browser that wrote the session*." One address,
two behaviours, decided by provenance the user cannot see.

**And fixing it makes the taxonomy simpler, not more complex.** Today "survives
reload" is its own column with its own rule. Afterwards it collapses into the
column beside it:

| the value | in the URL | Back undoes it | survives reload | shareable |
|---|---|---|---|---|
| `location` | yes | yes | **yes** | yes |
| `waypoint` | no | yes | **no** *(was yes)* | no |
| ordinary attribute | no | no | no | no |

Which is one rule instead of three: **if it is in the URL it survives everything;
if it is not, only Back and Forward retrace it.** That also extends the guide's
own existing discipline — *"if you catch yourself wanting a waypoint to survive a
paste, it was an address all along"* — by one word: *survive a paste or a reload*.

### The fix

Discriminate the arrival. `performance.getEntriesByType("navigation")[0]?.type`
distinguishes `reload` from `navigate` and `back_forward`.

- **On `reload`:** ignore the entry's stored `w` and `s`. The app starts at its
  declared initial waypoint and at the top. `syncByReplace()` (`:147–155`) already
  squares the entry to the app whenever they disagree, so the stale pair is
  overwritten by the fresh one on the first settle — drop the `s` carry-over at
  `:150` for this case.
- **Unchanged: back/forward.** `onPop` (`:174–190`) keeps restoring the pair and
  the departure scroll. That is what traversal means.
- **Unchanged: the fragment.** `location` is the URL, so a reload honours it
  exactly as a paste does — including a trailing `@name`, which reveals its anchor
  as it does on any arrival.
- **Keep the `pagehide` stamp.** It still serves leaving the site and coming Back;
  only its consumption on reload goes away.

### What it costs, and who pays

A long document reloaded loses the reader's place — which is the browser's own
default for documents, and the honest reason the current behaviour exists. An app
that genuinely wants a place to survive a reload has the sanctioned answer already:
it was an address, so put it in `location`.

**`apps/birds` is the one to check.** It is the teaching app for `location` +
`waypoint` and encodes an entire quiz session — seeds, answers, shown — in the
waypoint (`birds.declare:142–166`). Under the new rule, reloading mid-quiz starts
a fresh quiz. That is defensible and arguably wanted, but the app's own narrative
changes with it, so its header prose and the guide chapter need a pass together.

### The teaching app and the test suite both already state the contradiction

`apps/birds/birds.declare:15–17`, describing its own waypoint:

> **Reload resumes the round; a shared `#quiz` link starts a fresh one** — the URL
> carries the place and none of the session, *by construction*.

Two behaviours for one URL, in one sentence, with "by construction" attached to
the half that has it. Afterwards the sentence gets shorter and the clause finally
covers both: *a reload starts a fresh round, exactly as a shared `#quiz` link
does.*

And `test/history.test.mjs` encodes it as adjacent tests:

- `:96` — *"reload resumes the pair — the entry survives"*, asserting `wp ===
  "turn2"` after `page.reload()`
- `:105` — *"a fresh page at the same URL starts at the declared initial step"*

Same URL, opposite expectations, ten lines apart. Under the fix `:96` inverts and
the two become the same assertion — which is the whole argument, already written
down in the suite.

### Complete change inventory

**Code** — `browser/host-client.js`: the reload discrimination at `:76–78`
(waypoint seed) and `:173` (scroll restore), and the `s` carry-over at `:150`.
Nothing else.

**Prose, hand-edited**

- `docs/guide/13-location.md:99–101` — the "reload or session restore resumes both
  halves" sentence, and the "survives reload" column in the table at `:116–120`.
- `docs/declare.md:465` — *"Traversal, reload, and session restore bring the step
  back"*; reload leaves that list.
- `tools/internal/doc/prose/App.md:124` — the same sentence, same edit.
- `runtime/src/schema.ts:431–442` — the `waypoint` contract comment.
- `apps/birds/birds.declare:15–17` — the sentence above. **Prose only; the app's
  code is unaffected.** The quiz still derives from the waypoint and Back still
  retraces it action by action.

**Tests**

- `test/history.test.mjs:96` — inverts (reload starts at the declared initial
  step), and the file header at `:11` with it.
- Add the missing one: **no test covers reload restoring the scroll.** Only the
  traversal case exists (`:134`). The probe already has a 2400 px column for
  exactly this kind of assertion (`test/probe/waypoint.declare`).

**Generated — do not hand-edit, regenerate**

- `apps/docs/demos/seg_ch_13_location_1.declare` and `seg_App_waypoint_0.declare`
  are extracted from the prose by `tools/internal/doc/extract.mjs` (stale `seg_*`
  are deleted each run).
- `docs/declare-model.json` is assembled from the prose.

**Checked, no change needed** — recorded so the sweep isn't repeated

- `docs/guide/19-run-check-ship.md:49–50` — the crawl already *"walks locations
  only, at the declared initial waypoint."* Supporting evidence, not a conflict:
  the crawler already treats a cold arrival as waypoint-free.
- `skill/SKILL.md:78` — a routing-table row, no claim about reload.
- `docs/system-design/guide-outline.md` — uses "waypoint" for a table-of-contents
  concept. Unrelated sense.
- `docs/system-design/audits/prose-2026-08-07.md` — a dated audit record; it
  should keep saying what was true when it was written.

**Adjacent, worth reading while in here** — `platform-authorship.md:242`: *"`App.waypoint`
is the sibling construct and presumably wants the same treatment; it has not been
read closely."* A different open question (who may write the slot, and whether
`onFollow` guards it), but it is the same attribute and nobody has looked.

---

## Suggested order

1. **2** — cheapest, and it is the instrument every later diagnosis wants.
2. **8**, **7**, **6** — small, self-contained, no rulings.
3. **5** — small platform fix plus a doc correction.
5. **9** — small code change, but the prose and `apps/birds` move with it, so do
   it as one piece rather than landing the code alone.
6. **1** — three documentation statements, plus the two things to record. No code.
7. **3** — durable paint order (needs the `raised` vs `above:` ruling); then the
   settle event on its own merits. Check **4** against `sameSet` while here.

## Open questions for you

- **The dev server's boot-path cache.** The closure-checked cache is on `/build`
  (`create.mjs:339–349`, via `toolchain.fresh`). The boot path — `POST /compile`
  (`create.mjs:459–470` → `toolchain-worker.mjs:32`) — calls `compile()` with no
  cache lookup and no freshness check, and `boot-uniform.js:349–352` documents
  that as deliberate ("the server recompiles on every reload … always fresh").
  Is the boot path missing a cache it should have, or is only `/build` meant to
  have one?
- **Which `wants*` flags are subtree claims** and which are hit-view claims
  (item 6). Only pinch resolves an owner today; nothing states the rule.
- **3's surface:** `raised` slot, `above: View` relation, or a `raise()` whose
  effect the reconciler preserves.
- **3's other half:** what a settle event looks like to an author.
- **Whether to enforce `scrollY` read-only** and give `boot.ts`'s declared initial
  offsets their own path.

## What is still unresolved

- Murmur's 36 jumps are attributed to the animated photo frame — the mechanism is
  established and the text-only control case drifted 0 px, but the attribution has
  not been confirmed by re-measuring with the springs removed. Worth doing once,
  since item 1's whole disposition rests on it.
- The original hand-reported audio confusion (item 5).

## Rejected, and why — so they are not re-proposed

- **Runtime scroll anchoring** (generalizing `replicate.ts:1085` to every
  scroller). Solves a problem the app created by animating layout size, and adds
  runtime-driven `scrollY` writes to a system where author geometry may read
  `scrollY` and feed the extent — the homepage's measured 32-px-per-trip loop, but
  excitable without a user.
- **A held/standing scroll request** (widening "cannot take it yet" from *hidden*
  to *range not settled*). A request with no bounded lifetime: it either hangs
  indefinitely or needs an arbitrary expiry, and it leaves a view liable to jump
  long after the ask. The durable-name pattern (`Table.showRow`) gets the same
  outcome with no state to keep.
- **A `keeps` policy enum** (`offset | bottom | place`) on the scroller. Promotes
  an app policy — murmur's own `atBottom()` decision about whether to follow the
  newest message — into the language, where apps legitimately differ. And it reads
  as a member of the `ignoreScroll` / `sticks` opt-out family while meaning
  something unrelated.
