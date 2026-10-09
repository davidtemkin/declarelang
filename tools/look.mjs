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
// own: `export default async ({ page, drive }) => { … }`, run with
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
  --touch             a touch device: touch input, mobile viewport
  --dark              the system's dark appearance
  --console           print what the page writes to its console
  --no-settle         take each read and picture as it is, mid-motion

actions, run in the order written (each may repeat)
  --click PATH                 press the view at PATH
  --drag PATH DX,DY            press it, move by (DX, DY) pixels, release
  --wheel PATH DY              turn the wheel over it by DY pixels (negative: up)
  --type TEXT                  type TEXT into whatever has the focus (--click a field first)
  --key NAME                   press a key: Enter, Escape, Tab, ArrowDown, Backspace, …
  --wait MS                    let MS milliseconds pass
  --read PATH.ATTR             print PATH's attribute: app.list.scrollY = 240
  --shot FILE.png              save a picture of the window

PATH names a view by where it sits in the program: the App is "app", and each
named child adds its name — app.sidebar.list, app.toolbar.save. A replicated
row is its index: app.list.3. (declare-verify's introspection, find() and
inspect(), takes the same paths.)

examples
  declare-look app.declare --size 390x844 --shot phone.png
  declare-look app.declare --click app.toolbar.new --type "Buy milk" --key Enter --read app.items.count
  declare-look app.declare --drag app.board.card1 120,0 --shot moved.png
  declare-look app.declare --wheel app.list 2000 --read app.list.scrollY --shot scrolled.png`;

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); process.exit(0); }
const file = argv.find((a) => a.endsWith(".declare"));
if (file === undefined) { console.error(HELP); process.exit(2); }

const fail = (msg) => { console.error(`declare-look: ${msg}`); process.exit(2); };
let size, touch = false, dark = false, consoleOut = false, settle = true;
const actions = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const arg = () => { if (i + 1 >= argv.length) fail(`${a} needs a value — see --help`); return argv[++i]; };
  if (a === file) continue;
  else if (a === "--size") size = arg();
  else if (a === "--touch") touch = true;
  else if (a === "--dark") dark = true;
  else if (a === "--console") consoleOut = true;
  else if (a === "--no-settle") settle = false;
  else if (a === "--click") actions.push({ kind: "click", path: arg() });
  else if (a === "--drag") {
    const path = arg(), by = arg().split(",").map(Number);
    if (by.length !== 2 || by.some((n) => !Number.isFinite(n))) fail(`--drag ${path} ${argv[i]}: write the movement as DX,DY, e.g. 120,0`);
    actions.push({ kind: "drag", path, dx: by[0], dy: by[1] });
  } else if (a === "--wheel") {
    const path = arg(), dy = Number(arg());
    if (!Number.isFinite(dy)) fail(`--wheel ${path} ${argv[i]}: write the distance in pixels, e.g. 600`);
    actions.push({ kind: "wheel", path, dy });
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
  } else if (a === "--shot") actions.push({ kind: "shot", file: resolve(arg()) });
  else fail(`${a} is not an option — see --help`);
}
const [w, h] = size !== undefined ? size.split("x").map(Number) : [null, null];
if (size !== undefined && !(w > 0 && h > 0)) fail(`--size ${size}: write it as WIDTHxHEIGHT, e.g. 390x844`);

const rest = settle ? " await drive.settleMotion();" : "";
const step = (x) => {
  const p = JSON.stringify(x.path);
  switch (x.kind) {
    case "click": return `await drive.click(${p});${rest}`;
    case "drag": return `await drive.drag(${p}, ${x.dx}, ${x.dy});${rest}`;
    case "wheel": return `await drive.wheel(${p}, ${x.dy});${rest}`;
    case "type": return `await drive.type(${JSON.stringify(x.text)});${rest}`;
    case "key": return `await drive.key(${JSON.stringify(x.name)});${rest}`;
    case "wait": return `await drive.wait(${x.ms});`;
    case "read": return `console.log(${JSON.stringify(x.label + " = ")} + JSON.stringify(await page.evaluate((p, a) => { const n = window.__declare.find(p); if (n == null) return "(no view at " + p + ")"; const v = n[a]; return v === undefined ? null : v; }, ${p}, ${JSON.stringify(x.attr)})));`;
    case "shot": return `await page.screenshot({ path: ${JSON.stringify(x.file)} }); console.log(${JSON.stringify("shot: " + x.file)});`;
  }
};

const script = `export default async ({ page, drive }) => {
  ${consoleOut ? `page.on("console", (m) => console.log("console." + m.type() + ": " + m.text()));` : ""}
  const ready = () => page.waitForFunction(() => window.__declare && typeof window.__declare.find === "function", { timeout: 15000 });
  ${w !== null || touch ? `await page.setViewport({ width: ${w ?? 1280}, height: ${h ?? 800}, hasTouch: ${touch}, isMobile: ${touch} });
  await page.reload(); await ready();` : ""}
  ${dark ? `await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);` : ""}
  ${settle ? "await drive.settleMotion();" : ""}
  ${actions.map(step).join("\n  ")}
};
`;

const dir = mkdtempSync(join(tmpdir(), "declare-look-"));
const assert = join(dir, "look.mjs");
writeFileSync(assert, script);
const verify = join(dirname(fileURLToPath(import.meta.url)), "verify.mjs");
const r = spawnSync(process.execPath, [verify, file, "--assert", assert, "--rung=5"], { stdio: "inherit" });
rmSync(dir, { recursive: true, force: true });
process.exit(r.status ?? 1);
