// chrome.mjs — the one way the suite and the gates launch Chrome.
//
//   import { launchChrome, findChrome } from "…/tools/internal/chrome.mjs";
//   const browser = await launchChrome({ args: ["--no-sandbox"] });   // puppeteer.launch's options
//
// WHY ONE PLACE. Chrome starts helpers of its own — the crash handler, and on
// a branded install the Google updater — and they inherit its stdio. Puppeteer
// pipes Chrome's output to read the DevTools address, so after Chrome exits
// those helpers still hold the far end of the pipe, and a finished test's
// process waited on it: 20 s of nothing after the last result, every browser
// test file (measured 2026-10-03: draw-bounds 44 s → 24 s). Launch flags do not
// stop the helpers; releasing the pipes once launch has read the address does.

import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, utimesSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** The Chrome to drive: PUPPETEER_EXECUTABLE_PATH / CHROME_PATH, else the usual installs. */
export function findChrome() {
  for (const c of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean))
    if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}

// EVERY PROFILE IS REMOVED. Chrome writes a profile — caches, a GPU cache, a
// crash database — of tens to hundreds of megabytes. Puppeteer removes the one it
// makes only when the browser is closed; a process that ends any other way (a
// crash, a timeout, a kill, a test that throws past its close) leaves it, and
// such leftovers ran to gigabytes. So a launch here makes its own profile under
// a marked name, removes it when the browser closes or this process exits, and
// first clears the profiles earlier launches left behind.
const PROFILE_PREFIX = "declare-chrome-run-";
const LIVE_PROFILES = new Set();
const LIVE_CHROMES = new Set();   // Chrome processes this process started and has not seen close
let exitHook = false;
function removeProfile(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  LIVE_PROFILES.delete(dir);
}
/** Clear profiles whose launching process is gone (its pid is in the name's
 *  marker file). */
function sweepProfiles() {
  let names = [];
  try { names = readdirSync(tmpdir()).filter((n) => n.startsWith(PROFILE_PREFIX)); } catch { return; }
  for (const n of names) {
    const dir = join(tmpdir(), n);
    let pid = NaN;
    try { pid = Number(readFileSync(join(dir, "declare-owner"), "utf8")); } catch { /* unmarked */ }
    if (Number.isFinite(pid) && alive(pid)) continue;
    // unmarked: only once it is plainly abandoned
    if (!Number.isFinite(pid)) { try { if (Date.now() - statSync(dir).mtimeMs < 3_600_000) continue; } catch { continue; } }
    removeProfile(dir);
  }
}

/** puppeteer.launch, with Chrome found, its pipes released after launch, and its
 *  profile its own — removed when it closes or this process exits. */
export async function launchChrome(opts = {}) {
  sweepProfiles();
  const profile = opts.userDataDir ?? mkdtempSync(join(tmpdir(), PROFILE_PREFIX));
  const ours = opts.userDataDir === undefined;
  if (ours) {
    writeFileSync(join(profile, "declare-owner"), String(process.pid));
    LIVE_PROFILES.add(profile);
    if (!exitHook) {
      exitHook = true;
      // a Chrome left running is stopped first — it would go on writing to its
      // profile, and on running, after this process is gone
      process.on("exit", () => {
        for (const p of LIVE_CHROMES) { try { p.kill("SIGKILL"); } catch { /* gone */ } }
        for (const d of [...LIVE_PROFILES]) removeProfile(d);
      });
      for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(sig, () => process.exit(130));
    }
  }
  const quiet = ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"];
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, ...opts, args: [...(opts.args ?? []), ...quiet], userDataDir: profile });
  const proc = browser.process();
  for (const s of [proc?.stdin, proc?.stdout, proc?.stderr]) s?.unref?.();
  // the profile goes once Chrome has exited (it writes to it while closing)
  if (proc) { LIVE_CHROMES.add(proc); proc.once("exit", () => { LIVE_CHROMES.delete(proc); if (ours) removeProfile(profile); }); }
  else if (ours) browser.on("disconnected", () => removeProfile(profile));
  return browser;
}

// ── A CHROME KEPT RUNNING ─────────────────────────────────────────────────────
// declare-look and declare-verify's browser rungs are run again and again while
// a program is written: each call paid for a Chrome launch and a cold HTTP cache
// before it looked at anything. sharedChrome() keeps one Chrome running between
// calls — one per set of launch flags — and each call connects, works in a
// browser context of its own (no cookies or storage carried from one call to the
// next), and disconnects. A small reaper ends it after IDLE_MS without a call.
// DECLARE_FRESH_CHROME=1 launches a private Chrome per call instead.


