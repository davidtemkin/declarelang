// HeadlessBackend — the no-pixels RenderBackend for executing a program
// WITHOUT a page: static extraction (docs/system-design/capabilities.md §4–5), verify's
// rung-4 deterministic instantiation, and any tool that needs the settled
// tree but no rendering. Attaching to it runs everything attach always runs —
// auto-extent derives, layout install, text measurement (through the one
// measure.ts seam, injectable via provideMeasurer) — while every Surface push
// lands in a no-op, so the reactive model computes real geometry and the
// backend inks nothing.
//
// The surface implements the FULL Surface interface as typed no-ops — tsc
// keeps it complete, so a new Surface capability cannot silently miss the
// headless path (the lesson of the unit suite's hand-listed mock).
class HeadlessSurface {
    setX(_v) { }
    setY(_v) { }
    setWidth(_v) { }
    setHeight(_v) { }
    setFill(_fill) { }
    setCornerRadius(_r) { }
    setStroke(_stroke) { }
    setShadow(_shadow) { }
    setVisible(_visible) { }
    setOpacity(_opacity) { }
    setCursor(_cursor) { }
    setScale(_scale, _pivotX, _pivotY) { }
    setClip(_pathData) { }
    setBoxClip(_on) { }
    setScroll(_on, _onScroll) { }
    setScrollX(_on) { }
    /** -1 = "this backend cannot flow native rich content" — RichText then lays
     *  its runs out as child views through the shared measurer, exactly the
     *  Canvas fallback, so a headless settle still produces real flow geometry. */
    setRichContent(_blocks, _selectable, _width, _onResize, _onLink) {
        return -1;
    }
    scrollIntoView() { }
    // Headless lays a flow out the CANVAS way (setRichContent → -1), so a heading's
    // offset is known: `within >= 0` means "located it" — there is no viewport to
    // scroll, but the anchor resolved. This is what lets extraction/tests observe the
    // reveal without a live surface.
    revealRichAnchor(_slug, within) { return within >= 0; }
    setEmbed(_id) { }
    setDrawing(_list) { }
    setText(_text) { }
    setTextStyle(_style) { }
    setImage(_image) { }
    setImageStretch(_stretch) { }
    setInput(_sink) { }
    setEditable(_spec) { }
    activateEditable(_active) { }
    insertChild(_child, _before) { }
    destroy() { }
}
export class HeadlessBackend {
    createSurface() {
        return new HeadlessSurface();
    }
    /** No page to root into — the tree lives (and settles) unrooted. */
    attachRoot(_host, _root) { }
}
//# sourceMappingURL=headless-backend.js.map