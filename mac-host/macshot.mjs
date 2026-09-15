#!/usr/bin/env node
// macshot — launch THIS tree's Mac host on a program URL, capture its window,
// quit. `node mac-host/macshot.mjs <url> <out.png> [settleSeconds]`. Honours
// the variant knobs (app.mjs), so the graphics tree shoots its own app.
import { execFileSync, spawn } from "node:child_process";
import { hostBinary, NO_HOST, APP_NAME } from "./app.mjs";
import { hostWindow } from "./win.mjs";
const [url, out, settle = "3"] = process.argv.slice(2);
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const bin = hostBinary();
if (bin === null) { console.error(NO_HOST); process.exit(1); }
try { execFileSync("/usr/bin/pkill", ["-f", APP_NAME]); } catch { /* none */ }
await sleep(1);
spawn(bin, [], { detached: true, stdio: "ignore", env: { ...process.env, DECLARE_CONTROL: "1", DECLARE_APPEARANCE: "light", DECLARE_URL: url } }).unref();
let win = null;
for (let i = 0; i < 60 && win === null; i++) { await sleep(0.5); try { win = hostWindow(); } catch { /* not yet */ } }
if (win === null) { console.error("no window"); process.exit(1); }
await sleep(Number(settle));
execFileSync("/usr/sbin/screencapture", ["-x", "-o", "-l", String(hostWindow().id), out]);
console.log("shot", out, JSON.stringify(hostWindow()));
try { execFileSync("/usr/bin/pkill", ["-f", APP_NAME]); } catch { /* gone */ }
