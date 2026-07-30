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
export type EventSourceFactory = (url: string, listen: readonly string[], cb: StreamCallbacks) => StreamHandle;
export type SocketFactory = (url: string, cb: StreamCallbacks) => StreamHandle;
export interface StreamFactories {
    eventSource: EventSourceFactory;
    socket: SocketFactory;
}
/** Swap the connection factories (headless installs refusers; tests install
 *  stubs; the mac host injects its native pair). Returns the PREVIOUS pair so
 *  a scoped caller can restore it — the provideTransport contract. */
export declare function provideStreams(f: StreamFactories): StreamFactories;
/** The pair in force — what a Stream dials through (streams.ts). */
export declare function currentStreams(): StreamFactories;
