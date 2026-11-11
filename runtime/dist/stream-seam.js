// stream-seam — the streams' injectable transport seam (streams.md §4), split
// from the classes for one reason: index.ts must export the seam
// (the compiler's headless/crawl refusers swap it, tests stub it, the mac host
// injects its native pair), but the production entry imports index.js
// wholesale — so anything reachable from it ships in EVERY build. This module
// is side-effect-free on purpose (declarations and functions only, nothing
// top-level); the Stream/EventStream/Socket CLASSES live in streams.ts,
// reachable only through registry.js, which slimming substitutes — an app
// that declares no stream ships none of the machinery (the slim discipline,
// tools/declarec.mjs).
// ── The browser defaults ─────────────────────────────────────────────────────
function browserEventSource(url, listen, cb) {
    const es = new EventSource(url);
    const deliver = (e) => cb.message({ data: typeof e.data === "string" ? e.data : String(e.data), type: e.type, id: e.lastEventId });
    es.onopen = () => cb.open();
    es.onmessage = deliver;
    // EventSource has no catch-all: a named `event:` type reaches only a
    // listener registered for that exact name — the fact that forces the
    // `listen` attribute (streams.md §2). The three names EventSource OWNS are
    // never message channels: "message" is already wired (a second listener
    // double-delivered every unnamed event), and "open"/"error" deliver plain
    // Events whose `data` is undefined — which String()-ed into the literal
    // text "undefined" arriving as a message. The checker refuses these in a
    // literal list; this guard covers the data-borne one.
    for (const type of listen) {
        if (type === "message" || type === "open" || type === "error")
            continue;
        es.addEventListener(type, deliver);
    }
    es.onerror = () => {
        // CONNECTING = the platform is retrying (its own backoff, Last-Event-ID
        // resume): not final, and not a fact for the error channel — §3 says
        // onError reports terminal failures, not each retry. CLOSED: EventSource
        // does not say why (a refusal, a wrong content type and a dead network
        // look alike), so it is a network error unless the platform is offline.
        if (es.readyState === EventSource.CLOSED)
            cb.end(`the server closed the stream at ${url}`, true, { failure: offlineNow() ? "offline" : "networkError" });
        else
            cb.end("", false);
    };
    return { close: () => es.close() };
}
function browserSocket(url, cb) {
    const ws = new WebSocket(url);
    ws.onopen = () => cb.open();
    ws.onmessage = (e) => {
        // Text frames only in v1 (streams.md §2, ruled): a binary frame is
        // dropped, not surfaced through a speculative bytes shape.
        if (typeof e.data === "string")
            cb.message({ data: e.data, type: "message", id: "" });
    };
    // onerror carries no detail and onclose always follows with it — one
    // termination report, not two.
    ws.onclose = (e) => {
        const how = socketEnd(e.code, e.reason, e.wasClean);
        cb.end(how.failure === undefined ? "" : (e.reason !== "" ? e.reason : `connection ${how.failure === "rejected" ? "refused" : "lost"} (code ${e.code})`), true, how);
    };
    return { close: () => ws.close(), send: (t) => ws.send(t), buffered: () => ws.bufferedAmount };
}
/** Is the platform saying it is offline? A hint only (`false` is not proof of
 *  a connection): used to name a failure, never to refuse to try. */
export function offlineNow() {
    return globalThis.navigator?.onLine === false;
}
/** A WebSocket close, classified. 1000/1001 are clean ends (the server
 *  finished, or is going away — reconnect); 1012/1013 a restart and "try again
 *  later" (the server's trouble); 1002/1003/1007/1008/1009/1010 the server
 *  refusing what was sent or who sent it — retrying the same thing changes
 *  nothing; 1011 a server error; 1006 (no close frame, the only code a
 *  refused or broken connection ever gets in a browser) the network.
 *  4000–4999 are the application's own (an expired token, a rate limit): no
 *  failure is named; `onClose` reads `closeCode` and decides. */
export function socketEnd(code, reason, clean) {
    const out = (failure) => ({ code, reason, ...(failure !== undefined ? { failure } : {}) });
    if (code === 1000 || code === 1001)
        return out();
    if (code >= 4000 && code <= 4999)
        return out();
    if (code === 1002 || code === 1003 || code === 1007 || code === 1008 || code === 1009 || code === 1010)
        return out("rejected");
    if (code === 1011 || code === 1012 || code === 1013 || code === 1014)
        return out("serverError");
    if (clean)
        return out();
    return out(offlineNow() ? "offline" : "networkError");
}
// No default `request`: the fetch-based reader lives with the classes
// (streams.ts), so an app that declares no stream ships none of it.
let factories = { eventSource: browserEventSource, socket: browserSocket };
/** Swap the connection factories (headless installs refusers; tests install
 *  stubs; the mac host injects its native pair). Returns the PREVIOUS pair so
 *  a scoped caller can restore it — the provideTransport contract. */
export function provideStreams(f) {
    const prev = factories;
    factories = f;
    return prev;
}
/** Is `eventSource` still the browser default (not a host's or a test's)? —
 *  where there is no EventSource to back it, a plain GET stream reads over
 *  fetch instead (streams.ts). */
export function defaultEventSource() {
    return factories.eventSource === browserEventSource;
}
/** The pair in force — what a Stream dials through (streams.ts). */
export function currentStreams() {
    return factories;
}
//# sourceMappingURL=stream-seam.js.map