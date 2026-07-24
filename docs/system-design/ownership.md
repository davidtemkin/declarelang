# Slot ownership — one source of truth per slot

*Status: documents the ruled model implemented in `runtime/src/attributes.ts`
(the accessor layer) and consumed by bindings, layouts, states, and the
runtime's own derives. Background for implementors; the language doc carries
the author-facing consequences.*

Every reactive attribute — `width`, `fill`, `text`, a declared `count` — is a
**slot**: one stored value, one tracked cell, and at most one **standing
owner** (a constraint that keeps re-deriving it). The rules for what happens
when writes, bindings, layouts, and runtime derives meet at a slot look like a
table of cases, but they are not case law — every outcome derives from four
axioms. Learn the axioms and the table stops being facts to memorize.

## The axioms

1. **One source of truth at a time.** A slot's value has exactly one current
   provider: a stored value (literal or direct write) or one standing owner.
   Two standing owners is a *defect*, never a precedence contest.

2. **Author intent outranks runtime assistance.** The runtime supplies derives
   where the author was silent — Text auto-size, View auto-extent. These are
   marked `yielding`: they fill silence, they never argue. The moment the
   author speaks (a write, a binding), the yielding derive retires,
   permanently. An author construct never yields.

3. **A conflict whose loser would lose *silently* is refused *loudly*.** This
   is the generator of every error in the model. A direct write to a slot
   owned by an author constraint would be silently re-overwritten on the
   constraint's next run — so the write throws instead, naming the owner. Two
   author bindings on one slot would silently fight — so installation throws,
   naming both. Nothing in the model is silently reinterpreted; whatever
   cannot win honestly fails loudly with names.

4. **Every succession of ownership is explicit surface.** There is no
   pause-and-resume, no implicit handoff. Ownership changes hands only
   through named constructs: a `State` applying and retiring an override
   bundle, a layout installing and vacating an arrangement, an Animator or
   Spring declared as a slot's driver, a swap of the `layout` slot itself.
   ("Any write-then-resume idiom must be explicit surface" — the R4 ruling.)

## The derivations

| event | outcome | from |
|---|---|---|
| Direct write, slot owned by an author constraint | **Error**: *"…is bound by a constraint (label) — a direct write would be silently overwritten; change what the constraint reads instead"* | 3 (the write would lose silently) |
| Direct write, slot owned by a yielding derive | The derive is disposed permanently; the write lands; the slot is author-set from now on (writing `width` on an auto-sized Text pins it) | 2 |
| Installing an owner over a yielding derive | New owner wins; the derive is disposed (replication attaches auto-extent before bindings finish — the ordering case) | 2 |
| Installing an owner over an author owner | **Error naming both sides** (a layout claiming an axis that carries an author binding: *"…already bound (by …), but …'s SimpleLayout[y] arranges its children's y — drop one of the two"*) | 1 + 3 |
| A layout vacates a slot on **rearm** (axis flip, plan regime change) | The slot restores to its **authored base** — the literal or class default captured at first claim — instead of stranding the arrangement's last write | 4 (the vacated value has no standing source; the authored truth returns) |
| A layout is cancelled or swapped (`layout = null`, a new strategy) | Released slots keep their last arranged values as plain stored state; the incoming strategy (if any) re-places immediately | 4 (the documented release semantics; a swap's successor is the explicit next source) |
| `disown()` (States) | The override retires its own driver and restores the prior value itself — the one construct that manages its own succession | 4 |
| View teardown | Every owner disposes (`disposeBindings`) — a dead view can never wake work | 1 |

Two mechanical details complete the picture:

- **Two doors, one slot.** An author write goes through the accessor *setter*
  (which enforces axiom 3); an owner applies values through `setBound → write`
  — the raw store. That is why a layout writing a child's `x` doesn't trip the
  error it would throw at you, and why owner-applied values never mark a slot
  "author-set." There is no third door and no private storage: both doors land
  in the same slot, checked against the same owner record.
- **Writes are equality-gated** (`===`, or the slot's declared `equal`). A
  constraint re-producing the same value stops the cascade cold — no push, no
  dependent wake. Every claim in the layout kernel's cost model rests on this.

## Why this shape

The alternatives are the systems this model was built against. CSS resolves
competing sources by *precedence* (specificity, cascade order, `!important`) —
everything applies, something wins, and reading the winner requires simulating
the fight. AutoLayout resolves them by *solver* (priorities, ambiguity
warnings). Declare's answer is that competition itself is the bug: one slot,
one owner, loud refusal where a loser would be silent, named constructs for
succession. "Who sets this value, and what happens if I write it?" always has
one answer, computable by reading the source — which is the property the whole
language is a wager on.
