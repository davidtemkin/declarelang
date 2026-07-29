// DOM render backend — the first implementation of the render seam.
//
// Each view becomes an absolutely-positioned <div>, nested to mirror the view
// tree, so a child's x/y are relative to its parent: the LZX coordinate model
// expressed directly in CSS, with no layout engine involved (layout is R7).
//
// R3 content, all native where the DOM is native: text is a real DOM text
// run (the browser's rasterizer, selection, a11y), an image is a real <img>
// (stretch expressed as CSS %, so it tracks the view box for free), clip is
// CSS clip-path, and group opacity is what CSS opacity already means. Only a
// recorded *drawing* rasterizes — into this view's own <canvas>, sized by
// the recording's bounds (their first consumer). Content elements are
// created on first use: a plain colored view stays one bare <div>.
//
// R5 input rides the browser's own hit-testing: surfaces are pointer-inert
// until a sink arrives (setInput flips pointer-events on), content elements
// stay inert (hits are box-geometry, like the canvas walk), and resolution
// is target → nearest sinked surface; the pairing/click rule is shared
// (input.ts), so both backends decide clicks identically.

import type { EditableSpec, InputSink, InputWants, RenderBackend, RichBlock, Stretch, Surface } from "./backend.js";
import { colorToCss, isGradient, type Fill, type Shadow, type Stroke } from "./value.js";
import { type BoxState } from "./boxpaint.js";
import { fontMetrics, fontString, cssWeight, type TextStyle } from "./measure.js";
import { replay, type DisplayList } from "./draw.js";
import { onDprChange } from "./dpr.js";
import { routeInput, holdCaptureActive } from "./input.js";
import { lockFocusZoom } from "./viewport-lock.js";

/** Style a native editable element to match the view's painted text metrics, so
 *  the caret and glyphs sit exactly where the static measure would place them. */
function applyEditStyle(el: HTMLElement, st: TextStyle): void {
  const s = el.style;
  s.fontFamily = st.fontFamily;
  s.fontSize = st.fontSize + "px";
  s.fontWeight = cssWeight(st.fontWeight);
  s.letterSpacing = st.letterSpacing === 0 ? "normal" : st.letterSpacing + "px";
  s.color = colorToCss(st.color);
  const m = fontMetrics(fontString(st));
  s.lineHeight = m.ascent + m.descent + "px";
}

/** Perceived lightness of a solid color, 0 (black) → 1 (white) — sRGB relative
 *  luminance, the same weights the contrast math everywhere uses. */
function luminanceOf(c: number): number {
  const ch = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch((c >> 16) & 0xFF) + 0.7152 * ch((c >> 8) & 0xFF) + 0.0722 * ch(c & 0xFF);
}

/** Tell the platform which scheme the editable's own box is, so the chrome only
 *  the BROWSER draws follows it: the scrollbar inside a multiline field, the
 *  selection highlight, the placeholder, autofill. Declare styles the text, but
 *  none of those are ours to paint — left unset they render light-on-light
 *  inside a dark field. Read from the field's resolved fill rather than any
 *  app-level dark flag: the box's own background is the thing they sit on, and
 *  it is a fact the surface already has. A gradient or an unfilled field keeps
 *  the platform default. */
function applyEditScheme(el: HTMLElement, fill: Fill): void {
  if (fill === null || typeof fill !== "number") { el.style.colorScheme = ""; return; }
  el.style.colorScheme = luminanceOf(fill) < 0.4 ? "dark" : "light";
}

/** Primary-pointer coarseness, resolved once. The painted-UI selection
 *  suppression (root `user-select: none`, selectable runs opting back in
 *  with explicit `text`) is MOUSE reasoning: a mouse drag must not paint a
 *  selection. On a coarse-pointer device the drag IS scrolling, selection
 *  rides long-press — and iOS treats an explicit `text` island inside a
 *  `none` page as a text-interaction surface whose drags SELECT instead of
 *  panning (measured 2026-07-29: hero swipes died exactly on selectable
 *  runs, and swipes beside them scrolled). So on coarse devices the DOM
 *  realizes selection the way the rest of the web does: defaults everywhere,
 *  no explicit values, and text runs stay pointer-inert. */
const COARSE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

/** Element → its surface's input sink. Setting a sink is also what flips the
 *  element's pointer-events on, so membership here and native hit-testability
 *  are the same fact. Module-level (not per-backend) because DomBackend is
 *  stateless; a WeakMap adds no lifetime. */
const SINKS = new WeakMap<HTMLElement, InputSink>();
/** The declared-handler facts the router arbitrates with, per sinked element
 *  (input.ts HitTarget) — a parallel map so SINKS keeps its "is this a hit
 *  target" meaning exactly. */
const WANTS = new WeakMap<HTMLElement, InputWants>();

/** While the page is pinch-zoomed, a scroller's containment must yield to the
 *  user's viewport panning — measured on iPad (2026-07-28): iOS implements
 *  zoomed panning as scroll chaining, so a full-height pane with
 *  `overscroll-behavior: contain` cuts the chain at its edge and the app's
 *  bottom band becomes unreachable at any zoom > 1 (visible only during the
 *  elastic overscroll stretch). One document-level class, toggled from the
 *  visualViewport scale, relaxes every scroller's containment and touch-action
 *  exactly while zoomed — and only then, so the contain semantics (a pane
 *  bounces on its own edges, never flashes the page behind) hold at scale 1.
 *  The rule targets only `[data-declare-scroll]` (delegation is definitional
 *  there); claim-carrying elements keep their claims. Singleton per document. */
const ZOOM_WATCHED = new WeakSet<Document>();
function watchPinchZoom(doc: Document): void {
  if (ZOOM_WATCHED.has(doc) || typeof visualViewport === "undefined" || visualViewport === null) return;
  ZOOM_WATCHED.add(doc);
  const style = doc.createElement("style");
  style.textContent = "html.declare-zoomed [data-declare-scroll]{overscroll-behavior:auto !important;touch-action:auto !important}";
  doc.head.appendChild(style);
  const vv = visualViewport;
  const apply = (): void => { doc.documentElement.classList.toggle("declare-zoomed", vv.scale > 1.02); };
  vv.addEventListener("resize", apply);
  apply();
}

/** Realize an `ignoreScroll` element against its nearest enclosing scroll
 *  regime, read off its DOM ancestry (setIgnoreScroll marks; this resolves):
 *  a pane ancestor (`data-declare-scroll`) → the element moves into the
 *  pane's sticky frame; the app root ancestor → `position: fixed` against
 *  the viewport (the page regime — a fixed box adds no document extent, the
 *  extent-exclusion half of the rule, by the platform's own definition). No
 *  context found (not yet parented, or the root not yet stamped) → nothing;
 *  callers re-run at insert and at attachRoot. Top-level apps only for the
 *  fixed arm: an embedded island's root is stamped too, but sits offset in a
 *  host page where viewport-fixed coordinates would be wrong — its children
 *  stay put (the pane arm still applies inside island panes). */
function realizeIgnoreScroll(el: HTMLElement): void {
  if (el.dataset.declareIgnorescroll === undefined) {
    if (el.style.position === "fixed") el.style.position = "absolute";
    return;
  }
  for (let p = el.parentElement; p !== null; p = p.parentElement) {
    if (p.dataset !== undefined && p.dataset.declareScroll !== undefined) {
      const frame = ensureScrollFrame(p);
      if (el.parentElement !== frame) frame.appendChild(el);
      return;
    }
    if (p.dataset !== undefined && p.dataset.declareApp !== undefined) {
      // the page regime — but only where the root's frame IS the viewport
      const embedded = p.parentElement?.closest("[data-declare-app], [data-declare-embed]") ?? null;
      if (embedded === null) el.style.position = "fixed";
      return;
    }
  }
}

/** The pane's STICKY FRAME: a zero-size, in-flow `position: sticky` first
 *  child of a scroller element. The compositor holds it at the pane's frame
 *  origin while content scrolls beneath — so `ignoreScroll` children parented
 *  into it ride the frame with no per-frame JS and no lag. Zero-size +
 *  visible overflow: it occupies no layout space among the (absolute)
 *  content and contributes nothing to the scroll range itself. zIndex lifts
 *  the frame's subtree above the unindexed content — frame chrome paints
 *  over what it is pinned above. */
function ensureScrollFrame(scrollerEl: HTMLElement): HTMLElement {
  const existing = scrollerEl.querySelector<HTMLElement>(":scope > [data-declare-scrollframe]");
  if (existing !== null) return existing;
  const frame = scrollerEl.ownerDocument.createElement("div");
  frame.dataset.declareScrollframe = "1";
  const s = frame.style;
  s.position = "sticky";
  s.top = "0";
  s.left = "0";
  s.width = "0";
  s.height = "0";
  s.overflow = "visible";
  s.zIndex = "1";
  scrollerEl.insertBefore(frame, scrollerEl.firstChild);
  return frame;
}

