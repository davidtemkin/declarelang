# Platform authorship — the writer the ownership model never named

*Written 2026-08-09 out of a measured bug in the weather app. Extends
[ownership.md](ownership.md), whose four axioms this note does not question —
the claim here is that they govern only half the writers. Audited independently
the same day; that audit's findings and its corrections to this note are folded
in below, and the audit file itself is gone — this note is the record.*

## RULED 2026-08-09 (David)

**A platform-owned slot is a first-class thing, and writing one is a
compile-time error.** The platform becomes a named party in
[ownership.md](ownership.md)'s model — a third door, installed at realization
as a standing owner record (a `scrolls = y` claims `scrollY`; a mounted
transport claims `playing`; an edit session claims the draft; the host claims
`location`), which is axiom 4's explicit surface and one new row in the
succession table.

Two consequences follow, and both are the point:

- **Axiom 3 fires in the right direction.** An author binding on a
  platform-owned slot fails *at install*, naming the platform — instead of
  compiling clean and having the user's finger throw once per scroll frame.
- **`readOnly` becomes derived, not maintained.** A slot with a permanent
  platform owner is read-only as a consequence. The hand-kept lists have
  already drifted (`focused`, `settled`, `env`, `childName` missing;
  `App.scrollY` missing behind a dead pusher), and that drift class disappears
  structurally rather than by vigilance.

**Naming: no renames.** The existing spellings are irregular but each makes
sense in its context — `scrollIntoView` on the target (the scroller is not
knowable at the call site), the `Dataset` verbs, `Focus.focus`. Regularity is
bought at the *model* level by the ruling above, not by churning names that
already read correctly where they appear. Section 4's inventory stands as a
description, not a work item.

## The problem

`ownership.md` settles who may write a slot, and its answer is the language's
whole wager:

> Competition itself is the bug: one slot, one owner, loud refusal where a
> loser would be silent, named constructs for succession. "Who sets this
> value, and what happens if I write it?" always has one answer, computable by
> reading the source.

Every party in that model is **inside the program**: author constraints,
layouts, states, animators, and the runtime's own yielding derives. Each is
named, each succeeds another through explicit surface, and axiom 3 guarantees
that a writer who would lose silently is refused loudly instead.

There is a fifth writer, and the model does not name it: **the platform**. A
finger scrolls a pane; a keystroke changes a field; the Back button changes the
location; a backgrounded tab pauses a clip. Those writes arrive through the
runtime's raw store — the same door an owner uses to apply values — but the
platform is not an owner, declares nothing, and succeeds nobody. It simply
writes, into slots the program may also write.

So for exactly these slots, the wager fails. "Who sets this value?" has two
answers, and neither party can tell which one it is reading.

**Axiom 3 is what actually broke.** Measured 2026-08-09, iPhone 16 Pro / iOS
18.2, the weather app's city page:

| step | model (`page.scrollY`) | surface `scrollTop` |
|---|---|---|
| scrolled deep | 1553 | 1553 |
| pane hidden | 1553 | 0 |
| program writes `scrollY = 0`, pane shown | **0** | **1553** |

The program's write lost, silently, to a party the model never named — the
precise outcome axiom 3 exists to make impossible. A `display: none` scroller
reports `0` while privately keeping its offset and refusing writes, so the
mirror-echo guard compared the new value against a lie and skipped the write;
WebKit then restored the stale offset on show. Chrome fails the mirror image:
hiding a scroller zeroes it and *announces that as a scroll*, writing a number
the user never scrolled to into the model.

