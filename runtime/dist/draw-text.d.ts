import type { Draw, DrawTextStyle } from "./draw.js";
/** One run drawn in a text style: the style's face, tracking, colour, shadow
 *  and treatments become ORDINARY text state for this run, inside save/restore,
 *  so every renderer replays the recording unchanged. The face is built by the
 *  shared `fontString` — the one a Text measures with — so a Font in the style is
 *  a tracked read, and the drawing records again when its faces land. */
export declare function styledRun(d: Draw, style: DrawTextStyle, paint: "fill" | "stroke", text: string, run: (shown: string) => void): void;
