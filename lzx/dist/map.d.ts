import type { LzxDoc } from "./parse.js";
import type { Naming } from "./naming.js";
import type { GapSink } from "./gaps.js";
import type { DProgram } from "./ir.js";
export declare function mapDoc(doc: LzxDoc, naming: Naming, sink: GapSink): DProgram | null;
