# The optimization arc — what was built, what it bought, and what it did not

**Status: LANDED, merged into main 2026-09-19/20; measured 2026-09-20.** The design of the
centrepiece is [kernel.md](kernel.md); this note is the *result*. It records what the whole arc
is worth, on what evidence, and — at least as usefully — which ideas were measured and found
not to pay.

Every number below comes from one round on 2026-09-20 comparing two working copies:

- **before** — the released tree, v0.4.5, which has none of this work;
- **after** — main with the arc merged.

Both were instrumented by hand at the same semantic points, driven through the same corpus of
13 interactions, and held to a fairness check before any pair was reported. The method matters
enough that it has its own section at the end; the short version is that **a flag-based A/B
could not have produced these numbers**, and the first attempt at one said the opposite of the
truth.

---

## 1. What the arc is

Five pieces of work, in descending order of what they turned out to be worth.

**The kernel** (the centrepiece). The reactive core — the graph, the queues, the settle, the
two phases, the equality gate, the cycle guard, the close — moved out of JavaScript into one
C11 source, `kernel/src/kernel.c`. Constraints whose bodies are pure arithmetic over geometry
(the visibility walk, layout, text sizing, springs, percent and centring derives) became
bytecode the kernel evaluates itself, never returning to JS. See [kernel.md](kernel.md).

**Dirty regions on the canvas compositor.** Each surface records the device box it last painted
(`painted`); a frame collects the damage of what changed, clips to it, and repaints only that.
`DAMAGE_MAX = 0.8` falls back to a full repaint past that share; `MAX_DAMAGE_RECTS = 8` bounds
the rect count.

**The binary geometry channel (Mac only).** Geometry ops — 97% of the op stream under motion —
ride a `Float64Array` of six numbers per op instead of being serialized into the JSON op
stream.

**The provided-value memo.** `provided(name)` caches the *answer to the ancestor walk* rather
than the value, with a generation counter and a subtree clear on a genuine re-parent.

**The raster memo and culling**, which predate this arc but interact with dirty regions and are
measured here because they share the paint column.

---

## 2. The result: settle time

"Settle" is the whole reactive close — every rule the change provoked, evaluated to quiescence.
It is the number the kernel exists to move. Each cell is the change in **total milliseconds
over the measured window** of that case.

| case | Chrome DOM | Chrome canvas | iOS DOM | iOS canvas | Mac (JSC) |
|---|---|---|---|---|---|
| desktop:seed | −87% | −90% | −88% | −94% | −82% |
| desktop:drag | −81% | −81% | −93% | −91% | −88% |
| weather:resize | −74% | −65% | −56% | −56% | −71% |
| desktop:minimize | −51% | −57% | −45% | −53% | −47% |
| weather:city | −46% | −56% | −38% | −51% | −56% |
| desktop:openclose | −44% | −36% | −36% | −40% | −66% |
| marketmap:slider | −35% | −45% | −57% | −48% | −57% |
| tracker:filter | −35% | −17% | −22% | −12% | −36% |
| desktop:hover | −33% | −36% | −45% | −44% | −50% |
| tracker:hover | −28% | −28% | −31% | −34% | −50% |
| calendar:mode | −24% | −35% | −15% | −35% | −47% |
| desktop:menus | −21% | −16% | −19% | −22% | −35% |
| probe:memo | +6% | +41% | −66% | +82% | — |

**Totals, summed over every case in each configuration:**

| configuration | settle before → after | |
|---|---|---|
| Chrome, DOM backend | 10 912 → 6 317 ms | **−42%** |
| Chrome, canvas backend | 8 119 → 4 459 ms | **−45%** |
| iOS Safari, DOM backend | 16 523 → 8 518 ms | **−48%** |
| iOS Safari, canvas backend | 8 551 → 4 737 ms | **−45%** |
| Mac native host (JSC) | 17 722 → 8 344 ms | **−53%** |

Four JavaScript engines, two renderers, three operating systems, 64 comparable case-runs: every
case faster on every configuration, bar one (below). Around **half the settle time is gone**,
and the largest wins land on the cheapest interactions — dragging a window is −81% to −93%,
because a drag is almost entirely the arithmetic the kernel now does itself.

