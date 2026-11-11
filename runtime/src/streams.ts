// streams — SSE and WebSocket as SOURCES (docs/system-design/streams.md,
// RULED 2026-07-29). A stream is the ch. 7 family (Keys, Time, Tooltips,
// Dataset): a non-visual member whose handlers are called by something
// outside the tree, whose lifetime is its node's, with nothing to
// unsubscribe. The reactive model already does the hard half — a message
// arrives, a handler assigns, every constraint that read the changed state
// updates — so streaming AI text into a view is one line of handler.
//
// One family, three names (the Media arrangement): the abstract `Stream`
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
import { currentStreams, defaultEventSource, offlineNow, type StreamCallbacks, type StreamEnd, type StreamHandle, type StreamRequest } from "./stream-seam.js";
import { declareName } from "./declare-name.js";

// ── The classes ───────────────────────────────────────────────────────────

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
  /** Seconds to wait for the connection to open before giving it up
   *  (`failure` = timedOut); 0 = no limit. */
  declare connectTimeout: number;
  /** Seconds with nothing arriving on an open connection before it is taken
   *  for dead (a half-open link after sleep or a network change); 0 = off. */
  declare idleTimeout: number;
  /** Why the last connection failed — the closed set a DataSource uses. */
  declare failure: string;
  /** The last close's code (a WebSocket's; 0 when none) and reason. */
  declare closeCode: number;
  declare closeReason: string;

  /** The boolean view of `status`, like DataSource.loaded: four names, one
   *  fact, never in disagreement. */
  get open(): boolean {
    return this.status === "open";
  }

  /** The transport-specific half: hand the factory this stream's address and
   *  callbacks, get a live handle back. */
  protected abstract $dial(cb: StreamCallbacks): StreamHandle;

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
  /** Consecutive failed attempts — the retry delay grows with it, and resets
   *  once a connection has stayed open STABLE_MS. */
  private attempts = 0;
  private openedAt = 0;
  private heardAt = 0;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    LIVE.add(this);
    onDiscard(this, () => LIVE.delete(this));
    watchLifecycle();
    // Lifetime is the node's: a discarded stream closes its connection, so a
    // torn-down subtree cannot keep one alive. Quiet — no handlers fire into
    // a tree being discarded.
    onDiscard(this, () => this.$drop(true));
  }

  /** Construction-complete (instantiate.ts initTree — the hook every source
   *  uses): handlers and initial attribute values are all in place. */
  $autoStart(): void {
    if (this.wired) return;
    this.wired = true;
    this.$sync();
  }

  /** `url` (or `listen`) changed: close and reopen at the new address — the
   *  Dataset.url discipline, push-driven (the attribute pushers below reach
   *  these two private hooks the way Time's pushers reach its sync). */
  protected $readdressed(): void {
    if (!this.wired) return;
    this.$drop(false);
    this.$sync();
  }

  /** `active` changed: the gate. */
  protected $gated(): void {
    if (!this.wired) return;
    if (!this.active) this.$drop(false);
    this.$sync();
  }

  /** Converge on what the declaration wants: connected exactly when `active`
   *  and a non-empty `url` say so ("" = detached, the AppIsland idiom). */
  private $sync(): void {
    if (this.active && this.url !== "") {
      if (this.handle === null && this.timer === null) this.$connect();
    } else if (this.status !== "closed") {
      setBound(this, "status", "closed");
    }
  }

  private $connect(): void {
    const gen = ++this.gen;
    setBound(this, "status", "connecting");
    const cb: StreamCallbacks = {
      open: () => {
        if (gen !== this.gen) return;
        this.$clearTimers();
        this.wasOpen = true;
        this.openedAt = this.heardAt = Date.now();
        setBound(this, "error", "");
        setBound(this, "failure", "none");
        setBound(this, "status", "open");
        this.$armIdle();
        this.$fire("onOpen");
      },
      message: (m) => {
        if (gen !== this.gen) return;
        this.heardAt = Date.now();
        setBound(this, "last", m.data);
        this.$fire("onMessage", m);
      },
      alive: () => {
        if (gen !== this.gen) return;
        this.heardAt = Date.now();
      },
      end: (error, final, how) => {
        if (gen !== this.gen) return;
        this.$ended(error, final, how);
      },
    };
    try {
      this.handle = this.$dial(cb);
    } catch (e) {
      // The factory could not even construct a connection (the headless
      // refuser, a missing host service): structural, not transient —
      // straight to "failed", never a retry loop (§3).
      this.handle = null;
      setBound(this, "error", e instanceof Error ? e.message : String(e));
      setBound(this, "failure", "unsent");
      setBound(this, "status", "failed");
      this.$fire("onError");
      return;
    }
    // a connection that never opens is given up, not waited on forever
    if (this.connectTimeout > 0) {
      this.connectTimer = setTimeout(() => {
        this.connectTimer = null;
        if (gen !== this.gen) return;
        this.$lost(`no connection to ${this.url} after ${this.connectTimeout} s`);
      }, this.connectTimeout * 1000);
    }
  }

  /** Nothing has arrived for `idleTimeout`: checked against when something
   *  last did, so a timer a background tab held back late is not a false
   *  alarm, and one that fires early just re-arms. */
  private $armIdle(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (!(this.idleTimeout > 0) || this.status !== "open") return;
    const gen = this.gen;
    const due = this.heardAt + this.idleTimeout * 1000 - Date.now();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (gen !== this.gen || this.status !== "open") return;
      if (Date.now() - this.heardAt >= this.idleTimeout * 1000) this.$lost(`nothing from ${this.url} for ${this.idleTimeout} s`);
      else this.$armIdle();
    }, Math.max(0, due));
  }

  /** Given up by a timeout: close the handle and go down as a failure. */
  private $lost(error: string): void {
    const h = this.handle;
    this.gen++;
    this.handle = null;
    try { h?.close(); } catch { /* best-effort */ }
    this.$ended(error, true, { failure: "timedOut" }, true);
  }

  private $clearTimers(): void {
    if (this.connectTimer !== null) { clearTimeout(this.connectTimer); this.connectTimer = null; }
    if (this.idleTimer !== null) { clearTimeout(this.idleTimer); this.idleTimer = null; }
  }

  /** Back from the background, or back online: an idle check that a held-back
   *  timer missed runs now, and a stream waiting to retry dials soon — after
   *  a jittered moment, so every client does not reconnect in the same second. */
  $resume(_online: boolean): void {
    if (this.status === "open") { if (this.idleTimeout > 0) this.$armIdle(); return; }
    if (this.status !== "retrying" || this.timer === null || !this.active) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; this.$sync(); }, Math.random() * 1000);
  }

  /** The connection went down (the factory's `end`). Not final = the
   *  platform repairs it itself (SSE native retry): just "retrying". Final =
   *  the handle is dead; a declared `retry` schedules the reconnect, else
   *  the stream rests at "failed" (a failure) or "closed" (a clean end). */
  private $ended(error: string, final: boolean, how?: StreamEnd, bumped = false): void {
    this.$clearTimers();
    if (how?.code !== undefined) {
      setBound(this, "closeCode", how.code);
      setBound(this, "closeReason", how.reason ?? "");
    }
    if (error !== "") {
      setBound(this, "error", error);
      setBound(this, "failure", how?.failure ?? (offlineNow() ? "offline" : "networkError"));
      this.$fire("onError");
    }
    if (!final) {
      setBound(this, "status", "retrying");
      return;
    }
    if (!bumped) this.gen++;
    this.handle = null;
    // a connection that stayed up a while was a success: the next loss
    // starts the retry delay over
    if (this.wasOpen && Date.now() - this.openedAt >= STABLE_MS) this.attempts = 0;
    if (this.wasOpen) {
      this.wasOpen = false;
      // onClose runs before any retry is scheduled: a program that reads
      // `closeCode` (its own 4000–4999, an expired session) and turns
      // `active` off there stops the retry
      this.$fire("onClose");
    }
    // a refusal — the server saying no, or answering with something that is
    // not a stream — is not retried: asking again asks for the same no
    const refused = how?.failure === "rejected" || how?.failure === "unreadable";
    if (this.retry > 0 && this.active && !refused) {
      setBound(this, "status", "retrying");
      // the delay grows from `retry` (doubling, to a minute at most), with
      // jitter so clients a restart dropped together do not return together;
      // offline, it waits the longest — and coming back online dials at once
      const base = Math.min(this.retry * 2 ** this.attempts, RETRY_CAP_S);
      const wait = offlineNow() ? RETRY_CAP_S : base / 2 + Math.random() * base / 2;
      this.attempts++;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.$sync();
      }, wait * 1000);
    } else {
      setBound(this, "status", error !== "" ? "failed" : "closed");
    }
  }

  /** Close whatever is live or pending. `quiet` (discard) fires no handlers —
   *  nothing may run into a tree being torn down. */
  private $drop(quiet: boolean): void {
    this.gen++;
    this.$clearTimers();
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
      if (!quiet) this.$fire("onClose");
    }
  }

  /** A handler is an ordinary function-typed member the app may not have
   *  declared — pay-per-use, like every source. */
  protected $fire(name: string, arg?: unknown): void {
    const fn = (this as unknown as Record<string, unknown>)[name];
    if (typeof fn === "function") {
      // Loud and attributed, never fatal: a throwing onMessage must not kill
      // the stream (or the arrival burst it rode in on).
      try { (fn as (a?: unknown) => void).call(this, arg); }
      catch (e) { console.error(`[Declare] ${name} on ${declareName(this)} threw: ${(e as Error)?.message ?? e}`, e); }
    }
  }
}

