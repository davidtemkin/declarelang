import type { InputSink } from "./backend.js";
import type { View } from "./view.js";
export declare class PointerService {
    private readonly views;
    private readonly hoverHandlers;
    private readonly pressHandlers;
    private hovered;
    private pressed;
    /** Core wiring (view.ts, at attach): associate a view's input sink with it. */
    register(sink: InputSink, view: View): void;
    /** Core wiring (input.ts, routeInput): the current hover target as a sink
     *  (null = none). Fires onHover only when the resolved view changes. */
    hover(sink: InputSink | null): void;
    /** Core wiring (input.ts, routeInput): the current press target as a sink. */
    press(sink: InputSink | null): void;
    /** Plugin API: subscribe to hover changes; returns an unsubscribe thunk. */
    onHover(fn: (v: View | null) => void): () => void;
    /** Plugin API: subscribe to press changes; returns an unsubscribe thunk. */
    onPress(fn: (v: View | null) => void): () => void;
    /** Test/lifecycle reset (mirrors Focus.reset). */
    reset(): void;
}
/** The page's single pointer-observation service (one physical pointer). */
export declare const Pointer: PointerService;