**The one exception, honestly.** `probe:memo` reads +6%, +41% and +82% on three canvas
configurations and −66% on iOS DOM. Its canvas settle window is 6–20 ms — too small to measure,
and it has swung both ways across five runs (+10%, −4%, +7%, +56%, +82%). The only measurement
of that probe with a meaningful window is the iOS DOM one: **1569 → 531 ms, −66%**. The canvas
readings should be disregarded rather than explained.

### Why it is faster: the evaluation counts

The rule-evaluation counts are the mechanism, and they rule out "it did less work":

| case (Chrome DOM) | evaluations before → after | settle |
|---|---|---|
| desktop:drag | 2 160 → **2 160** | −81% |
| tracker:hover | 141 → **141** | −28% |
| desktop:seed | 5 877 → **11 430** | −87% |
| weather:city | 114 580 → **121 263** | −46% |

`desktop:drag` and `tracker:hover` run *exactly* the same number of rules in both trees and
finish in a fifth of the time. Where the count *rises*, the new tree is evaluating **more**
rules and still finishing far sooner, because a kernel-evaluated rule never enters JavaScript.
The meter records both totals and the JS subset (`evalN`, `evalJsN`) so the difference is
visible rather than asserted.

---

## 3. The result: paint

Dirty regions are a much narrower win than the settle work, and the corpus shows exactly where
the line falls. Sorted by the fraction of the surface a case actually repaints:

| case (Chrome canvas) | painted area | paint before → after | |
|---|---|---|---|
| tracker:hover | 0.053 | 53 → 15 ms | **−71%** |
| desktop:hover | 0.085 | 14 → 14 ms | −3% |
| tracker:filter | 0.092 | 212 → 84 ms | **−60%** |
| probe:memo | 0.256 | 12 → 15 ms | +22% |
| desktop:drag | 0.288 | 85 → 80 ms | −6% |
| desktop:openclose | 0.296 | 84 → 76 ms | −10% |
| desktop:minimize | 0.327 | 303 → 286 ms | −6% |
| desktop:seed | 0.564 | 54 → 62 ms | +16% |
| desktop:menus | 0.862 | 22 → 27 ms | +22% |
| weather:city | 0.989 | 1735 → 1524 ms | −12% |
| calendar:mode | 0.997 | 377 → 397 ms | +5% |
| weather:resize | 1.0 | 287 → 254 ms | −12% |
| marketmap:slider | 1.0 | 405 → 415 ms | +2% |

**Total, Chrome canvas: 3 643 → 3 249 ms, −11%.** Two cases carry it. Nine sit between −12% and
+5%.

On the phone, where the scenes are expensive relative to the device, the same shape holds but
the magnitudes are larger — **23 630 → 10 734 ms, −55%** — and most of that is not dirty regions
at all: `weather:resize` is −80% at painted area **1.0**, which a full repaint cannot explain.
That win belongs to the raster memo and culling, which share this column. **The paint column
measures the arc's effect on painting, not dirty regions in isolation**; separating them needs
the `__declareNoDamage` switch on individual cases, which is the one question where a
flag-based A/B is the better instrument.

### The threshold, and a wrong turn worth recording

The regressions cluster where a case repaints a middling share of a cheap scene. The temptation
is to lower `DAMAGE_MAX` so those frames take the full-repaint path. **That is measurably
wrong.** Round 5 varied the actual knob on a phone:

| threshold | drag paint | open/close | minimize | minimize frames >20 ms |
|---|---|---|---|---|
| off (always full) | 239 | 149 | 573 | 106 |
| 0.5 | 256 | 151 | 482 | 102 |
| **0.8** (current) | 245 | **139** | **470** | **69** |
| 0.98 | 293 | 143 | 456 | 74 |

0.5 is worse than 0.8 in every column. No single global threshold separates `drag` (where full
repaints win outright) from `minimize` (573 → 470 ms and long frames 106 → 69), and both sit in
the same middling band. 0.8 is a measured compromise, not an assumption.

**The better explanation of *why*, which the area model misses** (DT, 2026-09-20): dirty regions
do not save pixels, they save **the views that would have been repainted**. A window dragged
over a flat wallpaper avoids almost nothing, because what is underneath is nearly free to draw;
a small change over tracker's dense text rows avoids a great deal. Every desktop case in the
corpus costs 0.5–1.0 ms per full repaint — that is the wallpaper — which is why the tracking
shows up as the whole signal there.

