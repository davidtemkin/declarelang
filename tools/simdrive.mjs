// simdrive — drive a Declare app running in the iOS Simulator, from here, with
// no mouse and without bringing the Simulator window to the front.
//
// THE SHAPE. A proxy in front of the dev server injects one agent script into
// every HTML response; the agent long-polls this process for JS to run and
// posts the result back. So `simdrive eval '…'` executes inside REAL iOS
// WebKit — reading computed styles, live view state, and the app's own
// attributes — over the same origin the app is served from. `simctl openurl`
// points the device at it, `simctl io screenshot` reads the pixels back.
// Nothing touches the host cursor and nothing gets activated.
//
// WHAT IT CAN AND CANNOT DRIVE — the distinction that matters, because the
// touch bugs of 2026-07 lived on the far side of it:
//
//   SYNTHETIC (this file's `gesture`): arbitrary fingers, arbitrary paths,
//   arbitrary timing, every permutation. Dispatched as PointerEvents AND
//   TouchEvents in the real spec order, so both backends' listeners see what
//   they see on a device. These events carry `isTrusted: false`: they drive
//   DECLARE's own routing — the click rule, hold gating, `pressed`/`hovered`,
//   the raw touch family, an app's gesture physics — and nothing of WebKit's.
//   The browser will not scroll, zoom, select, or raise a callout for them,
//   and `preventDefault()` on them is inert.
//
//   TRUSTED (the Simulator's own digitizer): what WebKit actually arbitrates —
//   pan vs. select, the long-press callout, momentum, pinch-zoom. The
//   Simulator's input layer tops out at TWO contacts
//   (SimulatorKit `SimDigitizerInputView.TouchEvent` carries exactly `touch1`
//   and `touch2`), and the pair is coupled by its gesture model — pinch about
//   a pivot, or a parallel two-finger pan. Three independent fingers do not
//   exist on the Simulator at any layer. Reaching them means a real device.
//
// So: assert Declare's behaviour synthetically here, and confirm the browser's
// half by screenshot. Do not read a passing synthetic gesture as evidence that
// the page scrolls.
//
//   node tools/simdrive.mjs serve --target http://127.0.0.1:8291 [--port 8399]
//   node tools/simdrive.mjs open [path]          # simctl openurl → the proxy
//   node tools/simdrive.mjs eval '<js>'          # run in the page, print result
//   node tools/simdrive.mjs shot out.png
//   node tools/simdrive.mjs gesture '<json>'     # frames → a finger stream

import http from "node:http";
import { execFileSync } from "node:child_process";

const PORT = Number(argOf("--port") ?? 8399);
const TARGET = argOf("--target") ?? "http://127.0.0.1:8291";

