// host — the render=gpu host for the runtime's retained-layer backend (MacBackend), in the
// compositor worker.
//
// MacBackend (runtime/src/mac-backend.ts) keeps the scene model, hit testing and the
// scroll model in JS, and hands its host a retained layer tree as a stream of ops: one
// commit per frame, geometry as binary records. On the Mac the host is Swift and the
// layers are Core Animation's. Here the host is the engine's (engine/src/host/): it applies
// the ops to its own node tree and draws it. The runtime runs in a worker of its own and
// sends the commits here (remote-host.ts); this file is the host's platform side in the
// compositor worker — what the engine's host asks of it:
//
// - Text lines. A Text is laid out here exactly as the canvas renderer lays it out
//   (canvas-backend paintText): the runtime's own wrapLines/clampLines, the face's ascent plus
//   half the leading for the first baseline, `lineHeight` between lines — all measuring
//   through the same engine-backed measurer the runtime measures with, so the lines a Text was
//   sized for are the lines drawn. The engine names the Texts whose lines are out of date
//   before each frame (`host_text_wanted`) and takes the lines back (`host_text_answer`).
// - A 3D view's projection: the runtime's own homography (projective.ts), which the runtime
//   worker sends for the 3D views this host names (`onThree`).
// - Time: the touch session's physics (the runtime's ScrollPhysics), the display's ticks
//   for glides, the quiet after a wheel.
// - What the page must do (a cursor, a field placed, an island opened), and the scroll
//   facts the runtime hears, which the engine queues and this file hands on.

import { fontString, textWidth, fontMetrics, wrapLines, clampLines } from "../../runtime/dist/measure.js";
import type { Engine } from "../dist/engine.js";
import { resolveFamilies } from "./fonts.js";
import { ScrollPhysics, type ScrollState } from "../../runtime/dist/scroll-physics.js";

/** Mark the frame's phases for Chrome's trace (`?render=gpu&trace`): console.time spans are
 *  recorded with the trace clock, so a profile can split the worker's time precisely. */
export let TRACE = false;
export function setTrace(on: boolean): void { TRACE = on; }

/** Culling on (`?render=gpu&nocull` turns it off, for an A/B). */
let CULL = true;
export function setCull(on: boolean): void { CULL = on; }
/** Damage-limited redraw on (`?render=gpu&nodamage` turns it off, for an A/B). */
let DAMAGE = true;
export function setDamage(on: boolean): void { DAMAGE = on; }
/** Scroll layers on (`?render=gpu&nolayers` turns them off, for an A/B). */
let LAYERS = true;
export function setLayers(on: boolean): void { LAYERS = on; }
/** The change census (`?render=gpu&census`): each frame, what kind of change each changed
 *  view had, for the timing rig. */
let CENSUS = false;
export function setCensus(on: boolean): void { CENSUS = on; }
/** Diagnostic: drawings laid moving are not drawn again once still (`&nosharpen`). */
let NOSHARPEN = false;
export function setNoSharpen(on: boolean): void { NOSHARPEN = on; }
/** Diagnostic only: `?render=gpu&nofrost` skips backdrops; `&imgq=0|1|2` forces images' sampling. */
let NOFROST = false, IMGQ = -1;
export function setDiag(nofrost: boolean, imgq: number): void { NOFROST = nofrost; IMGQ = imgq; }
/** Diagnostic only (`?render=gpu&noclip`): skip box clips' layers — wrong pictures, to measure what clips cost. */
let NOCLIP = false;
export function setNoClip(on: boolean): void { NOCLIP = on; }

/** One frame's census: changed views per kind, then how the changes group (host/mod.rs). */
export type CensusRecord = {
  changed: number; kinds: number[]; placeOnly: number; rigid: number; rigidViews: number; affected: number;
  visited: number; drawn: number; path: "skip" | "fast" | "region" | "whole";
};

