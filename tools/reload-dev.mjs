// reload-dev.mjs — the build's hand on the dev server. Run after a build
// (`npm run build:dev` = tsc then this) to tell every running dev supervisor
// (server/dev.mjs) to respawn its server with the freshly built modules.
//
// It signals ONLY already-running supervisors (found by their per-port pid
// files); with no dev server up it is a quiet no-op, so a plain build (and the
// test suite's build) never touches anything. Loud on both ends — here, and in
// each supervisor.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server");

let pidFiles = [];
try { pidFiles = readdirSync(SERVER_DIR).filter((f) => /^\.dev-reload\..+\.pid$/.test(f)); } catch { /* no server dir */ }

if (pidFiles.length === 0) {
  console.log("reload: no dev server running — nothing to signal");
  process.exit(0);
}

let signaled = 0;
for (const f of pidFiles) {
  let pid = NaN;
  try { pid = Number(readFileSync(path.join(SERVER_DIR, f), "utf8").trim()); } catch { /* vanished */ }
  if (!Number.isInteger(pid) || pid <= 0) continue;
  try {
    process.kill(pid, "SIGUSR2");
    console.log(`reload: build → signaled the dev server (pid ${pid}) to reload with fresh modules`);
    signaled++;
  } catch (e) {
    console.log(`reload: dev server (pid ${pid}) not reachable (${e.code ?? e.message}) — stale pid file, ignoring`);
  }
}

if (signaled === 0) console.log("reload: no reachable dev server — nothing reloaded");