function argOf(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

// ── the in-page agent ────────────────────────────────────────────────────────
// Kept as a string (not a file) so the whole rig is one module. It installs
// `window.__drive`, unregisters any service worker (a stale SW under a new
// origin is the one thing that makes these runs non-reproducible), and polls.

const AGENT = `
(() => {
  if (window.__drive) return;
  navigator.serviceWorker?.getRegistrations?.().then(rs => rs.forEach(r => r.unregister())).catch(() => {});

  const at = (x, y) => document.elementFromPoint(x, y) ?? document.body;

  // A Touch, however this engine lets us build one. Safari carried
  // document.createTouch long after the constructor landed; probe, don't assume.
  const makeTouch = (id, x, y, target) => {
    try {
      return new Touch({ identifier: id, target, clientX: x, clientY: y,
        pageX: x + scrollX, pageY: y + scrollY, screenX: x, screenY: y,
        radiusX: 11, radiusY: 11, rotationAngle: 0, force: 1 });
    } catch (e) {
      return document.createTouch(window, target, id, x, y, x, y);
    }
  };
  const makeTouchList = (touches) => {
    try { return touches; } catch (e) { return document.createTouchList(...touches); }
  };
  const fireTouch = (type, target, touches, changed) => {
    const targetTouches = touches.filter(t => t.target === target);
    let ev;
    try {
      ev = new TouchEvent(type, { touches: makeTouchList(touches),
        targetTouches: makeTouchList(targetTouches), changedTouches: makeTouchList(changed),
        bubbles: true, cancelable: true, composed: true, view: window });
    } catch (e) {
      ev = document.createEvent("TouchEvent");
      ev.initTouchEvent(type, true, true, window, null, 0, 0, 0, 0, false, false, false, false,
        makeTouchList(touches), makeTouchList(targetTouches), makeTouchList(changed), 1, 0);
    }
    return target.dispatchEvent(ev);
  };
  const firePointer = (type, target, f, primary) => {
    const ev = new PointerEvent(type, {
      pointerId: f.id, pointerType: "touch", isPrimary: primary,
      clientX: f.x, clientY: f.y, screenX: f.x, screenY: f.y,
      width: 22, height: 22, pressure: type === "pointerup" ? 0 : 1,
      button: type === "pointermove" ? -1 : 0, buttons: type === "pointerup" ? 0 : 1,
      bubbles: true, cancelable: true, composed: true, view: window });
    return target.dispatchEvent(ev);
  };

  // Frame-based: each frame is the COMPLETE set of live fingers. The driver
  // diffs consecutive frames — a finger that appears is a down, one that
  // vanishes is an up, the rest are moves — so callers describe positions and
  // never bookkeep phases. Pointer events lead touch events, the spec order.
  const gesture = async (frames) => {
    let prev = [];
    const targets = new Map();          // a finger's target is fixed at its down
    let last = 0;
    for (const frame of frames) {
      const fingers = frame.fingers ?? [];
      const t = frame.t ?? last;
      if (t > last) await new Promise(r => setTimeout(r, t - last));
      last = t;
      const now = new Map(fingers.map(f => [f.id, f]));
      const was = new Map(prev.map(f => [f.id, f]));
      const down = fingers.filter(f => !was.has(f.id));
      const up = prev.filter(f => !now.has(f.id));
      const moved = fingers.filter(f => { const p = was.get(f.id); return p && (p.x !== f.x || p.y !== f.y); });

      for (const f of down) targets.set(f.id, at(f.x, f.y));
      const live = () => fingers.map(f => makeTouch(f.id, f.x, f.y, targets.get(f.id)));

      for (const f of down) {
        const tg = targets.get(f.id);
        firePointer("pointerdown", tg, f, prev.length === 0);
        fireTouch("touchstart", tg, live(), [makeTouch(f.id, f.x, f.y, tg)]);
      }
      if (moved.length) {
        const tg = targets.get(moved[0].id);
        for (const f of moved) firePointer("pointermove", targets.get(f.id), f, false);
        fireTouch("touchmove", tg, live(), moved.map(f => makeTouch(f.id, f.x, f.y, targets.get(f.id))));
      }
      for (const f of up) {
        const tg = targets.get(f.id);
        const remaining = fingers.map(g => makeTouch(g.id, g.x, g.y, targets.get(g.id)));
        firePointer("pointerup", tg, f, false);
        fireTouch(frame.cancel ? "touchcancel" : "touchend", tg, remaining, [makeTouch(f.id, f.x, f.y, tg)]);
        targets.delete(f.id);
      }
      prev = fingers;
    }
    return { frames: frames.length };
  };

  window.__drive = { gesture, at,
    supports: () => {
      const probe = (fn) => { try { fn(); return true; } catch (e) { return false; } };
      return {
        TouchCtor: probe(() => new Touch({ identifier: 0, target: document.body, clientX: 0, clientY: 0 })),
        TouchEventCtor: probe(() => new TouchEvent("touchstart", {})),
        createTouch: typeof document.createTouch === "function",
        PointerEventCtor: probe(() => new PointerEvent("pointerdown", { pointerId: 1 })),
        maxTouchPoints: navigator.maxTouchPoints,
      };
    } };

  // The command channel: long-poll, run, report. Errors come back as strings so
  // a thrown expression is a result, not a hang.
  const serialize = (v) => {
    try { return JSON.parse(JSON.stringify(v ?? null)); }
    catch (e) { return String(v); }
  };
  // Safari keeps the previous page alive (another tab, or bfcache) and ITS agent
  // keeps polling — so a command could be answered by the page you just
  // navigated away from, silently, with plausible-looking results. Every agent
  // reports its load time; the broker only ever dispatches to the newest.
  const EPOCH = performance.timeOrigin;
  const loop = async () => {
    for (;;) {
      try {
        const res = await fetch(\`/__poll?epoch=\${EPOCH}&url=\${encodeURIComponent(location.pathname)}\`);
        if (res.status !== 200) { await new Promise(r => setTimeout(r, 200)); continue; }
        const cmd = await res.json();
        let out, err = null;
        try {
          out = await (0, eval)("(async () => {" + (cmd.code.includes("return") ? cmd.code : "return (" + cmd.code + ")") + "})()");
        } catch (e) { err = String(e && e.stack || e); }
        await fetch("/__result", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: cmd.id, result: serialize(out), error: err }) });
      } catch (e) { await new Promise(r => setTimeout(r, 300)); }
    }
  };
  loop();
})();
`;

// ── the proxy + command broker ───────────────────────────────────────────────

const pending = [];                    // commands waiting for the page to fetch
const waiters = new Map();             // id → the HTTP response to answer
const pollers = [];                    // parked /__poll responses
let nextId = 1;

// Only the NEWEST page load may answer. A stale tab that keeps polling is left
// parked (harmless) rather than handed a command it would answer wrongly.
function dispatch() {
  while (pending.length && pollers.length) {
    const newest = pollers.reduce((a, b) => (b.epoch > a.epoch ? b : a));
    const i = pollers.indexOf(newest);
    pollers.splice(i, 1);
    const cmd = pending.shift();
    newest.res.writeHead(200, { "content-type": "application/json" });
    newest.res.end(JSON.stringify(cmd));
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => { b += c; });
    req.on("end", () => resolve(b));
  });
}

