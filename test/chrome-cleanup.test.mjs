// chrome-cleanup — a Chrome the tools start leaves nothing behind: its profile is
// removed when it closes, and when the process that started it ends without
// closing it, that Chrome is stopped and its profile removed too.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

function run(body) {
  const file = join(tempDir("declare-chrome-cleanup-"), "run.mjs");
  writeFileSync(file, `import { launchChrome } from ${JSON.stringify(join(ROOT, "tools/internal/chrome.mjs"))};
const b = await launchChrome({ args: ["--no-sandbox"] });
console.log(JSON.stringify({ pid: b.process().pid, profile: b.process().spawnargs.find((a) => a.startsWith("--user-data-dir=")).slice(16) }));
${body}`);
  const r = spawnSync(process.execPath, [file], { encoding: "utf8" });
  return JSON.parse(r.stdout.trim().split("\n")[0]);
}

await test("a closed browser takes its profile with it", async () => {
  const r = run("await b.close();");
  await new Promise((res) => setTimeout(res, 300));
  assert.equal(existsSync(r.profile), false, r.profile);
});

await test("a process that ends without closing stops its Chrome and removes the profile", async () => {
  const r = run("process.exit(0);");
  await new Promise((res) => setTimeout(res, 500));
  assert.equal(alive(r.pid), false, `Chrome ${r.pid} still running`);
  assert.equal(existsSync(r.profile), false, r.profile);
});

// A SIGKILL runs no exit hook, so the Chrome outlives its launcher. The next
// launch anywhere stops it: left alone, it ran for days (2026-11-12).
await test("a launcher killed outright: the next launch stops its Chrome", async () => {
  const r = run("process.kill(process.pid, 'SIGKILL');");
  assert.equal(alive(r.pid), true, "the killed launcher's Chrome should still be running before the sweep");
  run("await b.close();");
  await new Promise((res) => setTimeout(res, 500));
  assert.equal(alive(r.pid), false, `Chrome ${r.pid} still running`);
  assert.equal(existsSync(r.profile), false, r.profile);
});

// On a Mac, a headless copy of the person's own Chrome can take its place in the
// Dock (⌘N and Quit reach a copy with no window), so the tools drive Chrome for
// Testing when it is installed — even for a caller that names the branded path.
await test("on a Mac with Chrome for Testing, the tools never drive the person's own Chrome", async () => {
  if (process.platform !== "darwin") return;
  const { findChrome } = await import(join(ROOT, "tools/internal/chrome.mjs"));
  if (!/Google Chrome for Testing$/.test(findChrome())) return;   // not installed here: nothing to hold
  const file = join(tempDir("declare-chrome-cleanup-"), "run.mjs");
  writeFileSync(file, `import { launchChrome } from ${JSON.stringify(join(ROOT, "tools/internal/chrome.mjs"))};
const b = await launchChrome({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args: ["--no-sandbox"] });
console.log(b.process().spawnargs[0]); await b.close();`);
  const out = spawnSync(process.execPath, [file], { encoding: "utf8" }).stdout.trim();
  assert.match(out, /Google Chrome for Testing$/);
});

summarize("chrome-cleanup");
