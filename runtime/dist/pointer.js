export class PointerService {
    views = new WeakMap();
    hoverHandlers = new Set();
    pressHandlers = new Set();
    hovered = null;
    pressed = null;
    /** Core wiring (view.ts, at attach): associate a view's input sink with it. */
    register(sink, view) {
        this.views.set(sink, view);
    }
    /** Core wiring (input.ts, routeInput): the current hover target as a sink
     *  (null = none). Fires onHover only when the resolved view changes. */
    hover(sink) {
        const view = sink !== null ? this.views.get(sink) ?? null : null;
        if (view === this.hovered)
            return;
        this.hovered = view;
        for (const h of [...this.hoverHandlers])
            h(view);
    }
    /** Core wiring (input.ts, routeInput): the current press target as a sink. */
    press(sink) {
        const view = sink !== null ? this.views.get(sink) ?? null : null;
        if (view === this.pressed)
            return;
        this.pressed = view;
        for (const h of [...this.pressHandlers])
            h(view);
    }
    /** Plugin API: subscribe to hover changes; returns an unsubscribe thunk. */
    onHover(fn) {
        this.hoverHandlers.add(fn);
        return () => this.hoverHandlers.delete(fn);
    }
    /** Plugin API: subscribe to press changes; returns an unsubscribe thunk. */
    onPress(fn) {
        this.pressHandlers.add(fn);
        return () => this.pressHandlers.delete(fn);
    }
    /** Test/lifecycle reset (mirrors Focus.reset). */
    reset() {
        this.hoverHandlers.clear();
        this.pressHandlers.clear();
        this.hovered = null;
        this.pressed = null;
    }
}
/** The page's single pointer-observation service (one physical pointer). */
export const Pointer = new PointerService();
//# sourceMappingURL=pointer.js.map