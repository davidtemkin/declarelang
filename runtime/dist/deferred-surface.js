// A view's surface before it is first shown (docs/system-design/deferred-dom.md).
//
// On a renderer that opts in (`RenderBackend.defersHidden` — the DOM's), a view
// that attaches hidden — or attaches inside a settle, before its own bindings have
// said whether it is shown — attaches to one of these instead of a real surface,
// and so does everything under it: no elements exist for a subtree nobody has seen. The
// view itself is whole — attributes, constraints, data, children — and every push
// across the seam lands here and is dropped; the view's own state is the record.
// When the view is first shown (view.ts `$materialize`), it takes a real surface
// and flushes its current state into it, exactly as an attach does. Once shown,
// kept: hiding again is the real surface's `setVisible(false)`.
//
// The required members drop what they are told: the view flushes its state into
// the real surface when it comes in. A few calls carry state the flush does not
// (a row's place in its list, a list's extent, a scroll request): those are kept,
// the latest of each, and replayed into the real surface after the flush. Every
// other optional member is absent, so a caller asking a capability
// (`s.setScroll?.(…)`, `s.richMetrics?.()`) finds none — what a display:none
// element reports anyway: no offset, no metrics, no size.
export class DeferredSurface {
    kept = null;
    keep(name, args) {
        const k = (this.kept ??= new Map());
        k.delete(name); // re-set: replayed in the order last told
        k.set(name, args);
    }
    setRowIndex(...a) { this.keep("setRowIndex", a); }
    setRowCount(...a) { this.keep("setRowCount", a); }
    setVirtualExtent(...a) { this.keep("setVirtualExtent", a); }
    scrollToY(...a) { this.keep("scrollToY", a); }
    scrollToX(...a) { this.keep("scrollToX", a); }
    /** Hand what was kept to the surface that replaces this one. */
    replayInto(s) {
        if (this.kept === null)
            return;
        for (const [name, args] of this.kept)
            s[name]?.apply(s, args);
        this.kept = null;
    }
    setX() { }
    setY() { }
    setWidth() { }
    setHeight() { }
    setFill() { }
    setCornerRadius() { }
    setStroke() { }
    setShadow() { }
    setVisible() { }
    setOpacity() { }
    setCursor() { }
    setPointerEvents() { }
    setScale() { }
    setClip() { }
    setBoxClip() { }
    setRichContent() { return 0; }
    scrollIntoView() { }
    revealRichAnchor() { return false; }
    setEmbed() { }
    setDrawing() { }
    setText() { }
    setTextStyle() { }
    setImage() { }
    setImageStretch() { }
    setInput() { }
    setEditable() { }
    activateEditable() { }
    insertChild() { }
    destroy() { }
}
/** Is this surface a stand-in for a view not yet shown? */
export const isDeferred = (s) => s instanceof DeferredSurface;
//# sourceMappingURL=deferred-surface.js.map