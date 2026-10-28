#!/usr/bin/env node
// look — open a program in a real browser, do a few plain things, and report:
// the common checking round (open at a size, use it a little, read some values,
// take a picture) in ONE call, with no script to write.
//
// Actions run in the order they are written. Motion is run to rest after the
// page opens and after each action, so a read or a picture shows where things
// land, not a spring mid-flight (--no-settle takes them as they are). It runs
// as rung 5 of declare-verify — the same browser, server and failure reporting
// — by writing the equivalent assert script and handing it over. Anything more
// (a pinch, a timed poll, an assertion to keep) is an assert script of your
// own: `export default async ({ page, drive, expect }) => { … }`, run with
// `declare-verify app.declare --assert check.mjs`, and it stays as a test.

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HELP = `declare-look — open a Declare program in a real browser, use it, read it, picture it.

usage: declare-look app.declare [options] [actions…]

options
  --size WxH          the window, e.g. 390x844 (default 1280x800)
  --phone             a phone held upright: --size 390x844 --touch
  --touch             a touch device: a mobile viewport, and every press, drag and
                      hold below is a finger (touch events), not a mouse
  --dark              the system's dark appearance
  --console           print what the page writes to its console
  --no-settle         take each read and picture as it is, mid-motion
  --scrollbars        draw classic scrollbars (by default none are drawn, as on a
                      Mac or a phone, so a picture shows what a person there sees)

actions, run in the order written (each may repeat)
  --click PATH                 press the view at PATH
  --click-at PATH X,Y          press at (X, Y) inside it, from its top-left — a part of a
                               drawn control that is not a view of its own
  --drag PATH DX,DY            press it, move by (DX, DY) pixels, release (a finger's
                               drag under --touch: in a scroller, a scroll unless claimed)
  --press PATH [X,Y]           put the pointer down on it (at X,Y inside it) and keep it down
  --move DX,DY                 move the held pointer by (DX, DY) — then --shot, --read and
                               --semantics see the drag in progress
  --release                    let the held pointer go
  --hold PATH [MS]             press and hold it MS milliseconds (default 600), release —
                               what onHold answers
  --wheel PATH DY              turn the wheel over it by DY pixels (negative: up)
  --pinch PATH SCALE           pinch it to SCALE (2: spread twice as far apart, 0.5: drawn
                               together). Under --touch, two fingers: onPinch runs.
                               Otherwise a trackpad pinch: onWheel runs, with e.pinch true
  --type TEXT                  type TEXT into whatever has the focus (--click a field first)
  --key NAME                   press a key: Enter, Escape, Tab, ArrowDown, Backspace, …; a chord with +: Shift+Tab, Meta+A
  --wait MS                    let MS milliseconds pass
  --read PATH.ATTR             print PATH's attribute: app.list.scrollY = 240 (or any
                               property past it: app.col.childViews.length)
  --call PATH.METHOD(ARGS)     call a method, its arguments as JSON: --call 'app.preset(14)'
  --set PATH.ATTR=VALUE        write an attribute, the value as JSON or else a string:
                               --set app.formOpen=true
  --semantics                  print what a screen reader is given: the semantic tree
  --js EXPRESSION              evaluate a JavaScript expression in the page and print
                               what it returns (awaited, as JSON) — for what the options
                               above do not ask: document.activeElement.id, a computed style
  --requests                   print the requests the program has sent so far — its
                               data sources and streams: method, path, body, status
                               (roles, names, values, states, actions), as it stands then
  --url ADDRESS                look at the app where it is served — a dev server's address
                               (http://127.0.0.1:8200/my-apps/shop/shop.declare) — rather
                               than a copy hosted for the look: its own origin, its own
                               service. The program file may then be left out
  --shot FILE.png              save a picture of the window
  --shot-of PATH FILE.png      save a picture of one view only — its box, as seen: a
                               smaller picture to read than the whole window

PATH names a view by where it sits in the program: the App is "app", and each
named child adds its name — app.sidebar.list, app.toolbar.save. A replicated
row is its index: app.list.3. A view can also be named by what it says — its label,
its accessible name or its text: app.tabs.Settings, app.menu."Save As…". (declare-verify's introspection, find() and
inspect(), takes the same paths.)

examples
  declare-look app.declare --size 390x844 --shot phone.png
  declare-look app.declare --click app.toolbar.new --type "Buy milk" --key Enter --read app.items.count
  declare-look app.declare --drag app.board.card1 120,0 --shot moved.png
  declare-look app.declare --wheel app.list 2000 --read app.list.scrollY --shot scrolled.png
  declare-look app.declare --click app.toolbar.new --semantics
  declare-look --url http://127.0.0.1:8200/my-apps/shop/shop.declare --size 390x844 --shot served.png`;

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); process.exit(0); }
// --url: the app where it is served (a dev server) rather than a copy hosted for
// the look; a program file is then optional (its source is not what is looked at)
const urlAt = argv.indexOf("--url");
const url = urlAt >= 0 ? argv[urlAt + 1] : undefined;
let file = argv.find((a) => a.endsWith(".declare") && !/^[a-z]+:\/\//i.test(a));
if (file === undefined && url === undefined) { console.error(HELP); process.exit(2); }

const fail = (msg) => { console.error(`declare-look: ${msg}`); process.exit(2); };
let size, touch = false, dark = false, consoleOut = false, settle = true, scrollbars = false;
const actions = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const arg = () => { if (i + 1 >= argv.length) fail(`${a} needs a value — see --help`); return argv[++i]; };
  if (a === file) continue;
  else if (a === "--url") arg();
  else if (a === "--size") size = arg();
  else if (a === "--touch") touch = true;
  else if (a === "--phone") { size = "390x844"; touch = true; }
  else if (a === "--dark") dark = true;
  else if (a === "--console") consoleOut = true;
  else if (a === "--no-settle") settle = false;
  else if (a === "--scrollbars") scrollbars = true;
  else if (a === "--click") actions.push({ kind: "click", path: arg() });
  else if (a === "--click-at") {
    const path = arg(), at = arg().split(",").map(Number);
    if (at.length !== 2 || at.some((n) => !Number.isFinite(n))) fail(`--click-at ${path} ${argv[i]}: write the point as X,Y inside the view, e.g. 40,12`);
    actions.push({ kind: "clickAt", path, x: at[0], y: at[1] });
  }
  else if (a === "--press") {
    const path = arg(), next = argv[i + 1];
    const at = next !== undefined && /^-?[\d.]+,-?[\d.]+$/.test(next) ? arg().split(",").map(Number) : null;
    actions.push({ kind: "press", path, x: at?.[0], y: at?.[1] });
  } else if (a === "--move") {
    const by = arg().split(",").map(Number);
    if (by.length !== 2 || by.some((n) => !Number.isFinite(n))) fail(`--move ${argv[i]}: write the movement as DX,DY, e.g. 120,0`);
    actions.push({ kind: "move", dx: by[0], dy: by[1] });
  } else if (a === "--release") actions.push({ kind: "release" });
  else if (a === "--drag") {
    const path = arg(), by = arg().split(",").map(Number);
    if (by.length !== 2 || by.some((n) => !Number.isFinite(n))) fail(`--drag ${path} ${argv[i]}: write the movement as DX,DY, e.g. 120,0`);
    actions.push({ kind: "drag", path, dx: by[0], dy: by[1] });
  } else if (a === "--wheel") {
    const path = arg(), dy = Number(arg());
    if (!Number.isFinite(dy)) fail(`--wheel ${path} ${argv[i]}: write the distance in pixels, e.g. 600`);
    actions.push({ kind: "wheel", path, dy });
  } else if (a === "--hold") {
    const path = arg();
    const ms = argv[i + 1] !== undefined && /^\d+$/.test(argv[i + 1]) ? Number(arg()) : 600;
    actions.push({ kind: "hold", path, ms });
  } else if (a === "--pinch") {
    const path = arg(), scale = Number(arg());
    if (!(scale > 0)) fail(`--pinch ${path} ${argv[i]}: write the scale, e.g. 2 to spread or 0.5 to draw together`);
    actions.push({ kind: "pinch", path, scale });
  } else if (a === "--type") actions.push({ kind: "type", text: arg() });
  else if (a === "--key") actions.push({ kind: "key", name: arg() });
  else if (a === "--wait") {
    const ms = Number(arg());
    if (!(ms >= 0)) fail(`--wait ${argv[i]}: write milliseconds, e.g. 500`);
    actions.push({ kind: "wait", ms });
  } else if (a === "--read") {
    const pa = arg(), k = pa.lastIndexOf(".");
    if (k <= 0) fail(`--read ${pa}: write PATH.ATTR, e.g. app.list.scrollY`);
    actions.push({ kind: "read", label: pa, path: pa.slice(0, k), attr: pa.slice(k + 1) });
  } else if (a === "--call") {
    const c = arg(), m = /^(.*)\.([A-Za-z_$][\w$]*)\((.*)\)$/s.exec(c);
    if (m === null) fail(`--call ${c}: write PATH.METHOD(ARGS), e.g. 'app.preset(14)'`);
    let args;
    try { args = JSON.parse(`[${m[3]}]`); } catch { fail(`--call ${c}: the arguments are JSON — strings in double quotes`); }
    actions.push({ kind: "call", label: c, path: m[1], method: m[2], args });
  } else if (a === "--set") {
    const c = arg(), k = c.indexOf("="), dot = c.lastIndexOf(".", k);
    if (k <= 0 || dot <= 0) fail(`--set ${c}: write PATH.ATTR=VALUE, e.g. app.formOpen=true`);
    let v = c.slice(k + 1);
    try { v = JSON.parse(v); } catch { /* a bare word is a string */ }
    actions.push({ kind: "set", label: c, path: c.slice(0, dot), attr: c.slice(dot + 1, k), value: v });
  } else if (a === "--shot") actions.push({ kind: "shot", file: resolve(arg()) });
  else if (a === "--shot-of") { const path = arg(); actions.push({ kind: "shotOf", path, file: resolve(arg()) }); }
  else if (a === "--semantics") actions.push({ kind: "semantics" });
  else if (a === "--requests") actions.push({ kind: "requests" });
  else if (a === "--js") actions.push({ kind: "js", src: arg() });
  else fail(`${a} is not an option — see --help`);
}
const [w, h] = size !== undefined ? size.split("x").map(Number) : [null, null];
if (size !== undefined && !(w > 0 && h > 0)) fail(`--size ${size}: write it as WIDTHxHEIGHT, e.g. 390x844`);

