#!/usr/bin/env node
// see.mjs — the simulated user's eyes and hands: a plain browser that knows nothing
// about how the app it looks at was built. It loads a URL, does what a person would, in
// order, and reports what a person would notice: a picture, the words on screen, and
// anything the page complained about.
//
//   see.mjs <url> [--phone] [--dark] [--profile <dir>] [step …]
//
//   --phone          a phone: 390×844, touch, presses are taps
//   --dark           the system set to dark
//   --profile <dir>  the person's own browser profile, kept between looks (what they
//                    saved in the app is still there next time); default: a fresh one
//
// Steps, done in order:
//   shot:<file.png>        a picture of the window
//   text                   the words on screen (as read top to bottom)
//   click:<name>           press what is named <name> (its label, or its words)
//   type:<label>=<words>   type into the field named <label> (empty label: the focused one)
//   key:<Key>              press a key (Enter, Escape, Tab, ArrowDown, Meta+K, …)
//   scroll:<dy>[@x,y]      scroll by dy pixels (a wheel; on a phone, a swipe)
//   drag:<x1>,<y1>,<x2>,<y2>  drag from one point to another (a finger on a phone)
//   pinch:<x>,<y>,<scale>  a two-finger pinch about a point (phone)
//   hover:<name>           rest the pointer on what is named <name>
//   wait:<ms>              wait
//   reload                 reload the page, as a person coming back would
//
// Downloads land in <profile or tmp>/downloads and are listed in the report.
import { existsSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { launchChrome } from "../../../tools/internal/chrome.mjs";

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
const value = (n) => { const i = argv.indexOf(n); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const PHONE = flag("--phone"), DARK = flag("--dark");
const PROFILE = value("--profile");
const URL = argv.shift();
if (!URL) { console.error("usage: see.mjs <url> [--phone] [--dark] [--profile dir] [step …]"); process.exit(2); }
const STEPS = argv;

const base = PROFILE ? resolve(PROFILE) : mkdtempSync(join(tmpdir(), "see-"));
mkdirSync(base, { recursive: true });
const downloads = join(base, "downloads");
mkdirSync(downloads, { recursive: true });
const before = new Set(readdirSync(downloads));

const browser = await launchChrome(PROFILE ? { userDataDir: join(base, "chrome") } : {});
const page = await browser.newPage();
const said = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn" || m.type() === "warning") said.push(`console ${m.type()}: ${m.text().slice(0, 300)}`); });
page.on("pageerror", (e) => said.push(`page error: ${String(e.message ?? e).slice(0, 300)}`));
page.on("requestfailed", (r) => said.push(`request failed: ${r.url().slice(0, 160)} (${r.failure()?.errorText ?? "?"})`));
const cdp = await page.createCDPSession();
await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads }).catch(() => {});
if (PHONE) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
else await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: DARK ? "dark" : "light" }]);

const out = [];
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));
try {
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 30_000 });
} catch (e) {
  out.push(`could not load ${URL}: ${String(e.message ?? e).split("\n")[0]}`);
}
// a person waits until something is there to see
await page.waitForFunction(() => (document.body?.innerText ?? "").trim().length > 0, { timeout: 10_000 }).catch(() => {});
await settle(600);

