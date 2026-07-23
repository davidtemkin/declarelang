// The interaction-observation seam (interaction-state spec, Increment 1): a
// singleton that mirrors Focus and lets a PLUGIN observe hover/press changes
// WITH the View. Core feeds it — view.ts registers each sink->view at attach,
// input.ts reports the current hover/press sink from routeInput. Plugins
// subscribe via onHover/onPress. Focus is already observable (Focus.onFocusChange),
// so it is not duplicated here. Zero-dep; types only beyond the small class.
//
// The View/InputSink imports MUST stay `import type` (erased at runtime):
// view.ts imports the `Pointer` VALUE from here, so a value import back into
// view.ts would be a genuine runtime cycle. (This is the opposite direction from
// focus.ts, which can value-import View only because view.ts never imports it.)
import type { InputSink } from "./backend.js";
import type { View } from "./view.js";

export class PointerService {
  private readonly views = new WeakMap<InputSink, View>();
  private readonly hoverHandlers = new Set<(v: View | null) => void>();
  private readonly pressHandlers = new Set<(v: View | null) => void>();
  private hovered: View | null = null;
  private pressed: View | null = null;

  /** Core wiring (view.ts, at attach): associate a view's input sink with it. */
  register(sink: InputSink, view: View): void {
    this.views.set(sink, view);
  }

  /** Core wiring (input.ts, routeInput): the current hover target as a sink
   *  (null = none). Fires onHover only when the resolved view changes. */
  hover(sink: InputSink | null): void {
    const view = sink !== null ? this.views.get(sink) ?? null : null;
    if (view === this.hovered) return;
    this.hovered = view;
    for (const h of [...this.hoverHandlers]) h(view);
  }

  /** Core wiring (input.ts, routeInput): the current press target as a sink. */
  press(sink: InputSink | null): void {
    const view = sink !== null ? this.views.get(sink) ?? null : null;
    if (view === this.pressed) return;
    this.pressed = view;
    for (const h of [...this.pressHandlers]) h(view);
  }

  /** Plugin API: subscribe to hover changes; returns an unsubscribe thunk. */
  onHover(fn: (v: View | null) => void): () => void {
    this.hoverHandlers.add(fn);
    return () => this.hoverHandlers.delete(fn);
  }

  /** Plugin API: subscribe to press changes; returns an unsubscribe thunk. */
  onPress(fn: (v: View | null) => void): () => void {
    this.pressHandlers.add(fn);
    return () => this.pressHandlers.delete(fn);
  }

  /** Test/lifecycle reset (mirrors Focus.reset). */
  reset(): void {
    this.hoverHandlers.clear();
    this.pressHandlers.clear();
    this.hovered = null;
    this.pressed = null;
  }
}

/** The page's single pointer-observation service (one physical pointer). */
export const Pointer = new PointerService();
