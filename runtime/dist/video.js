// Video — the moving-picture leaf, and Image's twin. The whole transport —
// `source`, `playing`, `position`, `duration`, `volume` — lives on Media
// (media.ts), shared verbatim with Audio; what THIS file adds is exactly the
// picture: the natural size that arrives with the metadata, and the frame
// crossing the same bitmap seam an <img> does — a <video> places as an
// absolutely-positioned child on the DOM and answers `drawImage` on canvas,
// so no second content kind exists below this file.
//
//     clip: Video [ source = "tour.mp4", loop = true,
//         playing = { app.inView } ]
//
// That plays while the section is on screen and pauses when it leaves, with
// no handler, no observer and nothing to tear down. Build a scrubber out of
// `position` and `duration` the same way you would build any other control —
// out of the standard library, in Declare.
import { Media } from "./media.js";
import { defineAttributes, isSet, ownerOf, setBound } from "./attributes.js";
export class Video extends Media {
    /** The frame's natural size — what contentExtent folds into an auto-extent. */
    natural = { width: 0, height: 0 };
    contentExtent(size) {
        return this.loaded ? this.natural[size] : 0;
    }
    flush(s) {
        super.flush(s);
        s.setImageStretch(this.stretches);
    }
    makeElement() {
        const el = document.createElement("video");
        // inline, not the platform's fullscreen takeover: a Declare view owns its
        // own box, and iOS otherwise hijacks playback into its own player
        el.playsInline = true;
        return el;
    }
    metadataArrived(el) {
        const v = el;
        this.natural = { width: v.videoWidth, height: v.videoHeight };
        if (!isSet(this, "width") && ownerOf(this, "width") === null) {
            setBound(this, "width", v.videoWidth);
        }
        if (!isSet(this, "height") && ownerOf(this, "height") === null) {
            setBound(this, "height", v.videoHeight);
        }
        this.surface?.setImage(v);
    }
    sourceCleared() {
        this.surface?.setImage(null);
    }
}
defineAttributes(Video, {
    stretches: { def: "none", push: (v, s) => v.surface?.setImageStretch(s) },
});
//# sourceMappingURL=video.js.map