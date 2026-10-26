// streams — SSE and WebSocket as SOURCES (docs/system-design/streams.md,
// RULED 2026-07-29). A stream is the ch. 7 family (Keys, Time, Tooltips,
// Dataset): a non-visual member whose handlers are called by something
// outside the tree, whose lifetime is its node's, with nothing to
// unsubscribe. The reactive model already does the hard half — a message
// arrives, a handler assigns, every constraint that read the changed state
// updates — so streaming AI text into a view is one line of handler.
//
// One family, three names (the EditControl arrangement): the abstract `Stream`
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
import { currentStreams, defaultEventSource } from "./stream-seam.js";
// ── The classes ───────────────────────────────────────────────────────────
/** The abstract base: everything shared between SSE and WebSocket. Lifecycle
 *  is exactly the source contract (§5): node removal closes the connection,
 *  `active = false` closes it, a `url` change closes and reopens; nothing to
 *  unsubscribe, ever. */
export class Stream extends Node {
    /** The boolean view of `status`, like DataSource.loaded: four names, one
     *  fact, never in disagreement. */
    get open() {
        return this.status === "open";
    }
    handle = null;
    timer = null;
    /** Bumped whenever the current handle stops being ours (drop, terminal
     *  end, reconnect) — the sequence discipline: a stale handle's callbacks
     *  land nowhere (DataSource.seq for connections). */
    gen = 0;
    /** Did the CURRENT connection reach open? — decides whether going down is
     *  an onClose fact. */
    wasOpen = false;
    /** Set at initTree's autoStart: attribute pushes during construction and
     *  the initial binding evaluations must not connect — autoStart syncs once,
     *  with the settled initial values (zero churn by construction). */
    wired = false;
    constructor() {
        super();
        // Lifetime is the node's: a discarded stream closes its connection, so a
        // torn-down subtree cannot keep one alive. Quiet — no handlers fire into
        // a tree being discarded.
        onDiscard(this, () => this.$drop(true));
    }
    /** Construction-complete (instantiate.ts initTree — the hook every source
     *  uses): handlers and initial attribute values are all in place. */
    $autoStart() {
        if (this.wired)
            return;
        this.wired = true;
        this.$sync();
    }
    /** `url` (or `listen`) changed: close and reopen at the new address — the
     *  Dataset.url discipline, push-driven (the attribute pushers below reach
     *  these two private hooks the way Time's pushers reach its sync). */
    $readdressed() {
        if (!this.wired)
            return;
        this.$drop(false);
        this.$sync();
    }
    /** `active` changed: the gate. */
    $gated() {
        if (!this.wired)
            return;
        if (!this.active)
            this.$drop(false);
        this.$sync();
    }
    /** Converge on what the declaration wants: connected exactly when `active`
     *  and a non-empty `url` say so ("" = detached, the AppIsland idiom). */
    $sync() {
        if (this.active && this.url !== "") {
            if (this.handle === null && this.timer === null)
                this.$connect();
        }
        else if (this.status !== "closed") {
            setBound(this, "status", "closed");
        }
    }
    $connect() {
        const gen = ++this.gen;
        setBound(this, "status", "connecting");
        const cb = {
            open: () => {
                if (gen !== this.gen)
                    return;
                this.wasOpen = true;
                setBound(this, "error", "");
                setBound(this, "status", "open");
                this.$fire("onOpen");
            },
            message: (m) => {
                if (gen !== this.gen)
                    return;
                setBound(this, "last", m.data);
                this.$fire("onMessage", m);
            },
            end: (error, final) => {
                if (gen !== this.gen)
                    return;
                this.$ended(error, final);
            },
        };
        try {
            this.handle = this.$dial(cb);
        }
        catch (e) {
            // The factory could not even construct a connection (the headless
            // refuser, a missing host service): structural, not transient —
            // straight to "failed", never a retry loop (§3).
            this.handle = null;
            setBound(this, "error", e instanceof Error ? e.message : String(e));
            setBound(this, "status", "failed");
            this.$fire("onError");
        }
    }
    /** The connection went down (the factory's `end`). Not final = the
     *  platform repairs it itself (SSE native retry): just "retrying". Final =
     *  the handle is dead; a declared `retry` schedules the reconnect, else
     *  the stream rests at "failed" (a failure) or "closed" (a clean end). */
    $ended(error, final) {
        if (error !== "") {
            setBound(this, "error", error);
            this.$fire("onError");
        }
        if (!final) {
            setBound(this, "status", "retrying");
            return;
        }
        this.gen++;
        this.handle = null;
        if (this.wasOpen) {
            this.wasOpen = false;
            this.$fire("onClose");
        }
        if (this.retry > 0 && this.active) {
            setBound(this, "status", "retrying");
            this.timer = setTimeout(() => {
                this.timer = null;
                this.$sync();
            }, this.retry * 1000);
        }
        else {
            setBound(this, "status", error !== "" ? "failed" : "closed");
        }
    }
    /** Close whatever is live or pending. `quiet` (discard) fires no handlers —
     *  nothing may run into a tree being torn down. */
    $drop(quiet) {
        this.gen++;
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.handle !== null) {
            try {
                this.handle.close();
            }
            catch {
                /* closing is best-effort — the handle may already be dead */
            }
            this.handle = null;
        }
        if (this.wasOpen) {
            this.wasOpen = false;
            if (!quiet)
                this.$fire("onClose");
        }
    }
    /** A handler is an ordinary function-typed member the app may not have
     *  declared — pay-per-use, like every source. */
    $fire(name, arg) {
        const fn = this[name];
        if (typeof fn === "function") {
            // Loud and attributed, never fatal: a throwing onMessage must not kill
            // the stream (or the arrival burst it rode in on).
            try {
                fn.call(this, arg);
            }
            catch (e) {
                console.error(`[Declare] ${name} on ${this.constructor.name} threw: ${e?.message ?? e}`, e);
            }
        }
    }
}
defineAttributes(Stream, {
    url: { def: "", push: (s) => s.$readdressed() },
    active: { def: true, push: (s) => s.$gated() },
    retry: { def: 0 },
    status: { def: "closed" },
    error: { def: "" },
    last: { def: "" },
});
/** SSE (`text/event-stream`), receive-only. A plain GET keeps the platform's
 *  EventSource verbatim — its retry (the server's `retry:` hint) and
 *  Last-Event-ID resume are the best implementation of its own behavior. A
 *  stream that is the reply to a REQUEST — another verb, headers, a body, a
 *  credentials mode: the four a DataSource sends — is one request read as its
 *  reply arrives (stream-seam.ts browserRequestStream), which EventSource
 *  cannot make: it sends a bare GET with no headers. A request is not replayed
 *  when its reply ends; `retry` says whether to ask again. */
