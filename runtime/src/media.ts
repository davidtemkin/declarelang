// Media — the transport, with no face on it. Video and Audio share every fact
// that matters about a clip in time — `source`, `playing`, `position`,
// `duration`, `volume` — and differ only in whether there is a picture. So the
// transport lives here once, on the Editor/Stream arrangement: an abstract,
// documented base that a program can read about and inherit from but never
// instantiate, with the two concrete leaves each adding exactly what they are.
//
// THERE ARE NO CONTROLS HERE, and that is the design (Video carried this flag
// first; it holds for the whole family). A player's chrome — scrubber,
// buttons, volume thumb — is an application, and one with taste in it; baking
// it in would bake in someone's taste. The transport is ATTRIBUTES:
//
//     song: Audio [ source = "tracks/one.mp3",
//         playing = { app.nowPlaying == this.parent } ]
//
// `playing` and `position` are the two-way pair, on the `scrollY` pattern
// (view.ts): the author writes them and the runtime writes them back, and the
// push is idempotent so the two can never chase each other.
//
// The element seam: everything below rides an HTMLMediaElement from
// `document.createElement` — the same seam that backs Image — so a DOM-less
// host either shims it (the Mac host's env supplies a host-backed media
// element) or honestly lacks it (`loaded` stays false, nothing plays, nothing
// pretends).

import { View, fireEvent } from "./view.js";
import type { RenderBackend, Surface } from "./backend.js";
import { defineAttributes, setBound } from "./attributes.js";
import { resolveAsset } from "./asset-base.js";

export abstract class Media extends View {
  declare source: string;

  /** Playing or not — the whole transport. Author-writable (`playing = true`,
   *  or a constraint) and runtime-written: the element reports its own play,
   *  pause and end, so a clip that runs out, or an autoplay the browser
   *  refuses, lands back here as `false` rather than leaving the slot lying. */
  declare playing: boolean;

  declare loop: boolean;

  /** Muted. The DEFAULT DIFFERS by leaf, and each default is the honest one:
   *  Video mutes (browsers refuse audible video autoplay, so an unmuted
   *  default would make the common declaration silently not run); Audio does
   *  not (sound is its only product — an Audio muted by default is a
   *  component that appears broken until you find the flag). */
  declare muted: boolean;

  /** The playhead, in seconds. Writing it seeks. The runtime writes it back as
   *  the clip runs — on the platform's `timeupdate`, which fires about four
   *  times a second, NOT once a frame: a per-frame write would churn the graph
   *  for a number almost nothing needs that finely. Read it in a `Frames`
   *  handler when you genuinely need frame accuracy. */
  declare position: number;

  /** Loudness, 0–1. HTML's default is 1 (full) and so is this; `muted` is the
   *  separate fact, exactly as the platform has it — muting does not zero the
   *  volume, so unmuting returns you to where you were. */
  declare volume: number;

  /** 1 is normal speed, HTML's default. 0.5 is half, 2 is double. */
  declare playbackRate: number;

  /** The clip ran to its end. **Read-only**, and the reason `playing` alone is
   *  not enough: `playing` goes false for a pause and for an ending alike, so
   *  without this you cannot tell "finished" from "stopped". Never true while
   *  `loop` is on, because a looping clip has no end. Cleared when playback
   *  starts again or a new source loads. */
  declare ended: boolean;

  /** Seconds, once the metadata lands; 0 before that and for a live stream
   *  whose length is not a fact. **Read-only.** */
  declare duration: number;

  /** Waiting for data mid-playback — the spinner's fact
   *  (`visible = { clip.buffering }`). **Read-only.** */
  declare buffering: boolean;

  /** Enough has arrived to start — Image's `loaded`, same meaning, same
   *  placeholder idiom. For Video that also means a frame and a size. **Read-only.** */
  declare loaded: boolean;

  /** The CURRENT source failed. **Read-only**, reset when a new load starts.
   *  Boolean by honesty: the platform's media loader gives no reason. */
  declare failed: boolean;

  /** Discards a superseded load: only the latest request may land. */
  private loadSeq = 0;

  protected el: HTMLMediaElement | null = null;

  /** The leaf makes its own element — `<video>` or `<audio>` — and sets any
   *  leaf-only element facts (Video's `playsInline`) before the shared wiring. */
  protected abstract makeElement(): HTMLMediaElement;

  /** The metadata landed. The leaf takes what is its own — Video adopts the
   *  natural size and hands the element to the surface as its picture. */
  protected metadataArrived(_el: HTMLMediaElement): void {}