async function serve() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === "/__drive.js") {
      res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" });
      return res.end(AGENT);
    }
    if (url.pathname === "/__poll") {
      const entry = { res, epoch: Number(url.searchParams.get("epoch") ?? 0), url: url.searchParams.get("url") ?? "?" };
      pollers.push(entry);
      req.on("close", () => { const i = pollers.indexOf(entry); if (i !== -1) pollers.splice(i, 1); });
      return dispatch();
    }
    if (url.pathname === "/__pages") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(pollers.map((p) => ({ url: p.url, epoch: p.epoch }))
        .sort((a, b) => b.epoch - a.epoch)));
    }
    if (url.pathname === "/__result") {
      const { id, result, error } = JSON.parse(await readBody(req));
      const w = waiters.get(id);
      if (w) { waiters.delete(id); w.writeHead(200, { "content-type": "application/json" }); w.end(JSON.stringify({ result, error })); }
      res.writeHead(204);
      return res.end();
    }
    if (url.pathname === "/__eval") {
      const { code } = JSON.parse(await readBody(req));
      const id = nextId++;
      waiters.set(id, res);
      pending.push({ id, code });
      dispatch();
      setTimeout(() => {
        if (!waiters.has(id)) return;
        waiters.delete(id);
        res.writeHead(504, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "no page answered — is the app open in the Simulator, through this proxy?" }));
      }, 15000);
      return;
    }

    // everything else proxies to the dev server, with the agent injected into HTML
    try {
      const upstream = await fetch(TARGET + req.url, {
        method: req.method,
        headers: { ...req.headers, host: new URL(TARGET).host, "accept-encoding": "identity" },
        body: ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req),
        redirect: "manual",
      });
      const type = upstream.headers.get("content-type") ?? "application/octet-stream";
      const headers = { "content-type": type, "cache-control": "no-store" };
      const loc = upstream.headers.get("location");
      if (loc) headers.location = loc;
      if (type.includes("text/html")) {
        let html = await upstream.text();
        const tag = `<script src="/__drive.js"></script>`;
        html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, tag + "</head>")
             : /<!doctype html>/i.test(html) ? html.replace(/<!doctype html>/i, (m) => m + "\n" + tag)
             : tag + html;
        res.writeHead(upstream.status, headers);
        return res.end(html);
      }
      res.writeHead(upstream.status, headers);
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (e) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(`simdrive: upstream ${TARGET} unreachable — ${e.message}`);
    }
  });
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`simdrive: proxying ${TARGET} → http://localhost:${PORT}`);
    console.log(`simdrive: node tools/simdrive.mjs open   # point the Simulator at it`);
  });
}

// ── the CLI verbs ────────────────────────────────────────────────────────────

async function evalInPage(code) {
  const res = await fetch(`http://127.0.0.1:${PORT}/__eval`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }),
  });
  const { result, error } = await res.json();
  if (error) { console.error(error); process.exitCode = 1; return; }
  console.log(JSON.stringify(result, null, 2));
}

const [verb, ...rest] = process.argv.slice(2).filter((a) => !a.startsWith("--") && a !== argOf("--port") && a !== argOf("--target"));

switch (verb) {
  case "serve": await serve(); break;
  case "open":
    execFileSync("xcrun", ["simctl", "openurl", "booted", `http://localhost:${PORT}${rest[0] ?? "/"}`]);
    console.log(`opened http://localhost:${PORT}${rest[0] ?? "/"} on the booted device`);
    break;
  case "shot":
    execFileSync("xcrun", ["simctl", "io", "booted", "screenshot", rest[0] ?? "shot.png"], { stdio: "ignore" });
    console.log(rest[0] ?? "shot.png");
    break;
  case "pages":
    console.log(await (await fetch(`http://127.0.0.1:${PORT}/__pages`)).text());
    break;
  case "eval": await evalInPage(rest.join(" ")); break;
  case "gesture": await evalInPage(`return __drive.gesture(${rest.join(" ")})`); break;
  default:
    console.log("usage: simdrive serve|open|eval|gesture|shot   (see the header)");
}