const rest = settle ? " await drive.settleMotion();" : "";
const step = (x) => {
  const p = JSON.stringify(x.path);
  switch (x.kind) {
    case "click": return `await drive.click(${p});${rest}`;
    case "clickAt": return `await drive.clickAt(${p}, ${x.x}, ${x.y});${rest}`;
    case "pinch": return `await drive.pinch(${p}, ${x.scale});${rest}`;
    case "hold": return `await drive.hold(${p}, ${x.ms});${rest}`;
    case "drag": return `await drive.drag(${p}, ${x.dx}, ${x.dy});${rest}`;
    // a held drag is looked at as it stands: no settle between its steps
    case "press": return x.x === undefined ? `await drive.press(${p});` : `await drive.press(${p}, ${x.x}, ${x.y});`;
    case "move": return `await drive.moveBy(${x.dx}, ${x.dy});`;
    case "release": return `await drive.release();${rest}`;
    case "wheel": return `await drive.wheel(${p}, ${x.dy});${rest}`;
    case "type": return `await drive.type(${JSON.stringify(x.text)});${rest}`;
    case "key": return `await drive.key(${JSON.stringify(x.name)});${rest}`;
    case "wait": return `await drive.wait(${x.ms});`;
    // the longest leading part that names a view, then any properties past it
    case "read": return `console.log(${JSON.stringify(x.label + " = ")} + JSON.stringify(await page.evaluate((full) => {
      const d = window.__declare, segs = full.match(/"[^"]*"|[^.]+/g) ?? [];
      for (let k = segs.length - 1; k > 0; k--) {
        let v = d.find(segs.slice(0, k).join("."));
        if (v == null) continue;
        for (const s of segs.slice(k)) {
          const name = s.replace(/^"|"$/g, "");
          if (v == null || typeof v !== "object" || !(name in v)) return { missing: "'" + segs.slice(0, k).join(".") + "' has no '" + name + "'" + (v == null ? " (what came before it is " + v + ")" : "") };
          v = v[name];
        }
        return { v: v === undefined ? null : typeof v === "object" && v !== null && v.constructor?.name && "children" in v ? "(a " + v.constructor.name + ")" : v };
      }
      return { missing: "no view at '" + full + "'" };
    }, ${JSON.stringify(x.label)}).then((r) => { if (r.missing !== undefined) expect.fail("--read " + ${JSON.stringify(x.label)} + ": " + r.missing); return r.v; })));`;
    case "call": return `{ const r = await page.evaluate((p, m, a) => { const n = window.__declare.find(p); if (n == null) return "(no view at " + p + ")"; if (typeof n[m] !== "function") return "(" + p + " has no method " + m + ")"; const v = n[m](...a); return v === undefined ? null : v; }, ${p}, ${JSON.stringify(x.method)}, ${JSON.stringify(x.args)}); if (typeof r === "string" && r.startsWith("(")) expect.fail(r); }${rest}`;
    case "set": return `{ const r = await page.evaluate((p, a, v) => { const n = window.__declare.find(p); if (n == null) return "(no view at " + p + ")"; n[a] = v; return null; }, ${p}, ${JSON.stringify(x.attr)}, ${JSON.stringify(x.value)}); if (r !== null) expect.fail(r); }${rest}`;
    case "semantics": return `console.log(await page.evaluate(() => window.__declare.semantics()));`;
    // the app's time is the driver's (a page setTimeout waits for --wait), so an
    // expression still waiting after five real seconds is said, not hung on
    case "js": return `console.log(${JSON.stringify("js: ")} + JSON.stringify(await Promise.race([
      page.evaluate(async (src) => await (0, eval)("(async () => (" + src + "))()"), ${JSON.stringify(x.src)}),
      new Promise((_, no) => setTimeout(async () => {
        const waiting = await page.evaluate(() => globalThis.__declareTimers?.pending?.() ?? 0).catch(() => 0);
        no(new Error("--js is still waiting after 5 s" + (waiting > 0 ? ": " + waiting + " timer" + (waiting === 1 ? " is" : "s are") + " waiting on the app's clock, which moves only with --wait <ms> (a page setTimeout runs on the app's time here)" : " — it never finished")));
      }, 5000).unref?.()),
    ]).catch((e) => expect.fail(e.message))));`;
    case "requests": return `for (const q of drive.requests()) console.log("request " + q.method + " " + q.path + (q.body !== null ? " " + JSON.stringify(q.body) : "") + (q.status !== null ? " → " + q.status : ""));`;
    case "shot": return `await page.screenshot({ path: ${JSON.stringify(x.file)} }); console.log(${JSON.stringify("shot: " + x.file)});`;
    // a view below the fold is swiped into sight first, as a press on it is
    case "shotOf": return `{ const box = () => page.evaluate((p) => { const n = window.__declare.inspect(p); return n === null ? null : { x: n.rootX, y: n.rootY, width: n.rootWidth, height: n.rootHeight }; }, ${p});
    let b = await box();
    if (b === null) expect.fail("(no view at " + ${p} + ")");
    const vp = page.viewport() ?? { width: 1280, height: 800 };
    if (b.x < 0 || b.y < 0 || b.x + b.width > vp.width || b.y + b.height > vp.height) { await drive.reveal(${p}); b = await box(); }
    const x = Math.max(0, b.x), y = Math.max(0, b.y), w = Math.min(vp.width, b.x + b.width) - x, h = Math.min(vp.height, b.y + b.height) - y;
    if (w <= 0 || h <= 0) expect.fail(${p} + " is outside the window");
    // the box is in the window's frame; a clip is in the page's, which the page's scroll offsets
    const sc = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    await page.screenshot({ path: ${JSON.stringify(x.file)}, clip: { x: x + sc.x, y: y + sc.y, width: w, height: h } }); console.log(${JSON.stringify("shot: " + x.file)}); }`;
  }
};

