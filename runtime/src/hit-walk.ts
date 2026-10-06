// hit-walk — THE hit walk: what is under a point, and which of it a question is
// asking for. One implementation, read through an adapter, for both trees it
// runs over: the language's views (interaction.ts — `hovered`, `pressed`,
// `viewAt`, `explainHit`, the Inspector's picker) and a renderer's retained
// scene (scene-walk.ts — the press, the cursor, the wheel on canvas and the
// Mac host). The DOM backend's presses ride the browser's own hit-testing,
// which these rules mirror.
//
// The rules, in order:
//   · an invisible node holds nothing;
//   · a scroller bounds its subtree at its FRAME — content beyond it is out of
//     view by definition, whatever its clip says;
//   · a clip bounds its subtree's hits, except for children that opt out with
//     `ignoreClip` (frame chrome straddling the frame still hits);
//   · a scroller's frame chrome (`ignoreScroll`) paints above its scrolled
//     content, so it is offered the point first, in its own unshifted frame;
//   · children are offered the point in reverse paint order, each in its own
//     frame (the adapter's parent→child transform: scroll, content inset,
//     translate, the paint transform inverted);
//   · then the node itself, when the point is inside its box (and its clip),
//     if it is what the question asks for. A node the question passes over —
//     pointer-transparent, or holding no input — lets the walk go on to the
//     siblings beneath it.

/** One step of a narrated walk: the node, why it was taken or passed over, and
 *  the point in its own frame — usually the tell. */
export interface HitNote<N> {
  view: N;
  why: string;
  x: number;
  y: number;
}

/** How the walk reads one tree. */
export interface HitAdapter<N> {
  /** Whether a child entry is a node of this tree (a view's children list also
   *  holds non-view nodes). */
  isNode(c: unknown): c is N;
  children(n: N): readonly unknown[];
  visible(n: N): boolean;
  width(n: N): number;
  height(n: N): number;
  scroller(n: N): boolean;
  ignoresScroll(n: N): boolean;
  ignoresClip(n: N): boolean;
  clips(n: N): boolean;
  /** Whether a point in `n`'s frame is inside its clip; asked only when it clips. */
  insideClip(n: N, lx: number, ly: number): boolean;
  /** A point in `parent`'s frame, in `child`'s frame. */
  toChild(parent: N, child: N, lx: number, ly: number): [number, number];
}

/** What a walk is looking for: null when `n` is a target, else why it is not
 *  (said in a narrated walk). Asked only for a node whose box holds the point. */
export type HitAccept<N> = (n: N) => string | null;

/** Where the last hit was, in the hit node's own frame. */
export const hitPoint = { x: 0, y: 0 };

/** The deepest node under (lx, ly) — a point in `n`'s own frame — that
 *  `accept` takes, or null. A `trace` collects the narration. */
export function walkHit<N>(n: N, lx: number, ly: number, A: HitAdapter<N>, accept: HitAccept<N>, trace?: HitNote<N>[]): N | null {
  // The trace pushes are inline and guarded, never a closure: the walk runs on
  // every pointer move, so an untraced walk allocates nothing.
  if (!A.visible(n)) {
    if (trace !== undefined) trace.push({ view: n, why: "skipped — visible = false", x: Math.round(lx), y: Math.round(ly) });
    return null;
  }
  const inside = lx >= 0 && ly >= 0 && lx < A.width(n) && ly < A.height(n);
  const scroller = A.scroller(n);
  if (scroller && !inside) {
    if (trace !== undefined) trace.push({ view: n, why: "skipped — outside a scroller's FRAME, so its whole subtree is out of view", x: Math.round(lx), y: Math.round(ly) });
    return null;
  }
  const outside = A.clips(n) && !A.insideClip(n, lx, ly);
  const kids = A.children(n);
  if (scroller) {
    for (let i = kids.length - 1; i >= 0; i--) {
      const c = kids[i];
      if (!A.isNode(c) || !A.ignoresScroll(c)) continue;
      if (!A.visible(c) && trace === undefined) continue;
      if (outside && !A.ignoresClip(c)) continue;
      const [cx, cy] = A.toChild(n, c, lx, ly);
      const hit = walkHit(c, cx, cy, A, accept, trace);
      if (hit !== null) return hit;
    }
  }
  for (let i = kids.length - 1; i >= 0; i--) {
    const c = kids[i];
    if (!A.isNode(c)) continue;
    // a hidden child (a parked row among them) holds nothing to hit; the trace
    // still visits it, to say so
    if (!A.visible(c) && trace === undefined) continue;
    if (scroller && A.ignoresScroll(c)) continue;   // offered above
    if (outside && !A.ignoresClip(c)) continue;
    const [cx, cy] = A.toChild(n, c, lx, ly);
    const hit = walkHit(c, cx, cy, A, accept, trace);
    if (hit !== null) return hit;
  }
  if (!inside || outside) {
    if (trace !== undefined) trace.push({ view: n, why: inside ? "missed — the point is outside this view's clip" : "missed — the point is outside this view's own box", x: Math.round(lx), y: Math.round(ly) });
    return null;
  }
  const why = accept(n);
  if (why !== null) {
    if (trace !== undefined) trace.push({ view: n, why, x: Math.round(lx), y: Math.round(ly) });
    return null;
  }
  if (trace !== undefined) trace.push({ view: n, why: "HIT — the deepest box containing the point", x: Math.round(lx), y: Math.round(ly) });
  hitPoint.x = lx;
  hitPoint.y = ly;
  return n;
}
