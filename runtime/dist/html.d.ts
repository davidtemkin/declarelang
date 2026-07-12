import { type Block } from "./md.js";
export type Unsupported = "strip" | "error";
/** Every tag the reader honours — the runtime tag check reports against this. */
export declare const SUPPORTED_TAGS: readonly string[];
/** Parse a whitelisted-HTML string into the block tree. `policy` decides what an
 *  unsupported tag does (strip = unwrap / error = throw). */
export declare function parseHtml(src: string, policy?: Unsupported): Block[];
