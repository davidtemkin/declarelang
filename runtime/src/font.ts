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
import { noteLoadedFaces, noteUnloadedFamily, type LoadedFace } from "./face-table.js";
import { assetBaseFor, rebaseAsset } from "./asset-base.js";
import { FONT_CSS, FONT_DEMAND, FONT_PENDING, familyCss, isFontValue, provideFontDemand } from "./font-value.js";
import { textWidth } from "./measure.js";
import { faceSourceCss, faceWeightDescriptor } from "./face-literal.js";

export { FONT_WEIGHTS, faceWeight, faceWeightLiteral, FACE_WEIGHT_FORMS } from "./face-literal.js";

// ── which font text actually reaches ─────────────────────────────────────────
// A family list is tried in order and the first family this machine has wins,
// so a declared font is demanded only when no family before it is available
// (font-value.ts). Here, because only a program with a Font needs it.

/** CSS's generic families: always available. */
const GENERICS = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji", "fangsong"]);
const AVAILABLE = new Map<string, boolean>();

// Whether this machine has a family: text set in "name, monospace" measures
// differently from "monospace" alone only if the name resolved — the browser (and
// the Mac host's text engine) skip a name they cannot find. Tried against two
// generics, so a face that happens to match one's widths is still seen. An
// identifier is written bare, as a keyword (`-apple-system` quoted is a family
// NAME, which no browser has); anything else is quoted.
const PROBE_TEXT = "mmmmmmmmmmlli1WwQ@";
function familyAvailable(name: string): boolean {
  const css = /^[-_a-zA-Z][-_a-zA-Z0-9]*$/.test(name) ? name : `"${name.replace(/"/g, "")}"`;
  for (const generic of ["monospace", "serif"]) {
    if (Math.abs(textWidth(PROBE_TEXT, `72px ${css}, ${generic}`) - textWidth(PROBE_TEXT, `72px ${generic}`)) > 0.5) return true;
  }
  return false;
}

