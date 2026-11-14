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
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, utimesSync, rmSync, statSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// NEVER THE PERSON'S OWN CHROME, ON A MAC. A headless Chrome started from
// /Applications/Google Chrome.app is, to macOS, a running instance of the app the
// person uses. With their own window closed or quit, the Dock, ⌘N and Quit go to
// the oldest such instance — one with no window to show — and Chrome cannot be
// opened at all until every headless one is gone (2026-11-12: five, left by runs
// two to six days old). Chrome for Testing is the same browser under another
// bundle identity (com.google.chrome.for.testing), so nothing the person does
// reaches it. Installed into the cache puppeteer already uses:
//   npx @puppeteer/browsers install chrome@stable --path ~/.cache/puppeteer
const BRANDED_MAC = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TESTING_CACHE = join(homedir(), ".cache", "puppeteer", "chrome");

/** The newest Chrome for Testing in the puppeteer cache, or null. */
function chromeForTesting() {
  if (process.platform !== "darwin") return null;
  let dirs = [];
  try { dirs = readdirSync(TESTING_CACHE).filter((d) => /^mac(_arm)?-\d/.test(d)); } catch { return null; }
  const version = (d) => d.replace(/^[^-]*-/, "").split(".").map(Number);
  dirs.sort((a, b) => { const x = version(a), y = version(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return (y[i] ?? 0) - (x[i] ?? 0); return 0; });
  for (const d of dirs) {
    for (const arch of ["chrome-mac-arm64", "chrome-mac-x64"]) {
      const c = join(TESTING_CACHE, d, arch, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
      if (existsSync(c)) return c;
    }
  }
  return null;
}

let warned = false;
/** The Chrome to drive: PUPPETEER_EXECUTABLE_PATH / CHROME_PATH, else Chrome for
 *  Testing on a Mac, else the usual installs. */
export function findChrome() {
  for (const c of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH, chromeForTesting()].filter(Boolean))
    if (existsSync(c)) return c;
  if (process.platform === "darwin" && existsSync(BRANDED_MAC) && !warned) {
    warned = true;
    process.stderr.write("chrome.mjs: no Chrome for Testing — driving /Applications/Google Chrome, whose headless copies can take the place of your own Chrome. Install it: npx @puppeteer/browsers install chrome@stable --path ~/.cache/puppeteer\n");
  }
  for (const c of [BRANDED_MAC, "/usr/bin/google-chrome", "/usr/bin/chromium"])
    if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}

/** A path a caller named, with the person's own Chrome on a Mac swapped for
 *  findChrome()'s — callers that spelled the branded path out get the same
 *  protection as those that ask. */
function driven(path) {
  return path === undefined || path === BRANDED_MAC ? findChrome() : path;
}

/** Stop every Chrome whose command line names this profile — the ones a process
 *  that ended without closing them (a SIGKILL, a crash) left running. */
function stopChromesOn(profile) {
  let out = "";
  try { out = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" }); } catch { return; }
  for (const line of out.split("\n")) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (m === null || !(m[2] + " ").includes(`--user-data-dir=${profile} `) || / --type=/.test(m[2])) continue;
    try { process.kill(Number(m[1]), "SIGKILL"); } catch { /* gone */ }
  }
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
    // its launcher is gone, so a Chrome still on it has no one to close it
    stopChromesOn(dir);
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
  const browser = await puppeteer.launch({ headless: true, ...opts, executablePath: driven(opts.executablePath), args: [...(opts.args ?? []), ...quiet], userDataDir: profile });
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

/** The kept Chrome's state, with the reaper that ends it once it sits idle. */
function startReaper(slot, s) {
  const reaper = spawn(process.execPath, [join(HERE, "chrome-reaper.mjs"), slot.state, String(s.pid), String(IDLE_MS), slot.dir], { detached: true, stdio: "ignore" });
  reaper.unref();
  writeFileSync(slot.state, JSON.stringify({ pid: s.pid, ws: s.ws, reaper: reaper.pid }));
}

async function launchKept(slot, args, scrollbars) {
  rmSync(join(slot.profile, "DevToolsActivePort"), { force: true });
  const proc = spawn(findChrome(), [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${slot.profile}`,
    "--no-first-run", "--no-default-browser-check", "--mute-audio",
    // never the login keychain: a Chrome that is not the person's own asks for
    // "Chrome Safe Storage" at every launch, one dialog each (puppeteer.launch
    // passes this itself)
    "--use-mock-keychain", "--password-store=basic",
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
        startReaper(slot, { pid: proc.pid, ws });
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
  sweepProfiles();
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
      if (alive(s.pid)) {
        // a reaper that died (killed by PID, crashed) left its Chrome with no
        // end: the call that finds it so gives it a new one
        if (!(s.reaper > 0 && alive(s.reaper))) startReaper(slot, s);
        return s.ws;
      }
    } catch { /* none yet */ }
    return launchKept(slot, flags, scrollbars);
  });
  let browser;
  try { browser = await puppeteer.connect({ browserWSEndpoint: ws, defaultViewport: null }); }
  catch {
    // the state outlived its Chrome (or its Chrome stopped answering): end it,
    // or it runs on with no state naming it and no reaper, and start over
    try { process.kill(JSON.parse(readFileSync(slot.state, "utf8")).pid, "SIGKILL"); } catch { /* gone */ }
    rmSync(slot.state, { force: true });
    return sharedChrome({ args, ignoreDefaultArgs });
  }
  // a call keeps the reaper's clock at zero
  try { const t = new Date(); utimesSync(slot.state, t, t); } catch { /* fine */ }
  const context = await browser.createBrowserContext();
  // Release: the context's disposal is asked for, and waited on two seconds at
  // most. Chrome carries a disposal through once asked, whoever is listening; a
  // large page's teardown took ten (Murmur run 15), every call, with nothing for
  // the caller to wait for.
  return { browser, context, release: async () => {
    await Promise.race([context.close().catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
    await browser.disconnect();
  } };
}
