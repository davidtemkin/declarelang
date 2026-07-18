import type { View } from "./view.js";
export interface TipEvent {
    readonly text: string;
    /** The target's root-space box (chain-summed at show — the context-menu
     *  rule: a tip's placement is a snapshot; scroll/press hides it). */
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    /** The pointer's root-space position at show — for the Cupertino placement
     *  (macOS help tags appear near the CURSOR, not under the control). */
    readonly px: number;
    readonly py: number;
    /** The target's tree root — a page can host several apps (islands); each
     *  app's Tooltip stands down for foreign targets, like the FocusRing. */
    readonly root: View;
}
declare class TipService {
    private handlers;
    private timer;
    private current;
    private shown;
    private warmUntil;
    private lastLocalX;
    private lastLocalY;
    /** Subscribe (`onTip(e) <- Tip`). Returns the unsubscribe thunk. */
    onTip(fn: (e: TipEvent | null) => void): () => void;
    /** The pointer entered a tip-carrying view (x/y in the view's own coords). */
    over(view: View, x?: number, y?: number): void;
    /** Pointer movement inside the view, pre-show — keeps the at-pointer
     *  placement honest (the tip appears where the cursor RESTS, not where it
     *  entered). Ignored once shown. */
    move(view: View, x: number, y: number): void;
    /** The pointer left the view. Hiding by DEPARTURE keeps the system warm. */
    out(view: View): void;
    /** A press (or any interaction) dismisses AND cools — the tip never
     *  outlives intent, and the next hover earns the full delay again. */
    hide(): void;
    private publish;
    private emit;
    private clearTimer;
}
export declare const Tip: TipService;
export {};
