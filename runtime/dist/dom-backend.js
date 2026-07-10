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
import { boxBounds, paintBox } from "./boxpaint.js";
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
// A legible dark-theme scrollbar for `.neo-scroll` elements, injected once per
// document. macOS overlay scrollbars are near-invisible and never widen on
// hover; a `::-webkit-scrollbar` rule opts into a classic, always-present one
// (transparent track, translucent thumb that brightens + fattens on hover).
const SCROLLBAR_STYLE_ID = "neo-scrollbar-style";
function installScrollbarStyle(doc) {
    if (doc.getElementById(SCROLLBAR_STYLE_ID) !== null)
        return;
    const style = doc.createElement("style");
    style.id = SCROLLBAR_STYLE_ID;
    style.textContent =
        ".neo-scroll::-webkit-scrollbar{width:12px;height:12px}" +
            ".neo-scroll::-webkit-scrollbar-track{background:transparent}" +
            ".neo-scroll::-webkit-scrollbar-thumb{background:rgba(230,238,242,.16);border-radius:7px;" +
            "border:3px solid transparent;background-clip:padding-box}" +
            ".neo-scroll::-webkit-scrollbar-thumb:hover{background:rgba(230,238,242,.34);border-width:2px}" +
            ".neo-scroll{scrollbar-color:rgba(230,238,242,.28) transparent}";
    (doc.head ?? doc.documentElement).appendChild(style);
}
class DomSurface {
    element;
    textEl = null;
    editEl = null;
    edit = null;
    imgEl = null;
    drawEl = null;
    drawing = null;
    stretch = "none";
    /** The box's retained paint state — the same BoxState the Canvas walk
     *  keeps, because with `cornerRadius > 0` the box RASTERIZES through the
     *  shared painter (boxEl below) instead of brushing CSS. `fillV` keeps the
     *  raw Fill for the CSS branch's gradient string. */
    box = {
        width: 0, height: 0, fill: null, gradient: null, cornerRadius: 0, stroke: null, shadow: null,
    };
    fillV = null;
    /** The per-view box raster (created only while cornerRadius > 0 — the
     *  measured CSS-unstable case; see boxpaint.ts). First in content order:
     *  the box paints beneath image/drawing/text, like the Canvas walk. */
    boxEl = null;
    /** Set once a raster has ever existed (arms the dpr watch exactly once). */
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
        this.box.width = v;
        if (this.boxEl !== null)
            this.rasterizeBox(); // the raster is box-sized
    }
    setHeight(v) {
        this.element.style.height = v + "px";
        this.box.height = v;
        if (this.boxEl !== null)
            this.rasterizeBox();
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
    /** Route the box paint: rounded → the shared raster; square → CSS. One
     *  CSS property carries the square drop shadow AND the inside border (an
     *  inset zero-blur ring — a CSS `border` would shift absolutely-positioned
     *  children by its width, so it is never used). */
    decorate() {
        const s = this.element.style;
        if (this.box.cornerRadius > 0) {
            s.background = "";
            s.boxShadow = "";
            this.rasterizeBox();
            return;
        }
        if (this.boxEl !== null) {
            this.boxEl.remove();
            this.boxEl = null;
        }
        const f = this.fillV;
        s.background = isGradient(f)
            ? `linear-gradient(${f.angle}deg, ${f.stops
                .map((st) => colorToCss(st.color) + (st.offset === null ? "" : ` ${st.offset * 100}%`))
                .join(", ")})`
            : colorToCss(f);
        const parts = [];
        const sh = this.box.shadow;
        if (sh !== null)
            parts.push(`${sh.dx}px ${sh.dy}px ${sh.blur}px ${colorToCss(sh.color)}`);
        const st = this.box.stroke;
        if (st !== null)
            parts.push(`inset 0 0 0 ${st.width}px ${colorToCss(st.color)}`);
        s.boxShadow = parts.join(", ");
    }
    /** Rasterize the box through the SHARED painter (boxpaint.ts) into the
     *  per-view box canvas, sized by the paint's conservative bounds (the box
     *  plus its shadow's reach) at the current devicePixelRatio — exactly the
     *  drawing raster's discipline below. */
    rasterizeBox() {
        if (this.boxEl === null) {
            const c = document.createElement("canvas");
            c.style.position = "absolute";
            c.style.pointerEvents = "none"; // content is inert — hits are box-geometry
            this.placeContent(c); // first: the box paints beneath all other content
            this.boxEl = c;
            this.watchDpr();
        }
        const c = this.boxEl;
        const b = boxBounds(this.box);
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
        paintBox(ctx, this.box, null);
    }
    /** Arm the shared dpr watch once (rasters must stay crisp across zoom /
     *  display moves; text and <img> re-render natively and need nothing). */
    watchDpr() {
        if (this.watching)
            return;
        this.watching = true;
        onDprChange(() => !this.gone, () => {
            if (this.drawEl !== null)
                this.rasterize();
            if (this.boxEl !== null)
                this.rasterizeBox();
        });
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
    setClip(d) {
        // clip-path clips native hit-testing along with the pixels, so the
        // clipped-away part of an interactive box falls through — the same
        // subtraction the canvas walk's isPointInPath makes.
        this.element.style.clipPath = d === null ? "" : `path("${d}")`;
    }
    scrollListener;
    wheelListener;
    setScroll(on, onScroll) {
        const el = this.element;
        if (on) {
            // The box clips + owns a real scroll offset; siblings stay compositor-
            // pinned. Horizontal overflow is hidden (a horizontal scroller is nearly
            // always a bug).
            el.style.overflowY = "auto";
            el.style.overflowX = "hidden";
            // A styled, always-there scrollbar (not the near-invisible macOS overlay):
            // legible on dark, and it widens on hover. `overscroll-behavior: none`
            // stops a scroll-past from chaining to the document (rubber-band flash).
            installScrollbarStyle(el.ownerDocument);
            el.classList.add("neo-scroll");
            el.style.overscrollBehavior = "none";
            // A scroll container is interactive (like a sink): it must ACCEPT the
            // wheel, or the pointer-inert content passes it straight to the document
            // and nothing scrolls. Its own children stay inert, so clicks still
            // resolve to the sink under the pointer (native-target routing above).
            el.style.pointerEvents = "auto";
            if (this.scrollListener === undefined) {
                // Fires for wheel, scrollbar-drag, and programmatic scrollTop alike.
                this.scrollListener = () => onScroll(el.scrollTop);
                el.addEventListener("scroll", this.scrollListener, { passive: true });
            }
            if (this.wheelListener === undefined) {
                // Every neo view is position:absolute, so the scroller's content is
                // out of normal flow: the browser reports the overflow and honors a
                // programmatic scrollTop, but the WHEEL won't drive it (nothing
                // in-flow to scroll). So we advance scrollTop ourselves. macOS delivers
                // trackpad inertia as a wheel-event stream, so momentum survives; we
                // preventDefault only when we actually consumed the delta, leaving
                // overscroll to fall through to an outer scroller.
                this.wheelListener = (e) => {
                    const before = el.scrollTop;
                    el.scrollTop = before + e.deltaY;
                    if (el.scrollTop !== before)
                        e.preventDefault();
                };
                el.addEventListener("wheel", this.wheelListener, { passive: false });
            }
        }
        else {
            if (this.scrollListener !== undefined) {
                el.removeEventListener("scroll", this.scrollListener);
                this.scrollListener = undefined;
            }
            if (this.wheelListener !== undefined) {
                el.removeEventListener("wheel", this.wheelListener);
                this.wheelListener = undefined;
            }
            el.style.overflowY = "";
            el.style.overflowX = "";
            el.style.pointerEvents = "none";
        }
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
            // A styled, always-there scrollbar (like a neo scroller) — not the
            // near-invisible macOS overlay — so a scrolling code field shows one.
            installScrollbarStyle(el.ownerDocument);
            el.classList.add("neo-scroll");
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
        s.width = st.wrap ? "100%" : "";
        s.textAlign = st.align ?? "left";
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
            this.placeContent(el, this.boxEl, this.imgEl, this.drawEl);
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
            this.placeContent(image, this.boxEl);
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
            this.placeContent(c, this.boxEl, this.imgEl);
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
        this.element.remove();
    }
}
//# sourceMappingURL=dom-backend.js.map