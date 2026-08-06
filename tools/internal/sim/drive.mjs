// tools/internal/sim/drive.mjs — the iOS-simulator gesture rig (DIAG-adjacent
// tooling, keep). Drives real Safari on a booted simulator through Appium's
// XCUITest driver: synthesized touches enter through iOS's own event system,
// so WebKit sees genuine fingers — pinch/spread arbitration included, which
// no desktop emulation reproduces. Pair with the probe (?probe pages POST
// what the page ACTUALLY saw to /__probe) for closed-loop gesture tests.
//
//   node drive.mjs <sessionId> <command> [args...]
//
// Getting a session (2026-08-06 recipe, validated):
//   xcrun simctl boot <udid> && open -a Simulator
//   (cd tools/internal/sim && npx appium server -p 4723 &)
//   curl -s -X POST http://127.0.0.1:4723/session -H 'content-type: application/json' -d '{
//     "capabilities":{"alwaysMatch":{"platformName":"iOS",
//       "appium:automationName":"XCUITest","browserName":"Safari",
//       "appium:udid":"<udid>","appium:newCommandTimeout":900}}}'
//   → value.sessionId. Default newCommandTimeout is 60s — a thinking pause
//   kills the session; set 900.
//
// COORDINATES: these commands speak native screen points; Safari's web
// content sits BELOW the browser chrome — measured 2026-08-06 (iPhone 16
// Pro, portrait): to hit page point (x, y), send (x, y + 62). Calibrate a
// new device/orientation with ?probe: a hold anywhere logs its landing
// `ts` point (clientX/Y) to probe.jsonl; offset = sent y − logged y.
//
// MULTITOUCH: `mobile: pinch` never reached the web view here (all-zero
// counters on a full-claim page). What works is W3C actions — two pointer
// input sources, POST /session/<sid>/actions, staggered pauses/lifts as
// needed. See the lab pages: touchlab.declare (zones: touch-family pad,
// hold-gated chip in a scrolls pane) and touchlab-full.declare (App-level
// full claim); both surface their counters on screen, so a screenshot IS
// the assertion.
//
// THE FULL REGRESSION: node regress.mjs <sessionId> — every measured gesture
// contract (labs + homepage pack) as one repeatable pass/fail run; its header
// documents the synthesis quirks (humanized double-taps, the clearing tap
// after holds) the hard way taught us.
//
// Commands:
//   go <url>                      — navigate Safari
//   swipe <x1> <y1> <x2> <y2> [ms=120]   — one-finger drag (screen points)
//   pinch <scale> [velocity]      — on the app element: <1 pinch, >1 spread
//   hold <x> <y> [seconds=0.8]    — touch and hold
//   holddrag <x> <y> <x2> <y2> [holdSec=0.8]  — hold then drag (tap-hold drags)
//   tap <x> <y>
//   shot <file.png>               — screenshot
//   source                        — native window size sanity
const [sid, cmd, ...args] = process.argv.slice(2);
const A = `http://127.0.0.1:4723/session/${sid}`;

async function post(path, body) {
  const r = await fetch(A + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json();
  if (j.value && j.value.error) throw new Error(`${j.value.error}: ${j.value.message}`);
  return j.value;
}
const native = (script, a) => post("/execute/sync", { script, args: [a] });

const n = (v, d) => (v === undefined ? d : Number(v));

switch (cmd) {
  case "go":
    await post("/url", { url: args[0] });
    console.log("ok");
    break;
  case "swipe":
    await native("mobile: dragFromToForDuration", {
      fromX: n(args[0]), fromY: n(args[1]), toX: n(args[2]), toY: n(args[3]),
      duration: n(args[4], 120) / 1000,
    });
    console.log("ok");
    break;
  case "pinch": {
    // a Safari session lives in the WEB context; the element the pinch needs
    // is native, so hop to NATIVE_APP, find the app element, pinch, hop back
    const ctx = await (await fetch(A + "/context")).json();
    await post("/context", { name: "NATIVE_APP" });
    try {
      const el = await post("/element", { using: "class name", value: "XCUIElementTypeApplication" });
      const id = el.ELEMENT ?? el["element-6066-11e4-a52e-4f735466cecf"];
      await native("mobile: pinch", { elementId: id, scale: n(args[0]), velocity: n(args[1], n(args[0]) > 1 ? 1.5 : -1.5) });
    } finally {
      await post("/context", { name: ctx.value });
    }
    console.log("ok");
    break;
  }
  case "hold":
    await native("mobile: touchAndHold", { x: n(args[0]), y: n(args[1]), duration: n(args[2], 0.8) });
    console.log("ok");
    break;
  case "holddrag":
    // press, dwell past the hold window, then move — the tap-hold drag shape
    await native("mobile: dragFromToWithVelocity", {
      fromX: n(args[0]), fromY: n(args[1]), toX: n(args[2]), toY: n(args[3]),
      pressDuration: n(args[4], 0.8), holdDuration: 0.1, velocity: 400,
    });
    console.log("ok");
    break;
  case "tap":
    await native("mobile: tap", { x: n(args[0]), y: n(args[1]) });
    console.log("ok");
    break;
  case "shot": {
    const b64 = await (await fetch(A + "/screenshot")).json();
    const { writeFileSync } = await import("node:fs");
    writeFileSync(args[0], Buffer.from(b64.value, "base64"));
    console.log(args[0]);
    break;
  }
  case "source": {
    const r = await (await fetch(A + "/window/rect")).json();
    console.log(JSON.stringify(r.value));
    break;
  }
  case "orient": {
    // PORTRAIT | LANDSCAPE — rotates the simulator on the fly
    await post("/orientation", { orientation: (args[0] || "PORTRAIT").toUpperCase() });
    console.log("ok");
    break;
  }
  default:
    console.error("unknown command", cmd);
    process.exit(1);
}
