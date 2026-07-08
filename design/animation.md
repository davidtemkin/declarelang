# neo-LZX Animation — the ruled design (2026-07-02)

*This document supersedes the 13-question motion design proposal (also dated 2026-07-02, written earlier the same day). It is not a proposal — it is the record of the human's ruling, delivered in a live walk-through, on every question that proposal raised. Where the proposal recommended new grammar (a `transition` member, a `Spring`/`Motion` class family, reactive retargeting), the ruling took the simpler path: **v1 is LZX's animation vocabulary, unmodified, applied imperatively** — zero new keywords, zero new member forms. Two genuinely new capabilities (a destination-less "follow" form, and animation woven into `state`) were examined in depth and PARKED, each for a stated reason, not rejected. See [`neolang/HANDOFF.md`](../neolang/HANDOFF.md) for the dated entry pointing here.*

---

## 0. The three attachment points (kept as the design map)

Motion can attach to a slot at three different points, and the ruling resolves all three:

1. **The imperative act** — an explicit `start()` call drives a slot through a curve. This is LZX's own shape (`<animator>`/`<animatorgroup>`, `.doStart()`). **Ruled: this is v1, landed below (§1–§3).**
2. **The change/mode** — "here's a new mode, animate every difference it implies, coming and going" (SwiftUI's state-driven transitions). **Ruled: parked, with an explicit cut criterion (§5b).**
3. **The slot standing** — "this slot always arrives smoothly, no matter what drives it" (a CSS `transition` rule; a destination-less spring that just smooths whatever shows up). **Ruled: parked (§5a).**

These are not three competing designs for the same feature — they are three different places motion can live, and neo-LZX now has a definite answer at each: landed, parked, parked. The two parked forms share machinery (§5a explicitly reduces to a special case of §5b's requirements), so closing one materially de-risks the other.

---

## 1. Surface — v1, LZX's vocabulary, exactly

**`Animator` and `AnimatorGroup` are ordinary component classes** — twin-table entries exactly like `SimpleLayout` or `Dataset` (schema + runtime class, registered the way every built-in component is; see `neolang/HANDOFF.md`'s twin-table description), **not keywords and not new grammar**. They are written as ordinary child-instance members — the same member shape a `Dataset` or a named `View` child already uses. No new member form, no new declaration syntax, nothing for the parser to learn.

```
class WeatherTab extends View [
    …
    slide: Animator [ attribute = height, to = 255, duration = 300 ],       // named, imperative — reachable as slide.start()
    Animator [ attribute = x, to = 100, duration = 1000, started = true ], // anonymous — opts INTO auto-start (started defaults false)
    ]
```

### Carried surface, unqualified

| Member | Meaning |
|---|---|
| `attribute` | The target's slot name — a bare token, **schema-checked against the target's numeric slots** (the same machinery that already checks `axis = y`). Not a string: a typo dies at compile time. |
| `target` | Defaults to the parent node (LZX). Any node with a numeric attribute is a legal target, including a layout strategy instance. |
| `from` | Optional; defaults to the current value at start (LZX). |
| `to` | The destination. **Sampled once, at start** — v1 has no live retarget. Writing `to` while running has no effect until the animator is stopped and restarted. |
| `relative` | `to` is a delta from `from`, not an absolute (LZX). |
| `duration` | Milliseconds (LZX; a plain number, no unit suffix). |
| `motion` | An easing **curve** — a named token or a value constructor, both already in the grammar (see "The motion vocabulary" below). Default `easeBoth` (quadratic in-out, LZX-compatible). |
| `repeat` | Default 1; `Infinity` legal (LZX). |
| `started` | A reactive boolean. **Default `false` — auto-start is opt-in** (`started = true`). This is the one deliberate divergence from LZX's `start="true"` surface (reversed 2026-07-04; §6 Q3): auto-start is the rare case — almost every real animation is *triggered* — and the `true` default's failure mode is **silent**, a start/reverse animator *pair* on one slot both auto-firing at init and cancelling to net-zero motion, invisible to the settled-state acceptance (verified minimally in `neolang/scratchpad/autostart-repro.mjs`). |
| `paused` | Freeze in place; resume continues (LZX). |
| `start()` / `stop()` | The imperative pair. `stop()` halts **in place** at the current value (LZX) — no snap to either end. `start()` on a running animator is a no-op (LZX's `doStart` guard). |
| `onStart` / `onStop` / `onRepeat` | Carried events, camelCased per the language doc's naming rule. `onStop` fires on both `stop()` and natural completion (LZX; no `finished`-vs-stopped split). |

`AnimatorGroup` carries `process = sequential | simultaneous` (default sequential, LZX), plus the same `started`/`paused`/`start()`/`stop()`/`repeat` as the group-level unit — children's own `started` is not the driver; the group is. The LZX default-cascade (an unset child attribute inherits the enclosing group's) is internal LZX behavior, carried as-is, not a new proposal.

### The motion vocabulary

`motion` is a `Motion` value, written in one of two forms **already in the
grammar** — a bare named token (like `axis = y`) or a value constructor (like
`shadow(…)`). There are no new parser rules: the additions are enum tokens and
registered constructors (`animate.ts` / `value.ts`), so the surface stays
exactly what the parser already reads.

- **Named families** — `<family><In | Out | Both>` over the Penner set, by
  sharpness: `sine`, `quad`, `cubic`, `quart`, `quint`, `expo`, `circ` (e.g.
  `quartOut`, `expoBoth`); plus `linear` and `back{In,Out,Both}` (anticipation /
  overshoot). Aliases: `easeIn`/`easeOut`/`easeBoth` = the quad family
  (LZX-compatible), `ease` = the CSS default bézier.
- **Constructors** — `cubicBezier(x1, y1, x2, y2)` (CSS control points — the
  parametric escape hatch; every named smooth curve is expressible as one),
  `back(overshoot)`, `steps(n[, jumpStart | jumpEnd])`, and
  `laszlo(beginPole, endPole)`.

**`laszlo` — OpenLaszlo's exact curve.** The original's easing is a Möbius
function of an exponential over two "pole" offsets (`LaszloAnimation.lzs`); those
offsets *are* the constructor arguments, so `laszlo(0.25, 0.25)` = OL's
`easeboth`, `laszloIn` = `laszlo(0.25, 15)`, `laszloOut` = `laszlo(100, 0.25)`.
It is the one **scale-dependent** curve — its shape depends on the travel
distance (the pole offsets are absolute) — so it is the only motion the
evaluator hands the travel `delta`; every other curve is a pure `t → fraction`.
Reach for it to reproduce the original's motion exactly; reach for `quartBoth` /
`cubicBezier` when you want a predictable, scale-invariant curve instead.

Every curve is clamped to land exactly on its endpoints (`sample(m, 1) = 1`), and
the exact-landing ledger (§4.3) snaps the final value regardless — so an
overshooting `back` or a float-drifting bézier / laszlo still lands precisely.

### Explicitly not in v1

No new keywords, no new grammar or member forms. No `Motion` abstract base class. No `Spring` (a peer easing/physics class was proposed; dropped for v1 — additive surface later, if a real consumer needs velocity-continuous retargeting). No scrubbing (`fraction`), no `reversed`, no reactive `to` retargeting. These were all surface the superseded proposal invented; the ruling's whole point is that v1 needs none of it — see §6 for the full deletion ledger.

### Worked example — the neoweather tab slide, as shipped

This is neoweather's divergence #2 ("no motion — every end-state lands in one frame"), closed the way a v1 author actually writes it: an explicit `Animator` child, driven imperatively, exactly LZX's own idiom. The shipped form pairs it with the `TabSlider`-owns-selection model (composition.md; instantiation.md §6) — the container decides *which* tab is selected, each tab owns *how* it animates when (de)selected, so the container never learns a tab animates:

```
class TabSlider extends View [ width = 100%,
    layout: SimpleLayout [ axis = y ],
    select(tab) {
        for (const t of this.children) t.setSel(t === tab)
        },
    ]

class WeatherTab extends View [ width = 100%,

    label:      string  = "default title",
    sel:        boolean = false,
    openHeight: number  = 255,

    height = { sel ? openHeight : 25 },
    slide: Animator [ attribute = height, duration = 300, motion = easeBoth ],

    setSel(v) {
        slide.to = v ? openHeight : 25
        slide.start()       // displaces the height constraint for the run
        sel      = v         // constraint suspended ⇒ no jump; resumes re-evaluated
        },                   //   on completion, landing on the same value

    top: View [ … onClick() { classroot.parent.select(classroot) } … ],
    ]
```

The click delegates up (`classroot.parent.select`) — one place owns "exactly one selected." `select(tab)` calls each tab's `setSel`; `setSel` starts the slide *before* flipping `sel`, so `slide.start()` displaces the `height` constraint (§2, rule 2) and animates from the tab's current height, the suspended constraint does not re-fire when `sel` changes, and it resumes **re-evaluated** on completion (§2, rule 4) — landing on exactly the value it would have produced (255 / 25). Keeping `height` a **constraint** rather than a literal is what makes the initially-selected tab open correctly at construct time with no imperative kick: the slide runs only on a click; at init the constraint alone supplies the rest state.

This shipped and was verified end-to-end — a live-DOM probe caught the eased interpolation (`25→31→48→85→128→186→220→246→255` under `easeBoth`, both tabs moving at once, exact landing on 255/25) — holding neoweather's acceptance at 18/18.

*A simpler spelling, also legal in v1:* drop the constraint, make `height = 25` an ordinary literal slot, and drive selection from the tab itself — `select() { for (const t of parent.children) { t.sel = …; t.slide.to = …; t.slide.start() } }`. Then `height` is written every frame by whichever animator runs on it, nothing standing behind it, and the initially-selected tab needs an explicit opening kick. Both spellings use only LZX's vocabulary applied imperatively; the difference is only whether a constraint supplies the rest state (shipped) or a literal does.

---

## 2. Semantics — the five-rule deconfliction model

The ruling's own words on this: *"a runtime deconfliction model is welcome but not at the expense of complexity"* and *"silent-clobber is an edge case not worth complicating semantics."* This is deliberately **runtime behavior, not new language semantics** — no ownership diagnostics, no case table, no pointed errors naming competing owners. Five rules cover it completely:

1. **Temporary driver.** While a `started` animator is running, it drives its target slot every clock tick — an ordinary model write (`setBound`), same as any constraint or layout write.
2. **Displacement.** Whatever was driving the slot before the animator started — a constraint, a derive (auto-extent, auto-size), a layout's laid axis — is displaced for the duration of the run. It does not error, does not queue, does not fight.
3. **One-deep memo.** The displaced driver is remembered — not stacked, not layered; there is exactly one thing to resume, because there was exactly one owner before the animator arrived.
4. **Resume-and-reevaluate.** On `stop()` or natural completion, the previous driver resumes and is **re-evaluated at that moment** — not simply reinstated with its old, possibly stale, output. A displaced constraint re-runs against current state; a displaced layout re-lays-out.
5. **No diagnostics.** Two animators landing on the same slot, or an animator running against a slot someone else also writes directly, is an accepted edge case — the last write each tick simply wins, silently. This is not the R4 ownership-error rule reopened; it is a deliberate scope boundary: animators are **runtime writers in the derive family** (like auto-extent, auto-size), not language-level owners, so R4's error-on-direct-AUTHOR-write rule is untouched and still fires exactly as before for `{ }`/percent bindings and layout-laid axes. Animators simply don't participate in that diagnostic.

**The clock.** One shared `requestAnimationFrame` driver exists only while at least one animator is running — the idle-zero invariant is preserved exactly as it is for the reactive core and for layout. Each tick writes the model through the ordinary settle: constraints, layout chains, auto-extent, draw bodies downstream of an animated slot all see every intermediate frame value, exactly as the earlier model-space ruling requires (HANDOFF, 2026-07-01: presentation-layer tweening was rejected; this is that ruling, still in force, now specified as the write-then-settle sequence).

LZX's additive channel (§4) is how rule 2/3/4 behave when *two animators* land on one slot rather than an animator and a non-animator driver: they compose by addition instead of one displacing the other, because that composition is the one LZX already solved and it is strictly simpler to keep than to special-case away.

---

## 3. Magic ledger

Two tiers, both intentionally thin — the same "no-magic, but a small kernel-tier surface is fine" posture the layout system already established.

| Tier | Mechanism |
|---|---|
| **Compiler** | Exactly one check: the `attribute` token is validated against the target component's schema (numeric slots only, v1). This is the only new compile-time special case — the same shape as the existing `axis = y` enum check, nothing more. |
| **Runtime** | Two kernel-tier services, both invisible to the author and both pay-per-use: **the shared clock** (§2 — exists only while ≥1 animator runs, idle-zero preserved) and **supersede/restore** (§2 rules 2–4 — displacing a slot's prior driver and resuming it, re-evaluated, on completion). Neither is author-facing surface; both live at the same tier as layout's install/geometry machinery and the ownership-release mechanism it already uses. |

Nothing else is magic: no ownership case table, no per-animator error messages, no special-cased slot kinds beyond "numeric."

---

## 4. Carried LZX internals

Read for intent from `../runtime/lfc-src/animators/` (`LaszloAnimation.lzs` = `LzAnimator`, `LzAnimatorGroup.lzs`), and kept as the actual implementation mechanism, not merely as inspiration:

1. **One shared clock.** Every running animator registers with the same driver (LZX: `lz.Idle`) and every animator in a tick is handed **the same time value** ("to ensure that all animators are synched", `LzAnimatorGroup.lzs:475–478`). Time-based, not frame-counted — a dropped frame doesn't slow motion down.
2. **The additive core.** Every frame writes a **delta**, not an absolute: `target.setAttribute(attr, targ[attr] + (value − currentValue))` (`LaszloAnimation.lzs:444–448`). Two animators on one slot therefore *compose* — they don't fight, and this is the mechanism behind §2's rule 5 for the animator-vs-animator case specifically (as opposed to animator-vs-everything-else, which is rules 2–4's displace/resume).
3. **The expected-value ledger — exact landing.** Per target, `__animatedAttributes` holds each animated slot's *expected end value* plus a running-animator counter (`prepareStart`, `LaszloAnimation.lzs:210–259`). A later absolute `to` computes its delta against the **expected** value, not the instantaneous one, so it lands where its author said, accounting for everything already in flight; when the counter hits zero the exact expected value is assigned outright — no float drift (`__LZfinalizeAnim`, `LaszloAnimation.lzs:347–365`). LZX had additive multi-animator composition **with exact landing** in 2005; this is carried whole, not reinvented.

What LZX did **not** have, and what v1 does not need to invent to close the gap: an ownership/deconfliction model for animator-vs-non-animator drivers (a bare `setAttribute` or a constraint would simply fight an animator in stock LZX) — §2's five rules are the new ground, and they are runtime behavior sitting on top of these three carried mechanisms, not a replacement for them.

---

## 5. Parked

Both items below were designed in real depth during the walk-through and deliberately **not** cut for lack of consideration — each is parked for a stated, specific reason, and each has a path back in.

### 5a. The "follow" / CSS-transition form — parked

A destination-less animator that just smooths whatever a slot's owner writes to it — the CSS-`transition` shape, attachment point 3 in §0 — is **parked**, for two reasons, both from the human directly:

- **It needs a genuinely new runtime capability, not just new surface.** The human's own framing: *"Animator can't be just another node under this model"* — because this form requires one node to intercept *another slot's write boundary* (the owner's every write, not just an explicit `start()` call), which is a different relationship to the reactive graph than anything an ordinary child Node does today. It is not a small extension of §1–§3; it is a new kind of thing.
- **The naming was unresolved.** "Follow isn't the right word" — the walk-through didn't converge on a name for the construct, which is itself a signal the shape wasn't settled enough to rule.

It is **parked, not rejected** — and its machinery is shared with animated states (§5b): both need the same "intercept an arrival at a slot's write boundary" capability. If the states cut criterion below resolves cleanly, this form becomes close to a trivial special case of that machinery (a state with exactly one always-active mode, degenerate to "smooth every arrival").

### 5b. Animated states — parked, with an explicit cut criterion

The requirement, in the human's own words: *"here's the new state, animate to it upon apply, and animate back upon remove."* The load-bearing detail is that **the entire operation reads as continuous, not a pop** — not just the numeric attribute overrides `state … when { }` already supports (§10 of the language doc), but state-added and state-removed **children**, and **discrete** (non-numeric) slots, all animating as one continuous motion in and out.

**The cut criterion, verbatim:** *"This either makes the cut or doesn't based on getting to a clean resolution for children and non-numeric attributes."* Everything below is the design analysis for the future states-rung pass, recorded now so that pass starts from a resolved position rather than a blank page:

- **(a) Destinations must be computed at application time, and may be live.** A state's overrides can themselves be `{ }` bindings that keep re-evaluating while the state is active and, worse, *while it is mid-animation-into*. There is no cheap version of this: the mediation layer standing between "a state applies" and "a slot lands its overridden value" must route every override output through the animation as a **retarget** (§2's displaced-driver machinery, but continuously re-triggered as the override's own value moves) — not a one-shot tween to a value captured once at apply time.
- **(b) The model-space propagation dividend.** This is the reason to want it at all, not just a cost to pay: animating *only* the state's directly-overridden numeric slots is enough to make every downstream constraint, layout, auto-extent, and draw body follow continuously, for free — because that is simply the reactive graph's ordinary behavior (§2's rule 1: an animated write is an ordinary model write; everything reading it already reacts to every intermediate value). A presentation-layer system (CSS, Core Animation's presentation layer) cannot do this — it has no downstream model to propagate through. This dividend is the entire argument for landing animated states at all.
- **(c) Discrete slots don't tween.** A boolean, an enum, a component-typed slot has no continuous path between two values. The policy: **snap at completion by default**, plus the existing **derive-the-discrete idiom** as the escape hatch — the `Screen` class's `visible = { opacity > 0 }` pattern (§9b of the superseded proposal; still the right shape) turns a discrete slot into a *derived fact* of a numeric one that *does* animate, so the discrete slot changes at the exact right instant with no special-casing.
- **(d) The genuinely unsolved piece: structural enter/exit.** State-removed children must **linger** while animating out — a view slated for removal needs to keep existing, keep being hit-testable (or not — that's a design choice) and keep occupying layout space (or not), for the duration of its exit animation, before it is actually torn down. This is deferred teardown: a "leaving" limbo state with real hit-test and layout implications, precedented by SwiftUI's `transition`/`.animation` removal semantics and React's AnimatePresence. **This is the piece the cut criterion hinges on** — a clean answer here is what "makes the cut."
- **The hard guarantee, non-negotiable regardless of how (d) resolves:** states remain a fully general-purpose mechanism; motion on a state is **strictly additive, opt-in** surface; a state with no motion attached behaves **byte-for-byte identical** to plain §10 states today. If animated states ever compromises a plain state's behavior, the design has failed by definition — this is not a tradeoff to weigh, it is a precondition on any future proposal in this space.

---

## 6. What was deleted from the prior proposal

The superseded proposal (same filename, earlier draft, 2026-07-02) invented new grammar and a case-table ownership model to answer questions the ruling resolved more simply. For traceability, its consolidated question list (Q1–Q13) disposed of as follows:

| From the superseded proposal | Disposition |
|---|---|
| Q1 — non-visual child Nodes | **Ratified**, reframed: Animator/AnimatorGroup are twin-table component classes (§1), not a special "data-node" category. |
| Q2 — `attribute` bare token, schema-checked | **Ratified as-is** (§1, §3). |
| Q3 — `started` defaults to `false` | **Re-adopted (2026-07-04), after a round-trip.** The ruling first dropped it (restoring LZX's `true` unqualified); building neoweather then surfaced the footgun the earlier draft had intuited — two reversible pairs (zip `slideOut`/`slideIn`, topBar `comein`/`goout`) *both* auto-fired at init and **silently cancelled to net-zero** (the acceptance stayed green throughout; only value-probes caught it). So `false`/opt-in is restored as the one deliberate LZX divergence (§1 `started` row). The intuition was right; it took a concrete silent failure to earn the qualification. |
| Q4 — new `transition <attr>: Motion [ … ]` member | **Deleted.** No new member grammar in v1; the destination-less form it was meant to cover is parked as "follow" (§5a). |
| Q5 — ownership model (transitions-not-owners, free-animators-as-temporary-owners, pointed errors) | **Superseded** by the five-rule deconfliction model (§2) — no errors, no case table, displace-and-resume instead. |
| Q6 — `fraction` scrub, `reversed`, reactive `to` retargeting | **Dropped.** `to` is sampled once at start (§1); no scrubbing or reversal in v1. |
| Q7 — `Spring` / abstract `Motion` base | **Dropped for v1**, explicitly deferrable — additive surface later if a consumer needs velocity-continuous retargeting (§1). |
| Q8 — perceptual-curve easing implementation (not LZX's pole math) | Not addressed by this ruling pass; stands as prior implementation guidance, not re-litigated here. |
| Q9 — the interruption/retargeting case table | **Deleted wholesale** — moot once `to` is sampled once and there is no live retarget; superseded by §2's five rules for every other case. |
| Q10 — `AnimatorGroup` default cascade | **Carried as LZX-internal behavior** (§1, §4) — not a new proposal element, just what the class already does. |
| Q11 — keyframe/phase forms deferred | **Still deferred**, unchanged. |
| Q12 — states composition via per-slot transitions | **Folded into** the parked animated-states item (§5b) — there is no `transition` member for states to compose through anymore. |
| Q13 — bless an implementation rung | Superseded by this ruling: §1–§4 are landed design, ready to implement directly; §5a/§5b stay parked pending their stated criteria. |

Also deleted outright: the `Motion` abstract base class, the peer `Spring` class, and the full interruption case table (§7 of the superseded draft) — all surface invented to solve problems the five-rule model doesn't have.