/** Surfaces that carry BOTH a Shape clip and a sink. The browser must never
 *  see such an element as a pointer target: a clip-path'd hittable overlay
 *  blocks native wheel scrolling and selection UNDERNEATH it — across the
 *  whole element box, even where the clip cuts the overlay away (the engines'
 *  scroll targeting consults a coarser notion of hittability than their
 *  hit-testing). So a carved sink is realized CSS-inert (pointer-events:none)
 *  and the router resolves its hits HERE, by the same isPointInPath
 *  subtraction the canvas walk makes — the clip's promise ("the clipped-away
 *  part of an interactive box falls through") kept by the runtime instead of
 *  leaked to the app. Iterated per event, so a plain Map (destroy() removes). */
const CARVED = new Map<HTMLElement, DomSurface>();

/** Shared 2D context for Path2D point tests (the canvas backend's hitCtx twin). */
let carveCtx: CanvasRenderingContext2D | null = null;
function carveHitCtx(): CanvasRenderingContext2D {
  return (carveCtx ??= document.createElement("canvas").getContext("2d")!);
}

/** Is `a` painted above `b`? Our surfaces are untransformed absolutes in one
 *  stacking context, so paint order IS document order — and a descendant
 *  paints above its ancestor, which PRECEDING also answers (an ancestor's
 *  opening tag precedes its descendants). Mirrors the canvas walk's
 *  reverse-child-order probing. */
function paintedAbove(a: HTMLElement, b: HTMLElement): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
}

export class DomBackend implements RenderBackend {
  createSurface(): Surface {
    return new DomSurface();
  }

  attachRoot(host: HTMLElement, root: Surface): void {
    // Is this app EMBEDDED inside another Declare app (rendered into an island box
    // that lives in an outer app's marked tree)? An embedded app owns only its
    // box: it must NOT repaint the page's <body> background, and the outer app's
    // input router must ignore events inside it (see the boundary check below).
    // Inside another app's tree, or a foreign page's marked host div
    // (data-declare-embed, boot.ts isEmbedded) — either way, not the page's app.
    const embedded = typeof host.closest === "function" && host.closest("[data-declare-app], [data-declare-embed]") !== null;
    // Every surface is absolutely positioned (see DomSurface), so the tree
    // needs a positioned ancestor to anchor to; otherwise the root would
    // position against the viewport instead of `host` on a plain (static)
    // host element. Only touch it if the caller hasn't already opted into
    // a positioning scheme of their own.
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    const rootEl = (root as DomSurface).element;
    // Mark the app root: the ONE DOM signal a child reads to know it is embedded
    // (index.ts isEmbedded), and the boundary the input router stops at so an
    // outer app never double-handles a click that belongs to an embedded child.
    rootEl.dataset.declareApp = "";
    // Views are a painted UI, not a document: a press-drag (event drag, and any
    // future gesture) must not start a native text/element selection. Suppress
    // it once at the root — `user-select` inherits, so every view div is covered
    // (editable fields opt back IN, see setEditable).
    if (!COARSE) {
      rootEl.style.userSelect = "none";
      (rootEl.style as CSSStyleDeclaration & { webkitUserSelect: string }).webkitUserSelect = "none";
    }
    // Touch gestures are NOT suppressed here: the browser owns every gesture
    // until a view claims one by declaring the handler that answers it
    // (refreshTouchAction — the app root's default keeps pan for an app the
    // browser scrolls and keeps pinch-zoom for everyone; double-tap zoom is
    // the one gesture a painted UI always takes, since two quick taps on a
    // control must not lurch the page). Runs after the declareApp mark above
    // so the root default applies — and after the embedded fact is stamped,
    // since an island's default is `manipulation` (the finger belongs to the
    // host page's regime), and the root element is not yet in the host here.
    (root as DomSurface).embeddedRoot = embedded;
    (root as DomSurface).refreshTouchAction();
    // …and while the user IS pinch-zoomed, scroller containment yields to
    // viewport panning (see watchPinchZoom — the measured iOS chain trap).
    watchPinchZoom(host.ownerDocument);
    // The ROOT's scroll regime is the page (applyScrollStyle's root branch) —
    // but attach ran before the declareApp stamp, so the element still wears
    // the PANE realization. Re-apply now that root-ness is knowable, and
    // resolve any ignoreScroll children that found no context during attach
    // (their nearest regime is this root — the page).
    (root as DomSurface).applyScrollStyle();
    rootEl.querySelectorAll<HTMLElement>("[data-declare-ignorescroll]").forEach((el) => realizeIgnoreScroll(el));
    // NOTE the frame does NOT clip here: an app larger than its host scrolls
    // natively — "exterior" scrolling, the browser over the app object — and
    // that stays expressible. An app designed as a fixed window (everything
    // in-frame, no browser scrolling — the calendar) declares `clip = true`
    // on its App, whose box-clip is true CONTAINMENT (setBoxClip below).
    host.appendChild(rootEl);
    // Paint the page BEHIND the app with the app's own background — so Safari's
    // rubber-band overscroll and any sub-pixel edge match the app instead of
    // flashing white. Automatic for any TOP-LEVEL app: we read the root's realized
    // background (fill was applied at attach(), before attachRoot). `html`
    // height:100% + margin:0 keep the fill covering the whole frame. An embedded
    // app fills only its box, so it must not touch the shared page <body>.
    const doc = host.ownerDocument;
    const bg = getComputedStyle(rootEl).backgroundColor;
    if (!embedded && bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
      doc.documentElement.style.background = bg;
      doc.body.style.background = bg;
      doc.documentElement.style.height = "100%";
      doc.body.style.height = "100%";
      doc.body.style.margin = "0";
    }
    // A horizontal trackpad swipe over an app must never become the browser's
    // back/forward history gesture — that navigates the whole page away, out from
    // under the running app. A `scrollsX` pane swallows the delta where it can, but
    // a swipe over non-scrolling content (or a scroller already at its edge) still
    // reaches the page, so opt the root scroller OUT of the gesture at the source.
    // X only: vertical rubber-band (the painted-bg overscroll above, and an
    // exterior-scrolling app's own scroll) is left untouched. Top-level only — an
    // embedded island must not reach up and change the host page's behavior.
    if (!embedded) {
      doc.documentElement.style.overscrollBehaviorX = "none";
      doc.body.style.overscrollBehaviorX = "none";
    }
    // Input: the browser's own hit-test picks the target (only sinked
    // surface elements accept pointer events — everything else is
    // pointer-inert, see DomSurface), so resolution is just "walk up to the
    // nearest surface with a sink and localize the point to its box". The
    // pairing/click rule is the shared router's (input.ts).
    routeInput(
      () => rootEl.isConnected,
      (e) => {
        let el = e.target instanceof HTMLElement && rootEl.contains(e.target) ? e.target : null;
        // Ownership BEFORE the sink walk: the target's nearest enclosing app root
        // must be this rootEl, or the event belongs to an embedded child app and
        // its own router. This cannot be a check inside the walk — a sinked
        // element is exactly a pointer-events:auto element, so the browser's
        // hit-test lands directly ON it and the walk breaks there, never reaching
        // the child's root boundary; the outer router would then fire the
        // (globally-shared) sink a second time — every non-idempotent click
        // handler in an island ran twice (an island Checkbox toggled on+off per
        // click, a counter counted by 2).
        //
        // But the press is not INVISIBLE to the embedding app: it REMAPS to the
        // innermost OWNED element containing the child's root — the island — and
        // the sink walk continues from there. The child keeps the event for its
        // own views; the host hears a press ON ITS ISLAND (a different view, so
        // no double delivery), which is how a desktop window hosting an embedded
        // app comes to the front when its content is clicked.
        while (el !== null) {
          const owner = el.closest("[data-declare-app]");
          if (owner === rootEl || owner === null) break;
          el = owner.parentElement;
        }
        while (el !== null) {
          if (SINKS.has(el)) break;
          el = el === rootEl ? null : el.parentElement;
        }
        // Carved sinks are invisible to the browser's hit-test (CSS-inert, see
        // CARVED) — probe them here and let the topmost carved region beat a
        // native candidate it paints above. The same walk order as canvas.
        for (const [cel, surf] of CARVED) {
          if (cel === el || !rootEl.contains(cel)) continue;
          const owner = cel.closest("[data-declare-app]");
          if (owner !== rootEl && owner !== null) continue; // an embedded app's — its own router resolves it
          if (!surf.carvedHit(e.clientX, e.clientY)) continue;
          if (el === null || paintedAbove(cel, el)) el = cel;
        }
        if (el === null) return null;
        const r = el.getBoundingClientRect();
        return { key: el, sink: SINKS.get(el)!, ...WANTS.get(el), x: e.clientX - r.left, y: e.clientY - r.top };
      },
      (e) => {
        const r = rootEl.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      }
    );
    // Tap-to-dismiss for native editable fields. Desktop blurs a focused
    // input/textarea when you press a non-focusable element, but mobile Safari
    // keeps focus (and the keyboard) up when a plain view is tapped — so blur it
    // explicitly. A pointerdown that lands OUTSIDE the focused field blurs it;
    // capture phase runs before the field could re-assert focus, and a tap ON a
    // field (this one or another) is left to native focus handling. The listener
    // is scoped to this app's rootEl (an embedded app won't dismiss for taps in
    // its neighbours) and dies with the element — no teardown needed.
    rootEl.addEventListener(
      "pointerdown",
      (e) => {
        const active = doc.activeElement;
        if (!(active instanceof HTMLElement)) return;
        if (active.tagName !== "INPUT" && active.tagName !== "TEXTAREA") return;
        if (!rootEl.contains(active)) return;
        const t = e.target;
        if (t instanceof Element && t.closest("input,textarea") !== null) return;
        active.blur();
      },
      true
    );
    // The full-gesture-control clause (Rule 3): an app that claimed every
    // finger (its App declares the raw touch family) runs its own gesture
    // arithmetic, and an iOS focus auto-zoom arriving mid-gesture would shear
    // every coordinate that engine integrates. While such an app holds focus
    // in a field, suspend the auto-zoom; let go on blur (viewport-lock.ts —
    // the user's own pinch survives the lock, measured 2026-07-27). Every
    // other app keeps the browser's behavior untouched; the compiler flags a
    // sub-16px field instead. Top-level only — an embedded island must not
    // rewrite the host page's viewport.
    if (!embedded && WANTS.get(rootEl)?.wantsTouch === true) {
      lockFocusZoom(rootEl, () => rootEl.isConnected);
    }
  }
}

