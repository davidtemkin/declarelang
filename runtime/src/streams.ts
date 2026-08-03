// streams — SSE and WebSocket as SOURCES (docs/system-design/streams.md,
// RULED 2026-07-29). A stream is the ch. 7 family (Keys, Heartbeat, Tip,
// Dataset): a non-visual member whose handlers are called by something
// outside the tree, whose lifetime is its node's, with nothing to
// unsubscribe. The reactive model already does the hard half — a message
// arrives, a handler assigns, every constraint that read the changed state
// updates — so streaming AI text into a view is one line of handler.
//
// One family, three names (the Editor arrangement): the abstract `Stream`
// base carries the whole shared surface — `url`, `active`, `retry`, the
// handlers, and the read-only lifecycle intrinsics (`status`/`error`/`open`/
// `last`, the DataSource.status/.loaded design transplanted); `EventStream`
// is SSE, `Socket` is WebSocket plus `send(text)`.
//
// RECONNECTION (streams.md §3): delegate what the platform owns, declare the
// rest. EventSource retries natively (the server's `retry:` hint,
// Last-Event-ID resume) — while it does, `status` reads "retrying" and the
// error channel stays quiet. Beyond that, `retry = seconds` in the
// declaration: how long to wait before reconnecting after a loss the
// platform won't repair itself — a Socket's unexpected close, an
// EventStream's terminal failure. The interval is fixed and visible; 0 (the
// default) means the stream lands in "failed" and the app decides. A
// synchronous factory failure (no transport at all — the headless refuser)
// is structural, not transient: straight to "failed", no retry loop.
//
// THE SEAM (§4): like data.ts provideTransport, the platform constructors
// enter through one injectable pair of factories — which lives in
// stream-seam.ts, NOT here. The split is the slim discipline: index.ts
// exports the seam (headless refusers, test stubs, the mac host's native
// pair), while THIS module — the classes and their defineAttributes side
// effects — is reachable only through registry.js, so an app that declares
// no stream ships none of it.

import { Node, onDiscard } from "./node.js";
import { defineAttributes, setBound } from "./attributes.js";
import { currentStreams, type StreamCallbacks, type StreamHandle } from "./stream-seam.js";

// ── The components ───────────────────────────────────────────────────────────

/** The abstract base: everything shared between SSE and WebSocket. Lifecycle
 *  is exactly the source contract (§5): node removal closes the connection,
 *  `active = false` closes it, a `url` change closes and reopens; nothing to
 *  unsubscribe, ever. */
export abstract class Stream extends Node {
  declare url: string;
  declare active: boolean;
  declare retry: number;
  /** The lifecycle as one fact (read-only intrinsic — checkAttr refuses an
   *  assignment). "failed" = down and will not reconnect. */
  declare status: "closed" | "connecting" | "open" | "retrying" | "failed";
  /** The last failure reason, "" when none; cleared on open. Read-only. */
  declare error: string;
  /** The most recent message's data — the zero-handler tier (`text = { feed.last }`).
   *  Read-only. */
  declare last: string;

  /** The boolean view of `status`, like DataSource.loaded: four names, one
   *  fact, never in disagreement. */
  get open(): boolean {
    return this.status === "open";
  }

  /** The transport-specific half: hand the factory this stream's address and
   *  callbacks, get a live handle back. */
  protected abstract dial(cb: StreamCallbacks): StreamHandle;

  protected handle: StreamHandle | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped whenever the current handle stops being ours (drop, terminal
   *  end, reconnect) — the sequence discipline: a stale handle's callbacks
   *  land nowhere (DataSource.seq for connections). */
  private gen = 0;
  /** Did the CURRENT connection reach open? — decides whether going down is
   *  an onClose fact. */
  private wasOpen = false;
  /** Set at initTree's autoStart: attribute pushes during construction and
   *  the initial binding evaluations must not connect — autoStart syncs once,
   *  with the settled initial values (zero churn by construction). */
  private wired = false;

  constructor() {
    super();
    // Lifetime is the node's: a discarded stream closes its connection, so a
    // torn-down subtree cannot keep one alive. Quiet — no handlers fire into
    // a tree being discarded.
    onDiscard(this, () => this.drop(true));
  }

  /** Construction-complete (instantiate.ts initTree — the hook every source
   *  uses): handlers and initial attribute values are all in place. */
  autoStart(): void {
    if (this.wired) return;
    this.wired = true;
    this.sync();
  }

  /** `url` (or `listen`) changed: close and reopen at the new address — the
   *  Dataset.url discipline, push-driven (the attribute pushers below reach
   *  these two private hooks the way Heartbeat' pusher reaches its sync). */
  protected readdressed(): void {
    if (!this.wired) return;
    this.drop(false);
    this.sync();
  }

  /** `active` changed: the gate. */
  protected gated(): void {
    if (!this.wired) return;
    if (!this.active) this.drop(false);
    this.sync();
  }

