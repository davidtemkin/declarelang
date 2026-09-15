// THE FACE TABLE AS A TRACKED READ — the reason a font that lands late redraws.
//
// Every measurement in Declare happens inside a tracked computation: Text's
// auto-size width/height are `bindDerived` constraints, `ascent`/`capHeight`/
// `baseline` are getters that measure through `fontString`, and a flow's wrap,
// clamp and stack all run inside the render that reads them. So the machinery
// for "re-measure and redraw when the font changes" has always been there. The
// one thing missing was that the FACE TABLE — which families actually exist —
// was not a tracked read. A face that landed after boot changed every width in
// the program and invalidated nothing.
//
// This is that read. One `Cell` per family, created only when something
// measures in it (`Cell`'s own pay-per-use rule), tracked by `fontString`, and
// rung by `noteLoadedFaces` when a face for that family registers. Nothing else
// has to know: the constraints that were already reading the measurer re-run,
// the widths change, the layout follows.
//
// Per FAMILY, deliberately, and not one signal for the whole program: a late
// face should re-lay-out the text that asked for it, not the whole app.
//
// What the browser does here is the same invalidation by a different route — it
// marks the elements using that family dirty. It ALSO exposes the arrival as an
// event (`document.fonts.ready`, `loadingdone`), which is a second, parallel
// mechanism app code has to wire up by hand. Declare needs only the one, because
// the measurement is already inside the graph.

import { Cell } from "./reactive.js";

const CELLS = new Map<string, Cell>();

/** The family list as its individual names, lowercased — `"Roboto, Helvetica"`
 *  → `["roboto", "helvetica"]`. A quoted name keeps its spaces. */
function names(family: string): string[] {
  const out: string[] = [];
  for (const raw of family.split(",")) {
    const n = raw.trim().replace(/^["']|["']$/g, "").trim().toLowerCase();
    if (n !== "") out.push(n);
  }
  return out;
}

/** Record that the running computation measured in `family` (a CSS family list;
 *  every name in it counts, since a face landing for ANY of them can change
 *  which one wins). A no-op when nothing is tracking, which is most paints. */
export function trackFamilies(family: string): void {
  for (const n of names(family)) {
    let c = CELLS.get(n);
    if (c === undefined) { c = new Cell(); CELLS.set(n, c); }
    c.track();
  }
}

/** A face for `family` registered: re-measure everything that measured in it.
 *  Safe to call for a family nothing tracked — no Cell exists, so nothing
 *  happens. Nothing needs flushing alongside this: the measurer memoizes
 *  nothing (`textWidth`, `fontMetrics`, `capHeight` and `xHeight` all measure
 *  live), so re-running the constraint is the whole of the invalidation. */
export function familyChanged(family: string): void {
  for (const n of names(family)) CELLS.get(n)?.changed();
  generation++;
  ALL.changed();
}

// ── for a caller that measures in an APPLY, not a compute ───────────────────
// `Constraint` runs its compute with tracking ON and its apply with tracking
// OFF (reactive.ts), which is right: an apply's job is to land a result, not to
// subscribe to whatever it touches on the way. RichText measures its whole flow
// inside its apply (`rebuild`), so the tracked read above never reaches it —
// the flow would keep the widths it measured in the fallback for the life of
// the program. Its render KEY is where it says what makes it different, so the
// face table joins the key: one number, changing whenever any face lands.
//
// Coarser than the per-family read on purpose. A late face is rare, and a flow
// rebuild is cheap next to being silently mis-measured.
let generation = 0;
const ALL = new Cell();

/** A number that changes whenever the face table changes — track it in a render
 *  key when the measuring happens somewhere reads are not tracked. */
export function faceGeneration(): number { ALL.track(); return generation; }

// ── the faces the page has LOADED — for a second realm ──────────────────────
// The raster worker (raster-worker.ts) rasterizes text off the main thread, so it
// must see exactly the faces the page has: each registered face is noted here
// (absolute src, weight, style — the FontFace constructor's own arguments) and
// the worker client replays them, at spawn and as they come and go. Kept in this
// leaf rather than font.ts, so a program that declares no Font never ships that.

/** A face the page has loaded, as a second realm can load it identically. */
export interface LoadedFace { family: string; src: string; weight: string; style: string }
const LOADED_FACES: LoadedFace[] = [];
const LOAD_LISTENERS: ((faces: readonly LoadedFace[]) => void)[] = [];
const UNLOAD_LISTENERS: ((family: string) => void)[] = [];

/** Faces registered: note them for a second realm, and re-measure their family. */
export function noteLoadedFaces(faces: readonly LoadedFace[]): void {
  LOADED_FACES.push(...faces);
  for (const fn of LOAD_LISTENERS) fn(faces);
  for (const f of faces) familyChanged(f.family);
}
/** A family withdrawn (a Font retired, or its source replaced). */
export function noteUnloadedFamily(family: string): void {
  for (let i = LOADED_FACES.length - 1; i >= 0; i--) if (LOADED_FACES[i].family === family) LOADED_FACES.splice(i, 1);
  for (const fn of UNLOAD_LISTENERS) fn(family);
  familyChanged(family);
}
/** Every face loaded so far. */
export function loadedFontFaces(): readonly LoadedFace[] { return LOADED_FACES; }
/** Hear the faces that load LATER. */
export function onFontsLoaded(fn: (faces: readonly LoadedFace[]) => void): void { LOAD_LISTENERS.push(fn); }
/** Hear a family withdrawn. */
export function onFontsUnloaded(fn: (family: string) => void): void { UNLOAD_LISTENERS.push(fn); }