// Scrollbars are the platform's own. An earlier build injected a persistent,
// space-reserving `::-webkit-scrollbar` (+ `scrollbar-gutter: stable`) so a bar was
// always visible — but styling `::-webkit-scrollbar` opts Safari OUT of its native
// overlay bar and into a wide, always-on legacy one, which is not what a macOS app
// should look like. We now inject nothing: `overflow: auto` gives each pane the OS
// default — an overlay bar that appears on scroll and widens on hover (macOS), or
// the classic bar the OS/user setting dictates elsewhere.

// ── embedded-app NAME reflection (the reverse of the `env` channel) ──────────
//
// A `run:` island's mounted child app publishes its `appName` UP to the host
// DOMIsland view's `childName`, so a hosting window (the desktop's AppWindow)
// can title itself by the child — the viewer names its window by the file it is
// showing, and follows in-app navigation. `setEmbed` links the box → its
// DOMIsland view (`box.__declareView`); the host mounts the child on the same
// box (`box.__childApp`, the island-runner convention). ONE rAF loop polls every
// run-island and writes the name across, self-retiring the moment none remain
// (idle-zero, exactly like the animation clock).

interface NameBox extends HTMLElement {
  __declareView?: { childName?: string };
  __childApp?: { appName?: unknown };
}
let embedMirrorFrame = 0;
function reflectEmbeddedNames(): boolean {
  const boxes = document.querySelectorAll<NameBox>('[data-declare-slot^="run:"]');
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    const view = box.__declareView;
    if (view === undefined) continue;
    const name = box.__childApp !== undefined && typeof box.__childApp.appName === "string" ? box.__childApp.appName : "";
    if (view.childName !== name) view.childName = name;
  }
  return boxes.length > 0;
}
function ensureEmbeddedNameMirror(): void {
  if (embedMirrorFrame !== 0 || typeof requestAnimationFrame === "undefined" || typeof document === "undefined") return;
  const tick = (): void => { embedMirrorFrame = reflectEmbeddedNames() ? requestAnimationFrame(tick) : 0; };
  embedMirrorFrame = requestAnimationFrame(tick);
}

/** Materialize the inner clip container for a box-clipped element: adopt the
 *  ordinary children (in order), inherit the rounding, move the overflow. Used
 *  from BOTH sides of the arrival race — the parent's setBoxClip/insertChild
 *  and a child's late-flushed setIgnoreClip. Idempotent. */
function ensureClipBoxFor(el: HTMLElement): HTMLElement {
  const existing = el.querySelector(":scope > [data-declare-clipbox]") as HTMLElement | null;
  if (existing !== null) return existing;
  const box = el.ownerDocument.createElement("div");
  box.style.position = "absolute";
  box.style.inset = "0";
  box.style.borderRadius = "inherit";
  box.dataset.declareClipbox = "1";
  box.style.overflow = el.style.overflow || "clip";
  el.style.overflow = "";
  const kids = Array.from(el.children) as HTMLElement[];
  let anchor: HTMLElement | null = null;
  for (const k of kids) {
    if (k.dataset.declareIgnoreclip === "1") continue;
    if (anchor === null) { el.insertBefore(box, k); anchor = k; }
    box.appendChild(k);
  }
  if (anchor === null) el.appendChild(box);
  return box;
}

class DomSurface implements Surface {
  readonly element: HTMLDivElement;
  private textEl: HTMLSpanElement | null = null;
  private editEl: HTMLInputElement | HTMLTextAreaElement | null = null;
  private edit: EditableSpec | null = null;
  private richEl: HTMLDivElement | null = null;
  private richObserver: ResizeObserver | null = null;
  private onRichResize: ((height: number) => void) | undefined;
  private imgEl: HTMLImageElement | null = null;
  private drawEl: HTMLCanvasElement | null = null;
  private drawing: DisplayList | null = null;
  private stretch: Stretch = "none";
  /** The box's retained paint state — cornerRadius/stroke/shadow that decorate()
   *  brushes onto the div as CSS. `fillV` keeps the raw Fill for the gradient
   *  string. (The box is the div itself, painting beneath its children — no
   *  per-view canvas.) */
  private readonly box: BoxState = {
    width: 0, height: 0, fill: null, gradient: null, cornerRadius: 0, stroke: null, shadow: null,
  };
  private fillV: Fill = null;
  /** Set once the drawing raster has ever existed (arms the dpr watch once). */
  private watching = false;
  private gone = false;

  constructor() {
    const el = document.createElement("div");
    const s = el.style;
    // Absolute + a zeroed box so x/y/width/height map 1:1 to the view's
    // geometry; each surface is a positioning context for its children.
    s.position = "absolute";
    s.left = "0px";
    s.top = "0px";
    s.margin = "0";
    s.padding = "0";
    s.border = "0";
    s.boxSizing = "border-box";
    // Input is opt-in (setInput): a surface without a sink must be
    // transparent to the pointer, exactly like the canvas hit walk skipping
    // a sink-less view, so the native hit-test and the walk resolve the
    // same target for the same point.
    s.pointerEvents = "none";
    this.element = el;
  }

  setX(v: number): void { this.element.style.left = v + "px"; }
  setY(v: number): void { this.element.style.top = v + "px"; }

  setWidth(v: number): void {
    this.frameW = v;
    this.element.style.width = v + "px";
    this.box.width = v;   // border-radius/background track the box via CSS — no re-raster
    if (this.element.dataset.declareApp !== undefined) { this.applyRootSize(); this.refreshTouchAction(); }
  }

  setHeight(v: number): void {
    this.frameH = v;
    this.element.style.height = v + "px";
    this.box.height = v;
    if (this.element.dataset.declareApp !== undefined) { this.applyRootSize(); this.refreshTouchAction(); }
  }

  /** The view-model frame (setWidth/setHeight, verbatim) — the ROOT element
   *  may realize LARGER than it along a declared scroll axis (applyRootSize). */
  private frameW = 0;
  private frameH = 0;

  /** ROOT only, stamped by attachRoot: this app is an EMBEDDED island in a
   *  host page — its gesture default is `manipulation`, never the geometry
   *  read (refreshTouchAction). */
  embeddedRoot = false;

  // ── Box decoration: CSS properties as PAINT PRIMITIVES where they are
  // MEASURED pixel-stable against the shared box painter — flat and square
  // (background, linear-gradient, the inset ring, box-shadow, blurred and
  // translucent included) — and the shared painter ITSELF, rasterized into a
  // per-view canvas, the moment cornerRadius > 0 (Chrome's border-radius
  // corner AA diverges from path AA by up to ~80/255 — the ruled fallback:
  // per-view rasterization wherever a CSS paint primitive proves
  // pixel-unstable). Either way the value painted is always the one resolved
  // value the attribute system produced — no selector, no cascade, no CSS
  // *model* anywhere. Cross-backend identity is pinned by the suite.