/** CSS colour text → 0xRRGGBBAA. */
const colorCache = new Map<string, number>();
export function rgba(css: string | null | undefined): number | null {
  if (css == null) return null;
  const hit = colorCache.get(css);
  if (hit !== undefined) return hit;
  let r = 0, g = 0, b = 0, a = 1;
  const s = css.trim();
  let m: RegExpMatchArray | null;
  if (s[0] === "#") {
    const h = s.slice(1);
    const x = (i: number, n: number) => parseInt(n === 1 ? h[i] + h[i] : h.slice(i, i + 2), 16);
    if (h.length === 3 || h.length === 4) { r = x(0, 1); g = x(1, 1); b = x(2, 1); if (h.length === 4) a = x(3, 1) / 255; }
    else { r = x(0, 2); g = x(2, 2); b = x(4, 2); if (h.length === 8) a = x(6, 2) / 255; }
  } else if ((m = s.match(/^rgba?\(([^)]*)\)$/i)) !== null) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map((v) => v.endsWith("%") ? parseFloat(v) * 2.55 : parseFloat(v));
    [r, g, b] = p; if (p.length > 3) a = m[1].includes("%") && p[3] > 1 ? p[3] / 255 : p[3];
  } else if (s === "transparent") { a = 0; }
  else if (s === "white") { r = g = b = 255; }
  else if (s === "black") { /* 0,0,0 */ }
  const v = ((Math.round(r) & 255) << 24 | (Math.round(g) & 255) << 16 | (Math.round(b) & 255) << 8 | (Math.round(a * 255) & 255)) >>> 0;
  colorCache.set(css, v);
  return v;
}

const WEIGHTS: Record<string, number> = { thin: 100, extralight: 200, light: 300, regular: 400, normal: 400,
  medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };

/** Parse the measurer's font string — `[italic ][small-caps ]weight sizepx families`
 *  (measure.ts fontString) — into what the engine shapes with. */
const fontCache = new Map<string, { families: string; size: number; weight: number; italic: boolean }>();
export function parseFont(font: string): { families: string; size: number; weight: number; italic: boolean } {
  const hit = fontCache.get(font);
  if (hit !== undefined) return hit;
  const m = font.match(/^(italic\s+)?(small-caps\s+)?(\d+)\s+([\d.]+)px\s+(.*)$/);
  // anything else is a CSS font shorthand (a drawing's `font`: "bold 34px Helvetica")
  const css = m === null ? font.match(/^\s*((?:(?:italic|oblique|normal|small-caps|bold|bolder|lighter|[1-9]00|ultra-condensed|condensed|semi-condensed|semi-expanded|expanded)\s+)*)([\d.]+)(px|pt|em|rem)(?:\s*\/\s*[\d.]+\w*)?\s+(.+)$/i) : null;
  let out: { families: string; size: number; weight: number; italic: boolean };
  if (m !== null) out = { families: resolveFamilies(m[5]), size: parseFloat(m[4]), weight: parseInt(m[3], 10), italic: m[1] !== undefined };
  else if (css !== null) {
    let italic = false, weight = 400;
    for (const t of css[1].trim().split(/\s+/)) {
      if (/^(italic|oblique)$/i.test(t)) italic = true;
      else if (/^bold(er)?$/i.test(t)) weight = 700;
      else if (/^lighter$/i.test(t)) weight = 300;
      else if (/^[1-9]00$/.test(t)) weight = parseInt(t, 10);
    }
    const n = parseFloat(css[2]);
    out = { families: resolveFamilies(css[4]), size: css[3] === "pt" ? n * 4 / 3 : css[3] === "px" ? n : n * 16, weight, italic };
  }
  else out = { families: resolveFamilies("system-ui"), size: 13, weight: 400, italic: false };
  fontCache.set(font, out);
  return out;
}

export interface FieldBox {
  x: number; y: number; w: number; h: number;
  clip: { x: number; y: number; w: number; h: number } | null;
  shown: boolean; opacity: number;
}