  /** Converge on what the declaration wants: connected exactly when `active`
   *  and a non-empty `url` say so ("" = detached, the AppIsland idiom). */
  private sync(): void {
    if (this.active && this.url !== "") {
      if (this.handle === null && this.timer === null) this.connect();
    } else if (this.status !== "closed") {
      setBound(this, "status", "closed");
    }
  }

  private connect(): void {
    const gen = ++this.gen;
    setBound(this, "status", "connecting");
    const cb: StreamCallbacks = {
      open: () => {
        if (gen !== this.gen) return;
        this.wasOpen = true;
        setBound(this, "error", "");
        setBound(this, "status", "open");
        this.fire("onOpen");
      },
      message: (m) => {
        if (gen !== this.gen) return;
        setBound(this, "last", m.data);
        this.fire("onMessage", m);
      },
      end: (error, final) => {
        if (gen !== this.gen) return;
        this.ended(error, final);
      },
    };
    try {
      this.handle = this.dial(cb);
    } catch (e) {
      // The factory could not even construct a connection (the headless
      // refuser, a missing host service): structural, not transient —
      // straight to "failed", never a retry loop (§3).
      this.handle = null;
      setBound(this, "error", e instanceof Error ? e.message : String(e));
      setBound(this, "status", "failed");
      this.fire("onError");
    }
  }

  /** The connection went down (the factory's `end`). Not final = the
   *  platform repairs it itself (SSE native retry): just "retrying". Final =
   *  the handle is dead; a declared `retry` schedules the reconnect, else
   *  the stream rests at "failed" (a failure) or "closed" (a clean end). */
  private ended(error: string, final: boolean): void {
    if (error !== "") {
      setBound(this, "error", error);
      this.fire("onError");
    }
    if (!final) {
      setBound(this, "status", "retrying");
      return;
    }
    this.gen++;
    this.handle = null;
    if (this.wasOpen) {
      this.wasOpen = false;
      this.fire("onClose");
    }
    if (this.retry > 0 && this.active) {
      setBound(this, "status", "retrying");
      this.timer = setTimeout(() => {
        this.timer = null;
        this.sync();
      }, this.retry * 1000);
    } else {
      setBound(this, "status", error !== "" ? "failed" : "closed");
    }
  }

  /** Close whatever is live or pending. `quiet` (discard) fires no handlers —
   *  nothing may run into a tree being torn down. */
  private drop(quiet: boolean): void {
    this.gen++;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.handle !== null) {
      try {
        this.handle.close();
      } catch {
        /* closing is best-effort — the handle may already be dead */
      }
      this.handle = null;
    }
    if (this.wasOpen) {
      this.wasOpen = false;
      if (!quiet) this.fire("onClose");
    }
  }

  /** A handler is an ordinary function-typed member the app may not have
   *  declared — pay-per-use, like every source. */
  protected fire(name: string, arg?: unknown): void {
    const fn = (this as unknown as Record<string, unknown>)[name];
    if (typeof fn === "function") (fn as (a?: unknown) => void).call(this, arg);
  }
}

defineAttributes(Stream as never, {
  url: { def: "", push: (s: unknown) => (s as unknown as { readdressed(): void }).readdressed() },
  active: { def: true, push: (s: unknown) => (s as unknown as { gated(): void }).gated() },
  retry: { def: 0 },
  status: { def: "closed" },
  error: { def: "" },
  last: { def: "" },
} as never);

/** SSE (`text/event-stream`), receive-only. The platform's EventSource is
 *  kept verbatim — its retry (the server's `retry:` hint) and Last-Event-ID
 *  resume are the best implementation of its own behavior. */
export class EventStream extends Stream {
  /** The named SSE event types to deliver (`listenTo = ["content_block_delta",
   *  "message_stop"]`) — EventSource physically cannot hear a named `event:`
   *  it was not asked for (streams.md §2). Unnamed messages always arrive. */
  declare listenTo: readonly string[];

  protected dial(cb: StreamCallbacks): StreamHandle {
    // a data-borne list could carry non-strings; dial only what is dialable
    const listen = this.listenTo.filter((s) => typeof s === "string" && s !== "");
    return currentStreams().eventSource(this.url, listen, cb);
  }
}

defineAttributes(EventStream as never, {
  // listeners attach at construction, so changing what you listen to is a
  // readdress: close and reopen with the new set
  listenTo: { def: Object.freeze([]), push: (s: unknown) => (s as unknown as { readdressed(): void }).readdressed() },
} as never);

/** WebSocket: the same surface plus `send`. Text frames only in v1 (ruled;
 *  binary is a later attribute if a real project needs it). */
export class Socket extends Stream {
  protected dial(cb: StreamCallbacks): StreamHandle {
    return currentStreams().socket(this.url, cb);
  }

  /** A call you make; `onMessage` is it calling you. On a socket that is not
   *  open: a reported error, not a silent queue (§5). */
  send(text: string): void {
    if (this.open && this.handle?.send !== undefined) {
      this.handle.send(text);
      return;
    }
    setBound(this, "error", "send(…) on a socket that is not open — nothing was sent (gate on .open, or send from onOpen)");
    this.fire("onError");
  }
}
