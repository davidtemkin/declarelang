import { shellMedia } from "./shell-media.js";
import { applyPurpose } from "../../runtime/dist/purpose.js";
import { navigationOf, type IslandNavigation } from "../../runtime/dist/navigation.js";
// shell — the page's side of render=gpu.
//
// The ordinary boot resolves the program (an artifact, a cached compile, or the dev
// server's compile) and, when the page's address carries `?render=gpu`, hands it here instead of
// to the DOM page boot. From then on this thread does only what a page must: it owns the
// canvas element, relays what the person does to the two workers, and carries out the few
// things only the page can — the cursor, the title, the page's colour, and editable text
// fields, which are real DOM fields laid over the canvas where the program's TextInputs are
// (and always frontmost). The runtime runs in one worker (worker.ts); the compositor
// (compositor.ts) owns the canvas, through an OffscreenCanvas, and the scroll process, so
// pointers, wheels and touches go to it first (touches to both: the runtime decides whether a
// finger is the program's), and everything else to the runtime. The two talk through a port.
//
// Input never waits on the workers: inside the canvas every touch and wheel is the
// program's (touch-action none, wheel always taken), and a key's default is prevented
// unless a modifier is held, so the browser's own shortcuts keep working.

type Msg = Record<string, unknown> & { t: string };

interface EditSpec {
  multiline: boolean; spellcheck: boolean; wrap: boolean; padding: number[]; value: string; placeholder: string;
  purpose: string; concealed: boolean;
  style: { family: unknown; size: number; weight: string | number; italic: boolean; color: string | null; align: string; letterSpacing: number };
  families?: string;
}

type ExternalValue = <T>(initial: T) => { get(): T; set(v: T): void };
type Compiled = { program?: unknown; report?: unknown } | null | undefined;
/** What the page's boot lends for compiling an AppIsland's program (boot-uniform.js): its
 *  prewarmed builds, the dev server's compile, and the in-browser compiler. */
type IslandCompile = {
  prewarm(u: URL): Promise<Compiled>;
  serverCompile(u: URL, source: string): Promise<Compiled>;
  compiler(): Promise<{ compileProgram(source: string, opts: { mainId: string }): Promise<Compiled> }>;
};

/** An AppIsland's program, for the worker that mounts it — the island ladder (host-islands
 *  resolveCompiled): a prewarmed build, else its source compiled (the dev server's compile, or
 *  the in-browser compiler). { program } | { report } | { missing } | null. */
async function compileIsland(c: IslandCompile, url: string): Promise<unknown> {
  const u = new URL(url);
  const onServer = !!(window as unknown as { __declareServer?: unknown }).__declareServer;
  if (!onServer) { try { const warm = await c.prewarm(u); if (warm) return warm; } catch { /* compile it instead */ } }
  let src: string;
  try { const res = await fetch(u.href, { cache: "no-cache" }); if (!res.ok) return { missing: true }; src = await res.text(); }
  catch { return null; }
  try {
    const out = onServer ? await c.serverCompile(u, src) : await (await c.compiler()).compileProgram(src, { mainId: u.href });
    return out?.program ? { program: out.program } : out?.report != null ? { report: out.report } : null;
  } catch { return null; }
}

/** Boot a program on WebGPU. With `host`, the app runs in that element, sized to it (a page
 *  embedding several apps); without, it takes the page. Resolves, once the program is up, to
 *  the page's stand-in for the app: reads answer its values (tracked, when the page's runtime
 *  handed over `externalValue`, so `observe` follows them) and writes go to it. */