async function find(name) {
  for (const sel of [`::-p-aria(${name})`, `::-p-text(${name})`]) {
    try { const h = await page.waitForSelector(sel, { timeout: 1500, visible: true }); if (h) return h; } catch { /* next */ }
  }
  return null;
}
async function pressAt(x, y) {
  if (PHONE) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

for (const step of STEPS) {
  const i = step.indexOf(":");
  const verb = i < 0 ? step : step.slice(0, i), arg = i < 0 ? "" : step.slice(i + 1);
  try {
    if (verb === "shot") { await page.screenshot({ path: resolve(arg) }); out.push(`picture: ${resolve(arg)}`); }
    else if (verb === "text") {
      const t = await page.evaluate(() => document.body?.innerText ?? "");
      out.push(`on screen:\n${t.replace(/\n{3,}/g, "\n\n").slice(0, 4000)}`);
    }
    else if (verb === "click" || verb === "hover") {
      const h = await find(arg);
      if (!h) { out.push(`${verb}: nothing named "${arg}" to be seen`); continue; }
      const b = await h.boundingBox();
      if (!b) { out.push(`${verb}: "${arg}" is not on screen`); continue; }
      if (verb === "hover") await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      else await pressAt(b.x + b.width / 2, b.y + b.height / 2);
      out.push(`${verb === "click" ? (PHONE ? "tapped" : "clicked") : "hovered"} "${arg}"`);
    }
    else if (verb === "type") {
      const eq = arg.indexOf("=");
      const label = eq < 0 ? "" : arg.slice(0, eq), words = eq < 0 ? arg : arg.slice(eq + 1);
      if (label) {
        const h = await find(label);
        if (!h) { out.push(`type: no field named "${label}"`); continue; }
        const b = await h.boundingBox();
        if (b) await pressAt(b.x + b.width / 2, b.y + b.height / 2);
      }
      await page.keyboard.type(words, { delay: 20 });
      out.push(`typed "${words}"${label ? ` into "${label}"` : ""}`);
    }
    else if (verb === "key") {
      const parts = arg.split("+"), key = parts.pop();
      for (const m of parts) await page.keyboard.down(m);
      await page.keyboard.press(key);
      for (const m of parts.reverse()) await page.keyboard.up(m);
      out.push(`pressed ${arg}`);
    }
    else if (verb === "scroll") {
      const [dy, at] = arg.split("@");
      const [x, y] = (at ?? (PHONE ? "195,500" : "640,400")).split(",").map(Number);
      if (PHONE) {
        await cdp.send("Input.synthesizeScrollGesture", { x, y, yDistance: -Number(dy), speed: 1200, gestureSourceType: "touch" });
      } else {
        await page.mouse.move(x, y);
        await page.mouse.wheel({ deltaY: Number(dy) });
      }
      out.push(`scrolled ${dy}`);
    }
    else if (verb === "drag") {
      const [x1, y1, x2, y2] = arg.split(",").map(Number);
      if (PHONE) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x1, y: y1 }] });
        for (let k = 1; k <= 12; k++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x1 + (x2 - x1) * k / 12, y: y1 + (y2 - y1) * k / 12 }] }); await settle(16); }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      } else {
        await page.mouse.move(x1, y1); await page.mouse.down();
        for (let k = 1; k <= 12; k++) { await page.mouse.move(x1 + (x2 - x1) * k / 12, y1 + (y2 - y1) * k / 12); await settle(16); }
        await page.mouse.up();
      }
      out.push(`dragged from ${x1},${y1} to ${x2},${y2}`);
    }
    else if (verb === "pinch") {
      const [x, y, scale] = arg.split(",").map(Number);
      await cdp.send("Input.synthesizePinchGesture", { x, y, scaleFactor: scale, gestureSourceType: "touch" });
      out.push(`pinched ×${scale} about ${x},${y}`);
    }
    else if (verb === "wait") { await settle(Number(arg) || 500); out.push(`waited ${arg} ms`); }
    else if (verb === "reload") { await page.reload({ waitUntil: "networkidle2" }); out.push("reloaded"); }
    else out.push(`unknown step "${step}"`);
    await settle();
  } catch (e) {
    out.push(`${step}: ${String(e.message ?? e).split("\n")[0]}`);
  }
}

await settle(500);
const got = readdirSync(downloads).filter((f) => !before.has(f) && !f.endsWith(".crdownload"));
if (got.length) out.push(`downloaded: ${got.map((f) => join(downloads, f)).join(", ")}`);
if (said.length) out.push(`the page said:\n${[...new Set(said)].slice(0, 20).join("\n")}`);
console.log(`${PHONE ? "phone" : "laptop"}${DARK ? ", dark" : ""} — ${URL}\n${out.join("\n")}`);
await browser.close();
if (!existsSync(downloads)) process.exit(0);
