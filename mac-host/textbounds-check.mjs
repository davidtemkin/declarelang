// Does a text-ONLY drawing render on the native host?
//
//   node mac-host/textbounds-check.mjs
//
// The Mac host sizes a drawing's CGContext to the recording's bounds, which
// arrive in the display-list JSON from the runtime. So the recorder's text
// bounds fix (draw.ts textExtent) reaches the host only through that JSON — and
// the way to know is to render test/probe/textbounds.declare natively and count
// the white pixels in the text-only view. Zero means the bounds did not make
// it; the with-a-box view underneath is the control.
//
// Same launch discipline as drawconform.mjs: pinned light appearance, the
// installed binary, "Declare Mac" WITH THE SPACE on the way out.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hostWindow } from "./win.mjs";
import { hostBinary, NO_HOST } from "./app.mjs";
import { createDeclareServer } from "../server/create.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const server = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});
const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const URL_ = `http://127.0.0.1:${httpServer.address().port}/test/probe/textbounds.declare?render=mac`;

const bin = hostBinary();
if (bin === null) { console.error(NO_HOST); process.exit(1); }
for (const pat of ["Declare Mac", "DeclareMac"]) { try { execFileSync("/usr/bin/pkill", ["-f", pat]); } catch { /* none */ } }
await sleep(1.2);
spawn(bin, [], { detached: true, stdio: "ignore",
  env: { ...process.env, DECLARE_CONTROL: "1", DECLARE_APPEARANCE: "light", DECLARE_URL: URL_ } }).unref();
let up = false;
for (let i = 0; i < 60 && !up; i++) { await sleep(0.5); try { hostWindow(); up = i > 4; } catch { /* not yet */ } }
if (!up) { console.error("no host window"); process.exit(1); }
await sleep(2.5);

const { id } = hostWindow();
const shot = "/tmp/textbounds-mac.png";
execFileSync("/usr/sbin/screencapture", ["-x", "-o", "-l", String(id), shot]);
// The host opens at its RESTORED window size, not the App's — the 420x220
// program sits at the top-left of whatever window the session had. So the
// content origin is the published chrome height (the same file drawconform
// reads), never derived from the App's size.
const chromePt = Number(readFileSync("/tmp/declare-geom.txt", "utf8").trim().split(" ")[4] ?? 32);
const out = execFileSync("/usr/bin/python3", ["-c", `
from PIL import Image
im = Image.open(${JSON.stringify(shot)}).convert("RGB")
w, h = im.size
chrome = ${chromePt} * 2
def white(y0, y1):
    n = 0
    for y in range(y0, y1):
        for x in range(0, w, 2):
            r, g, b = im.getpixel((x, y))
            if r > 150 and g > 150 and b > 150: n += 1
    return n
lone = white(chrome + 20, chrome + 200)
box = white(chrome + 230, chrome + 410)
print(f"{lone} {box}")
`]).toString().trim();
const [lone, box] = out.split(" ").map(Number);
console.log(`mac: text-only view ${lone} white px · with-a-box control ${box} white px · ${shot}`);
console.log(lone > 500 ? "OK — the text-only drawing renders natively" : "FAIL — the text-only drawing is blank on the host");
for (const pat of ["Declare Mac", "DeclareMac"]) { try { execFileSync("/usr/bin/pkill", ["-f", pat]); } catch { /* gone */ } }
httpServer.close();
process.exit(lone > 500 ? 0 : 1);
