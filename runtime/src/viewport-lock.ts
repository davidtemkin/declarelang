// The focus-zoom lock — Rule 3's full-gesture-control clause, shared by both
// backends (dom-backend.ts / canvas-backend.ts attachRoot).
//
// iOS has one zoom nobody asks for: focus a text field whose text is smaller
// than 16px and Safari zooms the page toward it (factor = 16 ÷ fontSize,
// measured), then zooms back on blur. For an ordinary app that behavior
// stands — the compiler flags the sub-16px field instead (compile.ts). But an
// app that claimed every finger (the App declares the raw touch family) runs
// its own gesture arithmetic, and a browser zoom arriving mid-gesture would
// shear every coordinate its engine integrates. So while such an app holds
// focus in a native field, the viewport meta is rewritten to carry
// `maximum-scale=1` — which suppresses exactly the focus auto-zoom — and
// restored on blur.
//
// Measured facts this leans on (2026-07-27, iOS 18.2, logged in
// tools/internal/measure/results.jsonl):
//   - rewriting the viewport meta works LIVE, no reload;
//   - `maximum-scale=1` suppresses the focus auto-zoom (keyboard confirmed up);
//   - the user's own deliberate pinch SURVIVES the lock (broke through to
//     scale 1.51 under maximum-scale=1) — so this lock never disarms the
//     user, it only stills the zoom nobody asked for.

/** While an editable inside `scope` holds focus, hold the viewport still
 *  (suppress iOS's focus auto-zoom); release on blur. Listener lifetime
 *  follows `alive` — the same self-retiring discipline as routeInput. */
export function lockFocusZoom(scope: HTMLElement, alive: () => boolean): void {
  if (typeof document === "undefined") return;
  const doc = scope.ownerDocument;
  // The pre-lock state: the meta element and its original content ("" when the
  // page had none — then the lock creates one and removes it on release).
  let saved: { el: HTMLMetaElement; content: string; created: boolean } | null = null;
  const lock = (): void => {
    if (saved !== null) return;
    let el = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const created = el === null;
    if (el === null) {
      el = doc.createElement("meta");
      el.name = "viewport";
      doc.head.appendChild(el);
    }
    const content = el.content;
    saved = { el, content, created };
    const kept = content.split(",").map((s) => s.trim()).filter((s) => s !== "" && !s.startsWith("maximum-scale"));
    if (kept.length === 0) kept.push("width=device-width", "initial-scale=1");
    el.content = [...kept, "maximum-scale=1"].join(", ");
  };
  const unlock = (): void => {
    if (saved === null) return;
    if (saved.created) saved.el.remove();
    else saved.el.content = saved.content;
    saved = null;
  };
  const editable = (t: EventTarget | null): boolean =>
    t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  const listen = (type: "focusin" | "focusout", handle: (e: FocusEvent) => void): void => {
    const listener = (e: Event): void => {
      if (!alive()) {
        scope.removeEventListener(type, listener);
        unlock();
        return;
      }
      handle(e as FocusEvent);
    };
    scope.addEventListener(type, listener);
  };
  listen("focusin", (e) => {
    if (editable(e.target)) lock();
  });
  listen("focusout", (e) => {
    // Focus moving from one field to another fires out→in back-to-back;
    // relatedTarget names the destination, so a field-to-field move keeps the
    // lock and only a true departure releases it.
    if (editable(e.target) && !editable(e.relatedTarget)) unlock();
  });
}
