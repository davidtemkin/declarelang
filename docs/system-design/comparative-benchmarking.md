# Comparative benchmarking — how to measure one tree against another

**A runbook.** The results of the round this was built for are in
[optimization-arc.md](optimization-arc.md); this is how to do it again. It exists because the
measurement trees are throwaway and the knowledge in them is not: what took longest in
2026-09-20 was not running the corpus but working out *which quantities two unrelated
implementations can honestly be compared on*.

Read this when the question is **"what did this arc of work buy?"** — a question about a body
of changes with no single switch. For "what does this one optimization buy?", use the runtime's
A/B switches instead (§7); they are the better instrument for that, and a worse one for this.

---

## 0. When the obvious method fails

The first attempt at the 2026-09-20 round flipped every A/B switch in one build — damage,
culling, the raster memo, the wasm filter, kernel derives, the extent rule, the track ring,
filter regions, the raster worker, boot deferrals, the measure memo — off, then on, and read
the difference. Its settle column said **+5%**: the new code was *slower*.

It was not. The arc's largest work — the kernel's core evaluation, its visibility rule, the
provided-value memo, the Mac's binary geometry channel — **has no off switch**, so it was on in
both arms. The round compared "kernel on, paint optimizations off" against "kernel on, paint
optimizations on", and the settle difference was run spread between two identical code paths.

**A body of work without a switch can only be measured against a tree that never had it.**
That is the whole reason for the two-tree method below.

---

## 1. Stand up the two trees

Neither is main. Main stays clean — a shipped runtime must not carry meters.

```
~/Code/Declare-Before     the baseline: the released tree (a GitHub tarball of the tag)
~/Code/Declare-After      the subject: a copy of main
```

For the released side, download the tag rather than reaching into git:

```
curl -sL -o /tmp/v.tar.gz https://github.com/davidtemkin/declarelang/archive/refs/tags/v0.4.5.tar.gz
mkdir -p ~/Code/Declare-Before && tar xzf /tmp/v.tar.gz -C ~/Code/Declare-Before --strip-components=1
cd ~/Code/Declare-Before && npm install --no-audit --no-fund && npx tsc -b
```

For the subject, copy main without the weight — `rsync -a --exclude .git --exclude evals
--exclude my-apps ~/Code/Declare/ ~/Code/Declare-After/` — and **verify the copy is what you
think it is**. A measurement tree taken before a fix, or after an unrelated change, produces a
perfectly clean comparison of the wrong thing. When a fix lands mid-round, port *the fix* into
the measurement tree; do not re-copy the whole of main, which drags in everything else that
moved.

---

## 2. Place the meters by hand

Copy `mac-host/profile/meters.template.ts` to `runtime/src/meters.ts` in **both** trees, then
place the call sites by reading each tree's own code.

**Do not use the injector for this.** `build-runtime.mjs` patches meters into compiled JS by
matching strings, which is right for one tree over time and wrong for two trees against each
other: the same patch lands on `runBody()` in one and `run()` in the other, on `commitOps` here
and `host().commit` there. Every anchor matches, the build succeeds, and the two numbers quietly
count **different populations**. (The injector now stands down where it finds a hand-placed
meter, so the two do not fight.)

| meter | where | what to watch for |
|---|---|---|
| settle | wrap the exported `settle()`; keep the re-entrancy guard INSIDE the wrapper | a nested call does no settling and must not be counted as one |
| evaluations | the **dequeue**, not the evaluation | see below — this one is the trap |
| paint | the canvas backend's paint pass, clear through `root.paint` | record the painted FRACTION; a tree with no damage regions is 1 by construction, and recording it keeps the rows aligned |
| commit | the Mac backend's flush | count what rides the binary channel too, or the newer tree is credited with a crossing it still pays |
| instantiate | wrap `instantiate()` | same boundary in any tree |

