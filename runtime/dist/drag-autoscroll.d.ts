import { View } from "./view.js";
/** The view being dragged right now, if any (the anchor skips it). */
export declare function draggingView(): View | null;
/** Is a drag's edge scrolling moving a scroller now? A scroll under the drag's
 *  finger is then the program's, not the user's (dom-backend watchScrolling)
 *  and not the browser taking the gesture (input.ts takeover). */
export declare function dragScrolling(): boolean;
/** A drag move reached `view` at root point (x, y). */
export declare function dragMoved(view: View, x: number, y: number, extra: Record<string, unknown> | undefined, redeliver: (x: number, y: number, extra: Record<string, unknown> | undefined) => void): void;
/** The press ended (released or canceled): stop. */
export declare function dragEnded(): void;
