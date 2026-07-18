// Tip — the tooltip channel: the runtime half of the `tip` attribute
// (docs/system-design/planes.md §2 tier 1 — the layer system's floor: one
// attribute at the use site, everything else the system's).
//
// A view carrying `tip = "…"` reports hover through the input seam (view.ts
// wires its sink to this service — pay-per-use, exactly like handlers). This
// service owns the platform conventions — the show DELAY, the immediate
// retarget while a tip is already up (the OS behavior: once tips are showing,
// moving between controls swaps instantly), hide on press — and publishes ONE
// fact to subscribers: the active tip (text + the target's root-space box),
// or null. The library Tooltip singleton renders it (`onTip(e) <- Tip`), the
// same wiring contract as Focus/Keys (sources.ts).
// The default show delay; a theme overrides per platform (`tooltipDelay` —
// macOS help tags and Windows tooltips both wait ~1s, Material ~500ms).
const SHOW_DELAY_MS = 500;
// After a tip hides by the pointer LEAVING (not by a press), the system stays
// WARM briefly: entering another tip-carrying control inside this window shows
// its tip instantly — the OS behavior that makes scanning a toolbar feel
// continuous. A press cools immediately (interaction ends the tour).
const WARM_MS = 300;
class TipService {
    handlers = new Set();
    timer = null;
    current = null;
    shown = false;
    warmUntil = 0;
    /** Subscribe (`onTip(e) <- Tip`). Returns the unsubscribe thunk. */
    onTip(fn) {
        this.handlers.add(fn);
        return () => this.handlers.delete(fn);
    }
    /** The pointer entered a tip-carrying view. */
    over(view) {
        if (view === this.current)
            return;
        this.current = view;
        this.clearTimer();
        if (this.shown || Date.now() < this.warmUntil) {
            this.publish(view); // showing, or still warm — retarget instantly (the OS rule)
            return;
        }
        const theme = view.theme;
        const delay = typeof theme?.tooltipDelay === "number" ? theme.tooltipDelay : SHOW_DELAY_MS;
        this.timer = setTimeout(() => {
            this.timer = null;
            if (this.current === view)
                this.publish(view);
        }, delay);
    }
    /** The pointer left the view. Hiding by DEPARTURE keeps the system warm. */
    out(view) {
        if (view !== this.current)
            return;
        this.current = null;
        this.clearTimer();
        if (this.shown) {
            this.shown = false;
            this.warmUntil = Date.now() + WARM_MS;
            this.emit(null);
        }
    }
    /** A press (or any interaction) dismisses AND cools — the tip never
     *  outlives intent, and the next hover earns the full delay again. */
    hide() {
        this.current = null;
        this.clearTimer();
        this.warmUntil = 0;
        if (this.shown) {
            this.shown = false;
            this.emit(null);
        }
    }
    publish(view) {
        const text = String(view.tip ?? "");
        if (text === "")
            return;
        let x = 0;
        let y = 0;
        let root = view;
        // The parent chain may pass through non-visual nodes (typed Node); sum
        // the geometry of whatever carries it and remember the last link as root.
        let n = view;
        while (n !== null && typeof n === "object") {
            const v = n;
            if (typeof v.x === "number")
                x += v.x;
            if (typeof v.y === "number")
                y += v.y;
            root = n;
            n = v.parent ?? null;
        }
        this.shown = true;
        this.emit({ text, x, y, w: view.width, h: view.height, root });
    }
    emit(e) {
        for (const fn of [...this.handlers])
            fn(e);
    }
    clearTimer() {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
export const Tip = new TipService();
//# sourceMappingURL=tip.js.map