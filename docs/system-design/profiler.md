# A profiler for Declare

*Design note, 2026-10-28; built out 2026-10-29 (`runtime/src/profile.ts`, `tools/profile.mjs`,
`tools/internal/profile-mac.mjs`, `drive.profile` and `expect.budget` in
`tools/internal/verify-behave.mjs`, the Inspector's ◉ profile; user doc
`docs/operational/profile.md`). From Claude's proposal after building Pagemap, and DT's
direction: a tool for real apps and for improving the platform.*

## The goal

Someone writing Declare, or an agent, should be able to find out why their program is slow,
or why it won't settle, **in the terms they wrote it in**: classes, attributes, rules,
layouts, `draw()` methods, springs, datasets, source lines. They should never need to know
how the compiler lowers a rule, how the runtime schedules work, or what DOM, CSS or layers
come out the other end.

The test of success: someone who has read only the Declare docs runs one command on a slow
interaction and gets *"this ran 96 times because of that, and here is the Declare way to
write it so it doesn't."*

## Two measures, and which comes first

1. **Counts, by rule.** Declare knows every rule it runs and what it produced, so the
   profiler is **instrumented, not sampled**. Counts are deterministic: they hold across
   machines and can be budgets in a test. Times rank them.
2. **Time to display a frame.** For interactive and live work this is the measure that
   matters (DT, 2026-10-28): how long a frame took, start to finish, through Declare's
   calculation, the browser's (or the Mac host's) style, layout and paint, then raster,
   compositing and the GPU, some of it outside Declare and outside the browser. It is
   **not frame rate**, which the display caps and so hides the margin.

   **It runs to presentation, not submission** (DT, 2026-10-29: in Safari a canvas costs
   nothing until its bitmap is asked of the GPU). Measured, in Safari 27 and in Chrome
   alike: `draw()`'s script only records; the GPU draws later, in another process. 400
   shadowed circles took 0.2 ms of script for a 34 ms frame (Safari) and a 117–183 ms frame
   (Chrome). Ending at submission reported such a frame as 14 ms.

## The model: a turn

A **turn** is one settle: everything that followed from one cause (a press, a key, a tick, a
spring's frame, data arriving). The runtime names the cause (`noteOrigin`, shared with the
wake trace; a Time now names its own ticks). Each turn records:

- the rules that ran — a constraint, a layout's `place()`, a `draw()`, a replication — with
  how often each ran, how often what it produced changed anything, and the time;
