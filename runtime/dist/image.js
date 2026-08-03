// Image — the bitmap leaf. `source` loads asynchronously; the loaded image
// invalidates the scene when it arrives (nothing blocks on the network), and
// a view whose width/height the author never set adopts the bitmap's natural
// size — through the reactive write path, so a constraint reading
// `icon.width` re-fires when the size arrives. Since R4 `source` is live:
// assigning it after attach reloads (a stale in-flight load is discarded by
// sequence, never raced).
//
// The *view* owns loading (one loader for both backends) and hands the
// loaded element across the seam; each backend then shows it natively — an
// <img> there, drawImage on the shared canvas here. Decoding is a platform
// primitive, not a render-substrate choice, so using the browser's loader
// here does not breach substrate independence — and it runs only while
// attached, keeping the model importable in Node.
import { View } from "./view.js";
import { defineAttributes, isSet, ownerOf, setBound } from "./attributes.js";
/** THE ASSET BASE — the data.ts `provideTransport` shape, for bitmaps.
 *
 *  A relative `source` names a file beside the PROGRAM, exactly as a
 *  DataSource's `url` does: `Image [ source = "shots/cal.webp" ]` is the
 *  sibling of `DataSource [ url = "stats.json" ]` and has to mean the same
 *  place. But an <img src> resolves against the DOCUMENT, and the two only
 *  coincide when a program is browsed at its own path. An entry page that
 *  boots a program from elsewhere in the tree — index.html at the root
 *  running apps/homepage/homepage.declare — resolved every relative bitmap
 *  against the wrong directory, silently, while its DataSources were fine.
 *
 *  So the host states the program's directory once and every Image resolves
 *  through it. Absolute, protocol-relative, root-relative and data: sources
 *  pass through untouched. The default is identity — exactly what a program
 *  browsed at its own path already had. */
let assetBase = null;
/** Set the base that relative bitmap sources resolve against; returns the
 *  previous one, so a scoped caller can restore it — the provideTransport
 *  contract. */
export function provideAssetBase(base) {
    const prev = assetBase;
    assetBase = base;
    return prev;
}
export function resolveAsset(source) {
    if (assetBase === null || source === "")
        return source;
    if (/^[a-z][a-z0-9+.-]*:/i.test(source) || source.startsWith("//") || source.startsWith("/"))
        return source;
    try {
        return new URL(source, assetBase).href;
    }
    catch {
        return source;
    }
}
export class Image extends View {
    /** Discards a superseded load: only the latest request may land. */
    loadSeq = 0;
    /** The arrived bitmap's natural size — what contentExtent folds into a
     *  parent-style auto-extent when this Image has children of its own (LZX's
     *  max(resource, subviews)). Zero until loaded. */
    natural = { width: 0, height: 0 };
    /** Auto-extent's content hook: the bitmap's natural extent. Reads `loaded`
     *  (tracked), so an owning extent derive re-runs when the bitmap arrives. */
    contentExtent(size) {
        return this.loaded ? this.natural[size] : 0;
    }
    attach(backend, parentSurface) {
        super.attach(backend, parentSurface);
        this.load();
    }
    flush(s) {
        super.flush(s);
        // Pushers fire on *change*; attach's flush carries the pre-attach state
        // across (the image element itself arrives via load's async landing).
        s.setImageStretch(this.stretches);
    }
    /** (Re)load `source` — called at attach and by the `source` pusher. */
    load() {
        const seq = ++this.loadSeq;
        const s = this.surface;
        if (s === null)
            return;
        // a new attempt speaks for the new source: `failed` clears here (and only
        // here), so it is always a fact about the CURRENT address
        setBound(this, "failed", false);
        if (this.source === "") {
            s.setImage(null);
            return;
        }
        // A DOM-less host (HeadlessBackend — static extraction, verify rung 4)
        // has no image loader: the network is honestly absent (capabilities.md
        // §3), `loaded` stays false, the box keeps its declared size.
        if (typeof document === "undefined")
            return;
        // document.createElement, not `new Image()` — this class shadows that
        // global inside its own module.
        const img = document.createElement("img");
        img.onload = () => {
            if (seq !== this.loadSeq || this.surface === null)
                return; // superseded or detached
            // Natural size lands through the reactive write path (setBound: the
            // runtime is the writer, so was-set stays false) and only into slots
            // the author left alone — explicit sizes and constraints win (an
            // auto-extent derive owning the slot folds the natural size in through
            // contentExtent instead, woken by the `loaded` write below).
            this.natural = { width: img.naturalWidth, height: img.naturalHeight };
            if (!isSet(this, "width") && ownerOf(this, "width") === null) {
                setBound(this, "width", img.naturalWidth);
            }
            if (!isSet(this, "height") && ownerOf(this, "height") === null) {
                setBound(this, "height", img.naturalHeight);
            }
            setBound(this, "loaded", true);
            this.surface.setImage(img);
        };
        img.onerror = () => {
            if (seq !== this.loadSeq || this.surface === null)
                return; // superseded or detached
            setBound(this, "failed", true);
        };
        img.src = resolveAsset(this.source);
    }
}
defineAttributes(Image, {
    source: { def: "", push: (i) => i.load() },
    stretches: { def: "none", push: (i, v) => i.surface?.setImageStretch(v) },
    loaded: { def: false },
    failed: { def: false },
});
//# sourceMappingURL=image.js.map