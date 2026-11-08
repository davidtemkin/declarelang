// Copy, cut and paste on the Mac (runtime clipboard.ts; mac-host Clipboard.swift,
// DeclareView's Edit actions), through the real menu's key equivalents and the
// general pasteboard. Pins:
//   - ⌘C at a focused view puts every representation on the pasteboard — plain
//     text other apps read, and the program's own type;
//   - ⌘V hands the pasteboard to the view that takes it, its own type intact;
//   - text another app copied arrives as text.
// The person's clipboard is kept and put back.
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { test, summarize } from "./harness.mjs";
import { createDeclareServer } from "../server/create.mjs";
import { CTL_IN, CTL_OUT, hostBinary, NO_HOST, stopStrayHosts } from "../mac-host/app.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = hostBinary();
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
if (process.platform !== "darwin" || BIN === null) {
  console.log("mac-clipboard: " + NO_HOST + " — skipped");
  process.exit(0);
}
stopStrayHosts(CTL_IN);
await sleep(1);

const server = createDeclareServer({ mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }], mode: "distro" });
const httpServer = http.createServer(server.handler);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${httpServer.address().port}`;
const host = spawn(BIN, [], { detached: true, stdio: "ignore", env: { ...process.env, DECLARE_CONTROL: "1", DECLARE_URL: `${B}/test/probe/clipboard-probe.declare` } });

async function ctl(cmd, tries = 150) {
  if (existsSync(CTL_OUT)) unlinkSync(CTL_OUT);
  writeFileSync(CTL_IN, cmd + "\n");
  for (let i = 0; i < tries; i++) {
    await sleep(0.02);
    if (existsSync(CTL_OUT)) return readFileSync(CTL_OUT, "utf8").trim();
  }
  return null;
}
const app = async (k) => ctl(`eval String(__declare.find("app").${k})`);
const focusOn = (p) => ctl(`eval (() => { const a = __declare.find("app"); a.focusOn(a.${p}); return "ok" })()`);
const pbpaste = () => execFileSync("pbpaste", { encoding: "utf8" });
const pbcopy = (s) => execFileSync("pbcopy", { input: s });
const kept = pbpaste();

try {
  await test("the host comes up with the probe", async () => {
    let up = false;
    for (let i = 0; i < 100 && !up; i++) { up = (await ctl("ping", 10)) === "ok"; if (!up) await sleep(0.1); }
    assert.equal(up, true);
    await ctl("waitload");
    for (let i = 0; i < 50 && (await app("word")) !== "tomato"; i++) await sleep(0.1);
    assert.match(await ctl("activate"), /^ok/);
  });

  await test("⌘C at a focused view puts its text and its own type on the pasteboard", async () => {
    pbcopy("before");
    await focusOn("chip");
    assert.equal(await ctl("menukey c cmd"), "handled");
    await sleep(0.3);
    assert.equal(pbpaste(), "tomato", "the plain text, as other apps read it");
  });

  await test("⌘V gives the view the pasteboard, its own type first", async () => {
    await focusOn("board");
    assert.equal(await ctl("menukey v cmd"), "handled");
    for (let i = 0; i < 20 && (await app("pasted")) === ""; i++) await sleep(0.1);
    assert.equal(await app("pasted"), "tomato");
    assert.match(await app("types"), /application\/x-chip/);
  });

  await test("text another app copied arrives as text", async () => {
    pbcopy("thyme");
    await focusOn("board");
    await ctl("menukey v cmd");
    for (let i = 0; i < 20 && (await app("pasted")) !== "thyme"; i++) await sleep(0.1);
    assert.equal(await app("pasted"), "thyme");
    assert.equal(await app("types"), "text/plain");
  });
} finally {
  pbcopy(kept);
  try { process.kill(host.pid); } catch { /* gone */ }
  httpServer.close();
}
summarize("mac-clipboard");