export interface ShellPort {
  cursor(c: string): void;
  pageFill(c: number | null): void;
  /** How tall the page is, and where a wheel or a finger is the app's (host place_page). */
  pageMap(map: unknown): void;
  /** Scroll the page to `y`, gliding over `ms` (0: at once). */
  pageScrollTo(y: number, ms: number): void;
  edit(id: number, spec: unknown, box: FieldBox | null): void;
  editFocus(id: number, on: boolean): void;
  editSel(id: number, start: number, end: number): void;
  /** A DOMIsland's slot opened ("" closed it) — the page makes its element (shell.ts). */
  island(id: number, slot: string): void;
  /** Where a DOMIsland's element goes on the page. */
  islandBox(id: number, box: FieldBox): void;
  /** An AppIsland named its program ("run:…"): the worker mounts it into the island. */
  appIsland(id: number, slot: string): void;
}

export interface WireFilter { fn: string; v?: number; color?: string; dx?: number; dy?: number; blur?: number }

/** How small a layer can be made: one whose first pass blurs it whole by σ texels is made at
 *  a scale that leaves about 6 to blur (engine Layer); any other at full size. */
export function layerScaleOf(passes: number[]): number {
  if (passes[0] !== 1 || passes[1] <= 6) return 1;
  return Math.max(1 / 64, 6 / passes[1]);
}
/** Lengths in the passes (blur σ, shadow offsets and σ) times `s`: into a smaller layer's texels. */
export function scalePassList(passes: number[], s: number): number[] {
  if (s === 1) return passes;
  const out = passes.slice();
  for (let i = 0; i < out.length;) {
    const kind = out[i];
    if (kind === 1) { out[i + 1] *= s; i += 3; }
    else if (kind === 2) i += 21;
    else if (kind === 3) { out[i + 1] *= s; out[i + 2] *= s; out[i + 3] *= s; i += 5; }
    else if (kind === 4) i += 2;
    else if (kind === 5) i += 12;
    else break;
  }
  return out;
}

/** The filter list as layer passes, lengths scaled to texels by `k`; and how far they reach
 *  (a drawing's filtered ops, drawing.ts; the host's own are engine/src/host/geom.rs). */
export function filterPassList(list: readonly WireFilter[], k: number): { passes: number[]; reach: number } {
  const passes: number[] = [];
  let reach = 0;
  const matrix = (r: number[]) => passes.push(2, ...r);
  // colorize first, as the canvas renderer does (it has no CSS function)
  for (const f of list) if (f.fn === "tint") passes.push(4, rgba(f.color ?? "#000") ?? 0x000000ff);
  for (const f of list) {
    const v = f.v ?? 0;
    switch (f.fn) {
      case "blur": passes.push(1, v * k, 0); reach += v * k * 3; break;
      case "shadow": {
        const sg = ((f.blur ?? 0) * k) / 2;
        passes.push(3, (f.dx ?? 0) * k, (f.dy ?? 0) * k, sg, rgba(f.color ?? "#000") ?? 0x000000ff);
        reach += sg * 3 + Math.max(Math.abs((f.dx ?? 0) * k), Math.abs((f.dy ?? 0) * k));
        break;
      }
      case "brightness": matrix([v, 0, 0, 0, 0, v, 0, 0, 0, 0, v, 0, 0, 0, 0, 1, 0, 0, 0, 0]); break;
      case "contrast": { const o = 0.5 - 0.5 * v; matrix([v, 0, 0, 0, 0, v, 0, 0, 0, 0, v, 0, 0, 0, 0, 1, o, o, o, 0]); break; }
      case "invert": { const s = 1 - 2 * v; matrix([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1, v, v, v, 0]); break; }
      case "opacity": matrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, v, 0, 0, 0, 0]); break;
      case "saturate": case "grayscale": {
        const s = f.fn === "saturate" ? v : 1 - Math.min(1, v);
        matrix([0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0,
                0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0,
                0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0,
                0, 0, 0, 1, 0, 0, 0, 0]);
        break;
      }
      case "sepia": {
        const a = 1 - Math.min(1, v);
        matrix([0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a, 0,
                0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a, 0,
                0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a, 0,
                0, 0, 0, 1, 0, 0, 0, 0]);
        break;
      }
      case "hueRotate": {
        const t = ((f.v ?? 0) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
        matrix([0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0,
                0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283, 0,
                0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0,
                0, 0, 0, 1, 0, 0, 0, 0]);
        break;
      }
    }
  }
  return { passes, reach: Math.ceil(reach) };
}