export class EventStream extends Stream {
    $dial(cb) {
        // a data-borne list could carry non-strings; dial only what is dialable
        const listen = this.listenTo.filter((s) => typeof s === "string" && s !== "");
        const f = currentStreams();
        let req = this.$request();
        // a host with fetch but no EventSource (the native host) reads a plain GET
        // stream as the reply to one — without EventSource's own retry and resume
        if (req === null && typeof EventSource !== "function" && defaultEventSource())
            req = { method: "GET", headers: {}, body: null };
        if (req === null)
            return f.eventSource(this.url, listen, cb);
        return (f.request ?? requestStreamOverFetch)(this.url, req, listen, cb);
    }
    /** The request, when this stream is more than a plain GET; null when it is
     *  one. Encoded as a DataSource encodes its own: an object body as JSON with
     *  a JSON Content-Type, a string verbatim; an empty header value drops it. */
    $request() {
        const method = (this.method || "GET").toUpperCase();
        const headers = {};
        let body = null;
        if (method !== "GET" && this.body != null) {
            if (typeof this.body === "string")
                body = this.body;
            else {
                body = JSON.stringify(this.body);
                headers["Content-Type"] = "application/json";
            }
        }
        const authored = this.headers;
        if (authored !== null && typeof authored === "object") {
            for (const [k, v] of Object.entries(authored))
                if (v != null && v !== "")
                    headers[k] = String(v);
        }
        const credentials = this.credentials === "omit" ? "omit" : this.credentials === "include" ? "include" : undefined;
        if (method === "GET" && Object.keys(headers).length === 0 && credentials === undefined)
            return null;
        return { method, headers, body, ...(credentials !== undefined ? { credentials } : {}) };
    }
}
const readdress = (s) => s.$readdressed();
defineAttributes(EventStream, {
    // listeners attach at construction, so changing what you listen to is a
    // readdress: close and reopen with the new set
    listenTo: { def: Object.freeze([]), push: readdress },
    // the request: a change asks again, as a new url does
    method: { def: "GET", push: readdress },
    headers: { def: null, push: readdress },
    body: { def: null, push: readdress },
    credentials: { def: "sameOrigin", push: readdress },
});
/** WebSocket: the same surface plus `send`. Text frames only in v1 (ruled;
 *  binary is a later attribute if a real project needs it). */