defineAttributes(Stream as never, {
  url: { def: "", push: (s: unknown) => (s as unknown as { $readdressed(): void }).$readdressed() },
  active: { def: true, push: (s: unknown) => (s as unknown as { $gated(): void }).$gated() },
  retry: { def: 0 },
  status: { def: "closed" },
  error: { def: "" },
  last: { def: "" },
  connectTimeout: { def: 30 },
  idleTimeout: { def: 0, push: (s: unknown) => (s as unknown as { $armIdle(): void }).$armIdle() },
  failure: { def: "none" },
  closeCode: { def: 0 },
  closeReason: { def: "" },
} as never);

/** A connection that stays open this long was a success: the retry delay
 *  starts over after it. */
const STABLE_MS = 10_000;
/** The longest a retry waits, in seconds — and how long it waits while offline. */
const RETRY_CAP_S = 60;

/** Every live stream, for the page's lifecycle: back online, or shown again
 *  from the background or the back-forward cache. */
const LIVE = new Set<Stream>();
let lifecycleWatched = false;
function watchLifecycle(): void {
  if (lifecycleWatched) return;
  lifecycleWatched = true;
  const g = globalThis as { addEventListener?: (t: string, f: (e: unknown) => void) => void; document?: { visibilityState?: string } };
  if (typeof g.addEventListener !== "function") return;
  g.addEventListener("online", () => { for (const s of LIVE) s.$resume(true); });
  g.addEventListener("pageshow", () => { for (const s of LIVE) s.$resume(false); });
  g.addEventListener("visibilitychange", () => {
    if (g.document?.visibilityState === "visible") for (const s of LIVE) s.$resume(false);
  });
}

