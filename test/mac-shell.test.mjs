// test/mac-shell.test.mjs — the Mac host's SHELL: several windows at once, and
// the two key equivalents that close one and quit the app.
//
// Deliberately fast. The gates are long and this is not one of them: ONE launch
// (~6s, the only real cost), then every assertion over the control channel, and
// no program heavier than a probe. It exists because three of these behaviors
// cannot fail visibly in a screenshot — they fail as a crash, a hang, or a
// window that does not go away.
//
// ⌘W is driven with `menukey`, which hands a synthesized event to the REAL menu
// (NSMenu.performKeyEquivalent). A System Events keystroke would need
// accessibility permission and the frontmost app, so it would be both flaky and
// rude in a test run; this exercises the same dispatch AppKit uses.
//
// THE REGRESSION THIS PINS: an NSWindow created in code is released when it
// closes, which under ARC is one release too many. With a single never-closed
// window it was invisible; the first working ⌘W segfaulted the app inside
// `-[_NSWindowTransformAnimation dealloc]`, a frame that names nothing. So the
// test closes windows and then keeps talking to the host — a corpse cannot
// answer `ping`.

import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync, writeFileSync, readFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { test, summarize } from "./harness.mjs";
import { createDeclareServer } from "../server/create.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "mac-host/.build/release/DeclareMac");
const IN = "/tmp/declare-ctl.in", OUT = "/tmp/declare-ctl.out";
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

if (process.platform !== "darwin" || !existsSync(BIN)) {
  console.log("mac-shell: no native host built — skipped");
  process.exit(0);
}

// A stray host owns the control channel and would answer for the one under
// test. The installed app is "Declare Mac" WITH A SPACE, which `pkill -f
// DeclareMac` does not match — an hour was lost to exactly that.
for (const pat of ["DeclareMac", "Declare Mac"]) {
  try { execFileSync("/usr/bin/pkill", ["-f", pat]); } catch { /* none */ }
}
await sleep(1);

const server = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});
const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${httpServer.address().port}`;
const PROBE = `${B}/test/probe/arc.declare`;

const host = spawn(BIN, [], {
  detached: true, stdio: "ignore",
  env: { ...process.env, DECLARE_CONTROL: "1", DECLARE_ROOT: ROOT, DECLARE_URL: PROBE },
});

async function ctl(cmd, tries = 150) {
  if (existsSync(OUT)) unlinkSync(OUT);
  writeFileSync(IN, cmd + "\n");
  for (let i = 0; i < tries; i++) {
    await sleep(0.02);
    if (existsSync(OUT)) return readFileSync(OUT, "utf8").trim();
  }
  return null;
}

/** Wait for the host to come up rather than sleeping a guessed amount. */
async function ready() {
  for (let i = 0; i < 100; i++) {
    if ((await ctl("ping", 10)) === "ok") return true;
    await sleep(0.1);
  }
  return false;
}

const alive = () => { try { process.kill(host.pid, 0); return true; } catch { return false; } };
/// ⌘W the front window and wait for the count to settle.
///
/// Re-activates every time, deliberately. A key equivalent with a nil target is
/// resolved through the KEY window's responder chain, and after a close macOS
/// does not synchronously make the next window key — so a single activate at
/// the top of the suite left the second ⌘W landing nowhere. It reported
/// "handled" (the menu matched) and closed nothing, once in about every three
/// runs. Polling for the count instead of sleeping removes the other half of
/// the flake.
async function closeFrontWindow(expected) {
  assert.equal(await ctl("activate"), "ok");
  assert.equal(await ctl("menukey w cmd"), "handled", "⌘W did not reach the menu");
  for (let i = 0; i < 40 && (await countWindows()) !== expected; i++) await sleep(0.1);
}
const countWindows = async () => {
  const out = await ctl("windows");
  return out === "(none)" || out === null ? 0 : out.split("\n").length;
};

try {
  await test("the host comes up with one window", async () => {
    assert.equal(await ready(), true, "host never answered ping");
    assert.equal(await countWindows(), 1);
    // A key equivalent with a nil target is resolved through the KEY window's
    // responder chain, and an inactive app has none — automation does not take
    // the foreground on its own, so ⌘W would report "handled" and close
    // nothing. Put the app where a person pressing ⌘W would have it.
    assert.equal(await ctl("activate"), "ok");
  });

  await test("a second program opens in its own window", async () => {
    assert.match(await ctl(`newwindow ${PROBE}`), /^ok windows=2/);
    assert.equal(await countWindows(), 2);
    // Front is the new one, and the control channel addresses IT — the whole
    // point of resolving the target per command.
    const list = await ctl("windows");
    assert.equal(list.split("\n").filter((l) => l.startsWith("*")).length, 1, "exactly one front window");
    assert.ok(list.split("\n")[1].startsWith("*"), "the newest window is front");
  });

  await test("⌘W is wired to the menu and closes the front window", async () => {
    await closeFrontWindow(1);
    assert.equal(await countWindows(), 1);
  });

  await test("closing a window does not take the app with it", async () => {
    // The over-release crash lands on a LATER Core Animation commit, not on the
    // close, so proving survival means asking again after the app has drawn.
    await sleep(0.7);
    assert.equal(alive(), true, "host died after a window closed");
    assert.equal(await ctl("ping"), "ok", "host stopped answering after a close");
  });

  await test("the last window can close and leave the app running", async () => {
    await closeFrontWindow(0);
    assert.equal(await countWindows(), 0);
    assert.equal(alive(), true, "closing the last window quit the app");
    assert.equal(await ctl("ping"), "ok");
    // Window-less, the host still answers what it can and refuses the rest
    // plainly rather than trapping.
    assert.equal(await ctl("geom"), "no window");
  });

  await test("a window still opens after the last one closed", async () => {
    assert.match(await ctl(`newwindow ${PROBE}`), /^ok windows=1/);
    assert.equal(await countWindows(), 1);
  });

  // LAST: it ends the process, which IS the assertion. Do not expect a reply —
  // the app usually terminates before it can write one, so a null here is the
  // healthy case and only the exit is worth asserting.
  await test("⌘Q quits", async () => {
    await ctl("menukey q cmd", 40);
    for (let i = 0; i < 50 && alive(); i++) await sleep(0.1);
    assert.equal(alive(), false, "⌘Q did not quit the app");
  });
} finally {
  if (alive()) { try { process.kill(host.pid, "SIGKILL"); } catch { /* gone */ } }
  httpServer.close();
}

summarize("mac-shell");