  setFill(f: Fill): void {
    this.fillV = f;
    // an editable already mounted here re-reads the scheme: a themed field's
    // fill arrives (and flips light↔dark) after the element exists
    if (this.editEl !== null) applyEditScheme(this.editEl, f);
    if (isGradient(f)) {
      this.box.gradient = f;
      this.box.fill = null;
    } else {
      this.box.gradient = null;
      this.box.fill = f === null ? null : colorToCss(f);
    }
    this.decorate();
  }

  setCornerRadius(r: number): void {
    // Rounds the painted box only — children are never clipped, matching
    // the recorded lean and the walk.
    this.box.cornerRadius = r;
    this.decorate();
  }

  setStroke(st: Stroke | null): void {
    this.box.stroke = st;
    this.decorate();
  }

  setShadow(sh: Shadow | null): void {
    this.box.shadow = sh;
    this.decorate();
  }

  /** Box decoration — pure CSS, ALWAYS (fill/gradient = background, cornerRadius
   *  = border-radius, shadow + inset ring = box-shadow). A rounded box is a
   *  plain composited div, NOT a per-view canvas raster: resizing it each frame
   *  then costs one cheap relayout instead of a GPU re-rasterization + command-
   *  buffer flush per box per frame (the jank that capped the zoom's frame rate).
   *  The old raster pinned corner AA to the Canvas backend's path AA pixel-for-
   *  pixel; border-radius corner AA differs by a few pixels per corner — absorbed
   *  by the suite's AA-tolerant compare (same class of difference as DOM text vs
   *  fillText), invisible to the eye, and the price of a 120fps zoom. One CSS
   *  property carries the drop shadow AND the inside border (an inset zero-blur
   *  ring — a CSS `border` would shift absolutely-positioned children). */
  private decorate(): void {
    const s = this.element.style;
    const f = this.fillV;
    s.background = f === null ? "" : isGradient(f)
      ? `linear-gradient(${f.angle}deg, ${f.stops
          .map((st) => colorToCss(st.color) + (st.offset === null ? "" : ` ${st.offset * 100}%`))
          .join(", ")})`
      : colorToCss(f);
    s.borderRadius = this.box.cornerRadius > 0 ? this.box.cornerRadius + "px" : "";
    const parts: string[] = [];
    const sh = this.box.shadow;
    if (sh !== null) parts.push(`${sh.dx}px ${sh.dy}px ${sh.blur}px ${colorToCss(sh.color)}`);
    const st = this.box.stroke;
    if (st !== null) parts.push(`inset 0 0 0 ${st.width}px ${colorToCss(st.color)}`);
    s.boxShadow = parts.join(", ");
  }

  /** Arm the shared dpr watch once (the drawing raster must stay crisp across
   *  zoom / display moves; box decoration is CSS and text/<img> re-render
   *  natively, so neither needs it). */
  private watchDpr(): void {
    if (this.watching) return;
    this.watching = true;
    onDprChange(
      () => !this.gone,
      () => { if (this.drawEl !== null) this.rasterize(); }
    );
  }

  setVisible(v: boolean): void { this.element.style.display = v ? "" : "none"; }

  setCursor(c: string): void { this.element.style.cursor = c; }

  // The authored pointerEvents attr OVERRIDES the sink-driven default (setInput
  // flips auto/none by sink presence; an explicit value must survive that).
  private peOverride = "";
  setPointerEvents(m: string): void {
    this.peOverride = m;
    this.updateCarved();
  }

  setOpacity(o: number): void {
    // OPACITY IS PAINT, NOT PRESENCE (ruled): a fully transparent view is still
    // hittable, subtree included. This used to force `visibility: hidden` at
    // opacity 0 to prune input — which is what CSS opacity does NOT do, so the
    // DOM arm disagreed with its own hit-testing, with the canvas walk, and with
    // the `hovered`/`pressed` intrinsics (which consider only `visible`). The
    // gates that mean "not there" are `visible` and `pointerEvents`; an author who
    // wants a fade to become absence writes `visible = { opacity > 0 }`.
    this.element.style.opacity = String(o);
  }

  setScale(scale: number, pivotX: number, pivotY: number): void {
    // A CSS transform is paint-only (never reflows siblings) and the browser
    // accounts for it in hit-testing, so a scaled interactive box stays
    // correctly clickable. Identity clears the property so an untouched view
    // pays nothing.
    if (scale === 1) {
      this.element.style.transform = "";
      this.element.style.transformOrigin = "";
    } else {
      this.element.style.transformOrigin = pivotX + "px " + pivotY + "px";
      this.element.style.transform = "scale(" + scale + ")";
    }
  }

  setClip(d: string | null): void {
    // clip-path clips native hit-testing along with the pixels, so the
    // clipped-away part of an interactive box falls through — the same
    // subtraction the canvas walk's isPointInPath makes. (For a clipped SINK
    // that promise needs help: see CARVED above and updateCarved below.)
    this.element.style.clipPath = d === null ? "" : `path("${d}")`;
    this.clipData = d;
    this.clipObj = null;
    this.updateCarved();
  }

  /** The Shape clip's path data / lazily-built Path2D (carved-hit testing). */
  private clipData: string | null = null;
  private clipObj: Path2D | null = null;

  /** Reconcile carved-sink state (see CARVED): membership, and the element's
   *  effective pointer-events — authored override > carved-inert > sink default. */
  private updateCarved(): void {
    const el = this.element;
    if (this.clipData !== null && SINKS.has(el)) CARVED.set(el, this);
    else CARVED.delete(el);
    el.style.pointerEvents =
      this.peOverride !== "" ? this.peOverride : CARVED.has(el) ? "none" : SINKS.has(el) ? "auto" : "none";
  }

  /** Does the viewport point fall in this carved sink's clipped region?
   *  Local coords unwind a uniform scale (rect vs layout box ratio), then the
   *  Path2D answers with the canvas walk's default nonzero rule. */
  carvedHit(cx: number, cy: number): boolean {
    const el = this.element;
    if (!el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || cx < r.left || cx >= r.right || cy < r.top || cy >= r.bottom) return false;
    // (No visibility test: `visible = false` is `display: none`, which already
    // fails the rect check above, and opacity no longer prunes input.)
    const k = el.offsetWidth > 0 ? r.width / el.offsetWidth : 1;
    this.clipObj ??= new Path2D(this.clipData!);
    return carveHitCtx().isPointInPath(this.clipObj, (cx - r.left) / k, (cy - r.top) / k);
  }

  /** True when this surface opts out of its parent's box-clip (ignoreClip). */
  ignoresClip = false;
  /** The lazy inner clip container (see setBoxClip), discovered BY SELECTOR so
   *  either side of the seam can find or materialize it — the parent (a clip
   *  arriving over exempt children) or the child (ignoreClip flushed after the
   *  insert). Every ordinary child lives inside it, the exempt ones stay on
   *  the outer element, and the outer keeps ALL decoration exactly as before
   *  (radius rounds paint; the box-shadow silhouette is the outer's).
   *  Pay-per-use: an app that never writes ignoreClip keeps today's
   *  single-element realization untouched. */
  private get clipBox(): HTMLElement | null {
    return this.element.querySelector(":scope > [data-declare-clipbox]");
  }

  setIgnoreClip(on: boolean): void {
    this.ignoresClip = on;
    const el = this.element;
    if (on) {
      el.dataset.declareIgnoreclip = "1";
      const p = el.parentElement;
      if (p !== null) {
        // adopted into a clip box before the flag flushed? hoist to the outer
        if (p.dataset.declareClipbox === "1" && p.parentElement !== null) p.parentElement.appendChild(el);
        // parent still single-element box-clipped? materialize its partition now
        else if (p.style.overflow === "clip") ensureClipBoxFor(p);
      }
    } else if (el.dataset.declareIgnoreclip) {
      delete el.dataset.declareIgnoreclip;
    }
  }

  setBoxClip(on: boolean): void {
    // clip arriving AFTER an exempt child was inserted: materialize the box now
    if (on && this.clipBox === null && this.element.querySelector(":scope > [data-declare-ignoreclip]") !== null) ensureClipBoxFor(this.element);
    // The box-clip is CONTAINMENT, not just paint (backend.ts): `overflow:
    // clip` clips pixels AND hit-testing to the box (rounded — it follows
    // border-radius), makes the element a non-scroll-container that no
    // focus/script/scrollIntoView can shift, and removes the children's
    // contribution to every ancestor's scrollable overflow — so a child
    // parked beyond a clipped box (the calendar's detail panel; a clipped
    // App frame) can never grow the document a scroll extent. `clip`, not
    // `hidden`: a hidden box is still a scroll container. The box tracks
    // automatically — no per-resize re-derive.
    if (this.clipBox !== null) this.clipBox.style.overflow = on ? "clip" : "";
    else this.element.style.overflow = on ? "clip" : "";
  }

