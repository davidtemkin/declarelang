import type { View } from "./view.js";
export interface TooltipEvent {
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
declare class TooltipsService {
    private handlers;
    private timer;
    private current;
    private shown;
    private warmUntil;
    /** Subscribe (`Tooltips [ onTooltip(e) { … } ]`). Returns the unsubscribe thunk. */
    onTooltip(fn: (e: TooltipEvent | null) => void): () => void;
    /** The pointer entered a tip-carrying view. */
    over(view: View): void;
    /** The pointer left the view. Hiding by DEPARTURE keeps the system warm. */
    out(view: View): void;
    /** A press (or any interaction) dismisses AND cools — the tip never
     *  outlives intent, and the next hover earns the full delay again. */
    hide(): void;
    private publish;
    private emit;
    private clearTimer;
}
export declare const Tooltips: TooltipsService;
export {};
