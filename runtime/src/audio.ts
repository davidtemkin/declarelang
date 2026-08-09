// Audio — the transport with nothing to look at. Everything it is lives on
// Media (media.ts): `source` loads, `playing`/`position` are the two-way
// pair, `duration`/`buffering`/`ended` are facts to derive from. This file
// adds only the element kind — and one reversed default.
//
// It is still a View, because everything in the tree is one, but it draws
// nothing and its box means nothing: give it no size and it takes none.
// Where you put it is an ownership statement, not a layout one — declare it
// inside the panel whose sound it is, and it goes away when the panel does.
//
//     song: Audio [ source = "tracks/one.mp3",
//         playing = { player.current == this.parent } ]
//
// A player's chrome — scrubber, volume, the track grid — is an application;
// build it out of these attributes in Declare (the same ruling Video carries).

import { Media } from "./media.js";
import { defineAttributes } from "./attributes.js";

export class Audio extends Media {
  protected override makeElement(): HTMLMediaElement {
    return document.createElement("audio");
  }
}

defineAttributes(Audio, {
  // Video mutes by default because browsers refuse audible video autoplay and
  // a silent frame is still a picture. Audio's ONLY product is sound: muted by
  // default it would be a component that appears broken until you find the
  // flag. Autoplay policy still holds — a refused play() lands `playing` back
  // at false — so the polite default here is the audible one.
  muted: { def: false, push: (v, on: boolean) => { const e = (v as any).el; if (e !== null) e.muted = on; } },
});
