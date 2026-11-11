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
    /** Seconds to wait for the connection to open before giving it up
     *  (`failure` = timedOut); 0 = no limit. */
    connectTimeout: number;
    /** Seconds with nothing arriving on an open connection before it is taken
     *  for dead (a half-open link after sleep or a network change); 0 = off. */
    idleTimeout: number;
    /** Why the last connection failed — the closed set a DataSource uses. */
    failure: string;
    /** The last close's code (a WebSocket's; 0 when none) and reason. */
    closeCode: number;
    closeReason: string;
    /** The boolean view of `status`, like DataSource.loaded: four names, one
     *  fact, never in disagreement. */
    get open(): boolean;
    /** The transport-specific half: hand the factory this stream's address and
     *  callbacks, get a live handle back. */
    protected abstract $dial(cb: StreamCallbacks): StreamHandle;
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
    /** Consecutive failed attempts — the retry delay grows with it, and resets
     *  once a connection has stayed open STABLE_MS. */
    private attempts;
    private openedAt;
    private heardAt;
    private connectTimer;
    private idleTimer;
    constructor();
    /** Construction-complete (instantiate.ts initTree — the hook every source
     *  uses): handlers and initial attribute values are all in place. */
    $autoStart(): void;
    /** `url` (or `listen`) changed: close and reopen at the new address — the
     *  Dataset.url discipline, push-driven (the attribute pushers below reach
     *  these two private hooks the way Time's pushers reach its sync). */
    protected $readdressed(): void;
    /** `active` changed: the gate. */
    protected $gated(): void;
    /** Converge on what the declaration wants: connected exactly when `active`
     *  and a non-empty `url` say so ("" = detached, the AppIsland idiom). */
    private $sync;
    private $connect;
    /** Nothing has arrived for `idleTimeout`: checked against when something
     *  last did, so a timer a background tab held back late is not a false
     *  alarm, and one that fires early just re-arms. */
    private $armIdle;
    /** Given up by a timeout: close the handle and go down as a failure. */
    private $lost;
    private $clearTimers;
    /** Back from the background, or back online: an idle check that a held-back
     *  timer missed runs now, and a stream waiting to retry dials soon — after
     *  a jittered moment, so every client does not reconnect in the same second. */
    $resume(_online: boolean): void;
    /** The connection went down (the factory's `end`). Not final = the
     *  platform repairs it itself (SSE native retry): just "retrying". Final =
     *  the handle is dead; a declared `retry` schedules the reconnect, else
     *  the stream rests at "failed" (a failure) or "closed" (a clean end). */
    private $ended;
    /** Close whatever is live or pending. `quiet` (discard) fires no handlers —
     *  nothing may run into a tree being torn down. */
    private $drop;
    /** A handler is an ordinary function-typed member the app may not have
     *  declared — pay-per-use, like every source. */
    protected $fire(name: string, arg?: unknown): void;
}
/** SSE (`text/event-stream`), receive-only. A plain GET keeps the platform's
 *  EventSource verbatim — its retry (the server's `retry:` hint) and
 *  Last-Event-ID resume are the best implementation of its own behavior. A
 *  stream that is the reply to a REQUEST — another verb, headers, a body, a
 *  credentials mode: the four a DataSource sends — is one request read as its
 *  reply arrives (stream-seam.ts browserRequestStream), which EventSource
 *  cannot make: it sends a bare GET with no headers. A request is not replayed
 *  when its reply ends; `retry` says whether to ask again. */
export declare class EventStream extends Stream {
    /** The named SSE event types to deliver (`listenTo = ["progress",
     *  "done"]`) — EventSource physically cannot hear a named `event:`
     *  it was not asked for (streams.md §2). Unnamed messages always arrive. */
    listenTo: readonly string[];
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    headers: Record<string, unknown> | null;
    body: unknown;
    credentials: "omit" | "sameOrigin" | "include";
    protected $dial(cb: StreamCallbacks): StreamHandle;
    /** The request, when this stream is more than a plain GET; null when it is
     *  one. Encoded as a DataSource encodes its own: an object body as JSON with
     *  a JSON Content-Type, a string verbatim; an empty header value drops it. */
    private $request;
}
/** WebSocket: the same surface plus `send`. Text frames only in v1 (ruled;
 *  binary is a later attribute if a real project needs it). */
export declare class Socket extends Stream {
    protected $dial(cb: StreamCallbacks): StreamHandle;
    /** A call you make; `onMessage` is it calling you. On a socket that is not
     *  open: a reported error, not a silent queue (§5). */
    /** Bytes sent and not yet on the wire — growing on a slow link. Refreshed
     *  after each send() and while it drains; a message still queued when the
     *  connection drops is lost, its outcome unknown. Read-only. */
    bufferedAmount: number;
    private drainTimer;
    private $refreshBuffered;
    send(text: string): void;
}
