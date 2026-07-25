/** The geometry surface the chain walk reads — structurally, any View. */
export interface InteractionView {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    pivotX: number;
    pivotY: number;
    clip: string | boolean | null;
    visible: boolean;
    pointerEvents: string;
    ignoreclip: boolean;
    parent: unknown;
    root: unknown;
    children: readonly unknown[];
}
/** The app surface the driver reads. */
export interface InteractionApp extends InteractionView {
    pointerX: number;
    pointerY: number;
    pointerDown: boolean;
    hovering: boolean;
}
/** view.ts calls this once at module init — the injected instance test. */
export declare function initInteraction(test: (n: unknown) => n is InteractionView): void;
/** The tracked read behind `View.hovered`. */
export declare function readHovered(view: InteractionView): boolean;
/** The tracked read behind `View.pressed`. */
export declare function readPressed(view: InteractionView): boolean;
