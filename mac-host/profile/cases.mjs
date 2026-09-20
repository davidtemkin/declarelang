// cases — THE performance corpus, written once, measurable on all three
// runtimes: Chrome (DOM and canvas), the native Mac host, and iOS Safari.
//
// WHY THIS FILE EXISTS. The stimuli used to live inside the in-page driver as
// a chain of `if (stim === …)` branches written in browser terms: they
// dispatched DOM `PointerEvent`s at screen coordinates and reached into
// `document`. That is fine in a browser and impossible on the Mac host, which
// has no DOM — so the interactive cases (drag, hover, menus) could only ever be
// measured on two of the three runtimes, and the Mac numbers quietly covered a
// different, smaller set of cases than the Chrome ones.
//
// A case here is DATA: a list of steps from a small vocabulary that every host
// can perform, plus the landmarks the app should record while it runs. Each
// host has an adapter that knows how to perform the vocabulary; the case itself
// says nothing about how a pointer move or a frame happens.
//
//   model steps   call / set / ramp   the app's own verbs and slots. Identical
//                                     on every runtime: in a browser they run
//                                     in the page, on the Mac through the
//                                     control channel's `eval`.
//   input steps   pointer / wheel     a real input, performed the way that host
//                                     performs one: a DOM PointerEvent in a
//                                     browser, `move`/`down`/`up` on the Mac
//                                     control channel (Control.swift), which
//                                     injects a real event into the responder
//                                     chain rather than simulating one.
//   timing steps  wait / frames       wall time, or frames, the host's own.
//
// THE LANDMARK RULE. A case names the app landmarks (meters.ts `mark`) it must
// produce, and the rig REFUSES a comparison where the two trees did not record
// the same ones the same number of times. This is the whole point of the
// app-level marks: a runtime meter cannot tell you that one tree's run applied
// 24 filter keystrokes and the other's applied 20, and without that check a
// pair of settle timings can differ for a reason that has nothing to do with
// the runtime.
//
// A landmark must sit ON THE PATH THE STIMULUS TAKES. Two of these were
// originally placed on the input verb — `tracker`'s `onInput`, `calendar`'s
// `goMode` — while the stimulus writes the slot directly and never calls
// either. A landmark that cannot fire is worse than none: it reads as evidence
// the case ran when it proves nothing. So each one below is placed on the WORK
// the stimulus provokes, and `landmarks` records what a correct run produces.

/** The step vocabulary, and what each host adapter must implement.
 *
 *  call   { call: "app.launcher.newFiles", args: [] }
 *         Invoke an app method. `path` is resolved against the mounted app.
 *  set    { set: "app.mode", to: "week" }
 *         Write one slot.
 *  ramp   { ramp: ["w.wx", "w.wy"], from: […], to: […], ms: 3000, via: "frames" }
 *         Write slots once per frame over a duration — a drag, a scrub, a live
 *         resize. `of` names a receiver resolved once before the ramp starts.
 *  pointer{ pointer: "move" | "down" | "up" | "click", at: [x, y] }
 *         A real input at root coordinates.
 *  sweep  { sweep: [[x,y], …], ms }
 *         A pointer path, one step per frame — hover, a menu-bar sweep.
 *  wait   { wait: 900 }                     wall time
 *  frames { frames: 60 }                    that many host frames
 *  reset  { reset: true }
 *         Zero the meters HERE rather than at the start: the setup a case needs
 *         (opening windows, waiting for data) is not what it measures.
 */

/** Resolve-once receivers a case can name, so a step can address something the
 *  app made at run time (the front window, the scrubber slider). Each is a
 *  pure read against the mounted app and must work on every runtime. */
export const RECEIVERS = {
  frontWin: "app.wm.frontWin",
  scrubber: "__find(app, (n) => n.scrubber)",
};