**The evaluations trap, in full, because it points the wrong way.** The obvious site is the
callback the kernel invokes for a JS body (`runBody`). Counting there counts only the bodies
that *left* the kernel — EXPR bytecode and the visibility rule evaluate inside it and never
appear — so the newer tree reports **far fewer** evaluations than the baseline and looks like it
is doing less work. It is not; it is doing the same work somewhere the meter cannot see. The
kernel already counts every rule it dequeues and returns that from `kernel_settle`; read *that*,
and count at the pre-arc tree's own dequeue so both mean the same event.

Errors that flatter the change are the ones to hunt for. An error that makes the new code look
bad gets investigated immediately; one that makes it look good gets published.

---

## 3. Give each case a landmark

A settle time is comparable only if the two runs did the same thing, and **no runtime meter can
tell you they did**. A case whose query cycled 24 times in one tree and 20 in the other yields
two believable numbers whose difference means nothing.

So each case in `mac-host/profile/cases.mjs` declares the app-level marks a correct run
produces, and the app records them — `(globalThis as any).__M?.mark("tracker:project")` in the
program itself, in both trees.

Three rules learned the hard way:

- **A landmark must sit on the path the stimulus takes.** Two were first placed on the input
  verb (`tracker`'s `onInput`, `calendar`'s `goMode`) while the stimulus wrote the slot
  directly and never called either. A landmark that cannot fire is worse than none: it reads as
  evidence the case ran, and proves nothing.
- **Put it on the work, not the trigger**, when the trigger can be bypassed — `tracker`'s
  landmark is on `project()`, the recomputation a query change provokes.
- **Check the use site.** `marketmap`'s scrubber overrides `input(v)` at the use site, so the
  landmark in the library `Slider` never ran. It belongs on `app.scrub`.

Where no app verb exists — a pointer sweep provokes hover transitions the app never handles —
the landmark goes in the runtime, at the same line in both trees.

---

## 4. Make the gesture identical, not the duration

A time-boxed gesture does **different amounts of work** in a faster tree: the slider's 2.5 s
drag produced 122 steps in one tree and 151 in the other, and the pair was not comparable. Use
a fixed step or frame count (`frames: 150`, `moves: 120`) so both trees perform the same
gesture and the **wall time** is what differs — which is the measurement.

For the same reason, a case that declares a landmark count as a comparison (`">0"`) is stating
the count is **not** deterministic, so the checker holds each side to the predicate and does not
compare the two counts. The desktop cascades windows from a counter and picks zoom targets with
`Math.random`; an identical 120-move sweep crossed 144 view boundaries in one host and 118 in
the other, and nothing can make those equal.

---

## 5. Run it

```
# Chrome, both renderers
node mac-host/profile/build-runtime.mjs --web --root ~/Code/Declare-Before
node mac-host/profile/build-runtime.mjs --web --root ~/Code/Declare-After
node mac-host/profile/round.mjs --targets chrome,chrome-canvas

# Mac — one measurement APP per tree, each with its own control pipe
node mac-host/profile/build-runtime.mjs --root ~/Code/Declare-Before
node mac-host/profile/bake-mac.mjs --tree ~/Code/Declare-Before --app "Declare Mac Before" \
     --pipe /tmp/declare-ctl-declare-before.in
#   …the same for After, then launch both with DECLARE_CONTROL=1, DECLARE_CTL_PIPE
#   and a DECLARE_URL that resolves (a file:// program is enough), and:
node mac-host/profile/round.mjs --targets mac

# iPhone — launches Safari on the device itself
node mac-host/profile/round-ios.mjs --render canvas --real <udid>   # xcrun devicectl list devices
node mac-host/profile/round-ios.mjs --render dom --real <udid>
```

`bake-mac.mjs` builds the app honestly, swaps in the metered runtime and **re-signs it**,
verifying `com.apple.security.cs.allow-jit` survived: without that entitlement JavaScriptCore
runs its interpreter and every JS path is ~84× slower, which would be the entire measurement.

