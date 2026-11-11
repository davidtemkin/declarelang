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
    /** Bytes sent but not yet on the wire (a WebSocket's bufferedAmount). */
    buffered?(): number;
}
/** What a factory calls back into the runtime. `end` reports the connection
 *  going down: `error` is the failure reason ("" for a clean close — nothing
 *  for the error channel); `final` false means the PLATFORM will bring the
 *  connection back on its own (EventSource's native retry), so the stream
 *  just reads "retrying" until `open` fires again. */
export interface StreamCallbacks {
    open(): void;
    message(m: StreamMessage): void;
    end(error: string, final: boolean, how?: StreamEnd): void;
    /** Something arrived that is not a message (an SSE `:` comment, a
     *  keep-alive): the connection is alive. */
    alive?(): void;
}
/** What is known about a connection going down: why, as the closed set a
 *  DataSource uses, and a WebSocket's close code and reason. */
export interface StreamEnd {
    failure?: "unsent" | "offline" | "networkError" | "timedOut" | "rejected" | "serverError" | "unreadable";
    code?: number;
    reason?: string;
}
export type EventSourceFactory = (url: string, listen: readonly string[], cb: StreamCallbacks) => StreamHandle;
export type SocketFactory = (url: string, cb: StreamCallbacks) => StreamHandle;
/** What an EventStream asks of its request when it is more than a plain GET:
 *  the verb, the headers, the body (already encoded) and the credentials mode
 *  — the same four a DataSource sends. */
export interface StreamRequest {
    method: string;
    headers: Record<string, string>;
    body: string | null;
    credentials?: "omit" | "same-origin" | "include";
}
/** One request whose reply is an event stream, read as it arrives: open when
 *  the reply's head is good, a message per event, and a final end when the
 *  reply ends (a request is not replayed — `retry` is the author's to declare). */
export type RequestStreamFactory = (url: string, req: StreamRequest, listen: readonly string[], cb: StreamCallbacks) => StreamHandle;
export interface StreamFactories {
    eventSource: EventSourceFactory;
    socket: SocketFactory;
    /** Absent = the platform fetch (streams.ts requestStreamOverFetch). */
    request?: RequestStreamFactory;
}
/** Is the platform saying it is offline? A hint only (`false` is not proof of
 *  a connection): used to name a failure, never to refuse to try. */
export declare function offlineNow(): boolean;
/** A WebSocket close, classified. 1000/1001 are clean ends (the server
 *  finished, or is going away — reconnect); 1012/1013 a restart and "try again
 *  later" (the server's trouble); 1002/1003/1007/1008/1009/1010 the server
 *  refusing what was sent or who sent it — retrying the same thing changes
 *  nothing; 1011 a server error; 1006 (no close frame, the only code a
 *  refused or broken connection ever gets in a browser) the network.
 *  4000–4999 are the application's own (an expired token, a rate limit): no
 *  failure is named; `onClose` reads `closeCode` and decides. */
export declare function socketEnd(code: number, reason: string, clean: boolean): StreamEnd;
/** Swap the connection factories (headless installs refusers; tests install
 *  stubs; the mac host injects its native pair). Returns the PREVIOUS pair so
 *  a scoped caller can restore it — the provideTransport contract. */
export declare function provideStreams(f: StreamFactories): StreamFactories;
/** Is `eventSource` still the browser default (not a host's or a test's)? —
 *  where there is no EventSource to back it, a plain GET stream reads over
 *  fetch instead (streams.ts). */
export declare function defaultEventSource(): boolean;
/** The pair in force — what a Stream dials through (streams.ts). */
export declare function currentStreams(): StreamFactories;
