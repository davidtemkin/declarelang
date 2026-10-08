#!/usr/bin/env node
// look — open a program in a real browser, do a few plain things, and report:
// the common checking round (open at a size, maybe press something, read some
// values, take a picture) in ONE call, with no script to write.
//
//   npx declare-look app.declare [--size 390x844] [--touch] [--dark]
//                    [--click <view path>]… [--read <view path>.<attribute>]…
//                    [--shot out.png] [--no-settle]
//
// Flags are data, applied in this order: size/touch, dark, each --click, each
// --read (printed as `path.attr = value`), then --shot. Motion is run to rest
// after the page opens and after each click, so a read or a picture shows where
// things land, not a spring mid-flight (--no-settle takes them as they are). It runs as rung 5 of declare-verify — the same browser, server and
// failure reporting — by writing the equivalent assert script and handing it
// over. Anything more (a drag, a pinch, a timed poll) is an assert script of
// your own: `export default async ({ page, drive }) => { … }`, run with
// `declare-verify app.declare --assert check.mjs`, and it stays as a test.

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const file = argv.find((a) => a.endsWith(".declare"));
if (file === undefined) {
  console.error("usage: declare-look app.declare [--size WxH] [--touch] [--dark] [--click path]… [--read path.attr]… [--shot out.png] [--no-settle]");
  process.exit(2);
}
const all = (flag) => argv.flatMap((a, i) => (a === flag && i + 1 < argv.length ? [argv[i + 1]] : []));
const one = (flag) => all(flag).at(-1);
const size = one("--size");
const touch = argv.includes("--touch");
const dark = argv.includes("--dark");
const shot = one("--shot");
const settle = !argv.includes("--no-settle");
const [w, h] = size !== undefined ? size.split("x").map(Number) : [null, null];
if (size !== undefined && !(w > 0 && h > 0)) { console.error(`--size ${size}: write it as WIDTHxHEIGHT, e.g. 390x844`); process.exit(2); }

const script = `export default async ({ page, drive }) => {
  const ready = () => page.waitForFunction(() => window.__declare && typeof window.__declare.find === "function", { timeout: 15000 });
  ${w !== null || touch ? `await page.setViewport({ width: ${w ?? 1280}, height: ${h ?? 800}, hasTouch: ${touch}, isMobile: ${touch} });
  await page.reload(); await ready();` : ""}
  ${dark ? `await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);` : ""}
  ${settle ? "await drive.settleMotion();" : ""}
  ${all("--click").map((p) => `await drive.click(${JSON.stringify(p)});${settle ? " await drive.settleMotion();" : ""}`).join("\n  ")}
  ${all("--read").map((pa) => {
    const k = pa.lastIndexOf(".");
    const path = pa.slice(0, k), attr = pa.slice(k + 1);
    return `console.log(${JSON.stringify(pa + " = ")} + JSON.stringify(await page.evaluate((p, a) => { const n = window.__declare.find(p); if (n == null) return "(no view at " + p + ")"; const v = n[a]; return v === undefined ? null : v; }, ${JSON.stringify(path)}, ${JSON.stringify(attr)})));`;
  }).join("\n  ")}
  ${shot !== undefined ? `await page.screenshot({ path: ${JSON.stringify(resolve(shot))} }); console.log("shot: ${resolve(shot)}");` : ""}
};
`;

const dir = mkdtempSync(join(tmpdir(), "declare-look-"));
const assert = join(dir, "look.mjs");
writeFileSync(assert, script);
const verify = join(dirname(fileURLToPath(import.meta.url)), "verify.mjs");
const r = spawnSync(process.execPath, [verify, file, "--assert", assert, "--rung=5"], { stdio: "inherit" });
rmSync(dir, { recursive: true, force: true });
process.exit(r.status ?? 1);