  /** `source` went empty. Video clears the surface picture; Audio has nothing to clear. */
  protected sourceCleared(): void {}

  override attach(backend: RenderBackend, parentSurface: Surface | null): void {
    super.attach(backend, parentSurface);
    this.load();
  }

  /** (Re)load `source` — at attach, and from the `source` pusher. */
  load(): void {
    const seq = ++this.loadSeq;
    if (this.surface === null) return;
    setBound(this, "failed", false);
    setBound(this, "ended", false);
    if (this.source === "") {
      this.el = null;
      this.sourceCleared();
      return;
    }
    // A DOM-less host has no media element: the network is honestly absent,
    // `loaded` stays false and nothing plays. On the Mac host
    // `document.createElement("video"/"audio")` is the env's own shim (the
    // same seam that backs Image there), so this path is the portable one —
    // the runtime never reaches for a browser-only constructor.
    if (typeof document === "undefined") return;
    const el = this.makeElement();
    this.el = el;
    el.muted = this.muted;
    el.loop = this.loop;
    el.volume = this.volume;
    el.playbackRate = this.playbackRate;
    el.preload = "metadata";

    el.onloadedmetadata = () => {
      if (seq !== this.loadSeq || this.surface === null) return;
      setBound(this, "duration", isFinite(el.duration) ? el.duration : 0);
      this.metadataArrived(el);
      setBound(this, "loaded", true);
      // a `playing = true` that arrived before the metadata did is honoured now
      if (this.playing) this.syncPlaying();
    };
    el.onerror = () => {
      if (seq !== this.loadSeq || this.surface === null) return;
      setBound(this, "failed", true);
    };
    // the element is the authority on its own transport: every one of these is
    // the runtime side of the two-way pair
    el.onplay = () => {
      if (seq !== this.loadSeq) return;
      setBound(this, "playing", true);
      setBound(this, "ended", false);
      };
    el.onpause = () => { if (seq === this.loadSeq) setBound(this, "playing", false); };
    el.onended = () => {
      if (seq !== this.loadSeq) return;
      setBound(this, "playing", false);
      setBound(this, "ended", true);
      fireEvent(this, "ended");
      };
    el.onwaiting = () => { if (seq === this.loadSeq) setBound(this, "buffering", true); };
    el.onplaying = () => { if (seq === this.loadSeq) setBound(this, "buffering", false); };
    el.ontimeupdate = () => {
      if (seq !== this.loadSeq) return;
      setBound(this, "position", el.currentTime);
    };
    el.src = resolveAsset(this.source, this.root);
  }

  /** Author (or constraint) asked to play or pause. `play()` can be REFUSED —
   *  autoplay policy, a source that never loaded — and it answers with a
   *  rejected promise. When it is refused the slot goes back to false, because
   *  a `playing` that reads true over silence (or a still picture) is a lie. */
  syncPlaying(): void {
    const el = this.el;
    if (el === null) return;
    // A host whose createElement answers a bare stub (the Mac env, until its
    // media shim lands) has no transport to drive: `playing` stays whatever
    // the author wrote, and nothing here may throw inside a settle.
    if (typeof el.play !== "function") return;
    if (this.playing) {
      const p = el.play() as Promise<void> | undefined;
      if (p !== undefined && typeof p.catch === "function") {
        p.catch(() => { if (this.el === el) setBound(this, "playing", false); });
      }
    } else if (!el.paused) {
      el.pause();
    }
  }

  /** Author asked to seek. Guarded by a quarter-second so the runtime's own
   *  `timeupdate` writes — which land in this same slot — cannot bounce back
   *  out as seeks and stutter the playhead. */
  seek(): void {
    const el = this.el;
    if (el === null) return;
    if (Math.abs(el.currentTime - this.position) > 0.25) el.currentTime = this.position;
  }
}

defineAttributes(Media, {
  source: { def: "", push: (v) => v.load() },
  playing: { def: false, push: (v) => v.syncPlaying() },
  loop: { def: false, push: (v, on: boolean) => { const e = (v as any).el; if (e !== null) e.loop = on; } },
  muted: { def: true, push: (v, on: boolean) => { const e = (v as any).el; if (e !== null) e.muted = on; } },
  position: { def: 0, push: (v) => v.seek() },
  volume: { def: 1, push: (v, n: number) => { const e = (v as any).el; if (e !== null) e.volume = n; } },
  playbackRate: { def: 1, push: (v, n: number) => { const e = (v as any).el; if (e !== null) e.playbackRate = n; } },
  ended: { def: false },
  duration: { def: 0 },
  buffering: { def: false },
  loaded: { def: false },
  failed: { def: false },
});