interface TextStyleWire {
  family: string; size: number; weight: string | number; italic: boolean;
  wrap: boolean; maxLines: number; letterSpacing: number; lineHeight: number;
  textTransform: string | null; pad: [number, number, number, number];
}
/** A style's face and line metrics, as the canvas renderer lays text out. */
interface TextLayout {
  st: TextStyleWire; font: string; families: string; size: number; weight: number; italic: boolean; ls: number;
  ascent: number; lineHeight: number; halfLead: number;
}

type TouchProps = { touches?: { clientX: number; clientY: number }[]; changedTouches?: { clientX: number; clientY: number }[] };

/** How long after a commit the runtime counts as sending them (ms), and how long a tick's
 *  frame then waits for the next (ms). */
const COMMIT_ACTIVE = 50, COMMIT_WAIT = 8;

const raf = (f: () => void): void => {
  const r = (globalThis as { requestAnimationFrame?: (f: () => void) => number }).requestAnimationFrame;
  (r ?? ((g: () => void) => setTimeout(g, 16)))(f);
};

export class GpuHost {
  /** Per frame, for the timing rig (worker.ts stats). */
  constructor(private engine: Engine, private shell: ShellPort, page: { width: number; height: number; dpr: number }) {
    engine.host_init(new Float64Array([CULL ? 1 : 0, DAMAGE ? 1 : 0, LAYERS ? 1 : 0, CENSUS ? 1 : 0, NOSHARPEN ? 1 : 0, NOFROST ? 1 : 0, IMGQ, NOCLIP ? 1 : 0]),
      page.width, page.height, page.dpr, performance.timeOrigin);
  }

  // ── the runtime's commits ─────────────────────────────────────────────────