  /** ROOT only (backend.ts): the App's reactive content extent. The page
   *  realization sizes the root ELEMENT to max(frame, extent) along each
   *  declared scroll axis — the box itself is the scroll range and the
   *  document scrolls it natively — and refreshes the gesture default. */
  setPageExtent(w: number, h: number): void {
    if (this.extentW === w && this.extentH === h) return;
    this.extentW = w;
    this.extentH = h;
    if (this.element.dataset.declareApp !== undefined) {
      this.applyRootSize();
      this.refreshTouchAction();
    }
  }
  private extentW = 0;
  private extentH = 0;

  /** Realize the ROOT element's box: the model frame, stretched to the
   *  content extent along a declared scroll axis (the page realization —
   *  the element IS the scroll range; `overflow: clip` everywhere else keeps
   *  exact frame containment with no per-axis overflow pairs). The view
   *  MODEL's width/height are untouched — this is realization only. */
  private applyRootSize(): void {
    const el = this.element;
    const w = this.scrollXOn ? Math.max(this.frameW, this.extentW) : this.frameW;
    const h = this.scrollYOn ? Math.max(this.frameH, this.extentH) : this.frameH;
    el.style.width = w + "px";
    el.style.height = h + "px";
  }

  scrollIntoView(align: "start" | "nearest" = "start", smooth = false): void {
    // Native walks the scrollable ancestors (document included) and does the
    // offset math; block:start aligns the view to the top (the click-to-jump
    // index), block:nearest moves the minimum distance (the focus reveal).
    // align drives BOTH axes: block for a vertical scroller, inline for a
    // horizontal one — so "nearest" reveals minimally and "start" pins the
    // element to the container's leading edge (a Miller strip's left). smooth animates.
    this.element.scrollIntoView({ block: align, inline: align, behavior: smooth ? "smooth" : "auto" });
  }

  revealRichAnchor(slug: string, _within: number): boolean {
    // The heading is a real element in the flow (setRichContent tagged it with
    // `data-anchor`); scroll IT — `within` is the canvas path's concern. Missing
    // ⇒ the flow hasn't rendered that heading yet (held intent, retried later).
    const el = this.richEl?.querySelector(`[data-anchor="${slug}"]`) as HTMLElement | null;
    if (el === null || el === undefined) return false;
    el.scrollIntoView({ block: "start" });
    return true;
  }

  // Which axes this surface scrolls (the `scrolls` enum, per axis). The two
  // setters below each own one axis and share this state so `both` composes:
  // the overflow/touch-action/containment styling is recomputed from the pair.
  private scrollYOn = false;
  private scrollXOn = false;
  /** Reconcile the scroller styling with the axis pair. A scrolling axis is
   *  native `auto` (the OS overlay scrollbar, momentum, edge bounce); the
   *  other axis of a scroller is `hidden` (out of frame — the axis rule);
   *  no axes = not a scroller at all. `contain` gives the pane its own
   *  rubber-band while refusing to chain a scroll-past up to the page; the
   *  touch-action DELEGATES exactly the declared axes' panning and keeps
   *  pinch-zoom delegated too (plain `pan-y` would silently forbid the
   *  user's pinch — a claim nobody made). */
  applyScrollStyle(): void {
    const el = this.element;
    if (el.dataset.declareApp !== undefined) {
      // THE PAGE REALIZATION (ruled 2026-07-29, v3 after WebKit measurement):
      // the App is the outermost view, so its scroll regime IS the browser's
      // own page scroll — never a pane. Realization: the root ELEMENT sizes
      // itself to max(frame, content extent) along each declared scroll axis
      // (applyRootSize) — the box itself is the scroll range, so the document
      // scrolls a plain tall element natively, with the browser's physics,
      // memory, and full gesture tier (the measured mid-scroll pinch upgrade
      // lives only here). `overflow: clip` stays on ALWAYS — the App's
      // definitional containment, exact at the frame on every non-scroll
      // axis, uniformly supported (the per-axis `clip`+`visible` pair is
      // spec'd but WebKit collapsed it and the page lost its scroll —
      // measured on iPad, 2026-07-29). Fixed chrome (ignoreScroll) escapes
      // ancestor overflow clipping by the platform's own containing-block
      // rule. Pane trappings are actively removed: attach ran before the
      // root was stamped, so the element may carry them from the pane branch.
      el.style.overflow = "clip";
      (el.style as CSSStyleDeclaration & { overscrollBehavior: string }).overscrollBehavior = "";
      delete el.dataset.declareScroll;
      this.applyRootSize();
      this.updateCarved();       // pointer-events back to the sink-derived state
      this.refreshTouchAction(); // the root default owns the gesture surface
      return;
    }
    const any = this.scrollYOn || this.scrollXOn;
    el.style.overflowY = this.scrollYOn ? "auto" : any ? "hidden" : "";
    el.style.overflowX = this.scrollXOn ? "auto" : any ? "hidden" : "";
    if (any) {
      el.dataset.declareScroll = "1";   // a native scroller — its offset is preserved across a DOM move (insertChild)
      (el.style as CSSStyleDeclaration & { overscrollBehavior: string }).overscrollBehavior = "contain";
      el.style.touchAction = `${this.scrollXOn ? "pan-x " : ""}${this.scrollYOn ? "pan-y " : ""}pinch-zoom`;
      // A scroll container accepts pointer/wheel events (its children stay
      // inert, so clicks still resolve to the sink under the pointer). Native
      // wheel then drives the box directly: abs children DO register
      // scrollable overflow, so the browser scrolls, momentums, and
      // rubber-bands with no manual offset math.
      el.style.pointerEvents = "auto";
    } else {
      (el.style as CSSStyleDeclaration & { overscrollBehavior: string }).overscrollBehavior = "";
      el.style.pointerEvents = "none";
      delete el.dataset.declareScroll;
      this.refreshTouchAction(); // back to whatever this view's own claim says
    }
  }

  private scrollListener: (() => void) | undefined;
  setScroll(on: boolean, onScroll: (y: number) => void): void {
    const el = this.element;
    this.scrollYOn = on;
    if (on) {
      if (this.scrollListener === undefined) {
        // Mirror the browser's offset back into the view's reactive `scrollY`:
        // fires for wheel, touch, momentum, scrollbar-drag, and programmatic
        // scrollTop alike — the one bridge the runtime needs.
        this.scrollListener = () => onScroll(el.scrollTop);
        el.addEventListener("scroll", this.scrollListener, { passive: true });
      }
    } else if (this.scrollListener !== undefined) {
      el.removeEventListener("scroll", this.scrollListener);
      this.scrollListener = undefined;
    }
    this.applyScrollStyle();
  }

  private wheelXListener: ((e: WheelEvent) => void) | undefined;
  private scrollXListener: (() => void) | undefined;
  setScrollX(on: boolean, onScroll?: (x: number) => void): void {
    const el = this.element;
    this.scrollXOn = on;
    if (on) {
      if (this.wheelXListener === undefined) {
        // Absolute-positioned content: a PLAIN vertical wheel won't drive a
        // horizontal box, so advance scrollLeft ourselves — from a trackpad's
        // horizontal delta or a shift+wheel. A vertical wheel is left alone
        // (it belongs to whatever scrolls vertically here or above).
        this.wheelXListener = (e: WheelEvent) => {
          const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
          if (dx === 0) return;
          const before = el.scrollLeft;
          el.scrollLeft = before + dx;
          if (el.scrollLeft !== before) e.preventDefault();
        };
        el.addEventListener("wheel", this.wheelXListener, { passive: false });
      }
      if (this.scrollXListener === undefined && onScroll !== undefined) {
        // scrollX parity with scrollY: mirror the offset into the reactive slot.
        this.scrollXListener = () => onScroll(el.scrollLeft);
        el.addEventListener("scroll", this.scrollXListener, { passive: true });
      }
    } else {
      if (this.wheelXListener !== undefined) { el.removeEventListener("wheel", this.wheelXListener); this.wheelXListener = undefined; }
      if (this.scrollXListener !== undefined) { el.removeEventListener("scroll", this.scrollXListener); this.scrollXListener = undefined; }
    }
    this.applyScrollStyle();
  }