// the device is the page's from its first load: one load, not a load and a reload
const script = `export const device = ${JSON.stringify({ width: w ?? 1280, height: h ?? 800, touch, hideScrollbars: !scrollbars, echoConsole: consoleOut, ...(dark ? { scheme: "dark" } : {}) })};
export default async ({ page, drive, expect }) => {
  ${settle ? "await drive.settleMotion();" : ""}
  ${actions.map(step).join("\n  ")}
};
`;

const dir = mkdtempSync(join(tmpdir(), "declare-look-"));
const assert = join(dir, "look.mjs");
writeFileSync(assert, script);
// looking at a served page with no file: the rungs before the look check a stand-in
if (file === undefined) { file = join(dir, "served.declare"); writeFileSync(file, "App [ ]\n"); }
const verify = join(dirname(fileURLToPath(import.meta.url)), "verify.mjs");
// what was asked for, and only that when it went well: the checking ladder the run
// climbs on the way (R1–R5, its notes) is said only when something failed
const LIMIT = 180_000;
const r = spawnSync(process.execPath, [verify, file, "--assert", assert, "--rung=5", "--no-boot", ...(url !== undefined ? ["--url", url] : [])], { encoding: "utf8", timeout: LIMIT, killSignal: "SIGKILL" });
rmSync(dir, { recursive: true, force: true });
if (r.error?.code === "ETIMEDOUT" || r.signal === "SIGKILL") {
  process.stdout.write((r.stdout ?? "") + `declare-look: gave up after ${LIMIT / 1000} s — the page never finished what was asked (an action that waits on something that never comes)\n`);
  process.exit(1);
}
const said = (r.stdout ?? "") + (r.stderr ?? "");
if (r.status === 0) {
  const ladder = /^\s+(R\d [✓·]|note |verify: |[a-z].*(synthetic backend|browser's own module|--assert <script))/;
  // a ladder line's continuation (indented further) goes with it; anything else
  // indented — a semantic tree's deeper levels — is what was asked for
  let dropping = false;
  const lines = said.split("\n").filter((l) => {
    if (l.trim() === "") return false;
    if (ladder.test(l)) { dropping = true; return false; }
    if (dropping && /^\s{5,}\S/.test(l)) return false;
    dropping = false;
    return true;
  });
  if (lines.length > 0) process.stdout.write(lines.join("\n") + "\n");
} else process.stdout.write(said);
process.exit(r.status ?? 1);
