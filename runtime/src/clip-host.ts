// Clip host — the seam behind `Audio [ inMemory = true ]`: a short sound decoded whole into
// memory, started the moment it is asked, any number of times at once.
//
// A media element streams: it buffers, starts when it has enough, and plays one thing at a
// time. That is right for a song and wrong for a sound that answers an event — a shot, a
// click, a footstep — which must start on the frame it is asked for and may sound again
// before it has finished. A clip is decoded once into samples; each play is a VOICE reading
// those samples, scheduled to start now, and voices overlap.
//
// The browser's host is Web Audio: one AudioContext for the page, an AudioBuffer per clip,
// an AudioBufferSourceNode per voice into the clip's own gain. A host without one (a
// DOM-less host) has no clip host, and audio.ts plays the sound through its media element
// instead. A native host brings its own (the Mac env's `__declareClipHost`, Clips.swift).
//
// Autoplay: a page's AudioContext starts suspended until the person does something, and
// some engines resume it only from inside an input handler. So the first key or pointer
// press anywhere resumes it, and a voice asked for while it is still suspended is refused,
// exactly as a media element's refused play() is — never queued to sound later.

export interface ClipVoice {
  stop(): void;
  setLoop(on: boolean): void;
  setRate(rate: number): void;
}

export interface ClipSink {
  setVolume(volume: number, muted: boolean): void;
  /** Start a voice at `offset` seconds; `onEnded` when it runs out (never after stop()).
   *  Null when the host cannot sound right now (autoplay not yet allowed). */
  start(clip: unknown, offset: number, loop: boolean, rate: number, onEnded: () => void): ClipVoice | null;
  release(): void;
}

export interface ClipHost {
  decode(url: string): Promise<{ clip: unknown; duration: number }>;
  sink(): ClipSink;
}

let host: ClipHost | null | undefined;

/** The page's clip host, or null where there is none. A native host installs its own as
 *  `__declareClipHost` (the Mac env's, over AVAudioEngine) before the runtime loads. */
export function clipHost(): ClipHost | null {
  if (host !== undefined) return host;
  const native = (globalThis as { __declareClipHost?: ClipHost }).__declareClipHost;
  if (native !== undefined) return (host = native);
  const Ctx = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  host = typeof Ctx === "function" && typeof document !== "undefined" ? webAudioHost(Ctx) : null;
  return host;
}

function webAudioHost(Ctx: typeof AudioContext): ClipHost {
  // The live context is made on the first press, inside the input handler, where every
  // engine lets it run; decoding needs no live context, so it never makes one early.
  let ctx: AudioContext | null = null;
  const context = (): AudioContext => (ctx ??= new Ctx({ latencyHint: "interactive" }));
  const wake = (): void => { const c = context(); if (c.state === "suspended") void c.resume(); };
  for (const type of ["keydown", "pointerdown", "touchend"]) document.addEventListener(type, wake, { capture: true });
  const Offline = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  const decoder = (): BaseAudioContext => (Offline !== undefined ? new Offline(1, 1, 44100) : context());
  return {
    async decode(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const buf = await decoder().decodeAudioData(await res.arrayBuffer());
      return { clip: buf, duration: buf.duration };
    },
    sink() {
      let gain: GainNode | null = null;
      let level = 1;
      return {
        setVolume(volume, muted) {
          level = muted ? 0 : volume;
          if (gain !== null) gain.gain.value = level;
        },
        start(clip, offset, loop, rate, onEnded) {
          const c = ctx;
          if (c === null || c.state !== "running") { if (c !== null) void c.resume(); return null; }
          if (gain === null) {
            gain = c.createGain();
            gain.gain.value = level;
            gain.connect(c.destination);
          }
          const src = c.createBufferSource();
          src.buffer = clip as AudioBuffer;
          src.loop = loop;
          src.playbackRate.value = rate;
          src.connect(gain);
          let stopped = false;
          src.onended = () => { src.disconnect(); if (!stopped) onEnded(); };
          src.start(0, offset);
          return {
            stop() { if (stopped) return; stopped = true; src.stop(); },
            setLoop(on) { src.loop = on; },
            setRate(r) { src.playbackRate.value = r; },
          };
        },
        release() { gain?.disconnect(); },
      };
    },
  };
}
