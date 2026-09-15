// Font — a typeface as an object in the tree (docs/system-design/fonts.md).
//
//   App [ fontFamily = { [brand, "Helvetica", "sans-serif"] },
//       brand: Font [ wait = 800,
//           Face [ src = "brand-400.woff2" ],
//           Face [ src = "brand-700.woff2", weight = bold ] ],
//       ui: Font [ family = "Helvetica Neue" ] ]              // a system font
//
// A Font owns its faces; a Font with no faces is a SYSTEM font naming a family the
// machine already has. Web and system fonts are one kind of object, so a slot
// that holds one holds the other, and switching between them is an assignment.
//
// LIFETIME IS PLACEMENT. A font on the App lives for the program; a font inside a
// view lives with that view, and its faces are unregistered when the view retires.
// A face's `src` may be a `{ }` value: changing it loads the new file while text
// keeps the face it has, then changes once.
//
// REGISTRATION. A web font registers its faces under a name of its own
// (`declare-font-<id>-<generation>`), never under an author string, so two fonts
// never collide and a source change can load beside the faces it replaces. What
// the text machinery reads is `$css` — that name, or a system font's family —
// through font-value.ts.
//
// WHILE FACES LOAD (the `wait` / `late` policy):
//   `wait` (ms) — how long whatever is about to change to this font keeps its
//                 current look: the app's first paint (fontsReady, below); a view
//                 switching to it (font-value.ts heldFamily); a source change.
//   `late`      — what an arrival after the wait does: `swap` changes to it (one
//                 redraw); `keep` leaves the fallback for the rest of the run.
// `loaded` (every face arrived) and `failed` (a face could not be fetched) are
// read-only facts, both false while loading — `Image`'s pair.
import { Node, onDiscard } from "./node.js";
import { defineAttributes, setBound } from "./attributes.js";
import { Constraint } from "./reactive.js";
import { noteLoadedFaces, noteUnloadedFamily } from "./face-table.js";
import { assetBaseFor, rebaseAsset } from "./asset-base.js";
import { FONT_CSS, FONT_PENDING } from "./font-value.js";
import { faceSourceCss, faceWeightDescriptor } from "./face-literal.js";
export { FONT_WEIGHTS, faceWeight, faceWeightLiteral, FACE_WEIGHT_FORMS } from "./face-literal.js";
function browserHost() {
    if (typeof FontFace === "undefined" || typeof document === "undefined")
        return null;
    const set = document.fonts;
    return {
        load: async (family, src, d) => { const face = new FontFace(family, src, d); await face.load(); return face; },
        add: (h) => set.add(h),
        remove: (h) => set.delete?.(h),
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (h) => clearTimeout(h),
    };
}
let host;
const hostNow = () => (host === undefined ? (host = browserHost()) : host);
/** Replace the face loader (tests); null restores the environment's own. */
export function setFontHost(h) { host = h ?? undefined; }
// ── Face ─────────────────────────────────────────────────────────────────────
/** One face of a Font: a file, the weight(s) it covers, and whether it is italic. */
export class Face extends Node {
}
defineAttributes(Face, {
    src: { def: "" },
    weight: { def: "regular" },
    italic: { def: false },
});
// ── Font ─────────────────────────────────────────────────────────────────────
let SEQ = 0;
export class Font extends Node {
    #id = ++SEQ;
    #started = false;
    #watch = null;
    #current = null; // the faces text is using
    #incoming = null; // faces being loaded to replace them
    #gen = 0;
    #signature = "";
    #ready;
    #resolveReady;
    constructor() {
        super();
        this.#ready = new Promise((r) => { this.#resolveReady = r; });
        onDiscard(this, () => {
            this.#watch?.dispose();
            this.#watch = null;
            this.#retire(this.#incoming);
            this.#retire(this.#current);
            this.#incoming = this.#current = null;
        });
    }
    get [FONT_CSS]() { return this.$css; }
    get [FONT_PENDING]() { return this.$pending; }
    /** Construction-complete (instantiate.ts): start once the caller's synchronous
     *  setup (the app's asset base) has run. `fontsReady` starts it sooner. */
    autoStart() {
        if (this.#started)
            return;
        queueMicrotask(() => this.start());
    }
    /** Begin watching the faces and loading them. Idempotent. */
    start() {
        if (this.#started)
            return;
        this.#started = true;
        this.#watch = new Constraint("Font.faces", () => this.#faceSignature(), (sig) => this.#reload(sig), 0);
        this.#watch.run();
    }
    /** Resolves when the first load has settled: every face arrived, one failed,
     *  or the wait ran out. The start-up gate (fontsReady) waits on this. */
    ready() {
        this.start();
        return this.#ready;
    }
    #faces() {
        this.watchChildList();
        return this.children.filter((c) => c instanceof Face);
    }
    #faceSignature() {
        const faces = this.#faces().map((f) => [f.src, f.weight, f.italic]);
        return JSON.stringify([this.family, faces]);
    }
    #reload(sig) {
        if (sig === this.#signature)
            return;
        this.#signature = sig;
        const faces = this.#faces();
        this.#retire(this.#incoming);
        this.#incoming = null;
        if (faces.length === 0) {
            // A system font: nothing to load, available at once.
            this.#retire(this.#current);
            this.#current = null;
            setBound(this, "$css", this.family);
            this.#settle(true, false);
            return;
        }
        const h = hostNow();
        const base = assetBaseFor(this.root);
        const rebase = (url) => (base === null ? url : rebaseAsset(url, base));
        const gen = { name: `declare-font-${this.#id}-${++this.#gen}`, handles: [], timer: null, expired: false, settled: false };
        const specs = faces
            .map((f) => ({ src: faceSourceCss(f.src, rebase), weight: faceWeightDescriptor(f.weight), style: f.italic ? "italic" : "normal" }))
            .filter((s) => s.src !== "");
        if (h === null) {
            // No loader in this realm (Node, a headless check): settled as if arrived.
            this.#retire(this.#current);
            this.#current = gen;
            setBound(this, "$css", gen.name);
            this.#settle(true, false);
            return;
        }
        this.#incoming = gen;
        setBound(this, "loaded", false);
        setBound(this, "failed", false);
        setBound(this, "$pending", true);
        // The first load has no faces to keep: text names the new family at once and
        // falls back through its list until the faces land. A replacement keeps
        // naming the old faces until the new ones settle.
        if (this.#current === null)
            setBound(this, "$css", gen.name);
        gen.timer = h.setTimeout(() => this.#expire(gen), Math.max(0, this.wait));
        void Promise.allSettled(specs.map((s) => h.load(gen.name, s.src, { weight: s.weight, style: s.style })))
            .then((results) => this.#arrived(gen, specs, results));
    }
    #expire(gen) {
        gen.timer = null;
        if (gen !== this.#incoming || gen.settled)
            return;
        gen.expired = true;
        // Out of wait: whatever was holding changes now. With `swap` the new family
        // is named (the fallback shows until the faces land); with `keep` too — the
        // faces are simply never added, so the fallback stays for the run.
        this.#adopt(gen);
        setBound(this, "$pending", false);
        this.#resolveReady();
    }
    #arrived(gen, specs, results) {
        const h = hostNow();
        // A face that must not be used is withdrawn, not merely left un-added: on the
        // Mac host loading IS registering (browser/mac-env.js), so only a remove keeps
        // it out. On the web, removing a face never added is a no-op.
        const withdraw = () => {
            if (h === null)
                return;
            for (const r of results)
                if (r.status === "fulfilled")
                    h.remove(r.value);
        };
        if (gen !== this.#incoming && gen !== this.#current) {
            // Superseded while loading (a newer source, or the font retired).
            withdraw();
            return;
        }
        if (gen.timer !== null && h !== null) {
            h.clearTimeout(gen.timer);
            gen.timer = null;
        }
        gen.settled = true;
        const failed = results.some((r) => r.status === "rejected");
        if (gen.expired && this.late === "keep") {
            // Late and unwanted: never used, so this run keeps the fallback.
            withdraw();
            setBound(this, "failed", failed);
            return;
        }
        const landed = [];
        results.forEach((r, i) => {
            if (r.status !== "fulfilled" || h === null)
                return;
            h.add(r.value);
            gen.handles.push(r.value);
            landed.push({ family: gen.name, ...specs[i] });
        });
        this.#adopt(gen);
        if (landed.length > 0)
            noteLoadedFaces(landed);
        this.#settle(!failed && landed.length === specs.length, failed);
    }
    /** Make `gen` the faces text uses, retiring the ones it replaces. */
    #adopt(gen) {
        if (this.#current !== gen) {
            this.#retire(this.#current);
            this.#current = gen;
        }
        if (this.#incoming === gen)
            this.#incoming = null;
        setBound(this, "$css", gen.name);
    }
    #settle(loaded, failed) {
        setBound(this, "loaded", loaded);
        setBound(this, "failed", failed);
        setBound(this, "$pending", false);
        this.#resolveReady();
    }
    #retire(gen) {
        if (gen === null)
            return;
        const h = hostNow();
        if (gen.timer !== null && h !== null)
            h.clearTimeout(gen.timer);
        gen.timer = null;
        gen.settled = true;
        if (gen.handles.length === 0)
            return;
        if (h !== null)
            for (const handle of gen.handles)
                h.remove(handle);
        gen.handles = [];
        noteUnloadedFamily(gen.name);
    }
}
defineAttributes(Font, {
    family: { def: "" },
    wait: { def: 500 },
    late: { def: "swap" },
    loaded: { def: false },
    failed: { def: false },
    $css: { def: "" },
    $pending: { def: false },
});
// The start-up gate lives in the leaf (font-value.ts), recognizing a Font by its
// symbol, so a program with no fonts never ships this module.
export { fontsReady } from "./font-value.js";
//# sourceMappingURL=font.js.map