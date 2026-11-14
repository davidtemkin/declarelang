// chrome-reaper — ends a kept Chrome (chrome.mjs sharedChrome) once nothing has
// used it for a while. Each call touches the state file; when the file has not
// been touched for the idle time, the Chrome is stopped and its state removed.
//
//   node chrome-reaper.mjs <state.json> <chrome pid> <idle ms> <slot dir>
//
// When it stops the Chrome — or finds it gone — the whole slot goes with it,
// profile included: nothing of a kept Chrome outlives it on disk. A Chrome whose
// state now names another (a launch that replaced it) is stopped too: nothing
// can reach it.
import { statSync, rmSync, readFileSync } from "node:fs";

const [state, pidText, idleText, slotDir] = process.argv.slice(2);
const pid = Number(pidText), idle = Number(idleText);
const alive = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };

const timer = setInterval(() => {
  // mine: the state names this Chrome; false: it names another, or is gone;
  // null: unreadable this tick (a write in progress) — look again next tick
  let mine = null;
  try { mine = JSON.parse(readFileSync(state, "utf8")).pid === pid; }
  catch (e) { if (e?.code === "ENOENT") mine = false; }
  if (!alive(pid)) { if (mine) removeSlot(); clearInterval(timer); return; }
  if (mine === null) return;
  // superseded: nothing will ever connect to this Chrome again — end it rather
  // than leave it running for good
  if (!mine) { try { process.kill(pid); } catch { /* gone */ } clearInterval(timer); return; }
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