export class Socket extends Stream {
    $dial(cb) {
        return currentStreams().socket(this.url, cb);
    }
    /** A call you make; `onMessage` is it calling you. On a socket that is not
     *  open: a reported error, not a silent queue (§5). */
    send(text) {
        if (this.open && this.handle?.send !== undefined) {
            this.handle.send(text);
            return;
        }
        setBound(this, "error", "send(…) on a socket that is not open — nothing was sent (gate on .open, or send from onOpen)");
        this.$fire("onError");
    }
}
/** The request stream over fetch (the seam's `request` when a host gives none): the reply's body read chunk by chunk and
 *  parsed as server-sent events (the WHATWG event-stream format: `data:` lines
 *  joined, `event:` names the type, `id:` the last-event-id, a blank line
 *  dispatches; an event cut off by the end of the reply is dropped, as the
 *  format says). A named event is delivered only when listened to, as with
 *  EventSource. A refusal ends the stream with its status and what it said. */
function requestStreamOverFetch(url, req, listen, cb) {
    const ctl = new AbortController();
    let closed = false;
    const init = { method: req.method, headers: req.headers, signal: ctl.signal };
    if (req.body !== null)
        init.body = req.body;
    if (req.credentials !== undefined)
        init.credentials = req.credentials;
    (async () => {
        const res = await globalThis.fetch(url, init);
        if (!res.ok) {
            let said = "";
            try {
                said = (await res.text()).trim().slice(0, 300);
            }
            catch {
                said = "";
            }
            cb.end(`HTTP ${res.status} for ${url}${said !== "" ? ` — ${said}` : ""}`, true);
            return;
        }
        if (res.body === null) {
            cb.end(`no reply body from ${url}`, true);
            return;
        }
        cb.open();
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "", data = [], type = "", id = "";
        const line = (l) => {
            if (l === "") {
                if (data.length > 0) {
                    const t = type === "" ? "message" : type;
                    if (t === "message" || listen.includes(t))
                        cb.message({ data: data.join("\n"), type: t, id });
                }
                data = [];
                type = "";
                return;
            }
            if (l.startsWith(":"))
                return; // a comment
            const colon = l.indexOf(":");
            const field = colon < 0 ? l : l.slice(0, colon);
            let value = colon < 0 ? "" : l.slice(colon + 1);
            if (value.startsWith(" "))
                value = value.slice(1);
            if (field === "data")
                data.push(value);
            else if (field === "event")
                type = value;
            else if (field === "id" && !value.includes("\0"))
                id = value;
        };
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buf += decoder.decode(value, { stream: true });
            let nl;
            while ((nl = buf.search(/\r\n|\r|\n/)) >= 0) {
                if (nl === buf.length - 1 && buf[nl] === "\r")
                    break; // its \n may be in the next chunk
                const sep = buf.startsWith("\r\n", nl) ? 2 : 1;
                line(buf.slice(0, nl));
                buf = buf.slice(nl + sep);
            }
        }
        if (!closed)
            cb.end("", true);
    })().catch((e) => {
        if (closed)
            return;
        cb.end(e instanceof Error ? e.message : String(e), true);
    });
    return { close: () => { closed = true; ctl.abort(); } };
}
//# sourceMappingURL=streams.js.map