  /** Native rich-text flow (RichText). Build ONE flowing content element — a block
   *  per RichBlock (real `<p>`/`<h*>` for a11y), inline runs in NORMAL flow (a
   *  `<span>`/`<code>`) — so the browser wraps, aligns baselines, and lets the user
   *  select/copy/find contiguously. Returns the measured (flowed) height. */
  setRichContent(blocks: RichBlock[], selectable: boolean, width: number, onResize: (height: number) => void, onLink: (href: string) => void): number {
    const doc = this.element.ownerDocument;
    let host = this.richEl;
    if (host === null) {
      host = this.richEl = doc.createElement("div");
      const s = host.style;
      s.position = "absolute"; s.left = "0"; s.top = "0";
      this.element.appendChild(host);
    }
    host.style.width = width + "px";
    host.textContent = "";
    const selRealized = selectable && !COARSE; // coarse: default-selectable page, inert runs (see COARSE)
    host.style.userSelect = selRealized ? "text" : "";
    (host.style as CSSStyleDeclaration & { webkitUserSelect: string }).webkitUserSelect = selRealized ? "text" : "";
    host.style.pointerEvents = selRealized ? "auto" : "none";
    for (const b of blocks) {
      // A `pre` block is a real <pre>: whitespace preserved and, being code, it does
      // NOT wrap — long lines keep their shape and the block scrolls HORIZONTALLY
      // (native overflow-x), the way an editor shows code. Its height stays a stable
      // lines×lineHeight (no width-dependent reflow), so the flow measures it cleanly.
      // Its runs carry the monospace family and per-token colors, so it is one
      // contiguous, selectable, syntax-colored element.
      const be = doc.createElement(b.pre ? "pre" : /^h[1-6]$/.test(b.tag) ? b.tag : "p");
      // A heading carries its anchor slug so a `@name` reveal (location.md §6) can
      // find this exact element and scroll it into view natively.
      if (b.anchor !== undefined) be.setAttribute("data-anchor", b.anchor);
      const bs = be.style;
      bs.margin = "0"; bs.marginTop = b.gapBefore + "px";
      // Line box in PX — round(fontSize × lineHeight), NOT a unitless multiplier:
      // pinned so it keys off the block's own size (not the inherited cascade) and
      // matches the Canvas backend's line advance exactly (conformity).
      bs.fontSize = b.fontSize + "px";
      bs.lineHeight = Math.round(b.fontSize * b.lineHeight) + "px";
      if (b.pre) { bs.whiteSpace = "pre"; bs.overflowX = "auto"; bs.overflowY = "hidden"; }
      else bs.whiteSpace = "normal";
      if (b.align !== undefined && b.align !== "left") bs.textAlign = b.align;
      for (const r of b.runs) {
        if ("br" in r) { be.appendChild(doc.createElement("br")); continue; }
        // A link run is a REAL <a href> — native hover URL, right/middle/⌘-click
        // open-in-tab — but a plain left click routes through `onLink` so the app,
        // not the browser, decides (scroll, in-app route, or app.navigate).
        const isLink = r.href !== undefined;
        const el = doc.createElement(isLink ? "a" : r.chipBg !== undefined ? "code" : "span");
        const rs = el.style;
        if (isLink) {
          (el as HTMLAnchorElement).href = r.href!;
          rs.textDecoration = "none"; rs.cursor = "pointer"; rs.pointerEvents = "auto";
          el.addEventListener("click", (e) => {
            const m = e as MouseEvent;
            if (m.button === 0 && !m.metaKey && !m.ctrlKey && !m.shiftKey && !m.altKey) { e.preventDefault(); onLink(r.href!); }
          });
        }
        rs.fontFamily = r.family;
        rs.fontSize = r.size + "px";
        rs.fontWeight = cssWeight(r.weight);
        if (r.italic) rs.fontStyle = "italic";
        rs.color = colorToCss(r.color);
        // A themed accent fill overrides the solid color: a gradient clips a
        // background to the glyphs (matching Text.textFill and the Canvas ramp),
        // a solid fill is just that color.
        if (r.fill != null) {
          if (isGradient(r.fill)) {
            rs.backgroundImage = `linear-gradient(${r.fill.angle}deg, ${r.fill.stops.map((g) => colorToCss(g.color) + (g.offset === null ? "" : ` ${g.offset * 100}%`)).join(", ")})`;
            (rs as CSSStyleDeclaration & { webkitBackgroundClip: string }).webkitBackgroundClip = "text";
            rs.backgroundClip = "text";
            (rs as CSSStyleDeclaration & { webkitTextFillColor: string }).webkitTextFillColor = "transparent";
            rs.color = "transparent";
          } else {
            rs.color = colorToCss(r.fill);
          }
        }
        if (r.tracking !== 0) rs.letterSpacing = r.tracking + "px";
        if (r.strike) rs.textDecoration = "line-through";
        if (r.chipBg !== undefined) {
          rs.backgroundColor = colorToCss(r.chipBg);
          rs.borderRadius = "4px"; rs.padding = "1px 5px";
        }
        el.textContent = r.text;
        be.appendChild(el);
      }
      host.appendChild(be);
    }
    // Watch the flowed height: offsetHeight can read 0 here (attached inside a
    // momentarily zero-sized ancestor during a page transition, or before a web
    // font loads), and it also changes when a font arrives. The observer reports
    // the settled height back so the RichText — and the stack around it — correct.
    if (typeof ResizeObserver !== "undefined") {
      const measured = host;
      if (this.richObserver === null) {
        this.richObserver = new ResizeObserver(() => this.onRichResize?.(measured.offsetHeight));
        this.richObserver.observe(measured);
      }
      this.onRichResize = onResize;
    }
    return host.offsetHeight;      // forced layout → the flowed height
  }

  setEmbed(id: string, view?: unknown): void {
    // An HTML island: the host queries `[data-declare-slot="…"]` and mounts foreign
    // content inside this Declare-sized element; the tenant fills the box (100%), so
    // Declare's width/height constraints drive its size with no coordinate sync.
    const s = this.element.style;
    const webkit = s as CSSStyleDeclaration & { webkitUserSelect: string };
    const el = this.element as HTMLElement & { __declareView?: unknown };
    if (id === "") {
      delete this.element.dataset.declareSlot;
      delete el.__declareView;
      // Back to the painted-UI defaults: pointer-inert, unselectable.
      s.pointerEvents = "none";
      s.userSelect = "";
      webkit.webkitUserSelect = "";
    } else {
      this.element.dataset.declareSlot = id;
      // the view back-reference the name-mirror writes `childName` onto, plus a
      // start of that mirror (self-retiring, so it only runs while islands live)
      el.__declareView = view;
      ensureEmbeddedNameMirror();
      // A live foreign surface, not painted UI: its interior owns hits and
      // native text selection. Declare's model makes every view pointer-inert
      // (pointerEvents:none) and unselectable (user-select:none inherits from
      // the root) — an island opts BACK in for both, so an iframe receives
      // clicks and a text field selects, whether or not the View has a sink.
      // (On a coarse-pointer device the root never set `none` and explicit
      // `text` islands feed iOS's pan-stealing text gesture — see COARSE —
      // so only the pointer half applies there; native editables inside the
      // island still opt into selection themselves.)
      s.pointerEvents = "auto";
      s.userSelect = COARSE ? "" : "text";
      webkit.webkitUserSelect = COARSE ? "" : "text";
    }
  }

  setInput(sink: InputSink | null, wants?: InputWants): void {
    if (sink !== null) SINKS.set(this.element, sink);
    else SINKS.delete(this.element);
    if (sink !== null && wants !== undefined) WANTS.set(this.element, wants);
    else WANTS.delete(this.element);
    // Declaring a handler CLAIMS from the browser exactly what that handler
    // needs to fire (refreshTouchAction realizes it as this element's
    // touch-action, covering the subtree by CSS's own chain rule).
    this.refreshTouchAction();
    // The wheel claim is not a touch-action: it is a non-passive listener that
    // takes the wheel stream — trackpad pinch included, which arrives as
    // ctrlKey wheels — before the browser scrolls the page or zooms it.
    // The hold-gated drag's live half: while a hold-capture is up (the hold
    // fired with this finger down), suppress the browser's pan takeover so
    // the post-hold moves belong to the app. Non-passive by necessity; costs
    // nothing to views that never declare the pair.
    const holdGate = sink !== null && wants?.wantsDrag === true && wants?.wantsHold === true;
    if (holdGate && this.holdGateListener === undefined) {
      this.holdGateListener = (e: TouchEvent) => { if (holdCaptureActive()) e.preventDefault(); };
      this.element.addEventListener("touchmove", this.holdGateListener, { passive: false });
    } else if (!holdGate && this.holdGateListener !== undefined) {
      this.element.removeEventListener("touchmove", this.holdGateListener);
      this.holdGateListener = undefined;
    }
    const wantsWheel = sink !== null && wants?.wantsWheel === true;
    if (wantsWheel && this.wheelListener === undefined) {
      const el = this.element;
      this.wheelListener = (e: WheelEvent) => {
        // Nearest claim wins, and delegation beats a claim: walk from the real
        // target up to this element — an intervening native scroller keeps its
        // wheel (a `scrolls` pane inside a claiming subtree still scrolls), a
        // nearer onWheel view has already taken it, an editable or an island
        // keeps its native interior.
        for (let t = e.target instanceof HTMLElement ? e.target : null; t !== null && t !== el; t = t.parentElement) {
          if (t.dataset.declareScroll !== undefined) return;
          if (t.dataset.declareSlot !== undefined) return;
          if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
          if (WANTS.get(t)?.wantsWheel === true) return;
        }
        const s = SINKS.get(el);
        if (s === undefined) return;
        const r = el.getBoundingClientRect();
        // View-local point (the positional rule of pointerDown/click), the raw
        // deltas, and `pinch`: a trackpad pinch arrives on the wheel stream
        // with the zoom-intent flag set (a mouse user's ctrl+wheel zoom
        // reports the same way) — one handler hears wheels, trackpad scrolls,
        // and trackpad pinches.
        s("wheel", e.clientX - r.left, e.clientY - r.top, { deltaX: e.deltaX, deltaY: e.deltaY, pinch: e.ctrlKey });
        e.preventDefault();
      };
      el.addEventListener("wheel", this.wheelListener, { passive: false });
    } else if (!wantsWheel && this.wheelListener !== undefined) {
      this.element.removeEventListener("wheel", this.wheelListener);
      this.wheelListener = undefined;
    }
    this.updateCarved();
  }

