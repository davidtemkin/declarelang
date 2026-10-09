// Audio — the transport with nothing to look at. Everything it is lives on
// Media (media.ts): `source` loads, `playing`/`position` are the two-way
// pair, `duration`/`buffering`/`ended` are facts to derive from. This file
// adds the element kind, one reversed default, and sound held in memory.
//
// It is still a View, because everything in the tree is one, but it draws
// nothing and its box means nothing: give it no size and it takes none.
// Where you put it is an ownership statement, not a layout one — declare it
// inside the panel whose sound it is, and it goes away when the panel does.
//
//     song: Audio [ source = "tracks/one.mp3",
//         playing = { player.current == this.parent } ]
//
// HELD IN MEMORY (`inMemory = true`), a short sound is decoded whole rather than
// streamed: it starts on the frame it is asked for, and each play() is a voice
// of its own, so a sound that answers an event sounds every time the event
// happens, over itself if need be. clip-host.ts is the engine; a host without
// one plays the sound through its media element, as any Audio plays.
//
//     shot: Audio [ source = "sounds/fire.wav", inMemory = true ]      // shot.play() on each shot
//     hum: Audio [ source = "sounds/hum.wav", inMemory = true, loop = true, playing = { app.engineOn } ]
//
// A player's chrome — scrubber, volume, the track grid — is an application;
// build it out of these attributes in Declare (the same ruling Video carries).

import { Media } from "./media.js";
import { fireEvent } from "./view.js";
import { defineAttributes, setBound } from "./attributes.js";
import { resolveAsset } from "./asset-base.js";
import { clipHost, type ClipSink, type ClipVoice } from "./clip-host.js";

export class Audio extends Media {
  /** Held whole in memory and started at once, rather than streamed: for a short sound
   *  that answers an event. Each play() starts a voice of its own, and voices overlap;
   *  `playing` is true while any voice sounds, and false stops them all. A long track
   *  belongs streamed. */
  declare inMemory: boolean;

  private $clip: unknown = null;
  private $sink: ClipSink | null = null;
  private $voices = new Set<ClipVoice>();
  private $clipSeq = 0;

  protected override $makeElement(): HTMLMediaElement {
    return document.createElement("audio");
  }

  /** Held in memory, by a host that can hold it. */
  private $held(): boolean {
    return this.inMemory && clipHost() !== null;
  }

  override $load(): void {
    const seq = ++this.$clipSeq;
    this.$silence();
    this.$clip = null;
    if (!this.$held()) { super.$load(); return; }
    super.$release();
    if (this.$surface === null) return;
    setBound(this, "failed", false);
    setBound(this, "ended", false);
    setBound(this, "loaded", false);
    if (this.source === "") return;
    this.$sink ??= clipHost()!.sink();
    this.$sink.setVolume(this.volume, this.muted);
    clipHost()!.decode(resolveAsset(this.source, this.root)).then(({ clip, duration }) => {
      if (seq !== this.$clipSeq || this.$surface === null) return;
      this.$clip = clip;
      setBound(this, "duration", duration);
      setBound(this, "loaded", true);
      // a `playing = true` that arrived before the samples did is honoured now
      if (this.playing) this.$voice(this.position);
    }, () => {
      if (seq === this.$clipSeq && this.$surface !== null) setBound(this, "failed", true);
    });
  }

  override $teardown(): void {
    this.$clipSeq++;
    this.$silence();
    this.$sink?.release();
    this.$sink = null;
    super.$teardown();
  }

  override $syncPlaying(): void {
    if (!this.$held()) { super.$syncPlaying(); return; }
    if (!this.playing) this.$silence();
    else if (this.$voices.size === 0 && this.$clip !== null) this.$voice(this.position);
  }

  override $seek(): void {
    if (!this.$held()) { super.$seek(); return; }
    if (this.$reporting || this.$voices.size === 0) return;
    this.$silence();
    this.$voice(this.position);
  }

  override play(): void {
    if (!this.$held()) { super.play(); return; }
    this.$report(0);
    if (this.$clip === null) { setBound(this, "playing", true); return; }
    this.$voice(0);
  }

  /** Start a voice at `offset`. Refused (autoplay not yet allowed), `playing` goes back to
   *  false, as a refused play() does. */
  private $voice(offset: number): void {
    const voice: ClipVoice | null = this.$sink!.start(this.$clip, Math.max(0, offset), this.loop, this.playbackRate, () => {
      this.$voices.delete(voice!);
      if (this.$voices.size > 0) return;
      this.$report(this.duration);
      setBound(this, "playing", false);
      setBound(this, "ended", true);
      fireEvent(this, "ended");
    });
    if (voice === null) { setBound(this, "playing", false); return; }
    this.$voices.add(voice);
    setBound(this, "ended", false);
    setBound(this, "playing", true);
  }

  private $silence(): void {
    const voices = [...this.$voices];
    this.$voices.clear();
    for (const v of voices) v.stop();
  }

  /** The live voices follow `loop`, `volume`, `muted` and `playbackRate`. */
  $tune(): void {
    this.$sink?.setVolume(this.volume, this.muted);
    for (const v of this.$voices) { v.setLoop(this.loop); v.setRate(this.playbackRate); }
  }
}

// Each of these reaches the media element when there is one, and the voices of a sound
// held in memory when there are any.
const tuned = (name: "loop" | "volume" | "muted" | "playbackRate") => (v: object, x: unknown): void => {
  const e = (v as { el: HTMLMediaElement | null }).el;
  if (e !== null) (e as unknown as Record<string, unknown>)[name] = x;
  (v as Audio).$tune();
};

defineAttributes(Audio, {
  // Video mutes by default because browsers refuse audible video autoplay and
  // a silent frame is still a picture. Audio's ONLY product is sound: muted by
  // default it would be a class that appears broken until you find the
  // flag. Autoplay policy still holds — a refused play() lands `playing` back
  // at false — so the polite default here is the audible one.
  muted: { def: false, push: tuned("muted") },
  loop: { def: false, push: tuned("loop") },
  volume: { def: 1, push: tuned("volume") },
  playbackRate: { def: 1, push: tuned("playbackRate") },
  inMemory: { def: false, push: (v) => (v as Audio).$load() },
});
