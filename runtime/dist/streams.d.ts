import { Node } from "./node.js";
import { type StreamCallbacks, type StreamHandle } from "./stream-seam.js";
/** The abstract base: everything shared between SSE and WebSocket. Lifecycle
 *  is exactly the source contract (§5): node removal closes the connection,
 *  `active = false` closes it, a `url` change closes and reopens; nothing to
 *  unsubscribe, ever. */
export declare abstract class Stream extends Node {
    url: string;
    active: boolean;
    retry: number;
    /** The lifecycle as one fact (read-only intrinsic — checkAttr refuses an
     *  assignment). "failed" = down and will not reconnect. */
    status: "closed" | "connecting" | "open" | "retrying" | "failed";
    /** The last failure reason, "" when none; cleared on open. Read-only. */
    error: string;
    /** The most recent message's data — the zero-handler tier (`text = { feed.last }`).
     *  Read-only. */
    last: string;
    /** The boolean view of `status`, like DataSource.loaded: four names, one
     *  fact, never in disagreement. */
    get open(): boolean;
    /** The transport-specific half: hand the factory this stream's address and
     *  callbacks, get a live handle back. */
    protected abstract dial(cb: StreamCallbacks): StreamHandle;
    protected handle: StreamHandle | null;
    private timer;
    /** Bumped whenever the current handle stops being ours (drop, terminal
     *  end, reconnect) — the sequence discipline: a stale handle's callbacks
     *  land nowhere (DataSource.seq for connections). */
    private gen;
    /** Did the CURRENT connection reach open? — decides whether going down is
     *  an onClose fact. */
    private wasOpen;
    /** Set at initTree's autoStart: attribute pushes during construction and
     *  the initial binding evaluations must not connect — autoStart syncs once,
     *  with the settled initial values (zero churn by construction). */
    private wired;
    constructor();
    /** Construction-complete (instantiate.ts initTree — the hook every source
     *  uses): handlers and initial attribute values are all in place. */
    autoStart(): void;
    /** `url` (or `listen`) changed: close and reopen at the new address — the
     *  Dataset.url discipline, push-driven (the attribute pushers below reach
     *  these two private hooks the way Heartbeat' pusher reaches its sync). */
    protected readdressed(): void;
    /** `active` changed: the gate. */
    protected gated(): void;
    /** Converge on what the declaration wants: connected exactly when `active`
     *  and a non-empty `url` say so ("" = detached, the AppIsland idiom). */
    private sync;
    private connect;
    /** The connection went down (the factory's `end`). Not final = the
     *  platform repairs it itself (SSE native retry): just "retrying". Final =
     *  the handle is dead; a declared `retry` schedules the reconnect, else
     *  the stream rests at "failed" (a failure) or "closed" (a clean end). */
    private ended;
    /** Close whatever is live or pending. `quiet` (discard) fires no handlers —
     *  nothing may run into a tree being torn down. */
    private drop;
    /** A handler is an ordinary function-typed member the app may not have
     *  declared — pay-per-use, like every source. */
    protected fire(name: string, arg?: unknown): void;
}
/** SSE (`text/event-stream`), receive-only. The platform's EventSource is
 *  kept verbatim — its retry (the server's `retry:` hint) and Last-Event-ID
 *  resume are the best implementation of its own behavior. */
export declare class EventStream extends Stream {
    /** The named SSE event types to deliver (`listenTo = ["content_block_delta",
     *  "message_stop"]`) — EventSource physically cannot hear a named `event:`
     *  it was not asked for (streams.md §2). Unnamed messages always arrive. */
    listenTo: readonly string[];
    protected dial(cb: StreamCallbacks): StreamHandle;
}
/** WebSocket: the same surface plus `send`. Text frames only in v1 (ruled;
 *  binary is a later attribute if a real project needs it). */
export declare class Socket extends Stream {
    protected dial(cb: StreamCallbacks): StreamHandle;
    /** A call you make; `onMessage` is it calling you. On a socket that is not
     *  open: a reported error, not a silent queue (§5). */
    send(text: string): void;
}
