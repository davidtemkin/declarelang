// tally.js — a FOREIGN web app: no Declare anywhere in this file. It is
// mounted (by index.html) into the crossings app's `tally` island, and talks
// to its Declare host exclusively through the island element's one sanctioned
// handle, `box.__declareIsland` (guide ch. 18):
//
//   h.externals()        discovery — the typed surface the HOST declared
//   h.get(name)          read a fact's current value
//   h.observe(name, cb)  change notifications, one per settle the fact moved
//                        (changes only — read the initial value with get())
//   h.set(name, value)   push a fact the TENANT owns; the value is VALIDATED
//                        against the declared type, and a push to a slot the
//                        host binds is refused with the constraint named
//   h.post(topic, data)  a verb up to the island's onPost
//   h.onPost(cb)         verbs down from the host's island.post(...)
//
// This tenant IMPORTS `hue` (host-owned — it recolors everything here) and
// OWNS `count` (declared `external readonly` on the host side: the host reads,
// never writes). Every tap pushes the new count; the host's gauge, caption,
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

  // ---- facts IN: the host owns `hue`, we follow it ----------------------
  // observe() reports CHANGES (once per settle); the value at mount time is
  // read with get(). Both together are the complete "follow a fact" idiom.

  const paint = (hue) => {
    btn.style.background = `hsl(${hue} 62% 45%)`;
    num.style.color = `hsl(${hue} 70% 70%)`;
  };
  paint(h.get("hue"));
  h.observe("hue", paint);

  // ---- facts OUT: we own `count`, the host derives from it --------------
  // set() is a typed, validated push: the host declared `count: number`, so
  // pushing a string here would be refused with the type named. And had the
  // host BOUND the slot (as it binds `hue`), the push would be refused with
  // the owning constraint named — try h.set("hue", 0) in the console.

  const show = () => { num.textContent = String(count); };
  const push = () => {
    h.set("count", count);
    if (count > 0 && count % 10 === 0) {
      // a VERB, not a fact: "a milestone happened" is an event to consume
      // once, so it crosses as post() rather than as another external.
      h.post("milestone", count);
    }
  };
  show();

  btn.addEventListener("click", () => {
    count += 1;
    show();
    push();
  });

  // ---- verbs IN: the host's reset button posts down to us ---------------
  // The host cannot write `count` (it declared it readonly for itself), so
  // "reset" arrives as a COMMAND and the tenant applies it to its own state.

  h.onPost((m) => {
    if (m.topic === "reset") {
      count = 0;
      show();
      h.set("count", 0);
    }
  });
}
