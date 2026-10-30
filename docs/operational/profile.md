# Profiling — why a program is slow, in the terms it was written in

When something is slow, or a program won't settle, the profiler says which of **your**
rules ran, how often, how often to any effect and how long they took; what each class cost
to build; which write set each costly turn off; what your drawings cost the GPU; and how long
each frame took to reach the screen and where that time went. It names classes, attributes
and source lines, never the runtime's internals.

There are three ways in: the command line, a behaviour script, and the
[Inspector](declare-docs:operational:inspector) while you use the app.

```bash
npx declare-profile app.declare                              # boot, then a second of idle
npx declare-profile app.declare --scenario checks/flow.mjs   # boot, then a behaviour script
npx declare-profile app.declare --phone --scenario checks/phone.mjs
npx declare-profile app.declare --mac --for 5000             # in the Mac host, for five seconds
```

A scenario is an ordinary [`declare-verify`](declare-docs:operational:verify) behaviour
script (`export default async ({ drive, expect }) => { … }`): it drives the program with
real input while the profiler records. `--url` points at your dev server, as for verify;
`--fixtures <dir>` answers the program's requests from files; `--idle <ms>` is how long to
watch after the scenario (what will not settle shows there); `--json` prints the report as
data.

## What it reports

- **The costliest turns.** A *turn* is one settle: everything that followed from one cause,
  which is named (`onClick on Button 'save'`, `Plan 'plan' arrived`, `Time 'clock' ticked`).
  A callback your code handed to a promise, a timer or script code is named by the body it
  came from (`a callback in App.onInit (line 4)`); the profiler never names script code's
  own functions.
  For each one:
  - its time, and how much of it came before the settle (the handler that caused it);
  - **what opened it**: the writes that set it off, with their values
    (`app.selection "a" → "b"`);
  - **where the time went**: rules, handlers, building views, attaching them, binding their
    rules, rasterizing drawings, and the kernel's own steps;
  - **why its costliest rule ran**: the chain back through the rules whose changes woke it,
    to the write that opened the turn (`app.phoneBar.visible (changed by View.visible) ←
    app.width 0 → 320`);
  - the rules that ran in it, and how many changed anything;
  - what it built, by class.
- **Repeated causes.** One cause turn after turn, such as a drag's pointer moves or a
  spring's frames, folded into one line: how many in a row, what a turn of it typically
  cost, the worst one and its turn number, and the rule runs a turn.
- **Re-ran for nothing.** Rules that ran many times, over several turns, and almost never
  changed anything: the commonest cost in a constraint program. Typically every row compares
  itself against one shared value (`{ app.picked == :id }`), which changes for all of them
  while each row's answer changes for few. Each says what it reads, which writes opened its
  turns, and how much time its runs that changed nothing took. Those past a millisecond are
  listed; the rest are counted. Where it costs enough to matter, give each one its own answer
  to read (a field of its record, or an attribute set where the change is made) rather than a
  shared value they all compare against. Whatever holds that answer keeps one writer, as every
  attribute does.
- **Building, by class.** What each class cost to build, attach and bind its rules, exclusive
  of what it holds: a slow screen to open is usually one class here.
- **Handlers, by time.** Their own code, apart from the turns they open.
- **Drawings.** Each view whose `draw()` was rasterized: how often, its size in pixels, the
  script's time, and **the GPU's time to draw it**. That last is measured after the profile,
  by drawing it again, alone on a canvas of its own, and waiting for the pixels. A drawing's
  script only records what to draw. The GPU draws it later, out of the page's sight, and
  that is where its cost to a frame lands. 400 shadowed circles took 0.2 ms of script and
  34 ms (Safari) to 183 ms (Chrome) of a frame.
- **Rules, by runs**, each with its source line and the views it ran on (`on 40 views:
  app.list.0, app.list.1, …`), so a library class's rule says which of your views it is for. A runtime rule (a layout's pass, a
  replication, a measured size) is named by its class and says `(runtime)`. A rule whose
  value goes to the page rather than to a slot (a text style, the accessibility tree) says
  `pushed to the page`, since whether a run changed anything there is not known.
- **What was built**, by class, and what was torn down.
- **Built but hidden.** The views built and kept current while no one sees them, grouped by
  the hidden view that holds them (`12 hidden TaskRow`, `app.addSheet`). A hidden view is
  built, bound and updated like a shown one; a part shown only sometimes costs nothing while
  it is not wanted with `exists = { … }`, which builds it only then.
- **What keeps it from settling**: motion still running, an `afterDelay` still waiting, data
  still loading — each on the view it belongs to.
- **Frames, as the page sees them.** When each new frame began, where there is no Chrome
  trace to read (the Inspector, other browsers). A frame
  that costs more than the display's interval anywhere — script, the browser's work, the GPU
  — pushes the next one back, so the gaps are the cost a person sees. The slowest are split
  into Declare's part and the rest.
