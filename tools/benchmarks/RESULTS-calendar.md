# Calendar — phased startup benchmark (deferred vs. immediate instantiation)

Two self-contained bench variants of the calendar, both with the **intro animation removed**
(no slide-in / fade-up; `oninit` runs `finishStartSequence()` immediately) and timeline marks
(`app-oninit`, `data-loaded`, `events-hydrated`). The distro is untouched.

| variant | file | instantiation | event data | stages |
|---|---|---|---|---|
| **DEFERRED** | `apps/calendar/cal-bench.lzx` | stock (idle-queue / `initstage="late"`) | async fetch | **two**: init, *then* events fill in |
| **IMMEDIATE** | `apps/calendar/cal-bench-eager.lzx` | `lz.Instantiator.isimmediate=true` (no queue) | **inline** (`cal-data-eager.lzx`) | **one**: everything up front |

The immediate variant needs *both* levers. Forcing eager instantiation alone changes nothing
measurable, because the event views are gated on the **async data fetch**, not on the idle
queue — so the eager variant also pre-bakes the displayed month inline (`cal-data-eager.lzx`),
which makes `loadData()`'s own `datatester.hasNode()` guard skip the fetch and lets the event
views replicate **synchronously during the static build** — inside the `?profile` meter window.

Re-run: `tools/serve.mjs ../apps/calendar cal-bench.lzx 8096`, then
`tools/lzprof.mjs ".../cal-bench[-eager].lzx?profile=true" <label>` and
`tools/browserprof.mjs ".../cal-bench[-eager].lzx" <label>`.

---

## The headline: where the two strategies differ

Both variants do the **same total work** and draw the **same pixels** — the only question is
*when* the event-hydration work happens relative to `canvas.init` (the end of the `?profile`
meter window, ≈ first logical render).

| | DEFERRED (two-stage) | IMMEDIATE (one-stage) |
|---|--:|--:|
| LZX fn-calls metered **to `canvas.init`** | **74,546** | **82,699** |
| event hydration | *after* `canvas.init` (unmetered by `?profile`; ~3 ms browser paint) | *before* `canvas.init` (**fully metered**) |
| Δ = the event-hydration cost | — | **+8,153 calls** |
| browser pipeline (style+layout+paint+composite) | ~16.7 ms | ~16.7 ms (identical; just re-phased) |
| time to first paint | 36 ms | 32 ms |

**Rendering cost is invariant to instantiation strategy** — the browser draws the same tree
either way (~17 ms main-thread). Deferral only moves the *JS* event-build off the critical
path to `canvas.init`; it does not make it cheaper.

### What the 8,153-call event-hydration stage is made of

Summing both metered phases, IMMEDIATE − DEFERRED by category:

