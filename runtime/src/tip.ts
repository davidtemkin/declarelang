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
// or null. The library Tooltip singleton renders it (`Tip [ onTip(e) { … } ]`),
// the same wiring contract as Focus/Keys (sources.ts).

import type { View } from "./view.js";
import { rootFrameBox, type InteractionView } from "./interaction.js";

export interface TipEvent {
  readonly text: string;
  /** The target's root-space box (chain-summed at show — the context-menu
   *  rule: a tip's placement is a snapshot; scroll/press hides it). */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The target's tree root — a page can host several apps (islands); each
   *  app's Tooltip stands down for foreign targets, like the FocusRing. */
  readonly root: View;
}

// The default show delay; a theme overrides per preset (`tooltipDelay` —
// desktop help tags conventionally wait ~1s, Material ~500ms).
const SHOW_DELAY_MS = 500;
// After a tip hides by the pointer LEAVING (not by a press), the system stays
// WARM briefly: entering another tip-carrying control inside this window shows
// its tip instantly — the OS behavior that makes scanning a toolbar feel
// continuous. A press cools immediately (interaction ends the tour).
const WARM_MS = 300;

class TipService {
  private handlers = new Set<(e: TipEvent | null) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private current: View | null = null;
  private shown = false;
  private warmUntil = 0;

  /** Subscribe (`Tip [ onTip(e) { … } ]`). Returns the unsubscribe thunk. */
  onTip(fn: (e: TipEvent | null) => void): () => void {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  /** The pointer entered a tip-carrying view. */
  over(view: View): void {
    if (view === this.current) return;
    this.current = view;
    this.clearTimer();
    if (this.shown || Date.now() < this.warmUntil) {
      this.publish(view); // showing, or still warm — retarget instantly (the OS rule)
      return;
    }
    const theme = (view as unknown as { theme?: Record<string, unknown> }).theme;
    const delay = typeof theme?.tooltipDelay === "number" ? theme.tooltipDelay : SHOW_DELAY_MS;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.current === view) this.publish(view);
    }, delay);
  }

  /** The pointer left the view. Hiding by DEPARTURE keeps the system warm. */
  out(view: View): void {
    if (view !== this.current) return;
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
  hide(): void {
    this.current = null;
    this.clearTimer();
    this.warmUntil = 0;
    if (this.shown) {
      this.shown = false;
      this.emit(null);
    }
  }

  private publish(view: View): void {
    const text = String((view as unknown as { tip?: unknown }).tip ?? "");
    if (text === "") return;
    // THE one scroll-aware walk (interaction.ts), not a hand-rolled sum. A plain
    // accumulation of ancestor x/y anchors the tip where the view WOULD be if
    // nothing had scrolled: inside a pane scrolled 300px, a target SEEN at y=140
    // put its tooltip at y=309. The renderer places against the app frame, so
    // this has to be the frame position — the same fact `inspect()` reports and
    // the Inspector highlights, from the same function, so the three agree.
    // the composed BOX, not origin + local w/h — a scaled target's avoid
    // region is the box it paints, or the tip parks against phantom space
    // (the 2026-08-13 transform audit)
    const b = rootFrameBox(view as unknown as InteractionView);
    // the topmost link, which the event carries so a renderer can size itself
    // against the app; the chain may pass through non-visual nodes.
    let root: View = view;
    for (let n: unknown = view; n !== null && typeof n === "object"; ) {
      root = n as View;
      n = (n as { parent?: unknown }).parent ?? null;
    }
    this.shown = true;
    this.emit({ text, x: b.x, y: b.y, w: b.width, h: b.height, root });
  }

  private emit(e: TipEvent | null): void {
    for (const fn of [...this.handlers]) fn(e);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export const Tip = new TipService();
