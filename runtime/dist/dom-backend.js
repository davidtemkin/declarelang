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
import { colorToCss, isGradient } from "./value.js";
import {} from "./boxpaint.js";
import { fontMetrics, fontString, cssWeight } from "./measure.js";
import { replay } from "./draw.js";
import { onDprChange } from "./dpr.js";
import { routeInput } from "./input.js";
/** Style a native editable element to match the view's painted text metrics, so
 *  the caret and glyphs sit exactly where the static measure would place them. */
function applyEditStyle(el, st) {
    const s = el.style;
    s.fontFamily = st.fontFamily;
    s.fontSize = st.fontSize + "px";
    s.fontWeight = cssWeight(st.fontWeight);
    s.letterSpacing = st.letterSpacing === 0 ? "normal" : st.letterSpacing + "px";
    s.color = colorToCss(st.color);
    const m = fontMetrics(fontString(st));
    s.lineHeight = m.ascent + m.descent + "px";
}
/** Element → its surface's input sink. Setting a sink is also what flips the
 *  element's pointer-events on, so membership here and native hit-testability
 *  are the same fact. Module-level (not per-backend) because DomBackend is
 *  stateless; a WeakMap adds no lifetime. */
const SINKS = new WeakMap();
export class DomBackend {
    createSurface() {
        return new DomSurface();
    }
    attachRoot(host, root) {
        // Is this app EMBEDDED inside another neo app (rendered into an island box
        // that lives in an outer app's marked tree)? An embedded app owns only its
        // box: it must NOT repaint the page's <body> background, and the outer app's
        // input router must ignore events inside it (see the boundary check below).
        const embedded = typeof host.closest === "function" && host.closest("[data-neo-app]") !== null;
        // Every surface is absolutely positioned (see DomSurface), so the tree
        // needs a positioned ancestor to anchor to; otherwise the root would
        // position against the viewport instead of `host` on a plain (static)
        // host element. Only touch it if the caller hasn't already opted into
        // a positioning scheme of their own.
        if (getComputedStyle(host).position === "static")
            host.style.position = "relative";
        const rootEl = root.element;
        // Mark the app root: the ONE DOM signal a child reads to know it is embedded
        // (index.ts isEmbedded), and the boundary the input router stops at so an
        // outer app never double-handles a click that belongs to an embedded child.
        rootEl.dataset.neoApp = "";
        // Views are a painted UI, not a document: a press-drag (event drag, and any
        // future gesture) must not start a native text/element selection. Suppress
        // it once at the root — `user-select` inherits, so every view div is covered
        // (editable fields opt back IN, see setEditable). `touch-action: none` is
        // the same intent for touch: the app owns the gesture, not the browser.
        rootEl.style.userSelect = "none";
        rootEl.style.webkitUserSelect = "none";
        rootEl.style.touchAction = "none";
        // The App is a FIXED FRAME: every view and interaction lives inside the
        // window, and the browser must never scroll the frame itself — scrolling
        // is per-VIEW (`scrolls = true`). Without this, a child parked beyond the
        // frame (the calendar's detail panel waiting at x > width) is
        // absolutely-positioned OVERFLOW, which the browser counts as scrollable:
        // the document grows a scroll extent, and focusing an off-frame field
        // auto-scrolls the whole app sideways. `clip`, not `hidden` — a hidden box
        // is still a scroll container (focus/JS can move it); clip forbids ALL
        // scrolling and removes the overflow contribution entirely. This also
        // matches the canvas backend, whose frame physically cannot reveal
        // off-frame content.
        rootEl.style.overflow = "clip";
        host.appendChild(rootEl);
        // The same rule for the DOCUMENT on a top-level mount (defense in depth:
        // the app no longer overflows, and nothing else on a host page may scroll
        // the frame either). An embedded app owns only its box and must not touch
        // the page's scrolling.
        if (!embedded)
            host.ownerDocument.documentElement.style.overflow = "clip";
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
        // Input: the browser's own hit-test picks the target (only sinked
        // surface elements accept pointer events — everything else is
        // pointer-inert, see DomSurface), so resolution is just "walk up to the
        // nearest surface with a sink and localize the point to its box". The
        // pairing/click rule is the shared router's (input.ts).
        routeInput(() => rootEl.isConnected, (e) => {
            let el = e.target instanceof HTMLElement && rootEl.contains(e.target) ? e.target : null;
            while (el !== null) {
                // Stop at a nested app root: an embedded child's tree is inside THIS
                // rootEl, so without this guard the outer router would walk up into the
                // child, find its (globally-shared) sink, and fire it a second time.
                if (el !== rootEl && el.hasAttribute("data-neo-app"))
                    return null;
                if (SINKS.has(el))
                    break;
                el = el === rootEl ? null : el.parentElement;
            }
            if (el === null)
                return null;
            const r = el.getBoundingClientRect();
            return { key: el, sink: SINKS.get(el), x: e.clientX - r.left, y: e.clientY - r.top };
        }, (e) => {
            const r = rootEl.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        });
        // Tap-to-dismiss for native editable fields. Desktop blurs a focused
        // input/textarea when you press a non-focusable element, but mobile Safari
        // keeps focus (and the keyboard) up when a plain view is tapped — so blur it
        // explicitly. A pointerdown that lands OUTSIDE the focused field blurs it;
        // capture phase runs before the field could re-assert focus, and a tap ON a
        // field (this one or another) is left to native focus handling. The listener
        // is scoped to this app's rootEl (an embedded app won't dismiss for taps in
        // its neighbours) and dies with the element — no teardown needed.
        rootEl.addEventListener("pointerdown", (e) => {
            const active = doc.activeElement;
            if (!(active instanceof HTMLElement))
                return;
            if (active.tagName !== "INPUT" && active.tagName !== "TEXTAREA")
                return;
            if (!rootEl.contains(active))
                return;
            const t = e.target;
            if (t instanceof Element && t.closest("input,textarea") !== null)
                return;
            active.blur();
        }, true);
    }
}
// Scrollbars are the platform's own. An earlier build injected a persistent,
// space-reserving `::-webkit-scrollbar` (+ `scrollbar-gutter: stable`) so a bar was
// always visible — but styling `::-webkit-scrollbar` opts Safari OUT of its native
// overlay bar and into a wide, always-on legacy one, which is not what a macOS app
// should look like. We now inject nothing: `overflow: auto` gives each pane the OS
// default — an overlay bar that appears on scroll and widens on hover (macOS), or
// the classic bar the OS/user setting dictates elsewhere.
class DomSurface {
    element;
    textEl = null;
    editEl = null;
    edit = null;
    richEl = null;
    richObserver = null;
    onRichResize;
    imgEl = null;
    drawEl = null;
    drawing = null;
    stretch = "none";
    /** The box's retained paint state — cornerRadius/stroke/shadow that decorate()
     *  brushes onto the div as CSS. `fillV` keeps the raw Fill for the gradient
     *  string. (The box is the div itself, painting beneath its children — no
     *  per-view canvas.) */
    box = {
        width: 0, height: 0, fill: null, gradient: null, cornerRadius: 0, stroke: null, shadow: null,
    };
    fillV = null;
    /** Set once the drawing raster has ever existed (arms the dpr watch once). */
    watching = false;
    gone = false;
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
    setX(v) { this.element.style.left = v + "px"; }
    setY(v) { this.element.style.top = v + "px"; }
    setWidth(v) {
        this.element.style.width = v + "px";
        this.box.width = v; // border-radius/background track the box via CSS — no re-raster
    }
    setHeight(v) {
        this.element.style.height = v + "px";
        this.box.height = v;
    }
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
    setFill(f) {
        this.fillV = f;
        if (isGradient(f)) {
            this.box.gradient = f;
            this.box.fill = null;
        }
        else {
            this.box.gradient = null;
            this.box.fill = f === null ? null : colorToCss(f);
        }
        this.decorate();
    }
    setCornerRadius(r) {
        // Rounds the painted box only — children are never clipped, matching
        // the recorded lean and the walk.
        this.box.cornerRadius = r;
        this.decorate();
    }
    setStroke(st) {
        this.box.stroke = st;
        this.decorate();
    }
    setShadow(sh) {
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
    decorate() {
        const s = this.element.style;
        const f = this.fillV;
        s.background = f === null ? "" : isGradient(f)
            ? `linear-gradient(${f.angle}deg, ${f.stops
                .map((st) => colorToCss(st.color) + (st.offset === null ? "" : ` ${st.offset * 100}%`))
                .join(", ")})`
            : colorToCss(f);
        s.borderRadius = this.box.cornerRadius > 0 ? this.box.cornerRadius + "px" : "";
        const parts = [];
        const sh = this.box.shadow;
        if (sh !== null)
            parts.push(`${sh.dx}px ${sh.dy}px ${sh.blur}px ${colorToCss(sh.color)}`);
        const st = this.box.stroke;
        if (st !== null)
            parts.push(`inset 0 0 0 ${st.width}px ${colorToCss(st.color)}`);
        s.boxShadow = parts.join(", ");
    }
    /** Arm the shared dpr watch once (the drawing raster must stay crisp across
     *  zoom / display moves; box decoration is CSS and text/<img> re-render
     *  natively, so neither needs it). */
    watchDpr() {
        if (this.watching)
            return;
        this.watching = true;
        onDprChange(() => !this.gone, () => { if (this.drawEl !== null)
            this.rasterize(); });
    }
    setVisible(v) { this.element.style.display = v ? "" : "none"; }
    setOpacity(o) {
        this.element.style.opacity = String(o);
        // opacity 0 prunes the subtree for input, like the canvas walk (its
        // paint/hit cull). CSS opacity alone still hit-tests, and pointer-events
        // doesn't inherit past an explicitly-sinked descendant — visibility
        // does, and paints identically (nothing, either way).
        this.element.style.visibility = o <= 0 ? "hidden" : "";
    }
    setScale(scale, pivotX, pivotY) {
        // A CSS transform is paint-only (never reflows siblings) and the browser
        // accounts for it in hit-testing, so a scaled interactive box stays
        // correctly clickable. Identity clears the property so an untouched view
        // pays nothing.
        if (scale === 1) {
            this.element.style.transform = "";
            this.element.style.transformOrigin = "";
        }
        else {
            this.element.style.transformOrigin = pivotX + "px " + pivotY + "px";
            this.element.style.transform = "scale(" + scale + ")";
        }
    }
    setClip(d) {
        // clip-path clips native hit-testing along with the pixels, so the
        // clipped-away part of an interactive box falls through — the same
        // subtraction the canvas walk's isPointInPath makes.
        this.element.style.clipPath = d === null ? "" : `path("${d}")`;
    }
    scrollIntoView() {
        // Native walks to the nearest scrollable ancestor and does the offset math;
        // block:start aligns the view to the top, matching the canvas path.
        this.element.scrollIntoView({ block: "start" });
    }
    scrollListener;
    setScroll(on, onScroll) {
        const el = this.element;
        if (on) {
            // The box clips + owns a real vertical scroll offset; siblings stay
            // compositor-pinned. Horizontal overflow is hidden (a horizontal scroller
            // at this level is nearly always a bug — wide content opts in via
            // setScrollX). Native `overflow:auto` gives the OS overlay scrollbar.
            el.style.overflowY = "auto";
            el.style.overflowX = "hidden";
            // `contain` gives THIS element its own native rubber-band (edge bounce +
            // momentum) while refusing to chain a scroll-past up to the pinned page —
            // so a pane bounces on its own edges and never flashes the document behind
            // it, and two sibling panes overscroll independently. (An earlier build
            // used `none`, which killed the chain but ALSO the wanted local bounce.)
            el.style.overscrollBehavior = "contain";
            // The app root sets `touch-action: none` (the app owns gestures); a scroll
            // pane opts BACK IN to native vertical panning so touch drag + momentum
            // work on mobile.
            el.style.touchAction = "pan-y";
            // A scroll container accepts pointer/wheel events (its children stay inert,
            // so clicks still resolve to the sink under the pointer). Native wheel then
            // drives the box directly: every neo view is position:absolute, but abs
            // children DO register scrollable overflow, so the browser scrolls,
            // momentums, and rubber-bands it with no manual offset math — verified
            // in-browser (bare abs content: scrollHeight tracks the content, wheel
            // moves scrollTop, edges bounce). Driving scrollTop by hand instead would
            // clamp to the bounds and defeat the overscroll.
            el.style.pointerEvents = "auto";
            if (this.scrollListener === undefined) {
                // Mirror the browser's offset back into the view's reactive `scrollY`:
                // fires for wheel, touch, momentum, scrollbar-drag, and programmatic
                // scrollTop alike — the one bridge the runtime needs.
                this.scrollListener = () => onScroll(el.scrollTop);
                el.addEventListener("scroll", this.scrollListener, { passive: true });
            }
        }
        else {
            if (this.scrollListener !== undefined) {
                el.removeEventListener("scroll", this.scrollListener);
                this.scrollListener = undefined;
            }
            el.style.overflowY = "";
            el.style.overflowX = "";
            el.style.touchAction = "";
            el.style.pointerEvents = "none";
        }
    }
    wheelXListener;
    setScrollX(on) {
        const el = this.element;
        if (on) {
            // Clip the box and scroll its overflowing WIDTH; vertical stays clipped.
            el.style.overflowX = "auto";
            el.style.overflowY = "hidden";
            el.style.pointerEvents = "auto";
            if (this.wheelXListener === undefined) {
                // Absolute-positioned content: the wheel won't drive it (as in setScroll),
                // so advance scrollLeft ourselves — from a trackpad's horizontal delta or a
                // shift+wheel. A plain vertical wheel is left alone so it scrolls the PAGE.
                this.wheelXListener = (e) => {
                    const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
                    if (dx === 0)
                        return;
                    const before = el.scrollLeft;
                    el.scrollLeft = before + dx;
                    if (el.scrollLeft !== before)
                        e.preventDefault();
                };
                el.addEventListener("wheel", this.wheelXListener, { passive: false });
            }
        }
        else {
            if (this.wheelXListener !== undefined) {
                el.removeEventListener("wheel", this.wheelXListener);
                this.wheelXListener = undefined;
            }
            el.style.overflowX = "";
            el.style.overflowY = "";
            el.style.pointerEvents = "none";
        }
    }
    /** Native rich-text flow (RichText). Build ONE flowing content element — a block
     *  per RichBlock (real `<p>`/`<h*>` for a11y), inline runs in NORMAL flow (a
     *  `<span>`/`<code>`) — so the browser wraps, aligns baselines, and lets the user
     *  select/copy/find contiguously. Returns the measured (flowed) height. */
    setRichContent(blocks, selectable, width, onResize, onLink) {
        const doc = this.element.ownerDocument;
        let host = this.richEl;
        if (host === null) {
            host = this.richEl = doc.createElement("div");
            const s = host.style;
            s.position = "absolute";
            s.left = "0";
            s.top = "0";
            this.element.appendChild(host);
        }
        host.style.width = width + "px";
        host.textContent = "";
        host.style.userSelect = selectable ? "text" : "";
        host.style.webkitUserSelect = selectable ? "text" : "";
        host.style.pointerEvents = selectable ? "auto" : "none";
        for (const b of blocks) {
            // A `pre` block is a real <pre>: whitespace preserved and, being code, it does
            // NOT wrap — long lines keep their shape and the block scrolls HORIZONTALLY
            // (native overflow-x), the way an editor shows code. Its height stays a stable
            // lines×lineHeight (no width-dependent reflow), so the flow measures it cleanly.
            // Its runs carry the monospace family and per-token colours, so it is one
            // contiguous, selectable, syntax-coloured element.
            const be = doc.createElement(b.pre ? "pre" : /^h[1-6]$/.test(b.tag) ? b.tag : "p");
            const bs = be.style;
            bs.margin = "0";
            bs.marginTop = b.gapBefore + "px";
            // Line box in PX — round(fontSize × lineHeight), NOT a unitless multiplier:
            // pinned so it keys off the block's own size (not the inherited cascade) and
            // matches the Canvas backend's line advance exactly (conformity).
            bs.fontSize = b.fontSize + "px";
            bs.lineHeight = Math.round(b.fontSize * b.lineHeight) + "px";
            if (b.pre) {
                bs.whiteSpace = "pre";
                bs.overflowX = "auto";
                bs.overflowY = "hidden";
            }
            else
                bs.whiteSpace = "normal";
            if (b.align !== undefined && b.align !== "left")
                bs.textAlign = b.align;
            for (const r of b.runs) {
                if ("br" in r) {
                    be.appendChild(doc.createElement("br"));
                    continue;
                }
                // A link run is a REAL <a href> — native hover URL, right/middle/⌘-click
                // open-in-tab — but a plain left click routes through `onLink` so the app,
                // not the browser, decides (scroll, in-app route, or app.navigate).
                const isLink = r.href !== undefined;
                const el = doc.createElement(isLink ? "a" : r.chipBg !== undefined ? "code" : "span");
                const rs = el.style;
                if (isLink) {
                    el.href = r.href;
                    rs.textDecoration = "none";
                    rs.cursor = "pointer";
                    rs.pointerEvents = "auto";
                    el.addEventListener("click", (e) => {
                        const m = e;
                        if (m.button === 0 && !m.metaKey && !m.ctrlKey && !m.shiftKey && !m.altKey) {
                            e.preventDefault();
                            onLink(r.href);
                        }
                    });
                }
                rs.fontFamily = r.family;
                rs.fontSize = r.size + "px";
                rs.fontWeight = cssWeight(r.weight);
                if (r.italic)
                    rs.fontStyle = "italic";
                rs.color = colorToCss(r.color);
                // A themed accent fill overrides the solid colour: a gradient clips a
                // background to the glyphs (matching Text.textFill and the Canvas ramp),
                // a solid fill is just that colour.
                if (r.fill != null) {
                    if (isGradient(r.fill)) {
                        rs.backgroundImage = `linear-gradient(${r.fill.angle}deg, ${r.fill.stops.map((g) => colorToCss(g.color) + (g.offset === null ? "" : ` ${g.offset * 100}%`)).join(", ")})`;
                        rs.webkitBackgroundClip = "text";
                        rs.backgroundClip = "text";
                        rs.webkitTextFillColor = "transparent";
                        rs.color = "transparent";
                    }
                    else {
                        rs.color = colorToCss(r.fill);
                    }
                }
                if (r.tracking !== 0)
                    rs.letterSpacing = r.tracking + "px";
                if (r.strike)
                    rs.textDecoration = "line-through";
                if (r.chipBg !== undefined) {
                    rs.backgroundColor = colorToCss(r.chipBg);
                    rs.borderRadius = "4px";
                    rs.padding = "1px 5px";
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
        return host.offsetHeight; // forced layout → the flowed height
    }
    setEmbed(id) {
        // An HTML island: the host queries `[data-neo-slot="…"]` and mounts foreign
        // content inside this neo-sized element; the tenant fills the box (100%), so
        // neo's width/height constraints drive its size with no coordinate sync.
        const s = this.element.style;
        const webkit = s;
        if (id === "") {
            delete this.element.dataset.neoSlot;
            // Back to the painted-UI defaults: pointer-inert, unselectable.
            s.pointerEvents = "none";
            s.userSelect = "";
            webkit.webkitUserSelect = "";
        }
        else {
            this.element.dataset.neoSlot = id;
            // A live foreign surface, not painted UI: its interior owns hits and
            // native text selection. neo's model makes every view pointer-inert
            // (pointerEvents:none) and unselectable (user-select:none inherits from
            // the root) — an island opts BACK in for both, so an iframe receives
            // clicks and a text field selects, whether or not the View has a sink.
            s.pointerEvents = "auto";
            s.userSelect = "text";
            webkit.webkitUserSelect = "text";
        }
    }
    setInput(sink) {
        if (sink !== null) {
            SINKS.set(this.element, sink);
            this.element.style.pointerEvents = "auto";
        }
        else {
            SINKS.delete(this.element);
            this.element.style.pointerEvents = "none";
        }
    }
    setEditable(spec) {
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
            el = document.createElement(tag);
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
            s.webkitUserSelect = "text";
            s.touchAction = "auto";
            s.resize = "none";
            s.pointerEvents = "auto";
            // Native scrollbar for a scrolling code field (macOS overlay).
            const self = el;
            el.addEventListener("input", () => this.edit?.onInput(self.value));
            el.addEventListener("focus", () => this.edit?.onFocus());
            el.addEventListener("blur", () => this.edit?.onBlur());
            el.addEventListener("keydown", (e) => {
                if (!(this.edit?.multiline ?? false) && e.key === "Enter")
                    this.edit?.onEnter?.();
            });
            this.element.appendChild(el);
            this.editEl = el;
        }
        this.edit = spec;
        if (el.value !== spec.value)
            el.value = spec.value; // guard: don't reset the caret on an echo
        el.spellcheck = spec.spellcheck; // code fields turn the red squiggles off
        el.style.padding = spec.padding > 0 ? `${spec.padding}px` : "0";
        // no-wrap = one line per line + horizontal scroll (both native to a textarea
        // whose wrap attribute is "off"); soft = the wrapping default.
        if (el instanceof HTMLTextAreaElement) {
            el.wrap = spec.wrap ? "soft" : "off";
            el.style.whiteSpace = spec.wrap ? "pre-wrap" : "pre";
            el.style.overflow = "auto";
        }
        el.placeholder = spec.placeholder;
        applyEditStyle(el, spec.style);
    }
    activateEditable(active) {
        if (this.editEl === null)
            return;
        if (active)
            this.editEl.focus();
        else
            this.editEl.blur();
    }
    setText(text) {
        this.textRun().textContent = text;
    }
    setTextStyle(st) {
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
            s.webkitBackgroundClip = "text";
            s.backgroundClip = "text";
            s.webkitTextFillColor = "transparent";
            s.color = "transparent";
        }
        else {
            s.backgroundImage = "";
            s.backgroundClip = "";
            s.webkitTextFillColor = "";
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
        const sel = st.selectable === true;
        s.userSelect = sel ? "text" : "";
        s.webkitUserSelect = sel ? "text" : "";
        s.pointerEvents = sel ? "auto" : "none";
    }
    /** The text run element, created on first use. A positioned <span> — not a
     *  bare text node — so it paints in element order with the other content
     *  (in-flow text would paint *under* positioned siblings), matching the
     *  Canvas walk's content order. */
    textRun() {
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
     *  surfaces attached, and must not cover them (found by neoweather's
     *  topBar, whose bitmap covered the zip Text child). */
    placeContent(el, ...prior) {
        let anchor = this.element.firstChild;
        for (const p of prior) {
            if (p !== null)
                anchor = p.nextSibling;
        }
        this.element.insertBefore(el, anchor);
    }
    setImage(image) {
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
    setImageStretch(stretch) {
        this.stretch = stretch;
        if (this.imgEl !== null)
            this.applyStretch();
    }
    /** `100%` tracks the view box natively (a later resize costs no image
     *  bookkeeping); the un-stretched axis is pinned to the NATURAL dimension —
     *  CSS `auto` would preserve the intrinsic ratio and drag it along with the
     *  stretched axis, which is not what a single-axis stretch means (the
     *  canvas walk draws the un-stretched axis at natural size; found by
     *  neoweather's `stretches=width` tab art). The element is always loaded
     *  when it crosses the seam, so the natural size is known. */
    applyStretch() {
        const img = this.imgEl;
        const s = img.style;
        s.width = this.stretch === "width" || this.stretch === "both" ? "100%" : `${img.naturalWidth}px`;
        s.height = this.stretch === "height" || this.stretch === "both" ? "100%" : `${img.naturalHeight}px`;
    }
    setDrawing(list) {
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
    rasterize() {
        const c = this.drawEl;
        const b = this.drawing.bounds;
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.ceil(b.w * dpr));
        const h = Math.max(1, Math.ceil(b.h * dpr));
        c.width = w;
        c.height = h;
        c.style.left = b.x + "px";
        c.style.top = b.y + "px";
        c.style.width = w / dpr + "px";
        c.style.height = h / dpr + "px";
        const ctx = c.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, -b.x * dpr, -b.y * dpr);
        replay(ctx, this.drawing);
    }
    insertChild(child, before) {
        // insertBefore both parents and MOVES an existing child — exactly the
        // seam's contract; null appends.
        this.element.insertBefore(child.element, before === null ? null : before.element);
    }
    destroy() {
        this.gone = true; // quiets any armed dpr listener
        this.richObserver?.disconnect();
        this.onRichResize = undefined;
        this.element.remove();
    }
}
//# sourceMappingURL=dom-backend.js.map