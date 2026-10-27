import type { Node } from "./node.js";
export interface BootCheckOptions {
    /** The window is a touch device: targets too small for a finger are said. */
    touch?: boolean;
    /** Text is measured for real (a browser): the checks that rest on it run. */
    realText?: boolean;
    /** The program's own classes (not the library's), to say which were never built. */
    classes?: readonly string[];
    /** Hand each unloaded DataSource with a schema a sample of it, as a fetch would. */
    feed?: boolean;
    queries?: {
        reads?: readonly string[];
        outline?: string | true | null;
        semantics?: string | true | null;
    } | null;
    /** Controls already reported, by `flagged` key: a check asked again (a state a
     *  script reached) names only what it finds new. */
    skip?: readonly string[];
}
export interface BootCheckRecord {
    nodes: number;
    notes: string[];
    layout: string[];
    unbuilt: string[];
    answers: string[];
    samples: {
        source: string;
        value: unknown;
    }[];
    /** The controls this check reported, as keys a later check `skip`s. */
    flagged: string[];
}
export declare function bootCheck(app: Node, opts?: BootCheckOptions): BootCheckRecord;