- **Painting, by view** (Chrome). The layers the browser re-rasterized most, each named by
  its view (or the page's own layer), and the views that changed meanwhile, with what each
  declares that costs to paint: a shadow and its blur, a filter, a backdrop, opacity, a
  drawing. A view whose look changes every frame (its size, its colour, its drawing)
  repaints the layer it sits in and everything painted there with it. A view that only
  moves, with nothing painted over it, does not: it is given a layer of its own while it
  moves. One moving under other views repaints what it passes under.
- **Frames, from Chrome's trace** (`declare-profile` and `drive.profile`). For each frame,
  the **time to display**: from its start to its presentation on the screen, not frame rate,
  which the display caps. It is split into:
  - the main thread: Declare, style, layout, paint, other script;
  - commit and raster;
  - the display compositor taking the frame;
  - the GPU drawing it;
  - how busy the GPU process and the display compositor were meanwhile.

  How often a new picture reached the screen is given too. A frame that waited while nothing
  of the page's was being done is left out of the times, and counted. Headless Chrome on a
  Mac draws with the real GPU (Metal), so these times carry over.

## Itemized, and as shipped

Arithmetic rules (`{ a + b * 2 }`, `{ app.picked == :id }`) usually run natively in the
kernel, where they can be counted only in total. By default `declare-profile` keeps every rule
in JavaScript, so each is named and counted. The commonest rule that re-runs for nothing is one
of these, so this is what you want for counts. Their times run slower than shipped, and recording which writes
opened each turn costs a little more again (`--no-why` leaves that out). `--native` profiles
as shipped, for true times and frame times.

There is no profile of a production build, and none is needed. Production is development
without the developer's checks (it leaves out a check of hidden views after a settle, and a
runtime accessibility role's contract): the same runtime, the same rules, the same renderers.
A `--native` profile is what ships, with its names and source lines still readable.

## In the Mac host

`--mac` runs the program in the [Mac host](declare-docs:operational:mac-host) for `--for`
milliseconds (3000 by default), in a window of its own in the background. You may use the
window meanwhile. The report is the same, plus **the host's frames**:
- how often it committed a new picture to its layers, against the display's budget;
- **to the screen**: how many commits were done before the frame they were made for was
  due, and how late the rest were (each late one is shown a frame or more later);
- what a commit's own work cost;
- how much went to Core Animation's commit, to showing drawings and to drawing text.

On the Mac a drawing is drawn in the host as it is shown, so its cost is in the commit. The
program's own frames follow the display link whatever the commits cost, so on the Mac it is
the host's frames that say whether a picture was late. Commits further apart than the
display's interval are not late in themselves: a program whose picture changes 60 times a
second commits every other frame of a 120 Hz display. The host must carry the current
runtime: `npm run build:mac` after a runtime change.

## From a behaviour script

```js
export default async ({ drive, expect }) => {
  const p = await drive.profile(async () => {
    await drive.drag("app.board.card", 0, -300);
  });
  console.log(p.text);
  expect.budget(p, { runsPerTurn: 2000, builtPerTurn: 0, reranForNothing: 0, turnMs: 16, settled: true });
};
```

`drive.profile(fn)` records while `fn` runs, then measures the drawings and answers
`{ report, text, frames }`. `drive.profileFromBoot({ itemize, why })` reloads the page with
the profiler armed before the runtime loads, and `drive.profileReport()` stops it and answers.

`expect.budget` holds a profile to limits and fails naming each one passed, and what spent
it. **Counts are the same on every machine**, so they make the steadiest budgets:
- `runsPerTurn`: the most rule runs in one turn;
- `built` and `builtPerTurn`: the views built;
- `reranForNothing`: how many rules may re-run for nothing.

Times hold on the machine they were set on:
- `turnMs`: the costliest turn;
- `frameMs`: the 95th percentile between new pictures reaching the screen.

`settled: true` asks that nothing still moves or waits.

## In the Inspector, or the console

The Inspector's **◉ profile** records while you use the app. **■ stop** puts the report in
its console, opened tall enough to read. It records the app's turns only, not the
Inspector's own. A turn the two share can still show one of the Inspector's rules.

In a page's console (development builds):
- `__declare.profile.start({ why })` starts recording;
- `.stop()` stops it;
- `.measureDrawings()` measures each recorded drawing on the GPU;
- `.report()` and `.text()` answer the report as data and as text.

## Limits

- On the canvas renderer (`?render=canvas`), a drawing it keeps as a raster is counted and
  measured like the DOM renderer's; a small one it draws straight into the scene is part of
  the frame's paint.
- Painting is counted by layer in tiles and in the time spent recording them. The GPU
  process's time rastering them is given for the page in all: Chrome's trace does not say
  which layer each raster was for.
- A profile is a reading: nothing it does changes what the program does. When it isn't
  recording, its whole cost is one check on each of the runtime's busiest paths.