  private wheelListener: ((e: WheelEvent) => void) | undefined;
  private holdGateListener: ((e: TouchEvent) => void) | undefined;

  /** Realize this element's gesture CLAIM as its `touch-action` — the language
   *  rule "the browser owns a gesture until a view claims it, and declaring
   *  the handler is the claim", compressed to one CSS property per element:
   *    - the raw touch family → `none` (every finger is the app's; the app
   *      owes its own zoom);
   *    - `onPointerMove` → `pinch-zoom` (the single-finger drag is the app's;
   *      pinch stays the user's — and by the measured one-way ratchet this is
   *      the MINIMUM suppression for the handler to fire at all);
   *    - no claim → inherit, except the APP ROOT's default: `pinch-zoom` for
   *      a clipped (fixed-window) app, `manipulation` (pan + pinch) for one
   *      the browser scrolls — both retire double-tap zoom, which a painted
   *      UI can never concede (two quick taps on a control must not lurch
   *      the page).
   *  A scroll pane owns its own value (setScroll's `pan-y pinch-zoom`) and is
   *  left alone. */
  refreshTouchAction(): void {
    const el = this.element;
    if (el.dataset.declareScroll !== undefined) return;
    const w = WANTS.get(el);
    let ta = "";
    if (w?.wantsTouch === true) ta = "none";
    // A drag view that ALSO holds is HOLD-GATED (ruled 2026-07-29): it claims
    // nothing at touchdown — the quick swipe stays the browser's pan — and
    // takes the finger only when the hold fires (the non-passive touchmove
    // suppressor below, keyed on input.ts holdCaptureActive).
    else if (w?.wantsDrag === true && w?.wantsHold !== true) ta = "pinch-zoom";
    else if (el.dataset.declareApp !== undefined) {
      // The ROOT default keys on the App's reactive page-scrollability fact
      // (setPageScrollable — geometry, never any attribute): pan stays with
      // the user exactly when the page has somewhere to go; when it doesn't,
      // pan retires — stilling the rubber-band — and pinch stays. Double-tap
      // zoom retires either way: a painted UI never concedes it.
      // TOP-LEVEL only: an EMBEDDED app root (an island in a host page) fits
      // its box, so the geometry default below would read "nothing to
      // scroll", retire pan, and eat every swipe that starts over the island
      // — when the finger belongs to the HOST page's regime. Its default is
      // `manipulation`: pan and pinch stay with the user (chaining to the
      // host page), double-tap zoom retires — a painted UI never concedes
      // it. Declared claims (the branches above) still stand. The fact is
      // attachRoot's own (stamped there): the element is not yet in the host
      // when the attach-time refresh runs, so ancestry can't answer here.
      if (this.embeddedRoot) {
        el.style.touchAction = "manipulation";
        return;
      }
      // pan stays with the user exactly when the page has somewhere to go:
      // the REALIZED root box (frame stretched to content on scroll axes)
      // against the live viewport
      const de = el.ownerDocument.documentElement;
      const effW = this.scrollXOn ? Math.max(this.frameW, this.extentW) : this.frameW;
      const effH = this.scrollYOn ? Math.max(this.frameH, this.extentH) : this.frameH;
      ta = effW > de.clientWidth + 1 || effH > de.clientHeight + 1 ? "manipulation" : "pinch-zoom";
    }
    el.style.touchAction = ta;
  }

  /** `ignoreScroll` (backend.ts): this surface rides its nearest enclosing
   *  scroll FRAME. Realization by altitude, read off the element's ancestry:
   *  under the page regime (the app root), `position: fixed` — pinned to the
   *  viewport, contributing no document extent, exactly the platform's own
   *  meaning; under a pane, the element moves into the pane's STICKY FRAME
   *  (a zero-size in-flow `position: sticky` child of the scroller), which
   *  the compositor holds at the pane's frame origin — no per-frame JS, no
   *  lag. Idempotent; re-run when the root is stamped (attachRoot sweeps). */
  setIgnoreScroll(on: boolean): void {
    const el = this.element;
    if (on) el.dataset.declareIgnorescroll = "1";
    else delete el.dataset.declareIgnorescroll;
    realizeIgnoreScroll(el);
  }

  setEditable(spec: EditableSpec | null): void {
    if (spec === null) {
      this.editEl?.remove();
      this.editEl = null;
      this.edit = null;
      return;
    }
    const tag = spec.multiline ? "textarea" : "input";
    let el = this.editEl;
    if (el === null || el.tagName.toLowerCase() !== tag) {
      el?.remove();
      el = document.createElement(tag) as HTMLInputElement | HTMLTextAreaElement;
      const s = el.style;
      // Fill the surface box; transparent so the view's own box paint shows
      // through, and interactive (it IS the editable). No native chrome.
      s.position = "absolute";
      s.left = "0";
      s.top = "0";
      s.width = "100%";
      s.height = "100%";
      s.margin = "0";
      s.padding = "0";
      s.border = "0";
      s.boxSizing = "border-box";
      s.background = "transparent";
      s.outline = "none";
      // An editable opts back INTO selection (the root turned it off); the
      // caret/selection is the whole point of a text field.
      s.userSelect = "text";
      (s as CSSStyleDeclaration & { webkitUserSelect: string }).webkitUserSelect = "text";
      s.touchAction = "auto";
      (s as CSSStyleDeclaration & { resize: string }).resize = "none";
      s.pointerEvents = "auto";
      // Native scrollbar for a scrolling code field (macOS overlay).
      const self = el;
      el.addEventListener("input", () => this.edit?.onInput(self.value));
      el.addEventListener("focus", () => this.edit?.onFocus());
      el.addEventListener("blur", () => this.edit?.onBlur());
      el.addEventListener("keydown", (e) => {
        if (!(this.edit?.multiline ?? false) && (e as KeyboardEvent).key === "Enter") this.edit?.onEnter?.();
      });
      this.element.appendChild(el);
      this.editEl = el;
    }
    this.edit = spec;
    if (el.value !== spec.value) el.value = spec.value; // guard: don't reset the caret on an echo
    el.spellcheck = spec.spellcheck; // code fields turn the red squiggles off
    el.style.padding = spec.padding > 0 ? `${spec.padding}px` : "0";
    // no-wrap = one line per line + horizontal scroll (both native to a textarea
    // whose wrap attribute is "off"); soft = the wrapping default.
    if (el instanceof HTMLTextAreaElement) {
      el.wrap = spec.wrap ? "soft" : "off";
      el.style.whiteSpace = spec.wrap ? "pre-wrap" : "pre";
      el.style.overflow = "auto";
    }
    (el as HTMLInputElement).placeholder = spec.placeholder;
    applyEditStyle(el, spec.style);
    applyEditScheme(el, this.fillV);
  }

  activateEditable(active: boolean): void {
    if (this.editEl === null) return;
    if (active) this.editEl.focus();
    else this.editEl.blur();
  }

  setText(text: string): void {
    this.textRun().textContent = text;
  }