Both halves are now patched in `dom-backend.ts` (the mirror ignores an
unrendered box; the model's offset is remembered and re-asserted on show), with
pins in `gesture.test.mjs` and the iOS regression. **The patch is not the
point.** The point is that nothing in the language said which of those two
values was true, so there was no rule to appeal to — and three separate apps
each invented a private workaround for it.

## Where it manifests

Everything below is evidence, not inference — file and line, or a measured
run.

### Confirmed: the platform writes a slot the program also writes

| site | evidence | note |
|---|---|---|
| `View.scrollY` / `scrollX` | `view.ts:647-648`, `view.ts:917-918` | The **entire** reverse channel in the View layer is these two callbacks — a completeness result, not a sample. This is the bug above. |
| `TextInput.text` (uncontrolled) | `text-input.ts:165` — `if (this.text !== v) this.text = v` | The *controlled* path (`text = { model }` + `onInput`) is already correct and event-based. `text-input.ts:151` records the bug they hit getting there: a controlled field that swallowed keystrokes and fired nothing — "a DEAD field." |
| `App.location` | its own reference entry: the host "writes it back on back/forward" | Two-way **by design**. See the reformulation below. |
| `Media.playing` | its own reference entry: "**Two-way**: a constraint decides when it plays, and the element writes back" | Two-way by design; unexamined for the failure modes scroll had. |
| `Control.focused` | `schema.ts:636` + its comment | Documented "**read-only in practice**: writing it does not move platform focus, `Focus.focus(v)` does" — and **not** in any `readOnly` list, so writing it compiles and silently does nothing. The design is already right; only the enforcement is missing. |
| `App.pointerX/Y`, `pointerDown`, `hovering`, `pointerOverText` | written in `boot.ts`; absent from `schema.ts` `readOnly` | Unprotected facts. Harmless in practice, identical in shape. |

### The workarounds it has already caused

Three apps, three private inventions for the same missing rule:

- `apps/weather/weather.declare` — a per-frame `Heartbeat` re-asserting
  `page.scrollY = 0`, gated on a magic spring window (`0.45 < open < 0.9`).
  Deleted 2026-08-09; it could never have worked, since it tested the slot that
  was lying. (Measured on device afterward: the poll read the *same reactive
  slot* a constraint reads, so it never held fresher information — the two
  scalars it maintained are now ordinary constraints.)
- `apps/tracker/tracker.declare:709-710` — `this.list.scrollY = 0` written
  **twice**, the second inside `setTimeout(…, 0)`, with a comment explaining
  the first does not stick.
- `apps/lzx-dashboard/applets.declare:25` — `transcript.scrollY = 100000`,
  "scroll to the bottom" spelled as a magic number leaning on the platform's
  clamp.

### What the corpus actually wants

Every assignment to `scrollY`/`scrollX` in the entire corpus — **ten** lines
(this first read `apps/` only and said eight; `library/table.declare:280-281`
is a third hand-rolled reveal-row):

| intent | lines |
|---|---|
| *go to the top* | 5–6 |
| *go to the bottom* (via the magic number) | 1 |
| *reveal this row* (hand-rolled; `scrollIntoView` exists) | 3 |

Not one wants a value it owns. Every one is a **verb**.

## The proposed rule

> **A platform fact is read-only. To change it you ask (a verb), delegate (a
> declared driver), or own your own slot and let an event feed it.**

This is not a new mechanism. It is three mechanisms the language already ships,
applied to the region the ownership model skipped:

1. **Fact.** The platform is the only writer; the program reads. Enforced by
   `schema.readOnly` — a compile error. Already the shape of `hostWidth`,
   `safeBottom`, `dark`, `underlapBottom`, `View.contentWidth`, `hovered`,
   `pressed`, `Image.naturalWidth`, `Media.duration`, `DataSource.status`.
2. **Verb.** An imperative request against a fact. Already the shape of
   `Dataset`'s structural verbs, `scrollIntoView`, `Focus.focus(v)`. A request
   is honest where an assignment is not: the platform may clamp it, and may
   have to hold it until the surface can take it.
3. **Driver.** A named construct owns the slot and reconciles it with something
   else — `ownership.md` axiom 4's "explicit surface," already the shape of
   `Spring`/`Animator` and of `<->` (below).
4. **Controlled.** The program owns its own slot, the widget is constrained to
   it, and the platform's news arrives as an **event**. Already the shape of a
   bound `TextInput`.

**The corollary that makes the strict rule affordable: a driver's target is
always a separate attribute from the fact.** `Spring` has `to`, not `openT`.
That is what preserves the declarative form for cases where a verb would be
clumsy — `Media.playing`'s recommended `playing = { visible && !reducedMotion }`
becomes a bound *target* while `playing` stays a read-only fact, and
"pane B follows pane A" becomes a target rather than requiring an `onScroll`
event that does not exist.

### `<->` is part of the picture — and is aspirational, not actual

*This section originally claimed `<->` already satisfies one-writer-per-slot.
The audit showed that is **mechanically false today**, and the correction is
instructive.*

The intent is right: the record is the truth, `text` is a **draft**, keystrokes
go to the session, `commitOn` decides when the draft becomes the record, and
the program reads `dirty`/`valid`/`error`. Read that way, `<->` is structurally
a `Spring` — a declared construct that reconciles a slot with something else so
nobody shares it.

But `editor.ts:59-63` says outright: *"The reseed does **NOT own** the slot —
the user's edits write it freely."* The reseed enters through the owner door,
the keystroke through the author door, and the discipline holding them apart is
**choreography, not ownership** — the reseed re-fires only when the committed
value changes, precisely to dodge the "controlled reverts" trap. One edge
escapes it: an upstream commit mid-edit clobbers the draft, silently.

Under the ruling, the edit session holds the draft's owner record and the
choreography becomes the owner's internal business — which makes this section's
original claim *true* instead of aspirational. No author-facing change to `<->`
is proposed; it is the shape everything else should reach.

### Reformulating `location` rather than excusing it

`App.location` is today two-way by design, and the first draft of this note
argued to keep it as a named exception. **That was wrong**, and the reason
matters more than the case: an exception costs more than the convenience it
buys, because the property being protected is that a reader who has never seen
the language can predict the answer. "It landed that way" is not a design.

Under the rule, nothing is lost:

| what it must do | under one-writer |
|---|---|
| seed from the URL before first settle | the fact's initial value — unchanged |
| let constraints derive from it | reading is untouched |
| navigate | a verb |
| back/forward | the platform changes the fact; constraints re-derive — *identical* to a finger changing `scrollY` |
| one history entry per changed settle | the verb's business |
| the declared initial is the default location | its own authored slot |

And back/forward stops needing a sentence in the docs, because it stops being
special. The shape it lands in is one the language already ships:

| | author writes | read-only fact | verbs |
|---|---|---|---|
| `Dataset` | `contents` | `value` | `set`, `insert`, `removeAt`, `move` |
| location | a default slot | `location` | **`follow(ref)` — it exists** |
| a scroller | — | `scrollY` | *scrollTo*, `scrollIntoView` |

**The location verb must not be minted.** `App.follow(ref)` already is it —
`view.ts:1307` calls it "the ONE operation behind every arrival: a linked
view's activation, a rich-text href, a cold URL, back/forward," and
`onFollow(ref) → ref'` (`schema.ts:465`) is its app-scoped hook: transform, or
`""` to veto. (A first draft of this note proposed `navigate(to)`; that name is
taken — `view.ts:1274` is the app→host *external-URL* verb — and minting a
second one is the near-miss `designing-a-language-for-llms.md` warns about.)

That pair exposes the sharper argument for the ruling. `follow()` applies
`onFollow` and *then* "a `#…` writes `location`" — so **assigning `location`
directly is a second door into navigation that skips the app's own arrival
hook.** A link click is vetted; an assignment is not. Making `location`
platform-owned deletes the bypass, leaving one operation with one hook, which
is what the runtime already claims to have.

The bypass is already known, and `location.md` contradicts itself about it:
§0.6 promises `onFollow` "runs for **every** follow — linked views, prose
links, cold URLs, back/forward," while §0.7 concedes it is "**bypassable by a
raw write**" and ranks it below destination derivation partly for that reason.
The ruling resolves the two in favor of §0.6, and §0.7's clause must be struck
when it lands. Note the limit: this closes one of `onFollow`'s two documented
weaknesses. The other — blind at t=0, since cold arrivals run the hook before
data loads — is independent of who may write the slot, so destination
derivation stays the airtight gating tool exactly as §0.7 says. The ruling
makes `onFollow` a reliable *arrival hook*, not a security boundary.

`App.waypoint` is the sibling construct and presumably wants the same
treatment; it has not been read closely.

## Current naming — the inventory to rationalize

The verbs that exist, or would need to, do not rhyme:

| fact | verb today | shape |
|---|---|---|
| `Dataset.value` | `set`, `insert`, `removeAt`, `move` | bare verbs on the object |
| focus | `Focus.focus(v)` | a service, verb = the noun |
| a view's position in its scroller | `view.scrollIntoView()` | verb on the *target*, not the scroller |
| a scroller's offset | *(none — assignment today)* | proposed `scrollTo(y)` |
| location | *(none — assignment today)* | proposed `navigate(to)` |
| playback | *(none — assignment today)* | proposed `play()`/`pause()`, or a target |

Six facts, five naming conventions. Regularity is the entire point of the
exercise, so this inventory is as much the deliverable as the rule is.

## Why regularity is the criterion, not taste

From `designing-a-language-for-llms.md`'s premise and `ownership.md`'s closing
paragraph: the language is a wager that "who sets this value, and what happens
if I write it?" is answerable *by reading the source*. A model that has never
seen Declare — and a person on their first day — both pay for every exception
at full price, because an exception is exactly the thing that cannot be derived
from the rest of the system. One irregular construct does not cost one
lookup; it costs confidence in the whole rule, which means every future case
gets checked rather than inferred.

That is why `location` should be reformulated rather than excused, and why the
naming pass above matters more than it looks: three verbs that do the same kind
of thing under three different spellings *is* an exception, just a diffuse one.

## Not examined

Named so the audit knows where to start, in rough order of suspicion:

1. **`<->` two-way sessions** — a three-party arrangement (dataset ↔ draft ↔
   program). Argued above to be fine; not verified against the axioms.
2. **States and animators taking a slot over** — a sanctioned succession
   (axiom 4). Does it have the "cannot take it right now" hazard scroll had?
3. **`DataGrid` interaction state** — column order, widths, sort after a user
   drag. Who owns `order` when the user reorders?
4. **Selection** — anchor/extent, and the subtractive realization.
5. **`Media`** beyond `playing`.
6. **Focus** beyond `focused` — scopes, traps, `tabOrder`.
7. **Measurement-driven slots** — text metrics, image natural size, rich-text
   flowed height. These look like clean facts; confirm they are.

## Held true by (today)

`test/gesture.test.mjs` — "a hidden pane's scroll offset is the MODEL's,
re-asserted when it can take it"; `tools/internal/sim/regress.mjs` (26/26,
2026-08-09); `test/safearea.test.mjs` for `underlapBottom`, the read-only fact
added the same day.
