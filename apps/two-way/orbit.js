// orbit.js — the second FOREIGN tenant: a <canvas> animation with its own
// requestAnimationFrame clock, its own native <input type=range>, no Declare
// in the file. It rides the same bridge as tally.js (box.__declareIsland),
// and its surface shows the full triangle of the demo:
//
//   hue    host-owned   (bound to the master slider) — recolors the dots
//   dots   host-owned   — but bound to `app.tally.count`, the OTHER tenant's
//                        fact: a value that left one foreign app, crossed into
//                        Declare, and arrives here pushed by a constraint.
//                        This file cannot tell and does not care — it just
//                        follows a number.
//   speed  tenant-owned (`external readonly` host-side) — our range input
//                        pushes it up; the host's caption derives from it.
//
// Verbs: "reset" arrives from the host's button (speed back to 1); a
// double-click on the canvas posts "burst" up, which the host writes into its
// log line — commands in both directions, beside the facts.

export function mountOrbit(box) {
  const h = box.__declareIsland;

  // ---- our world: a canvas and a native control -------------------------

  let hue = h.get("hue");     // initial values by get(); changes by observe()
  let dots = h.get("dots");
  let speed = 1;
  let angle = 0;

  const root = document.createElement("div");
  root.style.cssText =
    "height:100%;display:flex;flex-direction:column;" +
    "font:12px/1.4 -apple-system,'Segoe UI',sans-serif;color:#6C7683";

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "flex:1;width:100%;min-height:0";

  const bar = document.createElement("label");
  bar.style.cssText = "display:flex;align-items:center;gap:10px;padding:10px 16px";
  const range = document.createElement("input");
  range.type = "range";
  range.min = "0";
  range.max = "4";
  range.step = "0.1";
  range.value = "1";
  range.style.flex = "1";
  const out = document.createElement("span");
  bar.append("speed", range, out);

  root.append(canvas, bar);
  box.append(root);

  // ---- facts IN ---------------------------------------------------------
  // Both hue and dots are host-bound; we follow them. Note that a change to
  // dots is REALLY a tap in tally.js next door — two app boundaries away.

  h.observe("hue", (v) => { hue = v; });
  h.observe("dots", (v) => { dots = v; });

  // ---- a fact OUT -------------------------------------------------------
  // The range input is this app's own control; each input event pushes the
  // tenant-owned `speed` up to the host, where it is an ordinary reactive
  // value (`app.orbit.speed` in a Text constraint).

  const showSpeed = () => { out.textContent = speed.toFixed(1) + "×"; };
  showSpeed();
  range.addEventListener("input", () => {
    speed = Number(range.value);
    showSpeed();
    h.set("speed", speed);
  });

  // ---- verbs, both ways -------------------------------------------------

  h.onPost((m) => {
    if (m.topic === "reset") {
      speed = 1;
      range.value = "1";
      showSpeed();
      h.set("speed", 1);
    }
  });
  canvas.addEventListener("dblclick", () => h.post("burst", dots));

  // ---- the tenant's own clock -------------------------------------------
  // The interior is ours, clock included: the host neither sees nor schedules
  // these frames. (Politeness: stand down while the page is hidden.)

  const ctx = canvas.getContext("2d");
  function frame() {
    if (document.hidden) return;    // resumed by visibilitychange below
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    if (canvas.width !== w * devicePixelRatio) {
      canvas.width = w * devicePixelRatio;
      canvas.height = hgt * devicePixelRatio;
    }
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    angle += 0.01 * speed;
    const cx = w / 2, cy = hgt / 2, R = Math.min(w, hgt) * 0.38;
    for (let i = 0; i < dots; i++) {
      const a = angle + (i / Math.max(dots, 1)) * Math.PI * 2;
      const r = R * (0.35 + 0.65 * ((i * 7919) % 97) / 97);
      ctx.beginPath();
      ctx.arc(cx + r * Math.cos(a * (1 + (i % 3) * 0.1)), cy + r * Math.sin(a * (1 + (i % 3) * 0.1)), 4, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${(hue + i * 5) % 360} 62% ${45 + (i % 4) * 8}%)`;
      ctx.fill();
    }
    if (dots === 0) {
      ctx.fillStyle = "#46505C";
      ctx.font = "12px -apple-system, 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("tap in TALLY to add dots here", cx, cy);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) requestAnimationFrame(frame);
  });
}
