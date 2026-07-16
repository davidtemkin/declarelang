# Dashboard — eager skip-login startup benchmark

Bench variant: `apps/dashboard/dashboard-bench.lzx` — a self-contained copy of the dashboard
that **skips the login dialog** (canvas `oninit` calls `showdashboard()` directly, which
destroys the login intro and reveals the five windows) and **forces eager instantiation**
(`lz.Instantiator.isimmediate=true` + the tab-content class flipped `initstage="late"` →
`"immediate"`), so the entire dashboard builds up front in one metered stage. The distro is
untouched. Marks: `app-oninit`, `dashboard-shown`. (`base/` and `utils/` includes resolve from
`runtime/components/` via the compiler, so the copy only carries the app's own files.)

Re-run: `tools/serve.mjs ../apps/dashboard dashboard.lzx 8097`, then
`tools/lzprof.mjs ".../dashboard-bench.lzx?profile=true" dash-bench` and
`tools/browserprof.mjs ".../dashboard-bench.lzx" dash-bench`.

---

## The headline: login + lazy instantiation hide ~80 % of the dashboard

| | STOCK (login shown, lazy) | EAGER (skip-login, immediate) |
|---|--:|--:|
| LZX fn-calls to `canvas.init` | **28,641** | **136,377** |
| what actually got built | login intro + 5 window **shells** | login intro + 5 windows + **all tab content** |
| `showdashboard()` cost | (deferred work happens here, later) | **1,102 calls** — just visibility flips |

The stock dashboard's quick ~91 ms startup is **the login screen plus empty window shells** —
the real content (news, contacts, chat, planner, media tabs) is gated behind *both* the login
click *and* `initstage="late"` lazy instantiation. Building the whole thing eagerly is
**136,377 calls (≈ 4.8×)**. As with the calendar: **deferral re-phases the work, it does not
reduce it.** And because everything is pre-built, `showdashboard()` itself is nearly free
(1,102 calls — it only sets five `visible=true` flags; the 630 constraint calls are the
visibility/layout constraints re-resolving).

---

## Wall-clock startup timeline

Wall-clock timeline (one production run; columns sum to each step's duration; italic = the
aligned `?profile` phase's category mix). See METHODOLOGY.md §5 for how the split is computed.

| t (ms) | milestone | step | JS (Laszlo/app) | style | layout | paint | composite | idle/wait | what happened |
|--:|---|--:|--:|--:|--:|--:|--:|--:|---|
| **0** | navigation start | 0 | | | | | | | request issued |
| **17** | runtime fetched | 17 | 15.6 | 0.2 | 0.1 | 0.1 | 0.1 | 0.7 | lfc.js downloaded + parsed |
| **27** | app JS fetched | 11 | 6.4 | · | | | · | 4.1 | compiled app downloaded → exec begins |
| **32** | first paint (splash) | 5 | 1.0 | · | · | | | 3.7 | `db_splash.jpg`; app not built |
| **173** | app-oninit | 141 | **102.0** | 4.8 | 4.5 | · | 0.1 | 29.7 | **entire tree built eager** (5 windows + tab content) · _135,269 calls — instantiate 26%, constraint 23%, sprite-dom 20%_ |
| **174** | dashboard-shown | 1 | 0.9 | | | | | | `showdashboard()` — windows revealed · _1,102 calls — constraint 57% (visibility), sprite-dom 21%_ |
| **195** | canvas-init | 21 | 13.3 | 2.0 | 3.4 | 1.3 | 1.0 | 0.1 | logical tree finalized; first dashboard frame |
| **536** | fully rendered / ready for input | 341 | 66.0 | 3.0 | 5.6 | **13.1** | 7.9 | **245.0** | **146-image network/decode burst**, then the heavy final paint; interactive |
| **536** | **TOTAL** | 536 | **205.2** | 10.1 | 13.7 | 14.5 | 9.0 | 283.2 | JS+browser ≈ 253 ms main-thread |

Two things jump out of the wall clock:

- **The build is 141 ms of almost-pure JS** (102 ms JS in the `app-oninit` step) — eager
  instantiation of the whole dashboard. `showdashboard()` is then **~1 ms** (everything is
  pre-built; just visibility flips).
- **Time-to-fully-rendered is ~536 ms, and the last step is 245 ms of *idle/wait*** — the main
  thread blocked on the **146-image** network+decode burst before the final 13 ms paint. The
  bottleneck to "on screen" is **images, not JS or the runtime** (see the load-order section).

Browser totals: style 10.1 · layout 13.7 · paint 14.5 · composite 9.0 ≈ **~47 ms** main-thread
rendering (≈ 2.7× the calendar — five dense windows vs. one grid).

---

## Resource / data loading order

Captured by recording every HTTP response (154 total: **146 images**, 3 scripts, 3 fonts,
1 document, 1 favicon-404):

```
  0 ms  document  /dashboard-bench.lzx              ← wrapper HTML
  7 ms  image     /runtime/includes/spinner.gif
  7 ms  script    /runtime/embed.js
 15 ms  script    /runtime/lfc/lfc.js               ← the runtime (serial)
 26 ms  script    /dashboard-bench.lzx.js           ← the compiled app (serial after lfc)
  ── ~160 ms compute gap: the JS builds the 135 k-call tree, NO network ──
192 ms  image     /img/shdw_top_rt.png             ← 146 images burst, all at once
 …      image     /img/glob_win_*.png, signin/*, background.png, icons, news thumbnails …
```

Two structural observations:

1. **JS is strictly serial and on the critical path:** `embed.js` → `lfc.js` → app JS, then a
   ~160 ms single-threaded build with **zero** network overlap. Nothing the browser can
   parallelize — the images aren't even *known* until the views that reference them
   instantiate.
2. **Images load in one burst *after* the tree is built (~192 ms+), not during.** Each view
   requests its resource when it instantiates, so all 146 land together at the end. On
   localhost this is ~10 ms; on a real network this image burst (146 requests) would dominate
   time-to-full-paint and is the #1 thing to optimize (sprite-sheet / fewer requests — the app
   already ships a `dashboard.sprite.png`, but many loose `img/*.png` remain).
3. **Skip-login still pays for login art:** `img/signin/*` and `loadwndw_*` still load because
   `login.lzx`'s intro is built (then destroyed). A production skip-login would drop the
   `login.lzx` include entirely.

---

## Key findings

1. **The dashboard's cheap startup is an illusion of deferral.** Stock = 28.6 k calls (login +
   shells); the real fully-populated dashboard is **136.4 k calls**, hidden behind login + lazy
   instantiation. Forcing it eager exposes the true cost — ~167 ms to build, ~210 ms to paint.
2. **`showdashboard()` is nearly free when content is eager** (1.1 k calls = visibility flips).
   In the stock app this transition is where the deferred tab content would actually build.
3. **Rendering is ~46 ms** (2.7× the calendar) and **all post-`canvas.init`** — paint can't
   start until the tree and its 146 images are ready.
4. **The optimization target is the 146-image burst**, not the JS. JS is already serial and
   unavoidable; the images are the part that would hurt on a real network, and they're
   request-per-view rather than batched.
