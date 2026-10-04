import { View } from "./view.js";
/** The view being dragged right now, if any (the anchor skips it). */
export declare function draggingView(): View | null;
/** A drag move reached `view` at root point (x, y). */
export declare function dragMoved(view: View, x: number, y: number, extra: Record<string, unknown> | undefined, redeliver: (x: number, y: number, extra: Record<string, unknown> | undefined) => void): void;
/** The press ended (released or canceled): stop. */
export declare function dragEnded(): void;