/** SSE (`text/event-stream`), receive-only. A plain GET keeps the platform's
 *  EventSource verbatim — its retry (the server's `retry:` hint) and
 *  Last-Event-ID resume are the best implementation of its own behavior. A
 *  stream that is the reply to a REQUEST — another verb, headers, a body, a
 *  credentials mode: the four a DataSource sends — is one request read as its
 *  reply arrives (stream-seam.ts browserRequestStream), which EventSource
 *  cannot make: it sends a bare GET with no headers. A request is not replayed
 *  when its reply ends; `retry` says whether to ask again. */
export class EventStream extends Stream {
  /** The named SSE event types to deliver (`listenTo = ["progress",
   *  "done"]`) — EventSource physically cannot hear a named `event:`
   *  it was not asked for (streams.md §2). Unnamed messages always arrive. */
  declare listenTo: readonly string[];
  declare method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  declare headers: Record<string, unknown> | null;
  declare body: unknown;
  declare credentials: "omit" | "sameOrigin" | "include";

  protected $dial(cb: StreamCallbacks): StreamHandle {
    // a data-borne list could carry non-strings; dial only what is dialable
    const listen = this.listenTo.filter((s) => typeof s === "string" && s !== "");
    const f = currentStreams();
    let req = this.$request();
    // a host with fetch but no EventSource (the native host) reads a plain GET
    // stream as the reply to one — without EventSource's own retry and resume
    if (req === null && typeof EventSource !== "function" && defaultEventSource()) req = { method: "GET", headers: {}, body: null };
    if (req === null) return f.eventSource(this.url, listen, cb);
    return (f.request ?? requestStreamOverFetch)(this.url, req, listen, cb);
  }

  /** The request, when this stream is more than a plain GET; null when it is
   *  one. Encoded as a DataSource encodes its own: an object body as JSON with
   *  a JSON Content-Type, a string verbatim; an empty header value drops it. */
  private $request(): StreamRequest | null {
    const method = (this.method || "GET").toUpperCase();
    const headers: Record<string, string> = {};
    let body: string | null = null;
    if (method !== "GET" && this.body != null) {
      if (typeof this.body === "string") body = this.body;
      else { body = JSON.stringify(this.body); headers["Content-Type"] = "application/json"; }
    }
    const authored = this.headers;
    if (authored !== null && typeof authored === "object") {
      for (const [k, v] of Object.entries(authored)) if (v != null && v !== "") headers[k] = String(v);
    }
    const credentials = this.credentials === "omit" ? "omit" : this.credentials === "include" ? "include" : undefined;
    if (method === "GET" && Object.keys(headers).length === 0 && credentials === undefined) return null;
    return { method, headers, body, ...(credentials !== undefined ? { credentials } : {}) };
  }
}

const readdress = (s: unknown): void => (s as unknown as { $readdressed(): void }).$readdressed();
defineAttributes(EventStream as never, {
  // listeners attach at construction, so changing what you listen to is a
  // readdress: close and reopen with the new set
  listenTo: { def: Object.freeze([]), push: readdress },
  // the request: a change asks again, as a new url does
  method: { def: "GET", push: readdress },
  headers: { def: null, push: readdress },
  body: { def: null, push: readdress },
  credentials: { def: "sameOrigin", push: readdress },
} as never);

