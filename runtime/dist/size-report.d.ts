import { View } from "./view.js";
export declare function noteNegativeSize(v: View, size: "width" | "height"): void;
/** Judge every pending size whose program is attached (see noteNegativeSize). */
export declare function judgeNegativeSizes(): void;