const IDLE_MS = 15 * 60_000;
const HERE = dirname(fileURLToPath(import.meta.url));

/** Is a process alive? */
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** One Chrome per launch-flag set, kept in the temp folder. */
function slotFor(args) {
  const key = createHash("sha1").update(JSON.stringify(args)).digest("hex").slice(0, 10);
  const dir = join(tmpdir(), "declare-chrome", key);
  mkdirSync(dir, { recursive: true });
  return { dir, state: join(dir, "state.json"), lock: join(dir, "lock"), profile: join(dir, "profile") };
}

async function withLock(lock, fn) {
  for (let i = 0; i < 200; i++) {
    try { mkdirSync(lock); break; } catch {
      // a lock older than 30 s is a crashed launcher's
      try { if (Date.now() - statSync(lock).mtimeMs > 30_000) rmSync(lock, { recursive: true, force: true }); } catch { /* gone */ }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  try { return await fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
}

async function launchKept(slot, args, scrollbars) {
  rmSync(join(slot.profile, "DevToolsActivePort"), { force: true });
  const proc = spawn(findChrome(), [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${slot.profile}`,
    "--no-first-run", "--no-default-browser-check", "--mute-audio",
    // several checks share one Chrome, each in its own page: a page that is not
    // the front one must not have its timers and frames throttled, or a step
    // that waits on a frame waits forever (verify-apps under load, 2026-10-26)
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    // its cache is what makes the next call quick, kept small
    "--disk-cache-size=52428800",
    ...(scrollbars ? [] : ["--hide-scrollbars"]),
    ...args,
  ], { detached: true, stdio: "ignore" });
  proc.unref();
  // the port Chrome chose is written to its profile
  for (let i = 0; i < 200; i++) {
    try {
      const [port, path] = readFileSync(join(slot.profile, "DevToolsActivePort"), "utf8").split("\n");
      if (port && path) {
        const ws = `ws://127.0.0.1:${port}${path}`;
        writeFileSync(slot.state, JSON.stringify({ pid: proc.pid, ws }));
        const reaper = spawn(process.execPath, [join(HERE, "chrome-reaper.mjs"), slot.state, String(proc.pid), String(IDLE_MS), slot.dir], { detached: true, stdio: "ignore" });
        reaper.unref();
        return ws;
      }
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 25));
  }
  try { process.kill(proc.pid); } catch { /* gone */ }
  throw new Error("a kept Chrome did not start");
}

/** A Chrome to work in: the one kept running for these flags, connected (and
 *  launched first if there is none). `ignoreDefaultArgs` is honoured by leaving
 *  `--hide-scrollbars` out. Returns { browser, context, release }: work in
 *  `context`, then `release()` closes the context and disconnects. */
export async function sharedChrome({ args = [], ignoreDefaultArgs = [] } = {}) {
  if (process.env.DECLARE_FRESH_CHROME === "1") {
    const browser = await launchChrome({ args, ...(ignoreDefaultArgs.length ? { ignoreDefaultArgs } : {}) });
    const context = browser.defaultBrowserContext();
    return { browser, context, release: () => browser.close() };
  }
  // real scrollbars are asked for by leaving the default --hide-scrollbars out
  const scrollbars = ignoreDefaultArgs.includes("--hide-scrollbars");
  const flags = args.filter((a) => a !== "--no-sandbox");
  const slot = slotFor({ flags, scrollbars });
  const ws = await withLock(slot.lock, async () => {
    try {
      const s = JSON.parse(readFileSync(slot.state, "utf8"));
      if (alive(s.pid)) return s.ws;
    } catch { /* none yet */ }
    return launchKept(slot, flags, scrollbars);
  });
  let browser;
  try { browser = await puppeteer.connect({ browserWSEndpoint: ws, defaultViewport: null }); }
  catch {
    // the state outlived its Chrome: start over
    rmSync(slot.state, { force: true });
    return sharedChrome({ args, ignoreDefaultArgs });
  }
  // a call keeps the reaper's clock at zero
  try { const t = new Date(); utimesSync(slot.state, t, t); } catch { /* fine */ }
  const context = await browser.createBrowserContext();
  return { browser, context, release: async () => { await context.close().catch(() => {}); await browser.disconnect(); } };
}