- the handlers, the views built (by the program's tag), attached and bound;
- the drawings rasterized;
- the rules the kernel ran natively, as a count.

**Times are exclusive.** Activities nest (a handler builds views; a view's building binds
rules; a layout's pass runs its children's rules), so each is charged only what the ones
inside it did not take, and a turn's parts add up to the turn. Activity before a settle opens
(the handler that caused it, a boot's building) is the turn's *lead*.

## What is built

- **The recorder** (`profile.ts`): one hook in the reactive core (`reactive.ts`
  `profileHook`), and calls where activities happen: `instantiate.ts` (building, binding),
  `view.ts` (attaching, handlers), `time.ts` and `node.ts` (ticks, `afterDelay`), and
  `dom-backend.ts` (rasterizing a drawing). When nothing records, each is one null check.
  Changed or not:
  - a rule changed something if a write it made changed a value;
  - a rule the kernel lands is compared against the cell's value;
  - a drawing handed to its surface counts as a change (`noteEffect`);
  - a rule whose value goes to the page (`Constraint.pushes`: a text style, the
    accessibility tree) is reported as such, never as unchanged.
- **Why**: with `why`, the wake trace records beside the profile. Each turn is tagged with
  the trace's settle, so the report names the writes that opened it, and a rule that re-ran for nothing its
  inputs (its kernel dependencies, named) and the writes that opened its turns.
- **The report**:
  - the costliest turns, with where their time went;
  - rules that re-ran for nothing (≥ 20 runs over ≥ 2 turns, ≥ 80% changing nothing), the
    most time wasted first, those past a millisecond listed in the text;
  - building by class;
  - handlers;
  - drawings;
  - rules by runs, with source lines;
  - what was built;
  - peaks (for budgets);
  - what keeps it from settling: motion, outstanding `afterDelay`s, data loading.
- **Drawings on the GPU** (`measureDrawings`): after recording, each recorded drawing is
  drawn again alone, on a fresh canvas the size of its raster, then a one-pixel readback
  waits for the pixels. Best of four, less an empty canvas's. Fresh each time because a
  canvas read back is moved off the GPU by Chrome (measured: a readback per frame made the
  shadowed frame *faster*, 117 → 25 ms, a different path).
- **Frames, as the page sees them** (any browser, the Inspector, the Mac host): the start
  of every frame while recording (`requestAnimationFrame`). A frame that costs more than the
  display's interval anywhere pushes the next back, so the gaps are what a person sees. The
  slowest are split into Declare's part and the rest.
- **Frames, from Chrome's trace** (`drive.profile`, `declare-profile`): each frame's
  `PipelineReporter` and its stages, matched by id and time (ids are reused), to
  presentation:
  - the main thread, with Chrome's own breakdown, and Declare's settles marked in the
    timeline (`performance.measure`);
  - commit and activation;
  - the display compositor taking the frame and waiting to draw;
  - the GPU drawing it (`StartDrawToSwapStart`);
  - the swap;
  - how busy the GPU process's and the display compositor's threads were meanwhile.

  A frame that waited longer than two intervals while neither was busy waited on nothing of
  the page's. It is counted, and left out of the times.
- **Itemized mode** (the default for `declare-profile`; `--native` turns it off): every rule
  stays off the kernel's native arithmetic path, so each is named.
- **No production profile.** A `declarec --profile` build (production with the bridge
  aboard) was built and removed the same day (DT: a production build by definition has no
  profiling information). Production is development without the developer's checks, so a
  `--native` profile measures what ships. The experiment found that a one-off class (a use
  site with its own declarations, the root `App` among them) was stamped with its base's
  minified JavaScript name; it is now stamped with the program's tag. It also led to the
  development build's blank-raster readback being removed: a readback is a GPU sync, and in
  Chrome it can move a canvas off the GPU, so development drew differently from production.
- **The Mac host** (`declare-profile --mac`): the same profiler over the host's control
  channel (`eval`), plus the host's own frames: commits against the display's budget, a
  commit's own work, Core Animation's commit, and drawings shown (`Bridge.swift`
  `statsReport`), and whether each commit was done before its display-link tick's target
  time (made its frame) or late (shown a frame or more later). On the Mac the program's
  frames follow the display link whatever the commits cost, so the host's commits are the
  truth there. (Commits further apart than the display's interval need not be late: the
  circles change their picture 60 times a second, so on a 120 Hz display they commit every
  12.8 ms on average, every one of them on time.)
- **Budgets**: `expect.budget(profile, { runsPerTurn, built, builtPerTurn, reranForNothing, turnMs,
  frameMs, settled })`.
- **The Inspector**: ◉ profile / ■ stop. It records the subject only: the profile keeps to
  the subject's tree (`only`), and a turn that neither the subject's code opened nor the
  trace saw change the subject is left out. It starts after the settle its own press opens.

Tried on the to-do app, the circles (`my-apps/circles`, plain canvas and Declare), and
Pagemap (unchanged, through its own `checks/flow.mjs`).

## What it found, so far

- **Declare's frames cost the same as a plain canvas's** where the pixels are the same:
  in Safari and in Chrome, 400 shadowed circles and 4000 plain ones ran at the same cadence
  both ways. Declare's cost is in script: at 4000 circles, 5.7 ms a frame (3.5 recording
  `draw()`, 2 replaying it) against 1.5 ms drawing directly. That is invisible at 60 Hz and
  would cost frames at 120 Hz under more load. It is a platform target: record and replay
  could be one pass when nothing else needs the recording.
- **Chrome draws a full circle's shadow fast and a near-circle's slowly**: an arc of 6.283
  radians (short of 2π) made the same picture cost 7× more. With large blurs on a Retina
  display Chrome was 5× slower than Safari (183 against 33 ms).
- **Pagemap**:
  - binding rules are most of building: `PageTile`, 46 of 49 ms;
  - `SectionHead`'s layout rules ran 14,000 times each under the map's glide, 86–99%
    changing nothing;
  - two `afterDelay`s on the toast were still waiting at the end.

## Built since (2026-10-29, the same day)

- **Rule ownership** (`Constraint.owner`, set where a rule takes a slot, `attributes.ts own`,
  and on the drawing, text-style, accessibility and visibility rules). The profile drops
  another tree's rules even inside a shared turn (the Inspector's last leak), and every rule
  says the views it ran on (`on 40 views: app.list.0, …`), so a library class's rule is tied
  to the author's views. A declared slot's default in an included file now keeps its file
  (`library/button.declare:176`, not a bare `line 176` that read as the program's own).
- **Painting, by view** (Chrome's raster): raster tasks counted by layer; the layers mapped
  to elements (the LayerTree protocol) and elements to views (the bridge's `profile.viewOf`),
  with what each declares that costs to paint (a shadow and its blur, a filter, a backdrop,
  opacity, a drawing); and the views that changed meanwhile (style invalidations), likewise
  named. Pagemap's drag ghost, reproduced: the page's own layer re-rasterized 187 tiles in
  1.5 s while `app.ghost` (a shadow, 28 px blur) changed 213 times. That led to the DOM renderer giving
  a view that moves on consecutive frames a layer of its own while it moves (compositing.md
  §4.1 on what stays the same): on a real display (headed Chrome, 120 Hz) the page's raster
  tasks went from ~900 in 3 s to none at the same time to display, and 96 tiles moving at
  once, all promoted, from 1,800 to none, with frame times unchanged. Headless Chrome had
  shown time to display getting worse; it was not so on the display. Moving *under* other
  views it cost frames (each view over it got a layer, and 7–13% of frames never reached
  the screen), so only a view with nothing painted after it is promoted. Safari 27 gained
  less (the main thread's work per frame 2 → 1 ms; no frames missed either way). Checked
  for conformance: the same frame promoted and not is the same picture, and presses land
  on the same views on the DOM and canvas renderers. That check found the canvas
  renderer leaving a moving shadow's faint outer edge behind (its repaint reached one blur
  radius; the shadow shows to 1.5), now fixed.
- **The canvas renderer's drawings**, hooked where its memo rasters them, on the main thread
  or the raster worker.
- **The Mac host's presentation, as far as the host can see it**: whether each commit was
  done before its display-link tick's target time. Whether the window server then showed it
  on time is beyond the host's sight.
- **Why, chained**: for each costly turn, its costliest rule's chain back through the rules
  whose changes woke it to the write that opened the turn, from the wake trace's record of
  which rule changed each value (`why Glyph.draw ran: app.phoneBar.visible (changed by
  View.visible) ← app.width 0 → 320`).

## Next

1. **Record and replay as one pass**, the script cost the circles showed: at 4000 circles,
   5.7 ms a frame against 1.5 drawing directly. A drawing's recording sizes its canvas (its
   bounds), so a single pass needs the size first: from the view's box, for a drawing that
   stays inside it. A runtime change, measured by this profiler.
2. ~~Raster cost by layer, in time~~ — done as far as Chrome allows: each layer's tiles
   and the time recording them, and the GPU process's raster for the page in all. A GPU
   raster call cannot be tied to its tile: no id is shared, and the counts do not pair
   (194 calls for 184 tiles), so pairing by order would charge the wrong layers.

## Decided (DT, 2026-10-29)

- **Turns stay one per settle.** Browsers deliver pointer moves at most once a frame, so a
  drag is a turn a frame already. Repeated causes fold into one line (how many in a row,
  the typical and the worst), which is how a developer reasons about a drag.
- **Times and counts both**, in the default report; counts are the stable measure for
  budgets.
- **Causality stops at `script`.** A turn a callback opens is named by the program's body
  it came from (`a callback in App.onInit (line 4)`), found from the stack once per such
  turn while recording (bodies are named for stacks, expr.ts `bodyLabel`); script code's
  own functions are never named.
