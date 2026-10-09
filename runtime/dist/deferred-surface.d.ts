import type { Surface } from "./backend.js";
export declare class DeferredSurface implements Surface {
    private kept;
    private keep;
    setRowIndex(...a: unknown[]): void;
    setRowCount(...a: unknown[]): void;
    setVirtualExtent(...a: unknown[]): void;
    scrollToY(...a: unknown[]): void;
    scrollToX(...a: unknown[]): void;
    /** Hand what was kept to the surface that replaces this one. */
    replayInto(s: Surface): void;
    setX(): void;
    setY(): void;
    setWidth(): void;
    setHeight(): void;
    setFill(): void;
    setCornerRadius(): void;
    setStroke(): void;
    setShadow(): void;
    setVisible(): void;
    setOpacity(): void;
    setCursor(): void;
    setPointerEvents(): void;
    setScale(): void;
    setClip(): void;
    setBoxClip(): void;
    setRichContent(): number;
    scrollIntoView(): void;
    revealRichAnchor(): boolean;
    setEmbed(): void;
    setDrawing(): void;
    setText(): void;
    setTextStyle(): void;
    setImage(): void;
    setImageStretch(): void;
    setInput(): void;
    setEditable(): void;
    activateEditable(): void;
    insertChild(): void;
    destroy(): void;
}
/** Is this surface a stand-in for a view not yet shown? */
export declare const isDeferred: (s: Surface | null) => s is DeferredSurface;