/** Whether a family string (one name, or a comma list) names something this machine has. */
function stringAvailable(s: string): boolean {
  for (const raw of s.split(",")) {
    const name = raw.trim().replace(/^["']|["']$/g, "");
    if (name === "") continue;
    if (GENERICS.has(name.toLowerCase())) return true;
    let known = AVAILABLE.get(name);
    if (known === undefined) { known = familyAvailable(name); AVAILABLE.set(name, known); }
    if (known) return true;
  }
  return false;
}

/** Resolve every family slot in a tree — resolving is what demands. */
function touch(n: unknown): void {
  const o = n as { fontFamily?: unknown; codeFamily?: unknown; textStyles?: unknown; children?: readonly unknown[] };
  try {
    if ("fontFamily" in (o as object)) familyCss(o.fontFamily);
    if ("codeFamily" in (o as object)) familyCss(o.codeFamily);
    const ts = o.textStyles;
    if (ts !== null && typeof ts === "object") for (const st of Object.values(ts as Record<string, { fontFamily?: unknown }>)) if (st && typeof st === "object") familyCss(st.fontFamily);
  } catch { /* a slot not readable yet is resolved when its view measures */ }
  for (const c of o.children ?? []) touch(c);
}

provideFontDemand({
  /** The font text will reach in `v`, if any: the first font no available
   *  family before it hides. Idempotent — a font asked twice loads once. */
  reached(v) {
    for (const e of v) {
      if (typeof e === "string") { if (stringAvailable(e)) return; continue; }
      if (isFontValue(e)) { e[FONT_DEMAND]?.(); return; }
    }
  },
  touch,
});

// ── the seam to whatever actually loads faces ─────────────────────────────────
// A browser (and the Mac host's FontFace shim) loads through FontFace; a test
// installs its own host and lands faces by hand; a realm with neither treats a
// web font as settled at once (there is nothing to measure it with anyway).

export interface FontHost {
  /** Fetch one face; resolves to a handle `add`/`remove` understand, rejects on failure. */
  load(family: string, src: string, descriptors: { weight: string; style: string }): Promise<unknown>;
  /** Make a loaded face available to text. */
  add(handle: unknown): void;
  /** Withdraw a face. */
  remove(handle: unknown): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

function browserHost(): FontHost | null {
  if (typeof FontFace === "undefined" || typeof document === "undefined") return null;
  const set = document.fonts as unknown as { add(f: unknown): void; delete?(f: unknown): void };
  return {
    load: async (family, src, d) => { const face = new FontFace(family, src, d); await face.load(); return face; },
    add: (h) => set.add(h),
    remove: (h) => set.delete?.(h),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  };
}

let host: FontHost | null | undefined;
const hostNow = (): FontHost | null => (host === undefined ? (host = browserHost()) : host);
/** Replace the face loader (tests); null restores the environment's own. */
export function setFontHost(h: FontHost | null): void { host = h ?? undefined; }

// The faces the page has LOADED (for the raster worker's second realm) are kept in
// the face table (face-table.ts) — a leaf every program ships — so the raster
// client and the feature families never import this module.
export type { LoadedFace } from "./face-table.js";

// ── Face ─────────────────────────────────────────────────────────────────────

/** One face of a Font: a file, the weight(s) it covers, and whether it is italic. */
export class Face extends Node {
  declare src: string | readonly string[];
  declare weight: string | number | readonly [number, number];
  declare italic: boolean;
}
defineAttributes(Face as never, {
  src: { def: "" },
  weight: { def: "regular" },
  italic: { def: false },
} as never);

// ── Font ─────────────────────────────────────────────────────────────────────

let SEQ = 0;

interface Generation {
  name: string;
  handles: unknown[];
  timer: unknown;
  expired: boolean;
  settled: boolean;
}

export class Font extends Node {
  /** A system font's family (a font with no faces). */
  declare family: string;
  /** Milliseconds whatever is about to change to this font keeps its current look. */
  declare wait: number;
  /** An arrival after the wait: change to it, or keep the fallback for the run. */
  declare late: "swap" | "keep";
  /** Every face has arrived. Read-only. */
  declare loaded: boolean;
  /** A face could not be fetched. Read-only. */
  declare failed: boolean;
  /** The CSS family text uses for this font right now (internal). */
  declare $css: string;
  /** Inside the wait for faces not yet here (internal). */
  declare $pending: boolean;

  readonly #id = ++SEQ;
  #started = false;
  #watch: Constraint | null = null;
  #current: Generation | null = null;    // the faces text is using
  #incoming: Generation | null = null;   // faces being loaded to replace them
  /** Text has reached this font (font-value.ts `familyCss`): only then are its
   *  faces fetched — a font a device never draws in costs nothing there. */
  #demanded = false;
  /** Faces prepared and waiting for the first demand. */
  #deferred: { gen: Generation; specs: { src: string; weight: string; style: string }[] } | null = null;
  /** Demanded, the load about to start (a microtask away): already pending, so
   *  text switching to this font holds its current look from the first read. */
  #queued = false;
  #gen = 0;
  #signature = "";
  #ready: Promise<void>;
  #resolveReady!: () => void;

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

  get [FONT_CSS](): string { return this.$css; }
  get [FONT_PENDING](): boolean { return this.$pending || this.#queued; }

  /** Text reached this font: fetch its faces, once. */
  [FONT_DEMAND](): void {
    if (this.#demanded) return;
    this.#demanded = true;
    this.start();
    const d = this.#deferred;
    if (d === null) return;
    this.#deferred = null;
    this.#queued = true;
    // Asked mid-measurement, inside another constraint's read: the load writes
    // this font's own slots, so it starts just after, not inside that read.
    queueMicrotask(() => { if (this.#watch !== null) this.#load(d.gen, d.specs); this.#queued = false; });   // not after a discard
  }

  /** Construction-complete (instantiate.ts): start once the caller's synchronous
   *  setup (the app's asset base) has run. `fontsReady` starts it sooner. */
  autoStart(): void {
    if (this.#started) return;
    queueMicrotask(() => this.start());
  }

  /** Begin watching the faces and loading them. Idempotent. */
  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#watch = new Constraint("Font.faces", () => this.#faceSignature(), (sig) => this.#reload(sig as string), 0);
    this.#watch.run();
  }

  /** Resolves when the first load has settled: every face arrived, one failed,
   *  or the wait ran out. The start-up gate (fontsReady) waits on this. */
  ready(): Promise<void> {
    this.start();
    // Faces no text has asked for are not waited on: they may never be needed.
    return this.#deferred !== null ? Promise.resolve() : this.#ready;
  }

  #faces(): Face[] {
    this.watchChildList();
    return this.children.filter((c): c is Face => c instanceof Face);
  }

  #faceSignature(): string {
    const faces = this.#faces().map((f) => [f.src, f.weight, f.italic]);
    return JSON.stringify([this.family, faces]);
  }

  #reload(sig: string): void {
    if (sig === this.#signature) return;
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
    const rebase = (url: string): string => (base === null ? url : rebaseAsset(url, base));
    const gen: Generation = { name: `declare-font-${this.#id}-${++this.#gen}`, handles: [], timer: null, expired: false, settled: false };
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

    if (!this.#demanded) { this.#retire(this.#deferred?.gen ?? null); this.#deferred = { gen, specs }; return; }
    this.#load(gen, specs);
  }

  /** Fetch `gen`'s faces: the load, its wait, and what follows it. */
  #load(gen: Generation, specs: { src: string; weight: string; style: string }[]): void {
    const h = hostNow();
    if (h === null) return;
    this.#incoming = gen;
    setBound(this, "loaded", false);
    setBound(this, "failed", false);
    setBound(this, "$pending", true);
    // The first load has no faces to keep: text names the new family at once and
    // falls back through its list until the faces land. A replacement keeps
    // naming the old faces until the new ones settle.
    if (this.#current === null) setBound(this, "$css", gen.name);

    gen.timer = h.setTimeout(() => this.#expire(gen), Math.max(0, this.wait));
    void Promise.allSettled(specs.map((s) => h.load(gen.name, s.src, { weight: s.weight, style: s.style })))
      .then((results) => this.#arrived(gen, specs, results));
  }

  #expire(gen: Generation): void {
    gen.timer = null;
    if (gen !== this.#incoming || gen.settled) return;
    gen.expired = true;
    // Out of wait: whatever was holding changes now. With `swap` the new family
    // is named (the fallback shows until the faces land); with `keep` too — the
    // faces are simply never added, so the fallback stays for the run.
    this.#adopt(gen);
    setBound(this, "$pending", false);
    this.#resolveReady();
  }

  #arrived(gen: Generation, specs: { src: string; weight: string; style: string }[], results: PromiseSettledResult<unknown>[]): void {
    const h = hostNow();
    // A face that must not be used is withdrawn, not merely left un-added: on the
    // Mac host loading IS registering (browser/mac-env.js), so only a remove keeps
    // it out. On the web, removing a face never added is a no-op.
    const withdraw = (): void => {
      if (h === null) return;
      for (const r of results) if (r.status === "fulfilled") h.remove(r.value);
    };
    if (gen !== this.#incoming && gen !== this.#current) {
      // Superseded while loading (a newer source, or the font retired).
      withdraw();
      return;
    }
    if (gen.timer !== null && h !== null) { h.clearTimeout(gen.timer); gen.timer = null; }
    gen.settled = true;
    const failed = results.some((r) => r.status === "rejected");
    if (gen.expired && this.late === "keep") {
      // Late and unwanted: never used, so this run keeps the fallback.
      withdraw();
      setBound(this, "failed", failed);
      return;
    }
    const landed: LoadedFace[] = [];
    results.forEach((r, i) => {
      if (r.status !== "fulfilled" || h === null) return;
      h.add(r.value);
      gen.handles.push(r.value);
      landed.push({ family: gen.name, ...specs[i] });
    });
    this.#adopt(gen);
    if (landed.length > 0) noteLoadedFaces(landed);
    this.#settle(!failed && landed.length === specs.length, failed);
  }

  /** Make `gen` the faces text uses, retiring the ones it replaces. */
  #adopt(gen: Generation): void {
    if (this.#current !== gen) {
      this.#retire(this.#current);
      this.#current = gen;
    }
    if (this.#incoming === gen) this.#incoming = null;
    setBound(this, "$css", gen.name);
  }

  #settle(loaded: boolean, failed: boolean): void {
    setBound(this, "loaded", loaded);
    setBound(this, "failed", failed);
    setBound(this, "$pending", false);
    this.#resolveReady();
  }

  #retire(gen: Generation | null): void {
    if (gen === null) return;
    const h = hostNow();
    if (gen.timer !== null && h !== null) h.clearTimeout(gen.timer);
    gen.timer = null;
    gen.settled = true;
    if (gen.handles.length === 0) return;
    if (h !== null) for (const handle of gen.handles) h.remove(handle);
    gen.handles = [];
    noteUnloadedFamily(gen.name);
  }
}
defineAttributes(Font as never, {
  family: { def: "" },
  wait: { def: 500 },
  late: { def: "swap" },
  loaded: { def: false },
  failed: { def: false },
  $css: { def: "" },
  $pending: { def: false },
} as never);

// The start-up gate lives in the leaf (font-value.ts), recognizing a Font by its
// symbol, so a program with no fonts never ships this module.
export { fontsReady } from "./font-value.js";
