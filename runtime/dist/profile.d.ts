import { type Node } from "./node.js";
/** Start recording (clearing what was recorded). `cap` turns are kept, the oldest
 *  dropped. `why` records the wake trace beside the profile, so each turn can say
 *  which writes opened it (it costs a copy of the value table per settle); `frames`
 *  (default on, where there are frames) notes when each frame begins. */
export declare function startProfile(opts?: {
    cap?: number;
    mark?: boolean;
    why?: boolean;
    frames?: boolean;
    only?: object | null;
}): void;
/** Stop recording; what was recorded stays readable. */
export declare function stopProfile(): void;
export declare function profiling(): boolean;
export interface ProfileRule {
    label: string;
    source: string | null;
    runs: number;
    changed: number;
    unchanged: number;
    ms: number;
    turns: number;
    /** its value goes to the page, not a slot: whether a run changed anything is not known */
    pushes: boolean;
    /** the runtime's own upkeep, which the author never wrote: what it is for */
    upkeep: string | null;
    /** the views it ran on: how many (up to 64 counted), and the first few, named */
    views: number;
    on: string[];
}
/** A rule that RE-RAN FOR NOTHING: ran often, over several turns, and almost
 *  never changed anything. */
export interface ProfileForNothing extends ProfileRule {
    /** the time its runs that changed nothing took, ms */
    wastedMs: number;
    /** what the rule reads (its last run's inputs, on one instance), named */
    reads: string[];
    /** the writes that opened the turns it ran in, most frequent first (with why) */
    openedBy: {
        write: string;
        turns: number;
    }[];
}
export interface ProfileSpent {
    what: string;
    ms: number;
}
export interface ProfileTurn {
    n: number;
    at: number;
    ms: number;
    lead: number;
    origin: string[];
    runs: number;
    kernelRuns: number;
    changed: number;
    built: number;
    builtBy: {
        cls: string;
        n: number;
    }[];
    /** where the turn's time went, exclusive: rules, handlers, building, attaching, binding, the kernel */
    spent: ProfileSpent[];
    /** the writes that opened it (with why) */
    triggers: string[];
    top: ProfileRule[];
    /** Why its costliest rule ran: the chain back from that rule, through the
     *  rules whose changes woke it, to the write that opened the turn (with why). */
    why: string[];
}
export interface ProfileBuild {
    cls: string;
    n: number;
    ms: number;
    build: number;
    attach: number;
    bind: number;
}
export interface ProfileHandler {
    label: string;
    n: number;
    ms: number;
}
export interface ProfileDrawing {
    view: string;
    n: number;
    scriptMs: number;
    w: number;
    h: number;
    /** the GPU's time to draw it once, alone on a canvas of its own (measureDrawings), ms */
    gpuMs?: number;
}
export interface ProfileFrames {
    /** frames begun while recording, and those with Declare work (a settle or a raster) in them */
    frames: number;
    withWork: number;
    /** the display's own interval, as the quietest frames show it */
    display: number;
    /** from one frame's start to the next's, over the frames with work */
    median: number;
    p95: number;
    worst: number;
    /** frames with work that took longer than one and a half display intervals */
    late: number;
    slowest: {
        at: number;
        ms: number;
        declare: number;
        turns: number;
        rasters: number;
        causes: string[];
    }[];
}
export interface ProfileReport {
    ms: number;
    turns: number;
    dropped: number;
    runs: number;
    kernelRuns: number;
    itemized: boolean;
    why: boolean;
    rules: ProfileRule[];
    /** every rule that re-ran for nothing, the most time wasted first (the text
     *  shows those past a millisecond) */
    reranForNothing: ProfileForNothing[];
    built: {
        cls: string;
        n: number;
    }[];
    discarded: {
        cls: string;
        n: number;
    }[];
    /** the time each class took to build, attach and bind, exclusive of what it holds */
    buildCost: ProfileBuild[];
    handlers: ProfileHandler[];
    drawings: ProfileDrawing[];
    frames: ProfileFrames | null;
    costliest: ProfileTurn[];
    /** The most any one turn did, over every turn: the steadiest budgets (counts). */
    peak: {
        runs: number;
        runsTurn: number;
        built: number;
        builtTurn: number;
        origin: {
            runs: string;
            built: string;
        };
    };
    /** The runtime's own upkeep (rules the author never wrote), by what each is for. */
    upkeep: {
        what: string;
        runs: number;
        ms: number;
    }[];
    /** Turns by what opened them: each kind of cause, how many turns, their time. */
    causes: {
        cause: string;
        turns: number;
        ms: number;
    }[];
    /** One cause over and over, turn after turn (a drag's moves, a spring's
     *  frames): folded into one entry, with what a turn of it typically cost and
     *  the worst. Three in a row or more, the costliest first. */
    repeated: {
        cause: string;
        turns: number;
        ms: number;
        median: number;
        worst: number;
        worstTurn: number;
        runs: number;
        openedBy: {
            write: string;
            turns: number;
        }[];
    }[];
    unsettled: {
        motion: string[];
        waiting: string[];
    };
    /** Views built but hidden when the profile ended (`visible = false`, theirs or an
     *  ancestor's), by the hidden view that holds them: each is built, bound and kept
     *  current while hidden. */
    hidden: {
        views: number;
        parts: {
            view: string;
            n: number;
        }[];
    };
}
/** What was recorded, summed: the rules by how often they ran, the ones that
 *  re-ran for nothing, what each class cost to build, the
 *  costliest turns and where their time went, the drawings, the frames, and what
 *  still keeps the program from settling. `nameOf` names a node by its path;
 *  `root` (the bridge's) lets the report name inputs and outstanding waits. */
export declare function profileReport(nameOf?: (node: object) => string, root?: Node | null): ProfileReport;
/** Draw each recorded drawing (the most drawn first, by area) ALONE, on a canvas
 *  of its own the size of its raster, and wait for its pixels: the GPU's time
 *  to draw it once in this browser — the part a frame pays out of the page's
 *  sight. Best of `reps` (each on a fresh canvas: a canvas read back is moved
 *  off the GPU by some browsers, which would measure a different path), less an
 *  empty canvas's. Run after recording, while the program is quiet if it can be:
 *  frames still being drawn share the GPU. Answers how many it measured. */
export declare function measureDrawings(opts?: {
    max?: number;
    reps?: number;
}): number;
/** The report as text: plain, structured, for a person or an agent to read and act on. */
export declare function profileText(r: ProfileReport): string;
/** The page's view of frames, as text. */
export declare function framesSeenText(f: ProfileFrames): string;
/** Clear what a profile recorded, the wake trace it started included. */
export declare function clearProfile(): void;