---

## 6. Conditions that silently ruin a round

Each of these was hit in 2026-09-20 and each looks like a result rather than a fault.

- **A busy machine.** `tracker:filter` on Mac read **+59%** during a Swift build and **−46% /
  −36%** on two idle runs. The *baseline* number barely moved; the contention landed on one arm.
  A single run on a loaded machine will publish a regression that is not there.
- **A backgrounded Safari.** iOS throttles a background tab to about a frame a second. The
  device round runs in one foregrounded tab for this reason, and alternates the two trees case
  by case so a pair is measured minutes apart at most — a phone's thermal state moves over a
  long round.
- **A host that never loaded its program.** The Mac error page is itself a Declare program, so
  a failed load mounts *it*: an app is up, it has a real width, and a rig that asks only "is
  something mounted?" will drive the error page and report its numbers. Check WHICH program is
  up (`__declareMain`), and read `lasterror`.
- **Warm-up.** JIT tiering, the client-side compile and (in a kernel tree) WASM instantiation
  make the first seconds slower. The rig waits for mount plus a settle before measuring. The
  asymmetry runs *against* the newer tree, so it understates rather than flatters — but it is
  worth removing with a longer pre-roll.
- **Only one viewport.** Every gate and this rig defaulted to desktop dimensions, which is how a
  dirty-region bug that blanked content at phone width survived four days. `web.mjs --viewport
  393x641@3` exists now; use it.

---

## 7. What to measure with a switch instead

Two-tree comparison answers "what did this arc buy?". It cannot attribute a result to one
optimization inside the arc, because they all moved at once — the paint column of the 2026-09-20
round mixes dirty regions with the raster memo and culling, and a case showing −80% paint at
painted area 1.0 proves the mixing.

For *that* question use the runtime's own switches inside ONE build — `__declareNoDamage`,
`__declareNoCull`, `__declareNoRasterMemo`, `__declareNoRasterWorker`, `__declareNoWasmFilter`,
`__declareNoKernelDerives`, `__declareNoKernelExtent`, `__declareNoTrackRing`,
`__declareNoFilterRegion`, `__declareNoBootDeferral`, `__declareNoMeasureMemo`. They only work
in a build with dev switches on (the metered bundles; **not** the dev server's, where they are
folded out, so a flag there silently does nothing).

They are also a diagnostic, not only a benchmark: bisecting a rendering fault by switch is how
the `painted`-box bug was pinned to dirty regions in three runs.

---

## 8. Reporting

Report what the rig reports: rows it can stand behind, and the rest named.

- A pair whose landmarks disagree is **void**, not a footnote. The first full round voided 21 of
  26 rows, every one a real defect in the case definitions.
- A case a runtime cannot perform is **named with its reason** (`probe:memo` on Mac: the raster
  memo is a canvas-backend cache the native host has none of). A corpus that silently shrinks
  per host is how one target's numbers come to cover fewer cases than another's.
- A window too small to measure is **said so**, not converted to a percentage. `probe:memo`'s
  canvas settle is 6–20 ms and has read +10%, −4%, +7%, +56% and +82% across five runs; its only
  meaningful measurement is the 1569 ms window on iOS DOM.
- Percentages over a small absolute are **quoted with the absolute**. `desktop:menus` at +22%
  paint is 5 ms across a four-second stimulus.

---

## 9. Afterwards

Delete the measurement trees, and the measurement apps with them:

```
rm -rf ~/Code/Declare-Before ~/Code/Declare-After
rm -rf "/Applications/Declare Mac Before.app" "/Applications/Declare Mac After.app"
```

A measurement tree is not a place to work: it has meters in its runtime and landmarks in its
apps, so anything written there is written against a runtime nobody ships. What survives is in
main already: the corpus, the executor and adapters, the checks, this runbook, the meter
template, and the round's results under `mac-host/profile/results/`.