  /** A commit: the ops (JSON) and `n` geometry records [seq, id, x, y, w, h]. */
  commit(json: string, geoms: Float64Array, n: number): void {
    if (TRACE) console.time("gpu:apply");
    this.engine.host_commit(json, geoms, n);
    if (TRACE) console.timeEnd("gpu:apply");
    this.after();
  }
  /** Engine calls made in the runtime worker (a drawing's recording, through remote-host.ts's
   *  stand-in engine), made here in their order. */
  replay(calls: [string, unknown[]][]): void {
    const e = this.engine as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const [m, a] of calls) {
      try { e[m](...a); } catch (err) { console.error(`[gpu] ${m}:`, err); }
    }
    this.after();
  }
  /** 3D views' projections from the runtime: [id, h0…h8, back hides] (id alone: drawn flat). */
  project(rows: number[][]): void {
    for (const r of rows) this.engine.host_set_projection(r[0], new Float64Array(r.slice(1)));
    this.after();
  }
  /** The 3D views changed: the runtime is told, and answers with their projections. */
  onThree: ((ids: number[]) => void) | null = null;
  private threeKey = "";

  /** The text measurer this worker's layout measures with (measure.ts provideMeasurer). */
  measurer(): unknown {
    const engine = this.engine;
    return {
      font: "13px system-ui",
      letterSpacing: "0px",
      measureText(this: { font: string; letterSpacing: string }, text: string) {
        const f = parseFont(this.font);
        const ls = parseFloat(this.letterSpacing) || 0, t = String(text);
        const r = engine.measure(f.families, f.size, f.weight, f.italic, ls, t);
        // the ink is read from the glyphs' outlines: only when asked (a cap or x height)
        let ink: Float32Array | null = null;
        const inkOf = (): Float32Array => (ink ??= engine.ink(f.families, f.size, f.weight, f.italic, ls, t));
        return { width: r[0], fontBoundingBoxAscent: r[1], fontBoundingBoxDescent: r[2],
          get actualBoundingBoxAscent() { return inkOf()[0]; }, get actualBoundingBoxDescent() { return inkOf()[1]; } };
      },
    };
  }

  // ── what the engine's host asks of the platform, after each call into it ─────

  /** Where the runtime hears what the scroll process moved: rows of
   *  [id, y | null, x | null, scrolling, gesture, bar held] (macScrollFacts). */
  onFacts: ((rows: unknown[][]) => void) | null = null;
  private factsQueued = false;

  private after(): void {
    const sh = this.engine.host_take_shell();
    if (sh !== "") this.toShell(JSON.parse(sh) as unknown[][]);
    if (!this.factsQueued && this.engine.host_has_facts()) {
      this.factsQueued = true;
      queueMicrotask(() => {
        this.factsQueued = false;
        const f = this.engine.host_take_facts();
        if (f !== "") this.onFacts?.(JSON.parse(f) as unknown[][]);
      });
    }
    const w = this.engine.host_take_wants();
    if (w & 1) this.tickSoon();
    if (w & 2) raf(() => this.frame());
    const three = this.engine.host_three();
    const key = three.join(",");
    if (key !== this.threeKey) { this.threeKey = key; this.onThree?.(Array.from(three)); }
    this.frame();
  }

  private toShell(rows: unknown[][]): void {
    for (const r of rows) {
      const id = r[1] as number;
      switch (r[0]) {
        case "pageFill": this.shell.pageFill(r[1] as number | null); break;
        case "pageMap": this.shell.pageMap(r[1]); break;
        case "pageScrollTo": this.shell.pageScrollTo(r[1] as number, r[2] as number); break;
        case "cursor": this.shell.cursor(r[1] as string); break;
        case "editFocus": this.shell.editFocus(id, r[2] === true); break;
        case "editSel": this.shell.editSel(id, r[2] as number, r[3] as number); break;
        case "edit": {
          const spec = r[2] as { style: { family: unknown }; families?: string } | null;
          if (spec != null) {
            const st = spec.style;
            const fam = Array.isArray(st.family) ? st.family.map(String).join(", ") : typeof st.family === "string" ? st.family : "system-ui";
            spec.families = resolveFamilies(fam);
          }
          this.shell.edit(id, spec, r[3] as FieldBox | null);
          break;
        }
        case "editBox": this.shell.edit(id, undefined, r[2] as FieldBox); break;
        case "island": this.shell.island(id, r[2] as string); break;
        case "appIsland": this.shell.appIsland(id, r[2] as string); break;
        case "islandBox": this.shell.islandBox(id, r[2] as FieldBox); break;
      }
    }
  }

  /** Text styles by the engine's number for them, and their layouts (until the fonts change). */
  private styles = new Map<number, TextStyleWire>();
  private layouts = new Map<number, TextLayout>();
  private layoutOf(sid: number, fresh: unknown[]): TextLayout {
    const hit = this.layouts.get(sid);
    if (hit !== undefined) return hit;
    const st = this.styles.get(sid)!;
    const weight = typeof st.weight === "number" ? st.weight : (WEIGHTS[String(st.weight)] ?? (parseInt(String(st.weight), 10) || 400));
    const font = fontString({ fontFamily: st.family, fontSize: st.size, fontWeight: weight, italic: st.italic });
    const p = parseFont(font);
    const fm = fontMetrics(font);
    const lineHeight = st.lineHeight > 0 ? Math.round(st.size * st.lineHeight) : fm.ascent + fm.descent;
    const halfLead = Math.floor((lineHeight - (fm.ascent + fm.descent)) / 2);
    const L = { st, font, families: p.families, size: p.size, weight: p.weight, italic: p.italic, ls: st.letterSpacing || 0,
      ascent: fm.ascent, lineHeight, halfLead };
    this.layouts.set(sid, L);
    fresh.push([sid, L.families, L.size, L.weight, L.italic, L.ls, L.ascent, L.lineHeight, L.halfLead]);
    return L;
  }
  /** The Texts the next frame draws whose lines are out of date: laid out for their width
   *  (measured as the runtime measures), with how far they reach. */
  private layText(): void {
    const want = this.engine.host_text_wanted();
    if (want === "") return;
    const w = JSON.parse(want) as { s: [number, TextStyleWire][]; r: [number, number, number, string][] };
    for (const [sid, st] of w.s) this.styles.set(sid, st);
    const fresh: unknown[] = [], out: unknown[] = [];
    for (const [id, tw, sid, text] of w.r) {
      const L = this.layoutOf(sid, fresh), st = L.st;
      const [pt, pr, pb, pl] = st.pad ?? [0, 0, 0, 0];
      const disp = st.textTransform === "uppercase" ? text.toUpperCase() : st.textTransform === "lowercase" ? text.toLowerCase() : text;
      const maxLines = st.maxLines > 0 ? (st.wrap ? st.maxLines : 1) : 0;
      const wrap = st.wrap || maxLines > 0;
      const lines = wrap && tw > 0 ? clampLines(wrapLines(disp, L.font, tw, L.ls), maxLines, L.font, tw, L.ls) : disp.split("\n");
      // how far the text reaches, for culling (a line wider than its box runs past it)
      let wMax = 0;
      for (const line of lines) wMax = Math.max(wMax, textWidth(line, L.font, L.ls));
      out.push([id, tw, pl + wMax + pr, pt + L.halfLead + lines.length * L.lineHeight + (pb ?? 0) + L.lineHeight, lines]);
    }
    this.engine.host_text_answer(JSON.stringify({ l: fresh, r: out }));
  }

  // ── frames ───────────────────────────────────────────────────────────────────

  /** Paint at the display's next tick if anything changed: changes that land between ticks
   *  (a decoded image, a scroll, a glide, a drawing to sharpen) share that tick's one frame.
   *  While the runtime is sending commits, the tick's frame waits for its commit (at most
   *  COMMIT_WAIT ms) and is drawn with it, once — the deadline Chrome's compositor keeps for
   *  the main thread's frame. */
  frame(): void {
    if (!this.engine.host_dirty() || this.paintQueued) return;
    this.paintQueued = true;
    raf(() => {
      this.paintQueued = false;
      if (!this.engine.host_dirty()) return;
      if (performance.now() - this.lastCommit > COMMIT_ACTIVE) { this.paintNow(); return; }
      this.waiting ??= setTimeout(() => { this.waiting = null; this.paintNow(); }, COMMIT_WAIT);
    });
  }
  private paintQueued = false;
  /** When the last commit arrived, and the tick's frame waiting for the next one. */
  private lastCommit = -Infinity;
  private waiting: ReturnType<typeof setTimeout> | null = null;

  /** A commit's frame: the runtime's flush is its frame, so it is drawn at once (with whatever
   *  else waits for the tick). */
  paintCommit(): void {
    this.lastCommit = performance.now();
    if (this.waiting !== null) { clearTimeout(this.waiting); this.waiting = null; }
    this.paintNow();
  }

  /** Paint now if anything changed. */
  paintNow(): void {
    if (!this.engine.host_dirty()) return;
    this.layText();
    if (TRACE) console.time("gpu:encode");
    this.engine.host_paint();
    if (TRACE) console.timeEnd("gpu:encode");
    this.after();
  }

  resize(width: number, height: number, dpr: number): void {
    this.engine.host_resize(width, height, dpr);
    this.paintNow();
  }

  /** The page shows a DOM field over field `id` (it has focus), or took it away: the canvas
   *  draws the field's text only while none shows. */
  fieldShown(id: number, on: boolean): void {
    this.engine.host_field_shown(id, on);
    this.after();
  }

  /** Views that take a finger, added and removed (worker.ts followTouchClaims). */
  touchClaims(add: number[], remove: number[]): void {
    this.engine.host_touch_claims(new Float64Array(add), new Float64Array(remove));
    this.after();
  }

  /** The page scrolled the window (the root's offset, a whole-page app). */
  pageScroll(y: number): void {
    this.engine.host_page_scroll(y);
    this.after();
  }

  /** A program's font face landed: text the fallback laid out is laid out again. */
  fontsChanged(): void {
    this.layouts.clear();
    this.engine.host_fonts_changed();
    this.after();
  }

  /** A bitmap finished decoding (or a video's frame came): the views showing it redraw. */
  imageLanded(handle: number, w: number, h: number): void {
    this.engine.host_image_size(handle, w, h);
    this.engine.host_image_landed(handle);
    this.after();
  }

  /** The earliest input not yet answered by a frame: its page timestamp (timeOrigin-based). */
  input(ts: number): void { this.engine.host_input(ts); }

  /** Frames, frame times, census and counts, for the timing rig; `clear` starts anew. */
  stats(clear: boolean): { frames: number; log: number[]; timing: number[][]; ops: Record<string, number>;
    counts: Record<string, number>; damage: Record<string, number>; census: CensusRecord[] } {
    return JSON.parse(this.engine.host_stats(clear));
  }

  /** Diagnostic: the nodes whose text holds `text`, each with its chain up to the root. */
  probe(text: string): unknown[] { const s = this.engine.host_probe(text); return s === "" ? [] : JSON.parse(s); }

  // ── the scroll process's input: wheel, bar, touch, and the ticks glides step on ──

  /** Wheel streams' quiet timers, by scroller. */
  private quiet = new Map<number, ReturnType<typeof setTimeout>>();

  /** A wheel at a page point: "claim" when an `onWheel` view nearest under it hears the
   *  stream (the runtime delivers it), "scroll" when a scroller took it here, null when
   *  nothing did. */
  wheel(x: number, y: number, dx: number, dy: number, pinch: boolean, notch = false): "claim" | "scroll" | null {
    const r = this.engine.host_wheel(x, y, dx, dy, pinch, notch);
    // a browser's wheel has no phases: `userScrolling` settles 120 ms after the last delta
    for (let i = 1; i < r.length && r[0] === 2; i++) {
      const id = r[i];
      const t = this.quiet.get(id);
      if (t !== undefined) clearTimeout(t);
      this.quiet.set(id, setTimeout(() => { this.quiet.delete(id); this.engine.host_quiet(id); this.after(); }, 120));
    }
    this.after();
    return r[0] === 1 ? "claim" : r[0] === 2 ? "scroll" : null;
  }

  /** A pointer event, before the program hears it: true when the bar took it (the program
   *  does not hear a press on the bar, nor the drag it starts). */
  barPointer(type: string, p: { clientX?: number; clientY?: number; pointerType?: string }): boolean {
    const took = this.engine.host_bar_pointer(type, Number(p.clientX ?? 0), Number(p.clientY ?? 0), String(p.pointerType ?? ""));
    this.after();
    return took;
  }

  // ── touch: the scroll provider's own session (canvas-backend's ScrollLoop, the runtime's
  // physics — drag, momentum, rubber band) over the pane under an unclaimed finger. A whole-page
  // app's root is the browser's to pan (shell.ts); embedded, or with `&nopagescroll`, the
  // root is a pane like any other. ──

  private touchS: { n: number; physics: ScrollPhysics; started: boolean; x0: number; y0: number; last: number } | null = null;
  /** A finger down whose claim the runtime has not answered yet, with what it did meanwhile. */
  private touchWait: { x: number; y: number; time: number; held: [string, TouchProps, number][] } | null = null;

  /** A touch event, beside the program hearing it. A first finger waits for the runtime's
   *  claim (touchClaim): what the views under it declared decides whether it scrolls. */
  touchEvent(type: string, p: TouchProps, time: number): void {
    const touches = p.touches ?? [];
    if (type === "touchstart") {
      if (touches.length !== 1 || this.touchS !== null || this.touchWait !== null) return;
      this.touchWait = { x: touches[0].clientX, y: touches[0].clientY, time, held: [] };
      return;
    }
    if (this.touchWait !== null) {
      if (type === "touchend" || type === "touchcancel") this.touchWait = null;   // a tap
      else this.touchWait.held.push([type, p, time]);
      return;
    }
    this.touchOn(type, p, time);
  }
  /** The runtime's claim for the finger that went down (the canvas renderer's claimAt): a
   *  view under it that takes touches or drags keeps it from scrolling. */
  touchClaim(claimed: boolean): void {
    const w = this.touchWait;
    if (w === null) return;
    this.touchWait = null;
    if (claimed) return;
    const n = this.engine.host_pane_at(w.x, w.y);
    if (n < 0) return;
    this.engine.host_touch_start(n);
    const [vw, vh, cw, ch, sx, sy] = this.engine.host_scroll_info(n);
    const physics = new ScrollPhysics({ contentWidth: cw, contentHeight: ch, viewportWidth: vw, viewportHeight: vh });
    physics.setContentOffset(sx, sy);
    physics.handleFingerEvent({ type: "down", x: w.x, y: w.y, time: w.time });
    this.touchS = { n, physics, started: false, x0: w.x, y0: w.y, last: w.time };
    for (const [t, p, time] of w.held) this.touchOn(t, p, time);
  }
  private touchOn(type: string, p: TouchProps, time: number): void {
    const touches = p.touches ?? [], changed = p.changedTouches ?? [];
    const ts = this.touchS;
    if (ts === null) return;
    // a finger holding a scrollbar scrubs it (host scroll.rs): the pane does not also pan
    if (this.engine.host_bar_scrubbing()) return;
    if (type === "touchmove") {
      if (touches.length !== 1) return;
      const { clientX: x, clientY: y } = touches[0];
      if (!ts.started) {
        if (Math.abs(x - ts.x0) + Math.abs(y - ts.y0) < 4) return;   // a tap still lands
        ts.started = true;
        this.engine.host_touch_live(ts.n);
      }
      ts.last = time;
      this.touchApply(ts.n, ts.physics.handleFingerEvent({ type: "move", x, y, time }));
      this.after();
      return;
    }
    if (type === "touchend" || type === "touchcancel") {
      if (!ts.started) { this.touchS = null; return; }
      const t0 = changed[0] ?? { clientX: ts.x0, clientY: ts.y0 };
      this.touchApply(ts.n, ts.physics.handleFingerEvent({ type: type === "touchcancel" ? "cancel" : "up", x: t0.clientX, y: t0.clientY, time }));
      ts.last = time;
      this.tickSoon();               // momentum and the spring step on the frames, with the glides
      this.after();
    }
  }
  private touchApply(n: number, st: ScrollState): void {
    this.engine.host_touch_apply(n, st.contentOffsetX, st.contentOffsetY, st.overscrollX, st.overscrollY);
  }
  /** The session after the finger lifts, each frame: momentum, then the spring home. */
  private stepTouch(now: number): boolean {
    const ts = this.touchS;
    if (ts === null || !ts.started) return false;
    const st = ts.physics.isAnimating() ? ts.physics.step(Math.max(1, now - ts.last)) : ts.physics.getState();
    ts.last = now;
    this.touchApply(ts.n, st);
    if (ts.physics.isAnimating() || st.phase === "dragging") return true;
    this.engine.host_touch_end(ts.n);
    this.touchS = null;
    return false;
  }

  /** Glides — a request's own tween — and a touch's momentum step on the worker's animation frames. */
  private ticking = false;
  private tickSoon(): void {
    if (this.ticking) return;
    this.ticking = true;
    raf(() => this.tick());
  }
  private tick(): void {
    this.ticking = false;
    const touching = this.stepTouch(performance.now());
    const gliding = this.engine.host_tick();
    this.after();
    if (gliding || touching) this.tickSoon();
  }
}