This suggests the per-frame decision could weigh the *cost* of the views it would skip rather
than their area. It is **not implemented, and should not be adopted on this evidence**: the
paint column is confounded (above), and scene cost is not knowable at the moment the decision
has to be made — you learn what a frame costs by painting it. A moving average would buy that
knowledge with state, staleness, and a new class of wrong answer, to replace one comparison.

### Where dirty regions cost, and whether it matters

Nine cases paint more than they used to, by +2% to +25%. In every one, the settle win is 3× to
170× larger:

| case | paint | settle | net |
|---|---|---|---|
| iOS desktop:drag | +31 ms | −167 ms | **−136 ms** |
| Chrome desktop:minimize | +27 ms | −159 ms | **−132 ms** |
| Chrome calendar:mode | +21 ms | −132 ms | **−110 ms** |

The always-full cases show what the overhead *is*: `desktop:menus` paints 14 frames, **12 of
them full** — the threshold firing correctly — and the +22% is 5 ms of damage collection across
the whole stimulus. That is the standing cost of *asking* whether a frame can be partial, on
cases where the answer is always no.

---

## 4. The Mac host: a different integration of the same C

The kernel is one source; how it reaches the runtime differs by host, and the difference is
worth stating precisely because it is the clearest case of the "same semantics, different
vehicle" rule.

**Browser — WebAssembly.** `kernel.c` compiles to WASM and is instantiated at boot
(`kernel-loader.ts`). The slot table is a `Float64Array` over the module's linear memory, so a
getter reads a number out of shared memory with no call. Bodies that stay in JS are called back
through an import. The cost is instantiation at startup and the bytes on the wire (§5).

**Mac — native static linking.** The same C is compiled into the host binary and bound to
JavaScriptCore directly (`kernel/src/kernel_jsc.c`). There is no module to fetch, no
instantiation, and no linear-memory boundary: the applier reads geometry straight from the
table for the elements `kernel_dirty` names. This is also why the Mac gets the **binary geometry
channel** — geometry never has to become text to cross into the host, because the host and the
kernel share an address space.

The measured consequence, from the per-switch A/B in `mac-host/profile/REPORT.md`:

| | on | off | |
|---|---|---|---|
| binary GEOM, serialize (calendar:mode, JIT) | 5.0 ms | 85.9 ms | **−94%** |
| binary GEOM, commit | 60.7 ms | 525.6 ms | **−88%**; 7.17 vs 8.65 MB crossed |
| binary GEOM, serialize (interpreter) | 4.4 ms | 73.9 ms | −94% |

**Elsewhere** (Windows, Android; V8 or Hermes) the shape is the native one: link the kernel, JIT
or interpret the bodies, write an applier. The iOS case is the interesting one — JSContext has
no JIT, so *every* JS path there is 3–4× worse and the kernel's share of the win is largest;
that is visible in the iOS DOM totals (−48%) being the highest of the browser configurations.

---

## 5. Size: what it costs on the wire

The calendar is the flagship, and its **first-load download** — every file a browser must have
before the program runs, gzipped, summed — is the number guarded by `test/declarec.test.mjs`.

| | KB gz |
|---|---|
| **First load, calendar, DOM production** | **111.77** |
| — the inline kernel (base64 WASM) | 9.45 |
| — its decode and binding | ~1.4 |
| Runtime with the kernel removed | 100.69 |
| The same program before the arc | 90.5 |

So the kernel costs **10.9 KB gzipped as a blob**, and the arc as a whole costs about 21 KB —
the rest being the kernel's JS side (cells, the EXPR machine, the extent and visibility rules)
and the island boundary that landed with it. The band in `declarec.test.mjs` is 112 KB, with
the accounting written into the test.

**This is 11.8 KB over DT's 100 KB target, and the tradeoff was accepted deliberately**
(2026-09-20) on the strength of the settle numbers above. It is recorded here rather than
softened: the arc made the runtime bigger.

### Why one file, not a sibling `.wasm`

The kernel rides **inside the bundle as base64**, not as a separate `.wasm` fetch. A sibling
file is about **3 KB smaller gzipped** — base64 costs a third in size, and gzip only partly
recovers it — so on wire size alone the separate file wins.

It lost on **latency**, measured on a real iPad over Wi-Fi (2026-09-18): the extra request cost
**+50–150 ms on every app's startup**, and Safari re-requested the file despite the page's
preload hint. One file means one request and no round trip before first paint. Three kilobytes
of download is a smaller price than a round trip on a real network, and the decode is inside
the measured boot stages rather than hidden.