export async function bootGpu(cfg: { program: unknown; main: string; host?: HTMLElement | null; provides?: Record<string, unknown>;
  externalValue?: ExternalValue; island?: IslandCompile;
  /** the page as a host (host-client's boot options): the app's postToHost, and its navigation */
  onPost?: (m: { topic: string; payload: unknown }) => void; onNavigate?: (nav: IslandNavigation) => void }): Promise<unknown> {
  const shellStart = performance.timeOrigin + performance.now();
  const doc = document;
  const embedded = cfg.host != null;
  const box: HTMLElement = cfg.host ?? doc.body;
  // a whole-page app scrolls the window, as the canvas renderer's does: the canvas stays fixed,
  // a strut gives the document the app's height, and the browser scrolls it (its scrollbar,
  // momentum and bounce); the compositor draws the slice the offset shows
  const pageScrolls = !embedded && !new URLSearchParams(location.search).has("nopagescroll");
  if (!embedded) {
    doc.documentElement.style.cssText = pageScrolls ? "margin:0" : "margin:0;height:100%;overflow:hidden";
    doc.body.style.cssText = pageScrolls ? "margin:0" : "margin:0;height:100%;overflow:hidden";
    doc.body.replaceChildren();
  } else if (getComputedStyle(box).position === "static") box.style.position = "relative";
  const canvas = doc.createElement("canvas");
  canvas.style.cssText = embedded
    ? "position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none;outline:none"
    : "position:fixed;left:0;top:0;width:100vw;height:100vh;display:block;touch-action:none;outline:none";
  canvas.tabIndex = 0;
  box.appendChild(canvas);
  const strut = doc.createElement("div");
  strut.style.cssText = "position:absolute;left:0;top:0;width:1px;height:0;visibility:hidden;pointer-events:none";
  if (pageScrolls) { box.appendChild(strut); canvas.style.touchAction = "pan-y"; }
  // the compositor's page map: how tall the page is, and the boxes where a wheel or a finger
  // is the app's (an inner pane that scrolls: 1 down, 2 across; a view that hears the wheel: 4;
  // one that takes a finger: 8) — anywhere else the browser scrolls the page. A frame old.
  let pageMap: { h: number; boxes: [number, number, number, number, number][] } = { h: 0, boxes: [] };
  const mapAt = (x: number, y: number): number => {
    let k = 0;
    for (const [bx, by, bw, bh, kind] of pageMap.boxes) if (x >= bx && y >= by && x < bx + bw && y < by + bh) k |= kind;
    return k;
  };
  if (pageScrolls) addEventListener("scroll", () => draw({ t: "page-scroll", y: scrollY }), { passive: true });
  const layer = doc.createElement("div");            // the editable fields and DOM islands, over the canvas
  layer.style.cssText = `position:${embedded ? "absolute" : "fixed"};left:0;top:0;width:0;height:0;overflow:visible`;
  box.appendChild(layer);
  // where the page's events are taken: the window for a whole-page app, the box for one of several
  const events: EventTarget = embedded ? box : window;

  const darkQ = matchMedia("(prefers-color-scheme: dark)");
  const coarseQ = matchMedia("(pointer: coarse)");
  // what the device HAS, apart from what is primary: the app's hasTouch / hasMouse
  const anyCoarseQ = matchMedia("(any-pointer: coarse)");
  const anyFineQ = matchMedia("(any-pointer: fine)");
  const page = () => ({
    width: embedded ? box.clientWidth : doc.documentElement.clientWidth, height: embedded ? box.clientHeight : doc.documentElement.clientHeight,
    dpr: devicePixelRatio || 1, dark: darkQ.matches, coarse: coarseQ.matches, anyCoarse: anyCoarseQ.matches, anyFine: anyFineQ.matches,
  });

  const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  const compositor = new Worker(new URL("./compositor.js", import.meta.url), { type: "module" });
  const post = (m: Msg, t: Transferable[] = []) => worker.postMessage(m, t);
  const draw = (m: Msg, t: Transferable[] = []) => compositor.postMessage(m, t);
  const link = new MessageChannel();
  const p0 = page();
  canvas.width = Math.round(p0.width * p0.dpr);
  canvas.height = Math.round(p0.height * p0.dpr);
  const off = canvas.transferControlToOffscreen();
  // the address the app starts at: the fragment, the entry's state, and whether Back or
  // Forward brought the page here (host-client's arrival/traversal rule)
  const nav = (performance.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined)?.type ?? "navigate";
  // where the user was on each entry, kept across reloads (host-client's table)
  const PLACES = "declare.places";
  let places: Record<string, unknown> = {};
  try { places = JSON.parse(sessionStorage.getItem(PLACES) || "{}") || {}; } catch { places = {}; }
  const address = { fragment: decodeURIComponent(location.hash.replace(/^#/, "")), state: history.state, traversed: nav === "back_forward", places };
  if (!embedded) {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    // leaving: the worker notes this entry's place (and posts the table back)
    doc.addEventListener("visibilitychange", () => { if (doc.visibilityState === "hidden") post({ t: "keep" }); });
  }
  // the page as the topmost host (host-client's rule): what the program reads with
  // hostProvided — the host element's data-declare-provide, then boot({ provides }), which wins
  let provides: Record<string, unknown> = {};
  const provideAttr = embedded ? box.getAttribute("data-declare-provide") : null;
  if (provideAttr) {
    try { provides = JSON.parse(provideAttr); }
    catch { console.error(`[Declare] data-declare-provide is not valid JSON — nothing provided: ${provideAttr.slice(0, 80)}`); }
  }
  provides = { ...provides, ...(cfg.provides ?? {}) };
  // an embedded app's address is its own state, never the page's URL (host-client's rule)
  draw({ t: "init", canvas: off, page: p0, href: location.href, port: link.port1, embedded }, [off, link.port1]);
  post({ t: "init", page: p0, program: cfg.program, main: new URL(cfg.main, location.href).href, href: location.href,
    address: embedded ? { fragment: "", state: null, traversed: false } : address, embedded, provides, port: link.port2 }, [link.port2]);
  // Back and Forward: the entry's pair goes to the app
  if (!embedded) addEventListener("popstate", (e) => post({ t: "pop", state: e.state, fragment: decodeURIComponent(location.hash.replace(/^#/, "")) }));

  // ── the page's state ───────────────────────────────────────────────────────
  let last = JSON.stringify(p0);
  const sendPage = () => { const p = page(); const s = JSON.stringify(p); if (s !== last) { last = s; draw({ t: "page", page: p }); post({ t: "page", page: p }); } };
  if (embedded) new ResizeObserver(sendPage).observe(box); else addEventListener("resize", sendPage);
  darkQ.addEventListener("change", sendPage);
  coarseQ.addEventListener("change", sendPage);
  anyCoarseQ.addEventListener("change", sendPage);
  anyFineQ.addEventListener("change", sendPage);
  doc.addEventListener("visibilitychange", () => post({ t: "visible", v: doc.visibilityState === "visible" }));

  // ── input ──────────────────────────────────────────────────────────────────
  // Every event the runtime listens for, taken at the window in the capture phase (where
  // the runtime's own router listens on the DOM renderer), so a press or a move over an
  // editable field reaches the program too. Each carries the page's timestamp — absolute
  // (timeOrigin + now), so the worker can tell how long the crossing took.
  const stamp = () => performance.timeOrigin + performance.now();
  const at = (x: number, y: number) => { const r = canvas.getBoundingClientRect(); return { clientX: x - r.left, clientY: y - r.top }; };
  const overField = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
  const pointerProps = (e: PointerEvent) => ({ ...at(e.clientX, e.clientY), button: e.button, buttons: e.buttons,
    pointerType: e.pointerType, pointerId: e.pointerId, isPrimary: e.isPrimary, detail: e.detail,
    width: e.width, height: e.height, pressure: e.pressure, overText: overField(e.target),
    shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, timeStamp: e.timeStamp });
  for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const) {
    events.addEventListener(type, (ev) => {
      const e = ev as PointerEvent;
      let pressed = false;
      if (type === "pointerdown" && e.button === 0 && !overField(e.target)) {
        const r = canvas.getBoundingClientRect();
        const hit = fieldAt(e.clientX - r.left, e.clientY - r.top);
        if (hit !== null) {
          const [id, f] = hit;
          const el = showField(id, f);
          // the caret where the press was: one line is read across its middle
          const b = f.box!;
          const cy = f.spec.multiline ? e.clientY : r.top + b.y + b.h / 2;
          const cp = (doc as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null })
            .caretPositionFromPoint?.(e.clientX, cy);
          el.focus({ preventScroll: true });
          const at = cp != null && cp.offsetNode === el ? cp.offset : el.value.length;
          try { el.setSelectionRange(at, at); } catch { /* input types without selection */ }
          pressedField = e.pointerType === "mouse";
          pressed = true;
        }
      }
      if (type === "pointerdown" && e.target === canvas && !pressed) {
        try { canvas.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer has nothing to capture */ }
        if (doc.activeElement === null || doc.activeElement === doc.body) canvas.focus({ preventScroll: true });
      }
      draw({ t: "pointer", type, p: pressed ? { ...pointerProps(e), overText: true } : pointerProps(e), ts: stamp() });
    }, { capture: true });
  }
  // leaving the page (or the app's box): the runtime's hover ends on a pointerout with no related target
  if (embedded) box.addEventListener("pointerleave", (e) => draw({ t: "pointer", type: "pointerout", p: { ...pointerProps(e), relatedTarget: null }, ts: stamp() }));
  else addEventListener("pointerout", (e) => {
    if (e.relatedTarget === null) draw({ t: "pointer", type: "pointerout", p: pointerProps(e), ts: stamp() });
  }, { capture: true });
  events.addEventListener("contextmenu", (e) => {
    if (overField(e.target)) return;            // a field's own menu (spelling, paste) stays the field's
    e.preventDefault();
    draw({ t: "pointer", type: "contextmenu", p: pointerProps(e as PointerEvent), ts: stamp() });
  }, { capture: true });
  const touchList = (l: TouchList) => Array.from(l, (t) => ({ identifier: t.identifier, ...at(t.clientX, t.clientY),
    radiusX: t.radiusX, radiusY: t.radiusY, force: t.force }));
  for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"] as const) {
    events.addEventListener(type, (ev) => {
      const e = ev as TouchEvent;
      // a finger that lands on an inner pane or a view that takes it is the app's: the
      // browser does not pan the page under it
      if (pageScrolls && type === "touchstart" && e.cancelable && e.touches.length === 1) {
        const r = canvas.getBoundingClientRect(), t0 = e.touches[0];
        if (mapAt(t0.clientX - r.left, t0.clientY - r.top) & (1 | 2 | 8)) e.preventDefault();
      }
      const m = { t: "touch", type, p: { touches: touchList(e.touches), changedTouches: touchList(e.changedTouches),
        targetTouches: touchList(e.targetTouches), shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey },
      ts: stamp() };
      draw(m); post(m);
    }, { capture: true, passive: !pageScrolls });
  }
  // A wheel's steps glide (as the browser animates a mouse wheel); a trackpad's deltas, which
  // the OS has already smoothed, move the pane at once. A trackpad's event carries
  // wheelDelta = -3 × delta (Chrome, Safari); a mouse wheel's carries notches of 120, and
  // Firefox's are in lines. `&smoothwheel` glides every wheel, `&nosmoothwheel` none.
  const wheelQ = new URLSearchParams(location.search);
  const glideAll = wheelQ.has("smoothwheel"), glideNone = wheelQ.has("nosmoothwheel");
  events.addEventListener("wheel", (ev) => {
    const e = ev as WheelEvent & { wheelDeltaX?: number; wheelDeltaY?: number };
    const r = canvas.getBoundingClientRect();
    // the page's own scroll, unless an inner pane or a claimant under the pointer takes it
    if (pageScrolls && !e.ctrlKey && !overField(e.target)) {
      const k = mapAt(e.clientX - r.left, e.clientY - r.top);
      if (!(k & 4) && !(k & 1 && e.deltaY !== 0) && !(k & 2 && e.deltaX !== 0)) return;
    }
    if (!overField(e.target)) e.preventDefault();
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
    const precise = e.deltaMode === 0 && e.wheelDeltaY !== undefined &&
      Math.abs(e.wheelDeltaY + 3 * e.deltaY) <= 3 && Math.abs((e.wheelDeltaX ?? 0) + 3 * e.deltaX) <= 3;
    const notch = glideAll || (!glideNone && !precise && !e.ctrlKey);
    draw({ t: "wheel", x: e.clientX - r.left, y: e.clientY - r.top, dx: e.deltaX * k, dy: e.deltaY * k, pinch: e.ctrlKey, notch, ts: stamp() });
  }, { passive: false, capture: true });
  const keyProps = (e: KeyboardEvent) => ({ key: e.key, code: e.code, repeat: e.repeat,
    shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey });
  for (const type of ["keydown", "keyup"] as const) {
    events.addEventListener(type, (ev) => {
      const e = ev as KeyboardEvent;
      if (overField(e.target)) {
        // a field's own typing stays the field's; Tab and Escape still reach the program
        if (e.key !== "Tab" && e.key !== "Escape") return;
      }
      if (!e.metaKey && !e.ctrlKey) e.preventDefault();
      post({ t: "key", type, p: keyProps(e), ts: stamp() });
    });
  }
  addEventListener("focus", () => post({ t: "window", type: "focus", ts: stamp() }));
  addEventListener("blur", () => post({ t: "window", type: "blur", ts: stamp() }));

  // ── fields ─────────────────────────────────────────────────────────────────
  // A field is a DOM element over the canvas only while it has focus; otherwise the canvas
  // draws its text, and a press inside its box makes the element there, focused, with the
  // caret where the press was. The compositor hears at once (`edit-shown`), so the canvas
  // stops drawing the text the element now shows.
  type Field = { spec: EditSpec; box: Box | null; el: HTMLInputElement | HTMLTextAreaElement | null };
  const fields = new Map<number, Field>();
  const showField = (id: number, f: Field): HTMLInputElement | HTMLTextAreaElement => {
    if (f.el !== null) return f.el;
    const el = makeField(id, f.spec);
    f.el = el;
    styleField(el, f.spec);
    if (f.box !== null) placeBox(el, f.box);
    draw({ t: "edit-shown", id, on: true });
    return el;
  };
  const hideField = (id: number): void => {
    const f = fields.get(id);
    if (f === undefined || f.el === null) return;
    const el = f.el;
    f.el = null;
    el.remove();
    draw({ t: "edit-shown", id, on: false });
  };
  /** The field whose box, as far as its clips leave it showing, holds the point (canvas pixels). */
  const fieldAt = (x: number, y: number): [number, Field] | null => {
    let hit: [number, Field] | null = null;
    for (const [id, f] of fields) {
      const b = f.box;
      if (b === null || !b.shown || b.opacity <= 0 || x < b.x || y < b.y || x >= b.x + b.w || y >= b.y + b.h) continue;
      const c = b.clip;
      if (c !== null && (x < c.x || y < c.y || x >= c.x + c.w || y >= c.y + c.h)) continue;
      hit = [id, f];
    }
    return hit;
  };
  // a press that made a field: the mouse's own default (focusing what lies under it) is not let undo it
  let pressedField = false;
  doc.addEventListener("mousedown", (e) => { if (pressedField) { pressedField = false; e.preventDefault(); } }, { capture: true });
  const styleField = (el: HTMLInputElement | HTMLTextAreaElement, s: EditSpec) => {
    const st = s.style;
    const pad = s.padding ?? [0, 0, 0, 0];
    Object.assign(el.style, {
      position: "absolute", boxSizing: "border-box", margin: "0", border: "none", outline: "none", background: "transparent",
      padding: `${pad[0]}px ${pad[1]}px ${pad[2]}px ${pad[3]}px`, resize: "none",
      font: `${st.italic ? "italic " : ""}${typeof st.weight === "number" ? st.weight : st.weight} ${st.size}px ${s.families ?? "system-ui"}`,
      color: st.color ?? "inherit", textAlign: st.align, letterSpacing: `${st.letterSpacing}px`,
      whiteSpace: s.multiline && s.wrap ? "pre-wrap" : "pre", overflow: "hidden",
    });
    applyPurpose(el, s.purpose, s.concealed, s.spellcheck);
    el.placeholder = s.placeholder;
    if (el.value !== s.value) el.value = s.value;
  };
  const makeField = (id: number, s: EditSpec) => {
    const el = s.multiline ? doc.createElement("textarea") : doc.createElement("input");
    el.addEventListener("input", () => post({ t: "edit-input", id, value: el.value }));
    el.addEventListener("focus", () => post({ t: "edit-focus", id, on: true }));
    el.addEventListener("blur", () => { post({ t: "edit-focus", id, on: false }); hideField(id); });
    el.addEventListener("keydown", (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === "Enter" && !s.multiline) { ke.preventDefault(); post({ t: "edit-enter", id }); }
    });
    layer.appendChild(el);
    return el;
  };

  // the bundled faces, so a field draws in the face the canvas draws with
  const faces = new Set<string>();

  // a video's frames are drawn (the compositor's); the rest of media is the program's
  const media = shellMedia((m, t) => (m.t === "media-frame" ? draw : post)(m, t));

  // where an element over the canvas goes (a field, a DOM island): its box, the part its
  // ancestors' clips leave showing (as an inset of its own box), hidden, faded
  type Box = { x: number; y: number; w: number; h: number; shown: boolean; opacity: number; clip: { x: number; y: number; w: number; h: number } | null };
  const placeBox = (el: HTMLElement, box: Box): void => {
    const c = box.clip;
    const inset = c === null ? "" : `inset(${Math.max(0, c.y - box.y)}px ${Math.max(0, box.x + box.w - (c.x + c.w))}px ${Math.max(0, box.y + box.h - (c.y + c.h))}px ${Math.max(0, c.x - box.x)}px)`;
    const hidden = !box.shown || (c !== null && (c.w <= 0 || c.h <= 0 || c.x >= box.x + box.w || c.y >= box.y + box.h || c.x + c.w <= box.x || c.y + c.h <= box.y));
    Object.assign(el.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px`,
      clipPath: inset, visibility: hidden ? "hidden" : "", opacity: box.opacity >= 1 ? "" : String(box.opacity) });
  };

  // ── DOM islands: the element foreign content mounts into, marked data-declare-slot, with
  // its handle (`__declareIsland`, island.ts) standing in for the real one in the worker:
  // provided values arrive and are kept; expose and post cross over. ──
  type Island = { el: HTMLElement; values: Map<string, unknown>; watchers: [string, (v: unknown) => void][]; posts: ((m: { topic: string; payload: unknown }) => void)[] };
  const islands = new Map<number, Island>();
  const islandBoxes = new Map<number, Box>();
  const openIsland = (id: number, slot: string, provides: string[]): void => {
    const el = doc.createElement("div");
    el.style.cssText = "position:absolute;margin:0;overflow:hidden";
    el.dataset.declareSlot = slot;
    const isl: Island = { el, values: new Map(), watchers: [], posts: [] };
    (el as HTMLElement & { __declareIsland?: unknown }).__declareIsland = {
      provides: () => provides.slice(),
      hostProvided: (name: string) => isl.values.get(name),
      watchProvided: (name: string, cb: (v: unknown) => void) => {
        const w: [string, (v: unknown) => void] = [name, cb];
        isl.watchers.push(w);
        cb(isl.values.get(name));
        return () => { const i = isl.watchers.indexOf(w); if (i >= 0) isl.watchers.splice(i, 1); };
      },
      expose: (name: string, v: unknown) => post({ t: "island-expose", id, name, v }),
      post: (topic: string, payload?: unknown) => post({ t: "island-post", id, topic, payload }),
      onPost: (cb: (m: { topic: string; payload: unknown }) => void) => {
        isl.posts.push(cb);
        return () => { const i = isl.posts.indexOf(cb); if (i >= 0) isl.posts.splice(i, 1); };
      },
    };
    layer.appendChild(el);
    islands.set(id, isl);
    const b = islandBoxes.get(id);
    if (b !== undefined) placeBox(el, b);
  };

  // ── the page's stand-in for the app: a value read is the app's (followed from the
  // worker once asked for, and tracked by the page's runtime when it handed over
  // externalValue); a value written goes to the app ──
  const known = new Map<string, unknown>();
  const facts = new Map<string, { get(): unknown; set(v: unknown): void }>();
  const plainValue = <T,>(v: T) => { let x = v; return { get: () => x, set: (n: T) => { x = n; } }; };
  const fact = (name: string): { get(): unknown; set(v: unknown): void } => {
    let f = facts.get(name);
    if (f === undefined) {
      f = (cfg.externalValue ?? plainValue)(known.get(name)) as { get(): unknown; set(v: unknown): void };
      facts.set(name, f);
      post({ t: "app-watch", name });
    }
    return f;
  };
  // a later change to what the page provides (the tenant handle's provide, below)
  const provide = (name: string, v: unknown): void => post({ t: "provide", name, v });
  const standIn = new Proxy({} as Record<string, unknown>, {
    get: (_t, name) => typeof name !== "string" || name === "then" ? undefined : fact(name).get(),
    set: (_t, name, v) => { if (typeof name !== "string") return false; fact(name).set(v); post({ t: "app-set", name, v }); return true; },
  });
  let resolveReady: (v: unknown) => void = () => {};
  const ready = new Promise<unknown>((r) => { resolveReady = r; });
  const onMessage = (e: MessageEvent<Msg>) => {
    if (media(e.data)) return;
    const m = e.data;
    switch (m.t) {
      case "ready":
        if (!embedded && typeof m.title === "string" && m.title !== "") doc.title = m.title;
        for (const [k, v] of Object.entries((m.values ?? {}) as Record<string, unknown>)) known.set(k, v);
        if (embedded) (box as HTMLElement & { __declareApp?: unknown }).__declareApp = standIn;
        {
          // the page's handle on the app, as host-client's: the app's values through
          // the stand-in, the verbs as messages to the worker
          const tenant = Object.freeze({
            app: standIn,
            post: (topic: string, payload?: unknown) => post({ t: "host-post", topic: String(topic), payload }),
            provide,
            exposed: (name: string, ...dflt: unknown[]) => { const v = standIn[name]; return v === undefined && dflt.length > 0 ? dflt[0] : v; },
          });
          (box as HTMLElement & { __declareTenant?: unknown }).__declareTenant = tenant;
          resolveReady(tenant);
        }
        {
          // the startup timeline, ms from navigation: the boot handing over, then the worker's milestones
          const rel = (t: number) => +(t - performance.timeOrigin).toFixed(1);
          const marks = Object.fromEntries(Object.entries({ shell: shellStart, ...(m.marks as Record<string, number>) }).map(([k, v]) => [k, rel(v)]));
          (window as unknown as { __declareGpu?: unknown }).__declareGpu = { ready: true, ms: m.ms, marks, worker, compositor };
        }
        return;
      case "error": {
        console.error("[gpu] " + m.msg);
        const w = window as unknown as { __declareGpuErrors?: string[] };
        (w.__declareGpuErrors ??= []).push(String(m.msg));
        return;
      }
      case "probe": (window as unknown as { __declareGpuProbe?: unknown }).__declareGpuProbe = m.nodes; return;
      case "stats": (window as unknown as { __declareGpuStats?: unknown }).__declareGpuStats = m; return;
      case "fonts":
        for (const [family, url] of m.faces as [string, string][]) {
          const key = family + url;
          if (faces.has(key)) continue;
          faces.add(key);
          const italic = /Italic/.test(url);
          const f = new FontFace(family, `url(${url})`, { style: italic ? "italic" : "normal", weight: "100 900" });
          f.load().then(() => doc.fonts.add(f)).catch(() => {});
        }
        return;
      case "cursor": canvas.style.cursor = (m.c as string) || ""; return;
      case "page-map": {
        pageMap = m.map as typeof pageMap;
        (window as unknown as { __declareGpuPageMap?: unknown }).__declareGpuPageMap = pageMap;   // for the tools
        strut.style.height = `${Math.round(pageMap.h)}px`;
        return;
      }
      case "page-scroll-to": scrollTo({ top: m.y as number, behavior: (m.ms as number) > 0 ? "smooth" : "instant" }); return;
      case "page-fill": {
        const c = m.c as number | null;
        (embedded ? box : doc.body).style.background = c === null ? "" : `rgba(${c >>> 24},${(c >>> 16) & 255},${(c >>> 8) & 255},${(c & 255) / 255})`;
        return;
      }
      case "title": if (!embedded) doc.title = m.s as string; return;
      case "app-val": fact(m.name as string).set(m.v); return;
      // an AppIsland's program, compiled here for the worker that mounts it
      case "compile-island": {
        const req = m.req as number;
        const done = (result: unknown) => post({ t: "island-program", req, result });
        if (cfg.island === undefined) { done(null); return; }
        compileIsland(cfg.island, m.url as string).then(done, () => done(null));
        return;
      }
      // a program's navigation verbs, carried out by the page (host-client's navServices)
      case "navigate":
        if (cfg.onNavigate !== undefined) cfg.onNavigate(navigationOf(m.url as string, m.newWindow === true));
        else if (m.newWindow === true) window.open(m.url as string, "_blank"); else location.href = m.url as string;
        return;
      // the app's postToHost, to a page that listens (boot({ onPost }))
      case "tenant-post":
        if (cfg.onPost !== undefined) cfg.onPost({ topic: m.topic as string, payload: m.payload });
        else console.warn(`[Declare] app.postToHost("${m.topic as string}"): the page passed no onPost to boot() — message dropped`);
        return;
      case "places": try { sessionStorage.setItem(PLACES, JSON.stringify(m.places)); } catch { /* storage refused: in-page Back still works */ } return;
      case "island": {
        const id = m.id as number, slot = m.slot as string;
        islands.get(id)?.el.remove(); islands.delete(id);
        if (slot !== "") openIsland(id, slot, (m.provides ?? []) as string[]);
        return;
      }
      case "island-box": {
        // kept: the box can come before the island's element is made
        islandBoxes.set(m.id as number, m.box as Box);
        const isl = islands.get(m.id as number);
        if (isl !== undefined) placeBox(isl.el, m.box as Box);
        return;
      }
      case "island-provided": {
        const isl = islands.get(m.id as number);
        if (isl === undefined) return;
        isl.values.set(m.name as string, m.v);
        for (const [n, cb] of isl.watchers) if (n === m.name) cb(m.v);
        return;
      }
      case "island-msg": {
        const isl = islands.get(m.id as number);
        for (const cb of isl?.posts ?? []) cb({ topic: m.topic as string, payload: m.payload });
        return;
      }
      case "history": {
        // the page's own path and query, never a bare fragment (a <base> would mislead it)
        const url = location.pathname + location.search + (m.frag as string);
        if (m.verb === "push") history.pushState(m.state, "", url); else history.replaceState(m.state, "", url);
        return;
      }
      case "edit": {
        const id = m.id as number;
        const spec = m.spec as EditSpec | null | undefined;
        if (spec === null) { hideField(id); fields.delete(id); return; }
        let f = fields.get(id);
        if (spec !== undefined) {
          if (f === undefined) { f = { spec, box: null, el: null }; fields.set(id, f); }
          const kind = f.el !== null && (f.el instanceof HTMLTextAreaElement) !== spec.multiline;
          f.spec = spec;
          if (kind) { const had = doc.activeElement === f.el; hideField(id); if (had) showField(id, f).focus({ preventScroll: true }); }
          else if (f.el !== null) styleField(f.el, spec);
        }
        const box = m.box as Box | null | undefined;
        if (f !== undefined && box != null) { f.box = box; if (f.el !== null) placeBox(f.el, box); }
        return;
      }
      case "edit-focus": {
        const id = m.id as number, f = fields.get(id);
        if (f === undefined) return;
        if (m.on === true) { const el = showField(id, f); if (doc.activeElement !== el) el.focus({ preventScroll: true }); }
        else if (f.el !== null) { if (doc.activeElement === f.el) f.el.blur(); else hideField(id); }
        return;
      }
      case "edit-sel": fields.get(m.id as number)?.el?.setSelectionRange(m.start as number, m.end as number); return;
    }
  };
  worker.onmessage = onMessage;
  compositor.onmessage = onMessage;
  return ready;
}
