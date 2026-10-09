// Windowing a replication (`virtualize = true`; materialization.md): only the
// records near the viewport have instances, and the list still reads as one
// continuous column of every record. A capability of its own
// (compiler/src/capabilities.ts, "virtualize"): a program that never writes
// `virtualize` replicates fully and carries none of this.
//
// THE LEDGER. Every record has an extent: measured once its row has been built
// (remembered by record identity), estimated until then. A row's place is its
// ledger offset — the sum of the extents above it — so the column is exact
// wherever rows have been measured, and the estimate only decides how far away
// the rest of it is.
//
// ROWS STAY MOUNTED. A record's row, once built, stays where it is while it is
// within reach of the viewport (the viewport, one ahead in the direction of
// travel and half behind, then a viewport's keep either side), and scrolls with
// the page like any other view. Rows are built ahead of the viewport in the
// direction of travel, so they are measured before they are seen. A row that
// falls out of reach is parked and later re-pointed at an arriving record — a
// scrub jumps a screen at a time, so two screens of parked rows serve it — and
// the parked rows are let go once the list has been still for a second. A row
// the user has touched, or that holds the focus, is never parked. A hidden
// list builds nothing new: a list never shown has no rows, and one the user
// has seen keeps the rows it had, so it opens again at once.
//
// KEEPING THE READER'S PLACE. A correction — a row measuring other than its
// estimate, a record arriving above — moves every row below it. When it lands
// above the reader, what is on screen must not move:
//   - at rest (no hand on the scroller), the scroll offset moves with it, in
//     the same settle, before anything is drawn;
//   - while the user scrolls, nothing writes the scroll offset — it would fight
//     the hand, stop a flick's momentum, pull a held thumb. The correction goes
//     into one number instead, the DEVIATION `dev`: every row sits at its ledger
//     offset plus `dev`, so the rows above grow upward, out of view, and the
//     rows on screen stay put. When the scroll ends, `dev` returns to zero and
//     the offset moves by the same amount in one step: nothing on screen moves.
// A correction below the reader needs nothing: rows grow downward, away.
//
// A HELD THUMB keeps the scroll range frozen, so the pointer keeps meaning the
// same place, and its position maps onto the ledger so that the top of the
// track is the first record and the bottom is the last, exactly: each move of
// the thumb covers the remaining ledger distance in proportion to the
// remaining track. Content moves continuously at a rate near 1; `dev` carries
// the difference.
//
// THE 2²⁴ CEILING. Browsers saturate layout near 2²⁵ px, silently. A ledger
// longer than EXTENT_CAP is published compressed: at rest, `dev` pairs the
// physical scroll offset with the ledger proportionally (the thumb reads the
// position in the whole list), and rows near the viewport stay inside the
// physical range. Rows keep their real size; only the range is scaled.
//
// The cap sits BELOW 2²⁴ by a margin: rows within reach of the viewport may
// overhang the published range by up to a viewport, and the scroller's extent
// counts them — and above 2²⁴ a browser that keeps scroll geometry in single
// precision (Chrome) holds only even pixels, so a pane shrinking at the end of a
// compressed list lost a pixel of its extent and moved the rows on screen.

import { View, onDiscard, markWindowedBlock, setRowIndex, markEvicting, fireRetireTree, fireInitTree, clearRetiredTree } from "./view.js";
import { Constraint, Cell, afterSettle } from "./reactive.js";
import { setBound, bindDerived, isSet, ownerOf, release } from "./attributes.js";
import { arriveSubtree } from "./spring.js";
import { heldAtEnd, readsAtEnd } from "./scroll-anchor.js";
import { insetLead } from "./value.js";
import type { Dataset } from "./data.js";
import type { PathNode } from "./select.js";
import type { Surface } from "./backend.js";
import { armTree, focusedWithin, reportInstanceThrow, subtreeDiverged, type Match, type Materialize, type MaterializationDiag } from "./replicate.js";

