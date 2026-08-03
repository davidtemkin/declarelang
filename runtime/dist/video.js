// Video — the moving-picture leaf, and Image's twin. `source` loads
// asynchronously, the natural size arrives with the metadata, and the frame
// crosses the same bitmap seam an <img> does: a <video> places as an
// absolutely-positioned child on the DOM and answers `drawImage` on canvas,
// so no second content kind exists below this file.
//
// THERE ARE NO CONTROLS HERE, and that is the design. A player's chrome —
// scrubber, buttons, fullscreen, captions menu — is an application, and one
// with taste in it; baking it in would bake in someone's taste. What this
// gives you instead is the TRANSPORT AS ATTRIBUTES, which is the thing the
// language is for:
//
//     clip: Video [ source = "tour.mp4", loop = true,
//         playing = { app.inView } ]
//
// That plays while the section is on screen and pauses when it leaves, with
// no handler, no observer and nothing to tear down. Build a scrubber out of
// `position` and `duration` the same way you would build any other control —
// out of the standard library, in Declare.
//
// `playing` and `position` are the two-way pair, on the `scrollY` pattern
// (view.ts): the author writes them and the runtime writes them back, and the
// push is idempotent so the two can never chase each other.
import { View, fireEvent } from "./view.js";
import { defineAttributes, isSet, ownerOf, setBound } from "./attributes.js";
import { resolveAsset } from "./image.js";
export class Video extends View {
    /** Discards a superseded load: only the latest request may land. */
    loadSeq = 0;
    el = null;
    /** The frame's natural size — what contentExtent folds into an auto-extent. */
    natural = { width: 0, height: 0 };
    contentExtent(size) {
        return this.loaded ? this.natural[size] : 0;
    }
    attach(backend, parentSurface) {
        super.attach(backend, parentSurface);
        this.load();
    }
    flush(s) {
        super.flush(s);
        s.setImageStretch(this.stretches);
    }
    /** (Re)load `source` — at attach, and from the `source` pusher. */
    load() {
        const seq = ++this.loadSeq;
        const s = this.surface;
        if (s === null)
            return;
        setBound(this, "failed", false);
        setBound(this, "ended", false);
        if (this.source === "") {
            this.el = null;
            s.setImage(null);
            return;
        }
        // A DOM-less host has no media element: the network is honestly absent,
        // `loaded` stays false and the box keeps its declared size. On the Mac
        // host `document.createElement("video")` is the env's own shim (the same
        // seam that backs Image there), so this path is the portable one — the
        // runtime never reaches for a browser-only constructor.
        if (typeof document === "undefined")
            return;
        const el = document.createElement("video");
        this.el = el;
        el.muted = this.muted;
        el.loop = this.loop;
        el.volume = this.volume;
        el.playbackRate = this.playbackRate;
        // inline, not the platform's fullscreen takeover: a Declare view owns its
        // own box, and iOS otherwise hijacks playback into its own player
        el.playsInline = true;
        el.preload = "metadata";
        el.onloadedmetadata = () => {
            if (seq !== this.loadSeq || this.surface === null)
                return;
            this.natural = { width: el.videoWidth, height: el.videoHeight };
            if (!isSet(this, "width") && ownerOf(this, "width") === null) {
                setBound(this, "width", el.videoWidth);
            }
            if (!isSet(this, "height") && ownerOf(this, "height") === null) {
                setBound(this, "height", el.videoHeight);
            }
            setBound(this, "duration", isFinite(el.duration) ? el.duration : 0);
            setBound(this, "loaded", true);
            this.surface.setImage(el);
            // a `playing = true` that arrived before the metadata did is honoured now
            if (this.playing)
                this.syncPlaying();
        };
        el.onerror = () => {
            if (seq !== this.loadSeq || this.surface === null)
                return;
            setBound(this, "failed", true);
        };
        // the element is the authority on its own transport: every one of these is
        // the runtime side of the two-way pair
        el.onplay = () => {
            if (seq !== this.loadSeq)
                return;
            setBound(this, "playing", true);
            setBound(this, "ended", false);
        };
        el.onpause = () => { if (seq === this.loadSeq)
            setBound(this, "playing", false); };
        el.onended = () => {
            if (seq !== this.loadSeq)
                return;
            setBound(this, "playing", false);
            setBound(this, "ended", true);
            fireEvent(this, "ended");
        };
        el.onwaiting = () => { if (seq === this.loadSeq)
            setBound(this, "buffering", true); };
        el.onplaying = () => { if (seq === this.loadSeq)
            setBound(this, "buffering", false); };
        el.ontimeupdate = () => {
            if (seq !== this.loadSeq)
                return;
            setBound(this, "position", el.currentTime);
        };
        el.src = resolveAsset(this.source);
    }
    /** Author (or constraint) asked to play or pause. `play()` can be REFUSED —
     *  autoplay policy, a source that never loaded — and it answers with a
     *  rejected promise. When it is refused the slot goes back to false, because
     *  a `playing` that reads true over a still picture is a lie. */
    syncPlaying() {
        const el = this.el;
        if (el === null)
            return;
        if (this.playing) {
            const p = el.play();
            if (p !== undefined && typeof p.catch === "function") {
                p.catch(() => { if (this.el === el)
                    setBound(this, "playing", false); });
            }
        }
        else if (!el.paused) {
            el.pause();
        }
    }
    /** Author asked to seek. Guarded by a quarter-second so the runtime's own
     *  `timeupdate` writes — which land in this same slot — cannot bounce back
     *  out as seeks and stutter the playhead. */
    seek() {
        const el = this.el;
        if (el === null)
            return;
        if (Math.abs(el.currentTime - this.position) > 0.25)
            el.currentTime = this.position;
    }
}
defineAttributes(Video, {
    source: { def: "", push: (v) => v.load() },
    stretches: { def: "none", push: (v, s) => v.surface?.setImageStretch(s) },
    playing: { def: false, push: (v) => v.syncPlaying() },
    loop: { def: false, push: (v, on) => { const e = v.el; if (e !== null)
            e.loop = on; } },
    muted: { def: true, push: (v, on) => { const e = v.el; if (e !== null)
            e.muted = on; } },
    position: { def: 0, push: (v) => v.seek() },
    volume: { def: 1, push: (v, n) => { const e = v.el; if (e !== null)
            e.volume = n; } },
    playbackRate: { def: 1, push: (v, n) => { const e = v.el; if (e !== null)
            e.playbackRate = n; } },
    ended: { def: false },
    duration: { def: 0 },
    buffering: { def: false },
    loaded: { def: false },
    failed: { def: false },
});
//# sourceMappingURL=video.js.map