The production build folds this with the other build flags: `__DECLARE_INLINE_KERNEL__` is true
for web builds, `__DECLARE_NATIVE_KERNEL__` for the Mac, and a shipping bundle carries no dev
switches at all (`tools/declarec.mjs`).

---

## 6. What we determined will *not* pay

Recorded so nobody spends the time again.

**Replication.** Closed as a performance target (2026-09-17). Per-row cost is flat; the
quadratic term has a tiny constant because splices are memory moves, so it does not bite below
several thousand fully materialized rows — which is what `virtualize` is for. Reconcile appears
nowhere in the top entries of any Chrome profile.

**The measure memo.** Unproven on every case in the corpus. Chrome: no effect. Mac interpreter:
the ranges overlap. The −7% with the JIT on sits inside its own run spread. It is kept because
it is correct and cheap, and because a program that re-measures the *same* text is the case it
exists for — but no case in this corpus does that, so no number should be quoted for it.

**Skipping empty settles.** Cannot be measured on this corpus: `weather:city` was *verified* to
have 0 empty settles of 553. The switch may be doing nothing at all here.

**Lowering `DAMAGE_MAX`.** Measured, worse (§3).

**Dirty regions on cheap scenes.** Not a defect to fix but a boundary to know: where a scene
costs ~0.5 ms to repaint entirely, partial painting cannot win, and the bookkeeping shows up as
a small regression. The threshold already sends the worst of these to the full path.

---

## 7. Promising, unexplored

**Isolating dirty regions from the raster memo.** The paint column mixes them. A
`__declareNoDamage` A/B *within* the merged tree on `desktop:drag` (cheap scene) and
`tracker:filter` (costly scene) would attribute the paint numbers properly. This is the one
place the flag method beats the two-tree method.

**A drag over expensive content.** The corpus has no such case: `desktop:drag` is a window over
a flat wallpaper, and `tracker` has the dense scene but no drag. Building one would test the
"cost of the views avoided" model directly rather than inferring it from correlation.

**Early-out in damage collection.** Collection currently gathers everything and then decides
whether the total exceeds `DAMAGE_MAX`. Stopping as soon as the accumulated damage passes the
threshold would recover the 2–5% standing overhead on always-full cases (`calendar:mode`,
`marketmap:slider`, `desktop:menus`). Small prize; needs the damage checker at both viewport
sizes to prove it safe.

**Compile-time lowering, and colour slots as cells.** Named as next steps when the kernel
landed; neither has been measured.

**The warm-up window.** A consistent slow-then-fast effect is visible in the first seconds after
load (JIT tiering, the client-side compile, and — in the after tree only — WASM instantiation).
The rig waits for mount plus 2.5 s before measuring, so it lands outside the window, and the
asymmetry runs *against* the new tree (the before tree has no kernel to instantiate). It means
these figures, if anything, **understate** the wins. Worth removing with a longer pre-roll or by
discarding the first N frames.

---

## 8. A defect this work shipped, and the gate that let it through

Dirty regions shipped a rendering bug that survived every gate for four days.

**What happened.** `painted` — where a surface and its subtree last landed — is what a partial
frame culls against. A container that last painted while it was **empty** carries an empty box.
When children arrive afterwards and book damage, the container's stale box misses that damage,
it returns before reaching any child, and nothing marks damage again. The content stays blank
until something forces a full repaint. On marketmap at a **phone** viewport the treemap never
appeared: 35.3% of the canvas drawn against 92% with damage off, fixed permanently by a
one-pixel resize.

**Why nothing caught it.** Desktop widths lay the tiles out before that first frame, so the bug
is invisible at 1280×828 — and the fidelity gate, the conformance suite, the perceptual tests
**and the damage checker itself** all ran only at desktop dimensions. The damage checker is
precisely the instrument for this and it had never been pointed at a phone-sized canvas.

**The fix** (`runtime/src/canvas-backend.ts`, `insertChild`): inserting a child retires the
`painted` record of every ancestor, because adding a child is exactly the event that invalidates
"this box bounds my subtree". Clearing it says *unknown*, which is what it now is; `paint()`
already propagates that signal upward for a child whose box it could not compute.

**What it cost the numbers.** Several paint figures were measuring work not done. The corrections
are large and are the reason §3 is smaller than the first draft of this round:

| case | paint, with the bug | paint, fixed |
|---|---|---|
| marketmap:slider (iOS) | −95% | **−60%** |
| desktop:menus (Chrome canvas) | −34% | **+22%** |
| tracker:hover (Chrome canvas) | −72% | −72% (unchanged — the control) |

**What changed as a result:** `mac-host/profile/web.mjs` now takes `--viewport WxH@dpr`, so the
damage checker can run at phone dimensions; it reports **183 partial frames checked, 0
mismatched** at 393×641 and 122/0 at 1280×828. Whether that becomes a standing gate is an open
decision.

---

## 9. How this was measured, and why the obvious method fails

Worth preserving, because the first attempt produced numbers that pointed the wrong way.

**Flags could not answer this question.** The morning's round flipped every A/B switch in one
build — damage, culling, the raster memo, the wasm filter, kernel derives, the extent rule, the
track ring, filter regions, the raster worker, boot deferrals, the measure memo — off, then on.
Its settle column read **+5% and +6%**, i.e. *slower*. The reason is that the arc's biggest work
**has no off switch**: the kernel's core evaluation, its visibility rule, the provided-value
memo and the binary geometry channel are on in both arms. That round compared "kernel on, paint
optimizations off" with "kernel on, paint optimizations on", and the settle difference was run
spread over identical code. Only a tree that never had the kernel can answer what the kernel is
worth.

**Meters placed by hand, not injected.** The profile rig patches meters into compiled JS by
matching strings. Across two trees years apart the same patch lands on `runBody()` in one and
`run()` in the other, on `commitOps` here and `host().commit` there — every anchor matches, the
build succeeds, and the two numbers quietly count **different populations**. So the meters were
placed by reading each tree's own code (`runtime/src/meters.ts` in each measurement copy), and
the file records for each what is comparable and what is not.

One example of what that caught: counting `runBody` in the merged tree counts only the bodies
the kernel calls back into — EXPR bytecode and the visibility rule never appear — so it would
have reported **far fewer** evaluations than the before tree and **flattered the new tree**. The
kernel already counts every rule it dequeues and returns it from `kernel_settle`; the meter
reads that instead.

**App-level landmarks, and a fairness check that voids rows.** Each case declares the app-level
marks a correct run produces (`tracker:project` ×24, `desktop:minimize` ×6). A pair whose
landmarks disagree is **discarded, not footnoted** — a run that applied 24 filter keystrokes
against one that applied 20 yields two believable numbers whose difference means nothing, and
no runtime meter can tell you it happened. The check earned its keep immediately: the first full
round voided **21 of 26 rows**, every one a real defect in the case definitions rather than a
measurement.

**One corpus, three runtimes.** Cases are data — steps from a vocabulary every host can perform
(`mac-host/profile/cases.mjs`) — because the stimuli used to be written in browser terms
(`document.elementFromPoint`, synthetic `PointerEvent`) and could therefore never run on the Mac
host, which has no DOM. The Mac numbers had silently covered a *smaller* corpus than the Chrome
ones. Any case a runtime genuinely cannot perform is now **named with its reason** (`probe:memo`
on Mac: the raster memo is a canvas-backend cache the native host does not have).

**Known limits of this round.** Single runs per pair, except where noted; `tracker:filter` on
Mac read **+59%** on a contended machine and **−46%/−36%** on two idle ones, which is a fair
warning about single runs on a busy machine. `desktop:drag` moves the window through the model
rather than through a real press, because a synthetic `pointerdown` cannot take pointer capture
in a browser — so the hit walk and the drag claim are in nobody's numbers. The paint column is
confounded as described in §3.

---

## Where the artefacts are

| what | where |
|---|---|
| the corpus (13 cases, as data) | `mac-host/profile/cases.mjs` |
| the in-page executor (all runtimes) | `mac-host/profile/driver-exec.js` |
| per-runtime adapters | `exec-chrome.mjs`, `exec-mac.mjs`, `exec-ios.mjs` |
| the rounds | `round.mjs` (Chrome, Mac), `round-ios.mjs` (device) |
| validity and comparability checks | `checks.mjs` |
| a measurement Mac app | `bake-mac.mjs` |
| raw results | `mac-host/profile/results/round-*.json` |
| the arc's running log | `mac-host/profile/REPORT.md` |
| the kernel's design | [kernel.md](kernel.md) |
| how to run a comparison like this again | [comparative-benchmarking.md](comparative-benchmarking.md) |
| the meter module, as a template | `mac-host/profile/meters.template.ts` |
