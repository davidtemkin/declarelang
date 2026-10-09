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

import type { Surface } from "./backend.js";

type Kept = "setRowIndex" | "setRowCount" | "setVirtualExtent" | "scrollToY" | "scrollToX";

export class DeferredSurface implements Surface {
  private kept: Map<Kept, unknown[]> | null = null;
  private keep(name: Kept, args: unknown[]): void {
    const k = (this.kept ??= new Map());
    k.delete(name);                                  // re-set: replayed in the order last told
    k.set(name, args);
  }
  setRowIndex(...a: unknown[]): void { this.keep("setRowIndex", a); }
  setRowCount(...a: unknown[]): void { this.keep("setRowCount", a); }
  setVirtualExtent(...a: unknown[]): void { this.keep("setVirtualExtent", a); }
  scrollToY(...a: unknown[]): void { this.keep("scrollToY", a); }
  scrollToX(...a: unknown[]): void { this.keep("scrollToX", a); }
  /** Hand what was kept to the surface that replaces this one. */
  replayInto(s: Surface): void {
    if (this.kept === null) return;
    for (const [name, args] of this.kept) (s[name] as ((...a: unknown[]) => void) | undefined)?.apply(s, args);
    this.kept = null;
  }

  setX(): void {}
  setY(): void {}
  setWidth(): void {}
  setHeight(): void {}
  setFill(): void {}
  setCornerRadius(): void {}
  setStroke(): void {}
  setShadow(): void {}
  setVisible(): void {}
  setOpacity(): void {}
  setCursor(): void {}
  setPointerEvents(): void {}
  setScale(): void {}
  setClip(): void {}
  setBoxClip(): void {}
  setRichContent(): number { return 0; }
  scrollIntoView(): void {}
  revealRichAnchor(): boolean { return false; }
  setEmbed(): void {}
  setDrawing(): void {}
  setText(): void {}
  setTextStyle(): void {}
  setImage(): void {}
  setImageStretch(): void {}
  setInput(): void {}
  setEditable(): void {}
  activateEditable(): void {}
  insertChild(): void {}
  destroy(): void {}
}

/** Is this surface a stand-in for a view not yet shown? */
export const isDeferred = (s: Surface | null): s is DeferredSurface => s instanceof DeferredSurface;
