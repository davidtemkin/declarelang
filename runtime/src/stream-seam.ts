// stream-seam — the streams' injectable transport seam (streams.md §4), split
// from the component classes for one reason: index.ts must export the seam
// (the compiler's headless/crawl refusers swap it, tests stub it, the mac host
// injects its native pair), but the production entry imports index.js
// wholesale — so anything reachable from it ships in EVERY build. This module
// is side-effect-free on purpose (declarations and functions only, nothing
// top-level); the Stream/EventStream/Socket CLASSES live in streams.ts,
// reachable only through registry.js, which slimming substitutes — an app
// that declares no stream ships none of the machinery (the slim discipline,
// tools/declarec.mjs).

/** What `onMessage` receives. `data` is always a string — parsing is app
 *  semantics (streams.md §2: an app that streams JSON parses in the handler).
 *  `type` is the SSE named event ("message" for unnamed/default messages and
 *  for every socket frame); `id` is the SSE last-event-id ("" on sockets). */
export interface StreamMessage {
  readonly data: string;
  readonly type: string;
  readonly id: string;
}

/** A live connection, as the factory hands it back: closeable, and — for
 *  sockets — sendable. */
export interface StreamHandle {
  close(): void;
  send?(text: string): void;
}

/** What a factory calls back into the runtime. `end` reports the connection
 *  going down: `error` is the failure reason ("" for a clean close — nothing
 *  for the error channel); `final` false means the PLATFORM will bring the
 *  connection back on its own (EventSource's native retry), so the stream
 *  just reads "retrying" until `open` fires again. */
export interface StreamCallbacks {
  open(): void;
  message(m: StreamMessage): void;
  end(error: string, final: boolean): void;
}

export type EventSourceFactory = (
  url: string,
  listen: readonly string[],
  cb: StreamCallbacks
) => StreamHandle;
export type SocketFactory = (url: string, cb: StreamCallbacks) => StreamHandle;

export interface StreamFactories {
  eventSource: EventSourceFactory;
  socket: SocketFactory;
}

// ── The browser defaults ─────────────────────────────────────────────────────

function browserEventSource(url: string, listen: readonly string[], cb: StreamCallbacks): StreamHandle {
  const es = new EventSource(url);
  const deliver = (e: MessageEvent): void =>
    cb.message({ data: typeof e.data === "string" ? e.data : String(e.data), type: e.type, id: e.lastEventId });
  es.onopen = () => cb.open();
  es.onmessage = deliver;
  // EventSource has no catch-all: a named `event:` type reaches only a
  // listener registered for that exact name — the fact that forces the
  // `listen` attribute (streams.md §2).
  for (const type of listen) es.addEventListener(type, deliver);
  es.onerror = () => {
    // CONNECTING = the platform is retrying (its own backoff, Last-Event-ID
    // resume): not final, and not a fact for the error channel — §3 says
    // onError reports terminal failures, not each retry.
    if (es.readyState === EventSource.CLOSED) cb.end(`the server closed the stream at ${url}`, true);
    else cb.end("", false);
  };
  return { close: () => es.close() };
}

function browserSocket(url: string, cb: StreamCallbacks): StreamHandle {
  const ws = new WebSocket(url);
  ws.onopen = () => cb.open();
  ws.onmessage = (e) => {
    // Text frames only in v1 (streams.md §2, ruled): a binary frame is
    // dropped, not surfaced through a speculative bytes shape.
    if (typeof e.data === "string") cb.message({ data: e.data, type: "message", id: "" });
  };
  // onerror carries no detail and onclose always follows with it — one
  // termination report, not two.
  ws.onclose = (e) =>
    cb.end(e.wasClean ? "" : (e.reason !== "" ? e.reason : `connection lost (code ${e.code})`), true);
  return { close: () => ws.close(), send: (t) => ws.send(t) };
}

let factories: StreamFactories = { eventSource: browserEventSource, socket: browserSocket };

/** Swap the connection factories (headless installs refusers; tests install
 *  stubs; the mac host injects its native pair). Returns the PREVIOUS pair so
 *  a scoped caller can restore it — the provideTransport contract. */
export function provideStreams(f: StreamFactories): StreamFactories {
  const prev = factories;
  factories = f;
  return prev;
}

/** The pair in force — what a Stream dials through (streams.ts). */
export function currentStreams(): StreamFactories {
  return factories;
}