const DEFAULT_UNIT = 24;      // pre-measurement row-extent estimate (corrected by the first real row)
const POOL_SCREENS = 2;       // parked rows kept for re-pointing, in screens of rows: a jump needs a screen
const POOL_QUIET = 1000;      // ms of stillness before the parked rows are let go
const LOOKAHEAD_PER_PASS = 8; // rows beyond the viewport one pass builds
const JUMP_QUIET = 150;       // ms after a jump before rows ahead are built again
const HAS_FRAMES = typeof (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame === "function";
const EXTENT_CAP = 16_777_216 - 65_536; // 2²⁴, less room for rows overhanging the range

/** Logical-per-physical ratio for a ledger of `logical` extent in a `viewH`
 *  viewport: exactly 1 whenever it fits under the cap. */
function extentScale(logical: number, viewH: number): number {
  if (logical <= EXTENT_CAP) return 1;
  const physicalRange = EXTENT_CAP - viewH;
  return physicalRange > 0 ? (logical - viewH) / physicalRange : 1;
}

/** Per-record extents: an estimate plus a Fenwick tree of the corrections for
 *  measured records, so offset(i) and indexAt(y) are O(log n) and a uniform
 *  collection is plain i × est. Measured extents are kept by record identity
 *  (indices shift as records arrive and leave); the index-keyed tree rebuilds
 *  on a data change. */
class ExtentLedger {
  est = 0;                                  // the per-row estimate (includes the gap)
  private estMeasured = false;
  private n = 0;
  private fen: Float64Array | null = null;  // Fenwick over (h_i − est); 1-based
  private fenTotal = 0;
  private readonly known = new Map<unknown, number>();
  private knownSum = 0;

  /** Has this record's extent been measured (rather than estimated)? */
  has(id: unknown): boolean { return this.known.has(id); }

  /** Remember a measured extent; returns the change at that index. */
  measure(index: number, id: unknown, h: number): number {
    const prev = this.known.get(id);
    if (prev === h) return 0;
    this.known.set(id, h);
    this.knownSum += h - (prev ?? 0);
    const d = h - (prev ?? this.est);
    this.update(index, d);
    return d;
  }

  /** Has the measured mean drifted far enough from the estimate that the
   *  unmeasured majority is mis-sized? */
  shouldRebaseline(): boolean {
    if (this.known.size === 0) return false;
    if (!this.estMeasured) return true;
    const mean = this.knownSum / this.known.size;
    return Math.abs(mean - this.est) > Math.max(1, this.est * 0.2);
  }

  rebuild(ids: readonly unknown[], fallbackEst: number): void {
    this.n = ids.length;
    if (this.known.size > 0) {
      const mean = this.knownSum / this.known.size;
      if (!this.estMeasured || Math.abs(mean - this.est) > this.est * 0.2) this.est = mean;
      this.estMeasured = true;
    }
    if (this.est === 0) this.est = fallbackEst;
    this.fen = null;
    this.fenTotal = 0;
    for (let i = 0; i < ids.length; i++) {
      const h = this.known.get(ids[i]);
      if (h !== undefined && h !== this.est) this.update(i, h - this.est);
    }
  }

  private update(index: number, delta: number): void {
    if (delta === 0 || index < 0 || index >= this.n) return;
    if (this.fen === null) this.fen = new Float64Array(this.n + 1);
    for (let i = index + 1; i <= this.n; i += i & -i) this.fen[i] += delta;
    this.fenTotal += delta;
  }

  private prefix(index: number): number {
    if (this.fen === null) return 0;
    let s = 0;
    for (let i = Math.min(index, this.n); i > 0; i -= i & -i) s += this.fen[i];
    return s;
  }

  /** The top of row `index`, block-local. */
  offset(index: number): number { return index * this.est + this.prefix(index); }
  total(): number { return this.n * this.est + this.fenTotal; }

  /** The row whose span contains block-local `y` (clamped). */
  indexAt(y: number): number {
    if (this.n === 0) return 0;
    if (this.fen === null) return Math.max(0, Math.min(this.n - 1, Math.floor(y / this.est)));
    let lo = 0, hi = this.n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.offset(mid) <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
}

/** What a windowed block needs from its Replicator. */
export interface WindowHost {
  readonly parent: View;
  readonly inited: Set<unknown>;
  idOf(item: unknown): unknown;
  kindAt(m: Match, i: number): string;
  kindOf(v: View): string;
  build(kind: string): ReturnType<Materialize>;
  /** The child index where the block starts. */
  start(): number;
  /** The last visible View before the block: its rows start below it. */
  leadingAnchor(): View | null;
}

export type WindowingFactory = (host: WindowHost) => Windowing;
export function createWindowing(host: WindowHost): Windowing { return new Windowing(host); }

interface Row { view: View; index: number; aria?: number }

/** A windowed block: the mounted rows, the ledger, and the reader's place. */
export class Windowing {
  /** Mounted rows by record identity. */
  private readonly rows = new Map<unknown, Row>();
  /** Parked rows: clean, hidden, waiting to be re-pointed. */
  private readonly pool: View[] = [];
  /** Every child the block owns, mounted and parked, in child order. */
  private owned: View[] = [];
  private readonly ledger = new ExtentLedger();
  private ledgerIds: readonly unknown[] | null = null;
  private items: readonly unknown[] = [];
  private arrayPath: readonly string[] | null = null;
  private data: Dataset | null = null;
  active = false;
  private unit = 0;
  private measured = false;
  private gap = 0;
  private leading = 0;
  /** The deviation: every row sits at its ledger offset plus this. */
  private dev = 0;
  /** A held thumb's mapping: the physical and ledger positions it last paired. */
  private hand: { p: number; l: number; lEnd: number; pLo: number } | null = null;
  /** The ledger position of the viewport's top at the last pass, and the way it went. */
  private lastL: number | null = null;
  /** When the viewport last jumped by more than a screenful. */
  private jumpedAt = -1e9;
  /** Where the reader's member sat below the viewport's top when the reader
   *  last moved, and the offset a correction last wrote (its echo is not a move). */
  private anchorVis = 0;
  private wrote: number | null = null;
  /** The reader is at the end (the last record in view): held there exactly. */
  private atEnd = false;
  private endBooked = false;
  private lastViewH = -1;
  private endRuns = 0;
  /** How far past the viewport's edge, in the direction of travel, rows count as in view (px). */
  private lead = 0;
  /** The physical position the last pass saw (a jump is told from a scroll by it). */
  private lastP: number | null = null;
  private travel = 1;
  /** The member the reader's place is kept by: a correction above it is absorbed. */
  private anchor: { id: unknown; index: number } | null = null;
  /** The build range the match chose (logical indices, inclusive start, exclusive end). */
  private from = 0;
  private to = 0;
  private keepRows = 0;
  /** The rows in view at the last match. */
  private inViewFrom = 0;
  private inViewTo = -1;
  /** Rows from this index on lie past a held thumb's frozen range, which
   *  ends at `reach` in ledger coordinates (Infinity when no thumb is held). */
  private limit = 0;
  private reach = Infinity;
  private bar = false;
  private heightOwner: Constraint | null = null;
  private published = 0;
  /** Wakes the pass when rows it built can be measured. */
  private readonly measureCell = new Cell();

  constructor(private readonly host: WindowHost) {
    onDiscard(host.parent, () => { this.dropHeightOwner(); if (this.drainTimer !== null) clearTimeout(this.drainTimer); });
  }

  // ── the window API (replicate.ts' kernel window door) ──────────────────

  realized(): { view: View; index: number }[] {
    return [...this.rows.values()].sort((a, b) => a.index - b.index).map((r) => ({ view: r.view, index: r.index }));
  }

  /** Scroll so the record at `index` is at the top of the viewport. */
  navigateTo(index: number): void {
    const sc = this.findScroller();
    if (sc === null) return;
    sc.scrollY = Math.max(0, this.offsetTo(sc) + this.leading + this.ledger.offset(index) + this.dev);
  }

  info(logical: number): Pick<MaterializationDiag, "materialized" | "retained" | "unit" | "extent"> {
    let retained = 0;
    for (const r of this.rows.values()) if (r.index < this.from || r.index >= this.to) retained++;
    return { materialized: this.rows.size - retained, retained, unit: this.unit, extent: logical > 0 ? (this.measured ? "measured" : "predicted") : null };
  }

  /** The block's last child — the next block's anchor. */
  last(): View | null { return this.owned.length > 0 ? this.owned[this.owned.length - 1] : null; }

  /** Engaging from full replication: its instances become mounted rows. */
  adopt(views: readonly View[], items: readonly unknown[]): void {
    views.forEach((v, i) => this.rows.set(this.host.idOf(items[i]), { view: v, index: i }));
    this.owned = [...views];
    // the full block's records are the ones it last built: when the data
    // changed in the same update (the match has already read the new
    // membership), each row finds its record's new place, or retires
    if (this.ledgerIds !== null) this.reindex(this.ledgerIds);
  }

  /** Disengaging: give the geometry back, discard the parked rows, and hand
   *  the mounted rows (in record order) to full replication. */
  release(): { views: View[]; items: unknown[] } {
    const parent = this.host.parent;
    this.dropHeightOwner();
    parent.$setVirtualExtent(null);
    parent.$surface?.setRowCount?.(null);
    this.ariaCount = -1;
    for (const v of this.pool.splice(0)) { markEvicting(v); parent.removeChild(v); v.discard(); }
    const sorted = this.realized();
    for (const { view } of sorted) { setBound(view, "y", 0); view.$surface?.setRowIndex?.(null); }
    this.rows.clear();
    this.owned = [];
    this.active = false;
    this.dev = 0;
    this.hand = null;
    markWindowedBlock(parent, false);
    return { views: sorted.map((r) => r.view), items: sorted.map((r) => this.items[r.index]) };
  }

  // ── the match: the tracked half ───────────────────────────────────────

  /** Is the list, and everything it sits in, visible? */
  private shownChain(): boolean {
    for (let v: unknown = this.host.parent; v instanceof View; v = v.parent) if (!v.visible) return false;
    return true;
  }
  private hidden = false;
  /** Parked rows kept, in rows (two screens' worth), and when the reader last moved. */
  private poolCap = 8;
  private movedL: number | null = null;
  private movedAt = 0;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;

  /** The parked rows let go: a list at rest keeps only the rows in reach. */
  private dropPool(): void {
    if (this.pool.length === 0) return;
    const parent = this.host.parent;
    const gone = new Set<View>(this.pool.splice(0));
    for (const v of gone) { markEvicting(v); parent.removeChild(v); v.discard(); }
    this.owned = this.owned.filter((o) => !gone.has(o));
    parent.$childrenMutated();
  }
  /** Still for a second: let the parked rows go (a pass, so the tree changes inside an update). */
  private drainWhenStill(): void {
    if (this.pool.length === 0) return;
    const still = (typeof performance !== "undefined" ? performance.now() : 0) - this.movedAt;
    if (still >= POOL_QUIET) { this.dropPool(); return; }
    if (this.drainTimer !== null) return;
    this.drainTimer = setTimeout(() => { this.drainTimer = null; this.measureCell.changed(); }, POOL_QUIET - still);
  }

  findScroller(): View | null {
    for (let v: unknown = this.host.parent; v instanceof View; v = v.parent) {
      const ax = v.scrolls;
      if (ax === "y" || ax === "both") return v;
    }
    return null;
  }

  /** Where the rows' own coordinates start in the scroller's content: the
   *  parent's top padding and each box's place up the chain (the scroll
   *  anchor's topIn, the same sum). */
  private offsetTo(scroller: View): number {
    let off = this.rowsLead();
    for (let v: unknown = this.host.parent; v instanceof View && v !== scroller; v = v.parent) off += v.y + v.$positionLead("y");
    return off;
  }
  private rowsLead(): number {
    const p = (this.host.parent as unknown as { padding?: unknown }).padding;
    return p === undefined || p === 0 ? 0 : insetLead(p as Parameters<typeof insetLead>[0], "y");
  }
  /** The room below the last row: what follows the rows in their parent
   *  (`trailing`), then the parent's bottom padding. */
  private rowsTrail(): number {
    return this.trailing.room + Math.max(0, ((this.host.parent as unknown as { insetY?: number }).insetY ?? 0) - this.rowsLead());
  }

  /** What the parent stacks after the rows (a "loading more…" line, a footer):
   *  the stack's pass stands down while windowing places the block, so these
   *  are placed here, after the last row, and their room joins the extent.
   *  Tracked: their sizes, their visibility, and the parent's child list (one
   *  arriving or leaving) wake the match. */
  private trailing: { views: View[]; room: number } = { views: [], room: 0 };
  private trailingSiblings(gap: number): { views: View[]; room: number } {
    const parent = this.host.parent;
    parent.$watchChildList();
    const mine = new Set<View>(this.pool);
    for (const r of this.rows.values()) mine.add(r.view);
    const views: View[] = [];
    let room = 0;
    const kids = parent.children;
    for (let i = kids.length - 1; i >= 0; i--) {
      const c = kids[i];
      if (!(c instanceof View)) continue;
      if (mine.has(c) || i < this.host.start()) break;
      if (!c.visible || c.ignoreLayout === true) continue;
      views.unshift(c);
      room += gap + c.height;
    }
    return { views, room };
  }

  /** The rows' whole extent: each row's span carries the gap after it, and
   *  the last row has none (a stack spaces between its children). */
  private span(): number {
    return this.items.length > 0 ? this.ledger.total() - this.gap : 0;
  }

  /** Move the rows by `d` without moving them on screen (see the header). */
  private absorb(d: number, sc: View): void {
    if (d === 0) return;
    // an end pane at its end is placed by its anchor — unless the hand has
    // just taken it away from the end (the anchor learns that a settle later)
    if (heldAtEnd(sc) && (sc.scrolling !== true || sc.scrollY >= sc.contentHeight - sc.height - 4)) return;
    if (sc.scrolling === true) {
      this.dev -= d;
      if (this.hand !== null) this.hand.l += d;
    } else setBound(sc, "scrollY", Math.max(0, Math.round(sc.scrollY + d)));   // whole pixels: an engine that truncates a fraction would bias every correction one way
  }

  match(data: Dataset, arr: readonly unknown[], arrayPath: readonly string[], dataChanged: boolean, scroller: View, gap: number): Match {
    const host = this.host;
    this.gap = gap;
    this.data = data;
    this.arrayPath = arrayPath;
    this.items = arr;
    const n = arr.length;
    let y = scroller.scrollY;
    const viewH = scroller.height;
    const offset = this.offsetTo(scroller);
    this.measureCell.track();
    // a mounted row changing height (a card springing open, a picture
    // arriving) re-runs the pass, so the rows below follow it
    for (const r of this.rows.values()) void r.view.height;
    const scrolling = scroller.scrolling === true;
    this.bar = scrolling && scroller.$surface?.scrollbarHeld?.() === true;
    const probe = this.rows.values().next().value?.view;
    const h = probe !== undefined ? probe.height + gap : 0;
    if (h > gap) this.measured = true;
    this.unit = h > gap ? h : this.unit > 0 ? this.unit : DEFAULT_UNIT + gap;

    // a new membership: the ledger re-seats its corrections, and the reader's
    // member, if it moved (records arriving above it), takes the view along
    if (dataChanged || this.ledgerIds === null || this.ledger.shouldRebaseline()) {
      const ids = dataChanged || this.ledgerIds === null ? arr.map((v) => host.idOf(v)) : this.ledgerIds;
      const was = this.anchor !== null && this.ledgerIds !== null ? this.ledger.offset(this.anchor.index) : null;
      if (dataChanged) this.reindex(ids);
      this.ledger.rebuild(ids, this.unit);
      this.ledgerIds = ids;
      if (was !== null && this.anchor !== null && this.anchor.index >= 0) {
        const before = scroller.scrollY;
        this.absorb(this.ledger.offset(this.anchor.index) - was, scroller);
        y += scroller.scrollY - before;
      }
    }
    // hidden — the list, or anything it sits in: nothing of it is on screen, so
    // it builds nothing new and keeps its place (the reader's member, the
    // offset, the heights measured) and the rows it has; shown again, the range
    // is completed where it was, in the same update. (The visibility read is
    // tracked: showing wakes it.)
    this.hidden = !this.shownChain();
    if (this.hidden) {
      this.from = this.to = 0;
      this.inViewFrom = 0;
      this.inViewTo = -1;
      return { data, nodes: [], items: arr, arrayPath, logical: n, start: 0, unit: this.unit, windowed: true, dataChanged, leading: this.leading };
    }
    const lead = host.leadingAnchor();
    this.leading = lead !== null ? lead.y + lead.height + gap : 0;
    this.trailing = this.trailingSiblings(gap);
    const total = this.span();
    const lEnd = Math.max(0, total + this.rowsTrail() - viewH);
    const scale = extentScale(total, viewH);
    // an end pane whose reader is at its end (scroll-anchor.ts) is read there:
    // its rows are the ones to build, not those at the offset it is leaving
    if (!scrolling && readsAtEnd(scroller)) y = offset + this.leading + this.dev + lEnd;
    const pRel = y - offset - this.leading;         // how far the scroller is into the rows (below 0: the room above them)

    if (this.bar) {
      // the thumb's mapping: the rest of the ledger in proportion to the rest of the track
      const pLo = -(offset + this.leading);
      const pMax = Math.max(0, scroller.contentHeight - viewH - offset - this.leading);
      const w = this.hand ??= { p: pRel, l: pRel - this.dev, lEnd, pLo };
      if (pRel < w.p) w.l = w.p > pLo ? pLo + (w.l - pLo) * ((pRel - pLo) / (w.p - pLo)) : pLo;
      else if (pRel > w.p) w.l = pMax > w.p ? w.l + (lEnd - w.l) * Math.min(1, (pRel - w.p) / (pMax - w.p)) : lEnd;
      w.p = pRel;
      // held at an end of the track, it stays the end of the ledger as rows
      // near it measure
      if (pRel >= pMax - 0.5) w.l = lEnd;
      else if (pRel <= pLo + 0.5) w.l = pLo;
      w.l = Math.min(lEnd, Math.max(pLo, w.l));
      w.lEnd = lEnd;
      w.pLo = pLo;
      this.dev = pRel - w.l;
    } else if (this.hand !== null) {
      // let go at an end: the end, exactly — of the ledger as it is now
      const w = this.hand;
      this.hand = null;
      if (w.l >= w.lEnd - 0.5) this.dev = pRel - lEnd;
      else if (w.l <= w.pLo + 0.5) this.dev = pRel - w.pLo;
    } else if (scale !== 1 && this.lastP !== null && Math.abs(pRel - this.lastP) > viewH) {
      // compressed, a jump (the track clicked, the offset set) lands where
      // the thumb says, in proportion — not one row-pixel per track-pixel
      this.dev = pRel - Math.min(lEnd, Math.max(0, pRel) * scale);
    }
    if (!scrolling && scale !== 1 && y >= scroller.contentHeight - viewH - 1) {
      // compressed and at the end of the range: the end of the ledger, exactly
      // (the proportional pairing would land it a rounding short)
      this.dev = pRel - lEnd;
    } else if (!scrolling) {
      // at rest: the deviation settles into the scroll offset in one step
      // (zero below the cap; compressed, the pairing that maps the thumb)
      const l = pRel - this.dev;
      const settled = scale === 1 ? 0 : l / scale - l;
      if (Math.abs(settled - this.dev) >= 0.5) {
        // a whole-pixel offset, its fraction kept in the deviation: an engine
        // that rounds the offset would otherwise move the rows on screen
        const want = Math.max(0, y + settled - this.dev);
        y = Math.round(want);
        setBound(scroller, "scrollY", y);
        this.dev = settled + (y - want);
      }
    }
    this.lastP = y - offset - this.leading;
    const l = this.lastP - this.dev;                   // the viewport's top, in ledger coordinates

    // the build range: the viewport, one ahead in the direction of travel and
    // half a viewport behind
    if (this.lastL !== null && l !== this.lastL) this.travel = l < this.lastL ? -1 : 1;
    // a jump (more than a screenful since the last pass): rows ahead would be
    // left behind by the next one — build what is in view, the rest once the
    // motion slows
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (this.lastL !== null && Math.abs(l - this.lastL) > viewH) this.jumpedAt = now;
    // the lead: a scroll the browser runs on its own thread carries the content
    // on between passes — a fast fling moves a third of a screen a frame, and
    // further when a frame runs long — so the rows that far past the edge it
    // moves toward are as good as in view (twice the last step covers a frame
    // missed; a step past a screenful is a jump, which no lead would cover)
    if (this.lastL !== null && l !== this.lastL) { const step = Math.abs(l - this.lastL); this.lead = step <= viewH ? Math.min(1.5 * viewH, 2 * step) : 0; }
    // (a scrub is a run of jumps; without frames — a headless host — there is no run to wait out)
    const jumping = HAS_FRAMES && now - this.jumpedAt < JUMP_QUIET;
    this.jumping = jumping;
    this.lastL = l;
    const first = this.ledger.indexAt(Math.max(0, l));
    let from = this.ledger.indexAt(Math.max(0, l - viewH * (this.travel < 0 ? 1 : 0.5)));
    let to = Math.min(n, this.ledger.indexAt(Math.max(0, l + viewH * (this.travel > 0 ? 2 : 1.5))) + 1);
    // under a held thumb the range is frozen: a row past its end could not be
    // reached, and the browser would count it in the range anyway — none is
    // built there, and none is kept
    this.limit = n;
    this.reach = Infinity;
    if (this.bar) {
      const reach = this.reach = scroller.contentHeight - offset - this.leading - this.rowsTrail() - this.dev;
      const k = this.ledger.indexAt(Math.max(0, reach));
      this.limit = this.ledger.offset(k + 1) <= reach + 0.5 ? k + 1 : k;
      to = Math.min(to, this.limit);
    }
    from = Math.min(from, to);
    this.from = from;
    this.to = to;
    this.inViewFrom = Math.min(first, Math.max(0, n - 1));
    this.inViewTo = Math.min(this.ledger.indexAt(Math.max(0, l + viewH)), Math.max(0, n - 1));
    this.keepRows = Math.ceil(viewH / Math.max(1, this.ledger.est));
    this.poolCap = Math.max(8, Math.ceil((POOL_SCREENS * viewH) / Math.max(1, this.ledger.est)));
    if (l !== this.movedL) { this.movedL = l; this.movedAt = now; }
    // the reader's member: the first row wholly in view (a row across the top
    // edge is above it, and grows upward, out of view), and the first record
    // whenever it is in view, so a correction never pushes the start down
    // The reader's own correction landing (its write, then the engine's echo,
    // less a fraction where it holds offsets to whole pixels) is not the
    // reader moving: the member and where it sat stay as they were.
    const own = !dataChanged && this.anchor !== null && this.wrote !== null && Math.abs(y - this.wrote) < 1;
    if (!own) {
      const whole = this.ledger.offset(first) < l - 0.5 ? first + 1 : first;
      const at = n === 0 ? -1 : first <= 0 ? 0 : Math.min(n - 1, whole);
      this.anchor = at >= 0 ? { id: host.idOf(arr[at]), index: at } : null;
      if (this.anchor !== null) this.anchorVis = this.ledger.offset(this.anchor.index) - l;
      this.wrote = null;
    }
    // the end, the bottom's twin of the first record: a reader at the end with
    // the last record in view stays at the end, exactly, as estimates there
    // resolve into real heights — the full build never had estimates, and its
    // end never moved. A viewport changing size is not that: the pane keeps
    // its top, as the full build's does — unless it grew with the end already
    // in view: the full build's offset is clamped to the end then, and so is this.
    const endGap = this.ledger.offset(n) - gap - (l + viewH);   // how far below the viewport the last row ends
    // (within 2 px: a rounding of the offset, never a reader's choice)
    const steady = viewH === this.lastViewH && y >= scroller.contentHeight - viewH - 2 && endGap <= 2;
    const grew = this.lastViewH > 0 && viewH > this.lastViewH && endGap <= 2;
    this.atEnd = n > 0 && first > 0 && !scrolling && (steady || grew);
    this.lastViewH = viewH;
    // what this pass builds: every row in view (and a row or two past its
    // edges), then a few more of the range, nearest the viewport first and
    // ahead of travel first — the rest fills in over the next frames, so a
    // first load or a jump costs a screenful, not the whole reach
    const nodes: PathNode[] = [];
    const add = (i: number): void => { nodes.push({ path: [...arrayPath, String(i)], value: arr[i] }); };
    const leadFrom = this.travel < 0 ? this.ledger.indexAt(Math.max(0, l - this.lead)) : this.inViewFrom;
    const leadTo = this.travel > 0 ? this.ledger.indexAt(Math.max(0, l + viewH + this.lead)) : this.inViewTo;
    const vFrom = Math.max(from, leadFrom - 2), vTo = Math.min(to, leadTo + 3);
    for (let i = vFrom; i < vTo; i++) add(i);
    const aheadDown = this.travel >= 0;
    let budget = jumping ? 0 : LOOKAHEAD_PER_PASS;
    this.unfilled = false;
    for (let d = 0; vTo + d < to || vFrom - 1 - d >= from; d++) {
      for (const i of aheadDown ? [vTo + d, vFrom - 1 - d] : [vFrom - 1 - d, vTo + d]) {
        if (i < from || i >= to || this.rows.has(host.idOf(arr[i]))) continue;
        if (budget-- > 0) add(i); else this.unfilled = true;
      }
    }
    return { data, nodes, items: arr, arrayPath, logical: n, start: from, unit: this.unit, windowed: true, dataChanged, leading: this.leading };
  }

  /** A new membership: each mounted row's record finds its index; a row whose
   *  record left is retired. The init set keeps only members. One scan. */
  private reindex(ids: readonly unknown[]): void {
    const found = new Map<unknown, number>();
    const wanted = new Set<unknown>([...this.rows.keys(), ...this.host.inited]);
    if (this.anchor !== null) wanted.add(this.anchor.id);
    for (let i = 0; i < ids.length; i++) if (wanted.has(ids[i]) && !found.has(ids[i])) found.set(ids[i], i);
    for (const id of this.host.inited) if (!found.has(id)) this.host.inited.delete(id);
    if (this.anchor !== null) {
      const i = found.get(this.anchor.id);
      this.anchor = i === undefined ? null : { id: this.anchor.id, index: i };
    }
    for (const [id, r] of this.rows) {
      const i = found.get(id);
      if (i !== undefined) { r.index = i; continue; }
      this.rows.delete(id);
      fireRetireTree(r.view);
      if (this.pool.length < this.poolCap && !subtreeDiverged(r.view) && !focusedWithin(r.view)) { clearRetiredTree(r.view); this.park(r.view); }
      else this.drop(r.view);
    }
  }

  // ── the reconcile: the apply half ─────────────────────────────────────

  reconcile(m: Match): void {
    // A row's init can settle the tree, and that settle can wake this block
    // again: the pass in progress finishes first, and the block runs once more.
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    try { this.pass(m); } finally { this.busy = false; }
    if (this.again) { this.again = false; this.measureCell.changed(); }
  }
  private busy = false;
  private again = false;

  private pass(m: Match): void {
    const host = this.host, parent = host.parent;
    const sc = this.findScroller();
    if (!this.active) { this.active = true; markWindowedBlock(parent, true); }
    const data = this.data;
    const path = this.arrayPath ?? [];
    const pointed = new Set<View>();
    // rows whose index moved (a data change) take their new place's cursor
    if (m.dataChanged && data !== null) {
      for (const r of this.rows.values()) {
        const cursor = data.$cursorAt([...path, String(r.index)]);
        if (r.view.datapath !== cursor) { setBound(r.view, "datapath", cursor); setRowIndex(r.view, r.index); pointed.add(r.view); }
      }
    }
    if (this.hidden) {
      // hidden: the rows already built stay — a pane the user left opens again
      // at once — and only the parked ones go; nothing new is built
      this.dropPool();
      const base = this.leading + this.dev;
      for (const r of this.rows.values()) setBound(r.view, "y", base + this.ledger.offset(r.index));
      this.publish(Math.min(EXTENT_CAP, this.leading + this.span() + this.trailing.room + this.dev + ((parent as unknown as { insetY?: number }).insetY ?? 0)));
      return;
    }

    // measure: each mounted row's extent, a correction above the reader absorbed
    let moved = false, above = 0;
    for (const [id, r] of this.rows) {
      if (pointed.has(r.view)) { moved = true; continue; }
      const h = r.view.height + this.gap;
      if (h <= this.gap) continue;
      const estimated = !this.ledger.has(id);
      const d = this.ledger.measure(r.index, id, h);
      if (d !== 0) {
        moved = true;
        if (this.anchor !== null && r.index < this.anchor.index) above += d;
        // a real change of a row already measured (a picture arriving): the
        // end is not held for it — the full build keeps its top there too
        else if (!estimated) this.atEnd = false;
      }
    }
    if (sc !== null) {
      // at rest, the member goes back to where the reader saw it — an absolute
      // target, so corrections in a row (cards springing shut above, frame
      // after frame) never add up the fractions a whole-pixel offset drops
      if (above !== 0 && sc.scrolling !== true && this.anchor !== null && !heldAtEnd(sc)) {
        const top = this.offsetTo(sc) + this.leading + this.ledger.offset(this.anchor.index) + this.dev;
        const target = Math.max(0, Math.round(top - this.anchorVis));
        if (Math.abs(target - sc.scrollY) >= 0.5) { this.wrote = target; setBound(sc, "scrollY", target); }
      } else this.absorb(above, sc);
    }

    // out of reach: park (or, past the pool, discard) rows far from the build
    // range — never a touched or focused one — first, so the records arriving
    // below can re-point them
    const cap = Math.max(200, 3 * (this.to - this.from));
    const lo = this.from - this.keepRows, hi = Math.min(this.limit, this.to + this.keepRows);
    const out = [...this.rows].filter(([, r]) => (r.index < lo || r.index >= hi) && !subtreeDiverged(r.view) && !focusedWithin(r.view));
    const over = this.rows.size - out.length - cap;
    if (over > 0) {
      const mid = (this.from + this.to) / 2;
      const rest = [...this.rows].filter(([, r]) => r.index >= lo && r.index < hi && (r.index < this.from || r.index >= this.to) && !subtreeDiverged(r.view) && !focusedWithin(r.view));
      rest.sort((a, b) => Math.abs(b[1].index - mid) - Math.abs(a[1].index - mid));
      out.push(...rest.slice(0, over));
    }
    for (const [id, r] of out) {
      this.rows.delete(id);
      if (this.pool.length < this.poolCap) this.park(r.view);
      else { markEvicting(r.view); this.drop(r.view); }
    }

    // build: every record in the range without a row gets one — a parked row
    // of its class re-pointed, or a new one
    const fresh: { view: View; made: ReturnType<Materialize>; id: unknown }[] = [];
    const repointed: { view: View; id: unknown }[] = [];
    const arriving: { view: View; path: readonly string[]; index: number }[] = [];
    m.nodes.forEach((node, i) => {
      const id = host.idOf(node.value);
      if (this.rows.has(id)) return;
      const index = Number(node.path[node.path.length - 1]), kind = host.kindAt(m, i);
      let view = this.unpark(kind);
      if (view !== undefined) repointed.push({ view, id });
      else {
        const made = host.build(kind);
        if (host.inited.has(id)) made.suppressInit();
        view = made.view;
        fresh.push({ view, made, id });
      }
      this.rows.set(id, { view, index });
      pointed.add(view);
      arriving.push({ view, path: node.path, index });
    });
    // cursors only once every row is built: building runs rules, and a row
    // cursored early would answer them unlinked
    for (const a of arriving) {
      if (data !== null) setBound(a.view, "datapath", data.$cursorAt(a.path));
      setRowIndex(a.view, a.index);
    }
    // link, provide and attach the new rows, in that order — the order every
    // creation path keeps: a provision may read up the tree, so it lands once
    // the row is linked, and before attach first-runs the row's face
    // (replicate.ts; child order is stacking only: placement is absolute)
    if (fresh.length > 0) {
      let at = host.start() + this.owned.length;
      for (const f of fresh) { parent.insertChild(f.view, at++); this.owned.push(f.view); }
      for (const f of fresh) {
        try { f.made.provide(); } catch (e) { reportInstanceThrow(f.view, "providing", e); }
      }
      const ps = parent.$surface;
      if (ps !== null && parent.$backend !== null) {
        // before whatever follows the block (a footer after the rows)
        let before: Surface | null = null;
        for (let i = at; i < parent.children.length && before === null; i++) {
          const sib = parent.children[i];
          if (sib instanceof View && sib.$surface !== null) before = sib.$surface;
        }
        for (const f of fresh) {
          try { f.view.$attach(parent.$backend, ps, before); } catch (e) { reportInstanceThrow(f.view, "attaching", e); }
        }
      }
    }
    // a row presenting a record it was not presenting takes its geometry outright
    for (const v of pointed) arriveSubtree(v);

    // place every mounted row, and publish the extent
    const extent = Math.min(EXTENT_CAP, this.leading + this.span() + this.trailing.room + this.dev + ((parent as unknown as { insetY?: number }).insetY ?? 0));
    const range = this.bar && this.published > 0 ? this.published : extent;
    // a row kept out of reach (touched, focused) is out of sight wherever it
    // sits: it stays inside the published range, so it never stretches it,
    // and takes its true place again once the viewport comes near
    const base = this.leading + this.dev;
    for (const r of this.rows.values()) {
      let y = base + this.ledger.offset(r.index);
      if (r.index < lo || r.index >= hi) y = Math.min(Math.max(0, y), Math.max(0, range - r.view.height));
      setBound(r.view, "y", y);
    }
    let after = base + this.span();
    for (const v of this.trailing.views) { after += this.gap; setBound(v, "y", after); after += v.height; }
    this.publish(range);
    // (a few corrections a frame: the end the write reveals can measure again,
    // but it settles — and a list that kept moving it must not loop the settle)
    if (this.atEnd && sc !== null && !this.endBooked && this.endRuns < 4) {
      this.endBooked = true;
      afterSettle(() => {
        this.endBooked = false;
        if (!this.atEnd || sc.scrolling === true || heldAtEnd(sc)) return;
        const end = Math.max(0, sc.contentHeight - sc.height);
        if (Math.abs(end - sc.scrollY) < 0.5) return;
        if (this.endRuns++ === 0) setTimeout(() => { this.endRuns = 0; }, 0);
        this.wrote = Math.round(end);
        setBound(sc, "scrollY", this.wrote);
      });
    }
    // assistive tech hears the logical place — written when it changes
    if (this.ariaCount !== m.logical) { this.ariaCount = m.logical; parent.$surface?.setRowCount?.(m.logical); }
    for (const r of this.rows.values()) if (r.aria !== r.index) { r.aria = r.index; r.view.$surface?.setRowIndex?.(r.index + 1); }

    for (const f of fresh) {
      try { f.made.finish(); } catch (e) { reportInstanceThrow(f.view, "finishing", e); }
    }
    for (const r of repointed) if (!host.inited.has(r.id)) fireInitTree(r.view);
    for (const f of fresh) { host.inited.add(f.id); armTree(f.view); }
    for (const r of repointed) { host.inited.add(r.id); armTree(r.view); }
    if (fresh.length > 0 || out.length > 0) parent.$childrenMutated();
    // rows built or re-pointed this pass have not settled their height yet
    // (their constraints run after this returns): measured on the next pass —
    // in this update when the viewport needs it, else on the next frame, so
    // rows ahead fill in over frames instead of converging all at once
    // the rest of the range: next frame — or, mid-scrub, once the jumps stop
    if (this.unfilled && this.jumping) this.afterJumps();
    else if (this.unfilled) this.nextFrame();
    this.drainWhenStill();
    if (!moved && pointed.size === 0) return;
    let covered = true;
    for (let i = this.inViewFrom; i <= this.inViewTo && covered; i++) if (!this.rows.has(host.idOf(this.items[i]))) covered = false;
    // (a held thumb's frozen range is exact in this update: a row measuring
    // past its end must leave before anything is drawn)
    const urgent = this.ledger.offset(this.limit) > this.reach + 0.5 || m.dataChanged || !covered || arriving.some((a) => a.index >= this.inViewFrom && a.index <= this.inViewTo);
    // a few passes per update at most: what is still converging continues on
    // the next frame (the hover chain, and anything else that reads the rows'
    // places, re-runs with every pass)
    if (urgent && this.urgentRuns++ < 8) {
      if (this.urgentRuns === 1) afterSettle(() => { this.urgentRuns = 0; });
      this.measureCell.changed();
    } else this.nextFrame();
  }

  private framePending = false;
  private jumping = false;
  private jumpTimer: ReturnType<typeof setTimeout> | null = null;
  private afterJumps(): void {
    if (this.jumpTimer !== null) clearTimeout(this.jumpTimer);
    this.jumpTimer = setTimeout(() => { this.jumpTimer = null; this.measureCell.changed(); }, JUMP_QUIET);
  }
  private ariaCount = -1;
  /** Rows of the range are still to build (the next frame builds more). */
  private unfilled = false;
  private urgentRuns = 0;
  private nextFrame(): void {
    if (this.framePending) return;
    // without frames (a headless host) there is nothing to spread over
    const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => void }).requestAnimationFrame;
    if (typeof raf !== "function") { this.measureCell.changed(); return; }
    this.framePending = true;
    raf(() => { this.framePending = false; this.measureCell.changed(); });
  }

  /** The block owns the parent's content extent — or, when the parent's
   *  height is the author's (rows directly in a scrolling Table: its height
   *  is the frame), the scroller's surface range. */
  private publish(h: number): void {
    const parent = this.host.parent;
    this.published = h;
    const authored = isSet(parent, "height") || ownerOf(parent, "height")?.yielding === false;
    if (authored) {
      this.dropHeightOwner();
      if (parent.scrolls !== "none") parent.$setVirtualExtent(h);
    } else if (this.heightOwner === null) this.heightOwner = bindDerived(parent, "height", () => this.published);
    else this.heightOwner.run();
  }

  /** Give the parent's height back: the slot's owner entry goes with the
   *  derive, or a dead rule would keep the auto-extent from returning. */
  private dropHeightOwner(): void {
    if (this.heightOwner === null) return;
    release(this.host.parent, "height", this.heightOwner);
    this.heightOwner.dispose();
    this.heightOwner = null;
  }

  private park(v: View): void {
    setBound(v, "visible", false);
    // a parked row presents no record: nothing asking rows for their place
    // (a table walking to its active row) may find it there
    setRowIndex(v, -1);
    this.pool.push(v);
  }

  private unpark(kind: string): View | undefined {
    let i = this.pool.length - 1;
    while (i >= 0 && this.host.kindOf(this.pool[i]) !== kind) i--;
    if (i < 0) return undefined;
    const [v] = this.pool.splice(i, 1);
    setBound(v, "visible", true);
    return v;
  }

  private drop(v: View): void {
    this.host.parent.removeChild(v);
    this.owned = this.owned.filter((o) => o !== v);
    v.discard();
  }
}
