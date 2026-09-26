import { type TextStyle } from "./measure.js";
export interface ClampRule {
    max: number;
    wrap: boolean;
    font: string;
    letterSpacing: number;
    transform: TextStyle["textTransform"];
}
/** Fill `el` with `raw` clamped by `rule` at `width`. */
export declare function renderClamped(el: HTMLElement, raw: string, rule: ClampRule, width: number): void;
