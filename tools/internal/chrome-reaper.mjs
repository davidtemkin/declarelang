// chrome-reaper — ends a kept Chrome (chrome.mjs sharedChrome) once nothing has
// used it for a while. Each call touches the state file; when the file has not
// been touched for the idle time, the Chrome is stopped and its state removed.
//
//   node chrome-reaper.mjs <state.json> <chrome pid> <idle ms> <slot dir>
//
// When it stops the Chrome — or finds it gone — the whole slot goes with it,
// profile included: nothing of a kept Chrome outlives it on disk.
import { statSync, rmSync, readFileSync } from "node:fs";

const [state, pidText, idleText, slotDir] = process.argv.slice(2);
const pid = Number(pidText), idle = Number(idleText);
const alive = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };

// Stopped itself (a kill by PID, a closed terminal): its Chrome goes with it. A
// reaper that just exited left a headless Chrome running for good — and on a Mac
// one running from the person's own Chrome.app takes their Dock click, so their
// Chrome would not open a window.
for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(sig, () => {
  let mine = false;
  try { mine = JSON.parse(readFileSync(state, "utf8")).pid === pid; } catch { /* gone */ }
  if (mine) { try { process.kill(pid); } catch { /* gone */ } setTimeout(() => { removeSlot(); process.exit(0); }, 3000); }
  else process.exit(0);
});

const timer = setInterval(() => {
  let mine = false;
  try { mine = JSON.parse(readFileSync(state, "utf8")).pid === pid; } catch { /* gone */ }
  if (!alive(pid)) { if (mine) removeSlot(); clearInterval(timer); return; }
  if (!mine) { clearInterval(timer); return; }
  let since = Infinity;
  try { since = Date.now() - statSync(state).mtimeMs; } catch { /* gone */ }
  if (since > idle) {
    try { process.kill(pid); } catch { /* gone */ }
    clearInterval(timer);
    // Chrome writes to its profile as it exits: remove it once it has
    setTimeout(removeSlot, 3000);
  }
}, 30_000);

function removeSlot() {
  try { rmSync(slotDir ?? state, { recursive: true, force: true }); } catch { /* best effort */ }
}