| category | DEFERRED | IMMEDIATE | Δ (= hydrating the month's events) |
|---|--:|--:|--:|
| constraint   | 17,759 | 21,055 | **+3,296** |
| other (data-binding / datapath) | 10,532 | 13,934 | **+3,402** |
| sprite-dom (DOM shadow) | 11,466 | 12,332 | +866 |
| attr-set     | 5,466 | 6,066 | +600 |
| data         | 337 | 761 | +424 |
| **instantiate** | 27,420 | 26,763 | **−657 (≈ flat)** |
| total        | 74,546 | 82,699 | **+8,153** |

> **Finding: hydrating data-bound event views is a *constraint / data-binding* cost, not an
> *instantiation* cost.** The month has only ~10 event views, so `instantiate` barely moves;
> the expense is the dense web of `datapath` xpath bindings each event carries
> (`summary`, `start`, `end`, `notes`, …) — `constraint` + `other` (the datapath machinery)
> together account for **~6,700 of the 8,153 calls (82 %)**. This is the fine-grained-reactivity
> tax, paid per data binding.

---

## Variant A — DEFERRED (the stock two-stage path)

Wall-clock timeline (one production run; columns sum to each step's duration; italic = the
aligned `?profile` phase's category mix). See METHODOLOGY.md §5 for how the split is computed.

| t (ms) | milestone | step | JS (Laszlo/app) | style | layout | paint | composite | idle/wait | what happened |
|--:|---|--:|--:|--:|--:|--:|--:|--:|---|
| **0** | navigation start | 0 | | | | | | | request issued |
| **14** | runtime fetched | 14 | 13.0 | 0.2 | 0.1 | 0.1 | 0.1 | 0.2 | lfc.js downloaded + parsed |
| **24** | app JS fetched | 11 | 6.3 | | | | | 4.2 | compiled app downloaded → exec begins |
| **36** | first paint (splash) | 12 | 8.1 | 0.1 | 0.1 | | · | 3.5 | spinner pixels; app not built |
| **102** | app-oninit | 66 | 31.2 | 1.2 | 4.9 | · | 0.1 | 28.5 | **static view tree built** · _64,810 calls — instantiate 41%, constraint 24%, sprite-dom 13%_ |
| **117** | data-loaded | 16 | 12.4 | 0.9 | 0.7 | 1.1 | 0.5 | · | month XML arrived (async fetch) |
| **120** | events-hydrated | 3 | 2.1 | 0.1 | 0.3 | | | | data merged → event views queued (idle) |
| **121** | canvas-init | 1 | 0.7 | | | | | | logical tree finalized · _start-seq 9,736 calls — sprite-dom 30%, constraint 20%_ |
| **168** | fully rendered / ready for input | 48 | 25.4 | 0.5 | 0.9 | 1.3 | 0.7 | 18.7 | deferred event views build + paint; interactive |
| **168** | **TOTAL** | 168 | **99.1** | 3.0 | 7.1 | 2.5 | 1.3 | 55.1 | JS+browser ≈ 113 ms main-thread |

Two-stage in one read: the tree is up at ~102 ms (JS-bound), then `canvas-init` at 121 ms; the
event views build *after* (the 168 ms row) — and that final step still costs ~25 ms of JS the
`?profile` meter can't see.

---

## Variant B — IMMEDIATE (one stage, everything metered)

`isimmediate=true` + inline month data → the whole app, **including the event views**, builds
synchronously before `canvas.init`. (The `data-loaded`/`events-hydrated` marks now fire for the
*adjacent* months still prefetched async; the **displayed** month is inline and never fetched.)

| t (ms) | milestone | step | JS (Laszlo/app) | style | layout | paint | composite | idle/wait | what happened |
|--:|---|--:|--:|--:|--:|--:|--:|--:|---|
| **0** | navigation start | 0 | | | | | | | request issued |
| **15** | runtime fetched | 15 | 12.5 | 0.2 | 0.1 | 0.1 | 0.1 | 1.5 | lfc.js downloaded + parsed |
| **26** | app JS fetched | 11 | 7.2 | | | | | 3.9 | compiled app downloaded → exec begins |
| **36** | first paint (splash) | 10 | 8.3 | 0.1 | 0.1 | | · | 1.8 | spinner pixels; app not built |
| **102** | app-oninit | 66 | 32.8 | 1.1 | 4.7 | · | 0.1 | 27.4 | **static view tree built** · _62,426 calls — instantiate 37%, constraint 25%_ |
| **124** | data-loaded | 22 | 17.4 | 1.1 | 1.3 | 1.4 | 0.7 | · | **+ EVENT HYDRATION** (inline data → built here) · _start-seq+events 20,273 calls — other 27%, constraint 25%, sprite-dom 19%_ |
| **126** | events-hydrated | 2 | 1.3 | 0.1 | 0.3 | | | | (adjacent-month prefetch marks) |
| **127** | canvas-init | 1 | 1.4 | | | | | · | logical tree finalized — events already in |
| **147** | fully rendered / ready for input | 20 | 17.7 | 0.2 | 0.4 | 1.2 | 0.4 | 0.3 | final paint; interactive |
| **147** | **TOTAL** | 147 | **98.7** | 2.8 | 6.9 | 2.7 | 1.3 | 35.0 | JS+browser ≈ 112 ms main-thread |

Same ~99 ms of JS and same ~14 ms of browser rendering as the deferred variant — but it all
lands *before* `canvas-init` (note the doubled start-sequence call count, 9,736 → 20,273), so
"fully rendered" arrives at **147 ms** vs the deferred **168 ms**: one stage, nothing trailing.

---

## Key findings

1. **"Lazy instantiation" is the wrong lever for the calendar.** Disabling the idle queue
   alone moves nothing measurable — the events are gated on the **async data fetch**, which
   lands ~right at `canvas.init`. The real two-stage-ness comes from *data being async*, not
   from the instantiation queue.
2. **Deferral re-phases, it doesn't reduce.** Same ~8,150 calls and same ~17 ms of browser
   rendering happen either way; deferral just keeps the event build off the path to first
   logical render (canvas.init ~111 ms), trading a slightly later "fully populated" state for
   a faster "structure visible" state.
3. **Event hydration is a data-binding cost (~82 % constraint + datapath), not instantiation.**
   Ten event views are cheap to *construct*; the expense is their reactive `datapath` bindings.
4. **Measurement boundary made concrete.** `?profile` auto-stops at `canvas.init`, so the
   deferred variant *cannot* meter its own event-hydration LZX cost. The immediate variant
   (inline data) is what makes that cost visible — and it is the **+8,153 calls** above.
