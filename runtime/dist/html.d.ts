import { type Block, type ReadOptions } from "./md.js";
export type Unsupported = "strip" | "error";
/** Every tag the reader honours — the runtime tag check reports against this. */
export declare const SUPPORTED_TAGS: readonly string[];
/** Parse a whitelisted-HTML string into the block tree. `policy` decides what an
 *  unsupported tag does (strip = unwrap / error = throw). `opts.isClass` turns a
 *  tag naming a program class into an inline view (md.ts ReadOptions); with
 *  none, every tag keeps today's meaning. */
export declare function parseHtml(src: string, policy?: Unsupported, opts?: ReadOptions): Block[];