export const CASES = [
  // ── desktop ───────────────────────────────────────────────────────────────
  {
    name: "desktop:seed",
    app: "apps/desktop/desktop.declare",
    what: "two extra Files windows, then the zoom seed driven 1→60, one write per frame",
    landmarks: { "desktop:newFiles": 2 },
    steps: [
      { call: "app.launcher.newFiles" },
      { call: "app.launcher.newFiles" },
      { wait: 600 },
      { reset: true },
      { ramp: ["app.scaleSeed"], from: [1], to: [60], frames: 60 },
      { wait: 600 },
    ],
  },
  {
    name: "desktop:openclose",
    app: "apps/desktop/desktop.declare",
    what: "a Files window opens (its zoom) and closes (the reverse zoom), four times",
    landmarks: { "desktop:newFiles": 4, "desktop:closeWin": 4 },
    steps: [
      { reset: true },
      ...Array.from({ length: 4 }, () => [
        { call: "app.launcher.newFiles" }, { wait: 900 },
        { call: "app.wm.closeWin", args: ["@frontWin"] }, { wait: 900 },
      ]).flat(),
    ],
  },
  {
    name: "desktop:minimize",
    app: "apps/desktop/desktop.declare",
    what: "the Calendar window minimized to the dock and restored, six times (the genie, 260 ms each way)",
    landmarks: { "desktop:minimize": 6 },
    steps: [
      { call: "app.launcher.byId('calendar').launch", args: [null] },
      // WAIT FOR THE TENANT, not for a clock: the launcher's bounce done, its
      // window front, and the island linked to the mounted child program.
      { until: "app.launcher.byId('calendar') && !app.launcher.byId('calendar').launching && !!app.launcher.byId('calendar').running && !!app.wm.frontWin && app.wm.frontWin.island != null && app.wm.frontWin.island.tenantSink != null",
        timeout: 15000, or: "the calendar did not initialize within 15 s" },
      { wait: 1000 },
      { bind: "w", to: "@frontWin" },
      { reset: true },
      ...Array.from({ length: 6 }, () => [
        { call: "app.wm.minimizeWin", args: ["@w"] }, { wait: 700 },
        { call: "app.wm.focusWin", args: ["@w"] }, { wait: 700 },
      ]).flat(),
    ],
  },
  {
    name: "desktop:drag",
    app: "apps/desktop/desktop.declare",
    what: "the front window moved around a loop, one move per frame",
    // ⚠ THIS MOVES THE WINDOW; IT DOES NOT PRESS ANYTHING. The pointer version
    // was written first and measured, and it does not work in a browser: moves
    // reach the runtime (the hover cases record their transitions), but a
    // synthetic `pointerdown` never starts the drag, because the press path
    // takes pointer capture and Chrome refuses it for a pointer id no real
    // device owns. `dragging` stays false and the window never moves.
    //
    // The Mac COULD do the real thing — `ctl down` injects a true event through
    // the responder chain — and that is exactly why this case does not: a case
    // that exercises the hit walk and the drag claim on one runtime and skips
    // them on the other two is not one case, and the three columns would not be
    // comparable. So every runtime moves the window the same way, and what this
    // measures is the MOVE: layout, damage and paint under continuous geometry
    // change. The input path is not in these numbers on any host.
    landmarks: {},
    steps: [
      { bind: "w", to: "@frontWin" },
      { bind: "x0", to: "@w.wx" },
      { bind: "y0", to: "@w.wy" },
      { reset: true },
      { ramp: ["@w.wx", "@w.wy"], from: ["@x0", "@y0"], to: ["@x0 + 160", "@y0 + 180"], frames: 120, round: true },
      { wait: 400 },
    ],
  },
  {
    name: "desktop:menus",
    app: "apps/desktop/desktop.declare",
    what: "the first menu opens, then the pointer sweeps the bar so each menu opens in turn; click away",
    landmarks: { "desktop:menuOpen": ">=2" },
    steps: [
      { bind: "titles", to: "__menuTitles(app)" },
      { reset: true },
      { pointer: "click", at: "@titles[0]" },
      { wait: 400 },
      { sweep: "@titles", passes: 2, dwell: 250 },
      { pointer: "click", at: "center" },
      { wait: 400 },
    ],
  },
  {
    name: "desktop:hover",
    app: "apps/desktop/desktop.declare",
    what: "a pointer zigzagging over the whole page, one move per frame",
    landmarks: { "hover:enter": ">0", "hover:leave": ">0" },
    steps: [{ reset: true }, { sweep: "zigzag", rows: 9, moves: 120 }, { wait: 400 }],
  },

  // ── tracker ───────────────────────────────────────────────────────────────
  {
    name: "tracker:filter",
    app: "apps/tracker/tracker.declare",
    what: "the query cycled through 24 values — a million issues re-projected each time",
    // The landmark sits on `project`, the work the query provokes, NOT on the
    // text field's `onInput`: the stimulus writes `app.query` and never touches
    // the field.
    landmarks: { "tracker:project": ">=24" },
    steps: [
      { reset: true },
      ...["a", "e", "re", "s", "", "an", "t", "", "o", "in", "", "er",
          "a", "e", "re", "s", "", "an", "t", "", "o", "in", "", "er"]
        .map((q) => [{ set: "app.query", to: q, via: "frame" }, { wait: 110 }]).flat(),
      { wait: 500 },
    ],
  },
  {
    name: "tracker:hover",
    app: "apps/tracker/tracker.declare",
    what: "a pointer zigzagging over the rows",
    landmarks: { "hover:enter": ">0", "hover:leave": ">0" },
    steps: [{ reset: true }, { sweep: "zigzag", rows: 9, moves: 120 }, { wait: 400 }],
  },

  // ── calendar ──────────────────────────────────────────────────────────────
  {
    name: "calendar:mode",
    app: "apps/calendar/calendar.declare",
    what: "month → week → day → month, twice (the grid's springs)",
    // Through the app's own verb, which is what the toolbar calls. The old
    // stimulus wrote `app.mode` directly and bypassed `goMode` entirely — so
    // `selectedId` was never cleared and the case ran a state the app cannot
    // actually be in.
    landmarks: { "calendar:mode": 6 },
    steps: [
      { reset: true },
      ...[0, 1].flatMap(() => ["week", "day", "month"].map((m) => [
        { call: "app.goMode", args: [m], via: "frame" }, { wait: 900 },
      ]).flat()),
    ],
  },

  // ── weather ───────────────────────────────────────────────────────────────
  {
    name: "weather:city",
    app: "apps/weather/weather.declare",
    what: "phone layout: a city page opens and closes, six times (the openT spring)",
    landmarks: { "weather:openRow": 6, "weather:closeCity": 6 },
    steps: [
      { when: "!app.phone", then: [{ set: "app.hostWidth", to: 402 }, { set: "app.hostHeight", to: 874 }, { wait: 1500 }] },
      { bind: "ids", to: "app.cities.map((c) => c.id)" },
      { reset: true },
      ...Array.from({ length: 6 }, (_, i) => [
        { call: "app.openRow", args: [`@ids[${i} % @ids.length]`, 200], via: "frame" }, { wait: 900 },
        { call: "app.closeCity", via: "frame" }, { wait: 900 },
      ]).flat(),
    ],
  },
  {
    name: "weather:resize",
    app: "apps/weather/weather.declare",
    what: "the viewport driven 1280x828 → 1000x640 over 60 frames, then back",
    // THE HOST RESIZES ITS OWN WINDOW where it can: on the Mac this is the
    // control channel's `liveresize`, which moves a real window and exercises
    // the host's resize path; in a browser it is the emulated viewport. Writing
    // `hostWidth`/`hostHeight` is the fallback, and is marked as such in the
    // result so a Mac row is never compared against a poked-slot row.
    landmarks: {},
    steps: [
      { reset: true },
      { resize: { from: [1280, 828], to: [1000, 640], frames: 60 } },
      { wait: 400 },
      { resize: { to: [1280, 828] } },
      { wait: 200 },
    ],
  },

  // ── marketmap ─────────────────────────────────────────────────────────────
  {
    name: "marketmap:slider",
    app: "apps/marketmap/marketmap.declare",
    what: "the day slider dragged left → right over 2.5 s, then the flight spring lands",
    landmarks: { "marketmap:scrub": ">0" },
    steps: [
      { until: "app.market?.ready && app.nDays > 1", timeout: 30000, or: "the market data did not load within 30 s" },
      { bind: "s", to: "@scrubber", or: "no scrubber slider found" },
      { call: "@s.input", args: ["@s.min"] },
      { wait: 1500 },
      { reset: true },
      { ramp: ["@s.input"], from: ["@s.min"], to: ["@s.max"], frames: 150, as: "call", round: true,
        track: "Math.abs(app.targetDay - app.day)" },
      { wait: 1500 },
    ],
  },

  // ── the raster-memo probe ─────────────────────────────────────────────────
  {
    name: "probe:memo",
    app: "test/probe/raster-memo.declare",
    what: "caption moves (promote), hue round trips (re-record), tick bumps (re-record)",
    landmarks: {},
    steps: [
      { reset: true },
      ...Array.from({ length: 6 }, () => [
        { set: "app.cap.x", to: 42 }, { wait: 300 }, { set: "app.cap.x", to: 41 }, { wait: 300 },
        { set: "app.hue", to: 121 }, { wait: 300 }, { set: "app.hue", to: 120 }, { wait: 300 },
        { set: "app.tick", to: "@+1" }, { wait: 300 },
      ]).flat(),
    ],
  },
];

/** Every case, by name. */
export const BY_NAME = Object.fromEntries(CASES.map((c) => [c.name, c]));

/** The cases a given runtime can perform today, and why a case is excluded.
 *  An excluded case is NAMED in the report rather than quietly missing: a
 *  corpus that silently shrinks per host is how the Mac numbers came to cover
 *  fewer cases than the Chrome ones without anyone noticing. */
export function plan(runtime) {
  const out = { runtime, runs: [], skips: [] };
  for (const c of CASES) {
    const needsCanvasProbe = c.name === "probe:memo";
    if (needsCanvasProbe && runtime === "mac") {
      out.skips.push({ name: c.name, why: "the raster memo is a canvas-backend cache; the Mac host does not have one" });
      continue;
    }
    out.runs.push(c.name);
  }
  return out;
}
