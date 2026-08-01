#!/usr/bin/env node
// Behavioural parity: run ONE scripted interaction against the DOM renderer and
// against the native host, and compare what each ends up showing.
//
// The DOM render is the reference. The point is not that either backend obeys
// some theory of correct behaviour — it is that this program behaves the same
// in every environment it runs in. A pixel diff at the end of a script catches
// what a static screenshot cannot: scroll routing, focus and raise order,
// hit areas, animation end-states.
//
//   node parity.mjs steps.json
//   node parity.mjs --inline '[["click",167,160],["wait",1.5],["shot"]]'
//   node parity.mjs steps.json --appearance dark    (default: light)
//   node parity.mjs steps.json --no-relaunch        (use the running app as-is)
//
// Steps: ["click",x,y] ["scroll",x,y,dy,dx] ["wait",seconds] ["shot"]
// Coordinates are the app's model space, which is CSS pixels in the DOM and
// content-relative points natively — the same numbers on both sides.
//
// BOTH SIDES ARE PINNED, and they have to be for the number to mean anything.
// Two things drift otherwise:
//
//   THEME. The native host follows the machine's appearance; headless Chrome
//   defaults to light. A run with the two disagreeing reported 39% differing
//   against a ~11% static baseline — all of it theme, none of it a defect.
//
//   PROCESS STATE. Chrome is born fresh for every run; the native app is a
//   long-lived process carrying whatever the last session left it — a cycled
//   wallpaper seed (` bumps it), windows opened, a mode switched. So the app is
//   relaunched by default, which also returns `wallSeed` to its declared 7.
//
// Anything this harness cannot pin, it should refuse to average over: prefer a
// re-launch to a plausible-looking number.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { hostWindow } from "./win.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL_DOM = "http://127.0.0.1:8260/apps/desktop/desktop.declare?render=dom";
const IN = "/tmp/declare-ctl.in";
const OUT = "/tmp/declare-ctl.out";
const CHROME_H = 32;                      // the native capture includes the title bar

const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(name); return i > 0 ? args[i + 1] : def; };
const APPEARANCE = flag("--appearance", "light") === "dark" ? "dark" : "light";
const RELAUNCH = !args.includes("--no-relaunch");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const stepArg = args.find((a) => !a.startsWith("--")) ?? null;
const steps = args[0] === "--inline" ? JSON.parse(args[1]) : JSON.parse(readFileSync(stepArg, "utf8"));
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

/** Start the native host from a known state, in the pinned theme. */
async function relaunchNative() {
  try { execFileSync("/usr/bin/pkill", ["-f", "DeclareMac"]); } catch { /* none running */ }
  await sleep(1);
  const bin = path.join(HERE, ".build/release/DeclareMac");
  spawn(bin, [], {
    detached: true, stdio: "ignore",
    env: { ...process.env,
           DECLARE_CONTROL: "1",
           DECLARE_APPEARANCE: APPEARANCE,
           DECLARE_ROOT: ROOT,
           DECLARE_URL: "http://127.0.0.1:8260/apps/desktop/desktop.declare?render=mac" },
  }).unref();
  await sleep(6);
}

// ── the native side, through the control channel (no system events) ─────────
async function ctl(cmd) {
  if (existsSync(OUT)) unlinkSync(OUT);
  writeFileSync(IN, cmd + "\n");
  for (let i = 0; i < 150; i++) {
    await sleep(0.02);
    if (existsSync(OUT)) return readFileSync(OUT, "utf8").trim();
  }
  throw new Error("the native app did not answer — is DECLARE_CONTROL set?");
}

async function runNative(shots) {
  const id = String(hostWindow().id);
  let n = 0;
  for (const [verb, ...a] of steps) {
    if (verb === "wait") await sleep(a[0]);
    else if (verb === "shot") {
      const f = `/tmp/parity-nat-${n++}.png`;
      execFileSync("/usr/sbin/screencapture", ["-x", "-o", "-l", id, f]);
      // Crop the title bar so both sides frame the same content, AND convert out
      // of the display profile. screencapture tags its output with the panel's
      // profile while headless Chrome writes untagged sRGB, so diffing them raw
      // compares two colour spaces: it read 43% differing where the geometry
      // agreed to within fidelity.mjs's 1.9% structural. fidelity.mjs has done
      // this conversion all along — parity.mjs diffing out of band was the whole
      // gap between the two harnesses' numbers.
      execFileSync("/usr/bin/python3", ["-c",
        `from PIL import Image, ImageCms\nimport io\n` +
        `f = ${JSON.stringify(f)}\n` +
        `src = Image.open(f)\n` +
        `icc = src.info.get("icc_profile")\n` +
        `im = src.convert("RGB")\n` +
        `if icc:\n` +
        `    im = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(icc)), ImageCms.createProfile("sRGB"), outputMode="RGB")\n` +
        `im.crop((0, ${CHROME_H * 2}, im.width, im.height)).save(f)\n`]);
      shots.push(f);
    } else if (verb === "click") await ctl(`click ${a[0]} ${a[1]}`);
    else if (verb === "move") await ctl(`move ${a[0]} ${a[1]}`);
    else if (verb === "scroll") await ctl(`scroll ${a[0]} ${a[1]} ${a[2] ?? 0} ${a[3] ?? 0}`);
  }
}

// ── the reference side ──────────────────────────────────────────────────────
async function runDom(shots) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ["--no-sandbox", "--force-device-scale-factor=2"],
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
  const p = await b.newPage();
  // The same theme the native side was pinned to — otherwise the two renders
  // disagree about every surface colour and the diff measures nothing.
  await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: APPEARANCE }]);
  await p.goto(URL_DOM, { waitUntil: "networkidle0" });
  await sleep(2.5);
  let n = 0;
  for (const [verb, ...a] of steps) {
    if (verb === "wait") await sleep(a[0]);
    else if (verb === "shot") {
      const f = `/tmp/parity-web-${n++}.png`;
      writeFileSync(f, Buffer.from(await p.screenshot({ encoding: "base64" }), "base64"));
      shots.push(f);
    } else if (verb === "click") {
      await p.mouse.move(a[0], a[1]); await sleep(0.05); await p.mouse.click(a[0], a[1]);
    } else if (verb === "move") {
      await p.mouse.move(a[0], a[1]);
    } else if (verb === "scroll") {
      await p.mouse.move(a[0], a[1]); await sleep(0.05);
      await p.mouse.wheel({ deltaY: a[2] ?? 0, deltaX: a[3] ?? 0 });
    }
  }
  await b.close();
}

const nat = [], web = [];
if (RELAUNCH) await relaunchNative();
console.log(`pinned: appearance=${APPEARANCE}  native=${RELAUNCH ? "relaunched (wallSeed at its declared default)" : "AS-IS (unpinned state — numbers are indicative only)"}`);
await runNative(nat);
await runDom(web);

for (let i = 0; i < Math.min(nat.length, web.length); i++) {
  const out = execFileSync("/usr/bin/python3", ["-c", `
from PIL import Image
import numpy as np
a = np.array(Image.open("${nat[i]}").convert("RGB")).astype(int)
b = np.array(Image.open("${web[i]}").convert("RGB")).astype(int)
h = min(a.shape[0], b.shape[0]); w = min(a.shape[1], b.shape[1])
d = np.abs(a[:h,:w] - b[:h,:w]).sum(axis=2)
print(f"{100*(d>24).mean():.2f} {100*(d>120).mean():.2f}")
`]).toString().trim().split(" ");
  console.log(`  shot ${i}: differing ${out[0]}%  structural ${out[1]}%   (${nat[i]} vs ${web[i]})`);
}
