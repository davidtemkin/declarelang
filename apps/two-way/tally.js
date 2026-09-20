// tally.js — a FOREIGN web app: no Declare anywhere in this file. It is
// mounted (by index.html) into the crossings app's `tally` island, and talks
// to its Declare host exclusively through the island element's one sanctioned
// handle, `box.__declareIsland` (guide ch. 18):
//
//   h.provides()              discovery — the names the host provides here
//   h.hostProvided(name)      read a provided value now
//   h.watchProvided(name, cb) cb(value) now, then once per settle it changes
//   h.expose(name, value)     offer a value UP — the host reads it with
//                             island.exposed(name, default)
//   h.post(topic, data)       a verb up to the island's onPost
//   h.onPost(cb)              verbs down from the host's island.post(...)
//
// This tenant FOLLOWS `hue` (the host provides it — it recolors everything
// here) and EXPOSES `count` (the host reads it, and cannot write it: a
// provided value and an exposed one each have one owner). Every tap exposes
// the new count; the host's gauge, caption,
// and even the OTHER tenant's dots re-derive from it by constraint.

export function mountTally(box) {
  const h = box.__declareIsland;

  // ---- the tenant's own little world: plain DOM, its own state ----------
  // The host sizes and positions the box; everything INSIDE it is ours.

  let count = 0;

  const root = document.createElement("div");
  root.style.cssText =
    "height:100%;display:flex;flex-direction:column;align-items:center;" +
    "justify-content:center;gap:14px;font:14px/1.4 -apple-system,'Segoe UI',sans-serif;" +
    "color:#E7EEF2;user-select:none";

  const num = document.createElement("div");
  num.style.cssText = "font-size:56px;font-weight:700;letter-spacing:1px";

  const btn = document.createElement("button");
  btn.textContent = "TAP";
  btn.style.cssText =
    "font:inherit;font-weight:600;letter-spacing:2px;color:#fff;border:none;" +
    "border-radius:999px;padding:14px 44px;cursor:pointer";

  const note = document.createElement("div");
  note.style.cssText = "font-size:11px;color:#6C7683;text-align:center;max-width:26em";
  note.textContent = "every 10th tap also POSTS a milestone verb up to the host";

  root.append(num, btn, note);
  box.append(root);

  // ---- values IN: the host provides `hue`, we follow it -----------------
  // watchProvided() calls back with the value now and on every change —
  // the whole "follow a value" idiom in one call.

  const paint = (hue) => {
    btn.style.background = `hsl(${hue} 62% 45%)`;
    num.style.color = `hsl(${hue} 70% 70%)`;
  };
  h.watchProvided("hue", paint);

  // ---- values OUT: we own `count`, the host derives from it -------------
  // expose() hands the value up; the host reads it with a typed default
  // (`exposed("count", 0)`), so exposing a string here would be refused
  // there with a warning and the default used.

  const show = () => { num.textContent = String(count); };
  const push = () => {
    h.expose("count", count);
    if (count > 0 && count % 10 === 0) {
      // a VERB, not a fact: "a milestone happened" is an event to consume
      // once, so it crosses as post() rather than as another exposed value.
      h.post("milestone", count);
    }
  };
  show();
  h.expose("count", count);

  btn.addEventListener("click", () => {
    count += 1;
    show();
    push();
  });

  // ---- verbs IN: the host's reset button posts down to us ---------------
  // The host cannot write `count` (it only reads what we expose), so
  // "reset" arrives as a COMMAND and the tenant applies it to its own state.

  h.onPost((m) => {
    if (m.topic === "reset") {
      count = 0;
      show();
      h.expose("count", 0);
    }
  });
}