  setTextStyle(st: TextStyle): void {
    const s = this.textRun().style;
    s.fontFamily = st.fontFamily;
    s.fontSize = st.fontSize + "px";
    s.fontWeight = cssWeight(st.fontWeight);
    s.fontStyle = st.italic ? "italic" : "normal";
    s.letterSpacing = st.letterSpacing === 0 ? "normal" : st.letterSpacing + "px";
    // A gradient text-fill clips a background to the glyphs (the canvas backend
    // realizes the same ramp over the box); a solid fill is the plain color.
    const tf = st.textFill;
    if (tf != null && isGradient(tf)) {
      s.backgroundImage = `linear-gradient(${tf.angle}deg, ${tf.stops
        .map((g) => colorToCss(g.color) + (g.offset === null ? "" : ` ${g.offset * 100}%`))
        .join(", ")})`;
      (s as CSSStyleDeclaration & { webkitBackgroundClip: string }).webkitBackgroundClip = "text";
      s.backgroundClip = "text";
      (s as CSSStyleDeclaration & { webkitTextFillColor: string }).webkitTextFillColor = "transparent";
      s.color = "transparent";
    } else {
      s.backgroundImage = "";
      s.backgroundClip = "";
      (s as CSSStyleDeclaration & { webkitTextFillColor: string }).webkitTextFillColor = "";
      s.color = colorToCss(st.color);
    }
    const sh = st.shadow ?? null;
    s.textShadow = sh === null ? "" : `${sh.dx}px ${sh.dy}px ${sh.blur}px ${colorToCss(sh.color)}`;
    // Wrapping: a bounded box wraps (`pre-wrap`) and the run fills the box
    // width so the browser breaks lines; an unbounded run stays a single line
    // (`pre`) and shrinks to content. (Canvas wrapping via pretext is its own rung.)
    s.whiteSpace = st.wrap ? "pre-wrap" : "pre";
    const align = st.align ?? "left";
    s.textAlign = align;
    // The run fills the box when it must: a wrapping run (to break lines) or a
    // non-left single line (so textAlign has a box to align within). A plain
    // left run stays shrink-to-content, preserving auto-size.
    s.width = st.wrap || align !== "left" ? "100%" : "";
    // Pin the first baseline to the font ascent: a line-height of exactly
    // ascent+descent leaves no half-leading, so DOM text and the Canvas
    // backend's fillText(…, ascent) place identical glyph geometry.
    const m = fontMetrics(fontString(st));
    s.lineHeight = m.ascent + m.descent + "px";
    // Selection: the app root sets `user-select: none` (a UI, not a document);
    // `selectable` opts THIS run back in — user-select plus a real pointer target
    // (the run is otherwise pointer-inert so hits fall through to the box). Off
    // ⇒ restore the inert default.
    const sel = st.selectable === true && !COARSE; // coarse: see COARSE above
    s.userSelect = sel ? "text" : "";
    (s as CSSStyleDeclaration & { webkitUserSelect: string }).webkitUserSelect = sel ? "text" : "";
    s.pointerEvents = sel ? "auto" : "none";
  }

  /** The text run element, created on first use. A positioned <span> — not a
   *  bare text node — so it paints in element order with the other content
   *  (in-flow text would paint *under* positioned siblings), matching the
   *  Canvas walk's content order. */
  private textRun(): HTMLSpanElement {
    if (this.textEl === null) {
      const el = document.createElement("span");
      const s = el.style;
      s.position = "absolute";
      s.left = "0";
      s.top = "0";
      s.whiteSpace = "pre"; // a run never wraps (wrap semantics: open question)
      // Content is pointer-inert (here and for img/drawing below): the hit
      // region is the view's geometry BOX, so a glyph run overflowing an
      // explicit box can't grow it — keeping DOM hits identical to the
      // canvas walk's box test. (Native text selection goes with this;
      // it returns via a future `selectable` attribute — HANDOFF §R5.)
      s.pointerEvents = "none";
      this.placeContent(el, this.imgEl, this.drawEl);
      this.textEl = el;
    }
    return this.textEl;
  }

  /** Insert a content element at its slot in the fixed content paint order —
   *  box raster, image, drawing, text, then child surfaces (the Canvas
   *  walk's order) —
   *  by anchoring after the last present content element that precedes it
   *  (or at the very front). Appending would be wrong for content that
   *  arrives LATE: an <img> lands asynchronously on load, after the child
   *  surfaces attached, and must not cover them (found by weather's
   *  topBar, whose bitmap covered the zip Text child). */
  private placeContent(el: HTMLElement, ...prior: (HTMLElement | null)[]): void {
    let anchor: ChildNode | null = this.element.firstChild;
    for (const p of prior) {
      if (p !== null) anchor = p.nextSibling;
    }
    this.element.insertBefore(el, anchor);
  }

  setImage(image: HTMLImageElement | null): void {
    this.imgEl?.remove();
    this.imgEl = image;
    if (image !== null) {
      const s = image.style;
      s.position = "absolute";
      s.left = "0";
      s.top = "0";
      s.pointerEvents = "none"; // content is inert — hits are box-geometry
      this.applyStretch();
      this.placeContent(image);
    }
  }

  setImageStretch(stretch: Stretch): void {
    this.stretch = stretch;
    if (this.imgEl !== null) this.applyStretch();
  }

  /** `100%` tracks the view box natively (a later resize costs no image
   *  bookkeeping); the un-stretched axis is pinned to the NATURAL dimension —
   *  CSS `auto` would preserve the intrinsic ratio and drag it along with the
   *  stretched axis, which is not what a single-axis stretch means (the
   *  canvas walk draws the un-stretched axis at natural size; found by
   *  weather's `stretches=width` tab art). The element is always loaded
   *  when it crosses the seam, so the natural size is known. */
  private applyStretch(): void {
    const img = this.imgEl!;
    const s = img.style;
    s.width = this.stretch === "width" || this.stretch === "both" ? "100%" : `${img.naturalWidth}px`;
    s.height = this.stretch === "height" || this.stretch === "both" ? "100%" : `${img.naturalHeight}px`;
  }

  setDrawing(list: DisplayList | null): void {
    this.drawing = list;
    if (list === null || list.bounds === null) {
      this.drawEl?.remove();
      this.drawEl = null;
      return;
    }
    if (this.drawEl === null) {
      const c = document.createElement("canvas");
      c.style.position = "absolute";
      c.style.pointerEvents = "none"; // content is inert — hits are box-geometry
      this.placeContent(c, this.imgEl);
      this.drawEl = c;
      this.watchDpr();
    }
    this.rasterize();
  }

  /** Rasterize the recording into this view's canvas, sized to the bounds at
   *  the current devicePixelRatio; CSS size is derived from the backing
   *  store so device pixels map 1:1. */
  private rasterize(): void {
    const c = this.drawEl!;
    const b = this.drawing!.bounds!;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.ceil(b.w * dpr));
    const h = Math.max(1, Math.ceil(b.h * dpr));
    c.width = w;
    c.height = h;
    c.style.left = b.x + "px";
    c.style.top = b.y + "px";
    c.style.width = w / dpr + "px";
    c.style.height = h / dpr + "px";
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, -b.x * dpr, -b.y * dpr);
    replay(ctx, this.drawing!);
  }

  insertChild(child: Surface, before: Surface | null): void {
    // insertBefore both parents and MOVES an existing child — exactly the
    // seam's contract; null appends. A move relayouts the subtree, which resets
    // any native scroller's offset inside it (Chrome) — so a window raised from
    // behind would jump its scrolled interior to the origin. Snapshot the marked
    // scrollers (setScroll/setScrollX) and restore them, making a raise a pure
    // z-order change (the dock-focus expectation).
    const el = (child as DomSurface).element;
    const scrollers: HTMLElement[] = el.dataset.declareScroll ? [el] : [];
    el.querySelectorAll<HTMLElement>("[data-declare-scroll]").forEach((s) => scrollers.push(s));
    const saved = scrollers.map((s) => [s, s.scrollLeft, s.scrollTop] as const);
    // An ignoreClip child stays on the OUTER element (marked so ensureClipBox
    // never adopts it); ordinary children live in the clip box once one exists.
    // `before` may live in the other container — then fall back to append (the
    // partition quantizes cross-container order: exempt children stack below or
    // above the clipped set by which side of it they were declared on).
    const exempt = (child as DomSurface).ignoresClip;
    if (exempt) el.dataset.declareIgnoreclip = "1";
    else if (el.dataset.declareIgnoreclip) delete el.dataset.declareIgnoreclip;
    if (exempt && this.clipBox === null && this.element.style.overflow === "clip") ensureClipBoxFor(this.element);
    const target = exempt ? this.element : (this.clipBox ?? this.element);
    const beforeEl = before === null ? null : (before as DomSurface).element;
    target.insertBefore(el, beforeEl !== null && beforeEl.parentElement === target ? beforeEl : null);
    for (const [s, l, t] of saved) { if (s.scrollLeft !== l) s.scrollLeft = l; if (s.scrollTop !== t) s.scrollTop = t; }
    // an ignoreScroll child's realization depends on the ancestry it just
    // gained — resolve it now that the context exists
    if (el.dataset.declareIgnorescroll !== undefined) realizeIgnoreScroll(el);
  }

  destroy(): void {
    this.gone = true; // quiets any armed dpr listener
    this.richObserver?.disconnect();
    this.onRichResize = undefined;
    CARVED.delete(this.element);
    this.element.remove();
  }
}