/** WebSocket: the same surface plus `send`. Text frames only in v1 (ruled;
 *  binary is a later attribute if a real project needs it). */
export class Socket extends Stream {
  protected $dial(cb: StreamCallbacks): StreamHandle {
    return currentStreams().socket(this.url, cb);
  }

  /** A call you make; `onMessage` is it calling you. On a socket that is not
   *  open: a reported error, not a silent queue (§5). */
  /** Bytes sent and not yet on the wire — growing on a slow link. Refreshed
   *  after each send() and while it drains; a message still queued when the
   *  connection drops is lost, its outcome unknown. Read-only. */
  declare bufferedAmount: number;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private $refreshBuffered(): void {
    const n = this.handle?.buffered?.() ?? 0;
    if (n !== this.bufferedAmount) setBound(this, "bufferedAmount", n);
    if (this.drainTimer !== null) clearTimeout(this.drainTimer);
    this.drainTimer = n > 0 ? setTimeout(() => { this.drainTimer = null; this.$refreshBuffered(); }, 250) : null;
  }

  send(text: string): void {
    if (this.open && this.handle?.send !== undefined) {
      this.handle.send(text);
      this.$refreshBuffered();
      return;
    }
    setBound(this, "error", "send(…) on a socket that is not open — nothing was sent (gate on .open, or send from onOpen)");
    this.$fire("onError");
  }
}

defineAttributes(Socket as never, {
  bufferedAmount: { def: 0 },
} as never);

/** The request stream over fetch (the seam's `request` when a host gives none): the reply's body read chunk by chunk and
 *  parsed as server-sent events (the WHATWG event-stream format: `data:` lines
 *  joined, `event:` names the type, `id:` the last-event-id, a blank line
 *  dispatches; an event cut off by the end of the reply is dropped, as the
 *  format says). A named event is delivered only when listened to, as with
 *  EventSource. A refusal ends the stream with its status and what it said. */
function requestStreamOverFetch(url: string, req: StreamRequest, listen: readonly string[], cb: StreamCallbacks): StreamHandle {
  const ctl = new AbortController();
  let closed = false;
  const init: RequestInit = { method: req.method, headers: req.headers, signal: ctl.signal };
  if (req.body !== null) init.body = req.body;
  if (req.credentials !== undefined) init.credentials = req.credentials;
  (async () => {
    const res = await globalThis.fetch(url, init);
    if (!res.ok) {
      let said = "";
      try { said = (await res.text()).trim().slice(0, 300); } catch { said = ""; }
      cb.end(`HTTP ${res.status} for ${url}${said !== "" ? ` — ${said}` : ""}`, true, { failure: res.status >= 500 ? "serverError" : "rejected" });
      return;
    }
    // a 200 that is not an event stream — a sign-in page, a proxy's notice —
    // is no stream at all: said, not read as one
    const replied = res.headers?.get?.("content-type") ?? "";
    if (replied !== "" && !/^text\/event-stream\b/i.test(replied)) {
      cb.end(`the reply from ${url} is ${replied.split(";")[0]}, not an event stream`, true, { failure: "unreadable" });
      return;
    }
    if (res.body === null) { cb.end(`no reply body from ${url}`, true, { failure: "unreadable" }); return; }
    cb.open();
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", data: string[] = [], type = "", id = "";
    const line = (l: string): void => {
      if (l === "") {
        if (data.length > 0) {
          const t = type === "" ? "message" : type;
          if (t === "message" || listen.includes(t)) cb.message({ data: data.join("\n"), type: t, id });
        }
        data = []; type = "";
        return;
      }
      if (l.startsWith(":")) { cb.alive?.(); return; }             // a comment — a keep-alive
      const colon = l.indexOf(":");
      const field = colon < 0 ? l : l.slice(0, colon);
      let value = colon < 0 ? "" : l.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "data") data.push(value);
      else if (field === "event") type = value;
      else if (field === "id" && !value.includes("\0")) id = value;
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.search(/\r\n|\r|\n/)) >= 0) {
        if (nl === buf.length - 1 && buf[nl] === "\r") break;     // its \n may be in the next chunk
        const sep = buf.startsWith("\r\n", nl) ? 2 : 1;
        line(buf.slice(0, nl));
        buf = buf.slice(nl + sep);
      }
    }
    if (!closed) cb.end("", true);
  })().catch((e: unknown) => {
    if (closed) return;
    cb.end(e instanceof Error ? e.message : String(e), true, { failure: offlineNow() ? "offline" : "networkError" });
  });
  return { close: () => { closed = true; ctl.abort(); } };
}
