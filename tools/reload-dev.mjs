// reload-dev.mjs — the build's hand on the dev server. Run after a build
// (`npm run build:dev` = tsc then this) to tell every running dev supervisor
// (server/dev.mjs) to respawn its server with the freshly built modules.
//
// It signals ONLY already-running supervisors (found by their per-port pid
// files); with no dev server up it is a quiet no-op, so a plain build (and the
// test suite's build) never touches anything. Loud on both ends — here, and in
// each supervisor.
//
// Then one more question, because a pid file is only THIS checkout's handle:
// is something answering on the dev port anyway? A server started from another
// checkout (a clone, a worktree, node_modules/declarelang) has its pid file
// elsewhere and will keep serving its own modules no matter how many builds run
// here. Saying "no dev server running" while one answers on :8200 sent an
// agent chasing a stale build for half an hour (field report 2026-08-21); now
// it is named.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server");

let pidFiles = [];
try { pidFiles = readdirSync(SERVER_DIR).filter((f) => /^\.dev-reload\..+\.pid$/.test(f)); } catch { /* no server dir */ }

let signaled = 0;
const signaledPorts = new Set();
for (const f of pidFiles) {
  let pid = NaN;
  try { pid = Number(readFileSync(path.join(SERVER_DIR, f), "utf8").trim()); } catch { /* vanished */ }
  if (!Number.isInteger(pid) || pid <= 0) continue;
  try {
    process.kill(pid, "SIGUSR2");
    console.log(`reload: build → signaled the dev server (pid ${pid}) to reload with fresh modules`);
    signaled++;
    signaledPorts.add(f.replace(/^\.dev-reload\.(.+)\.pid$/, "$1"));
  } catch (e) {
    console.log(`reload: dev server (pid ${pid}) not reachable (${e.code ?? e.message}) — stale pid file, ignoring`);
  }
}

// The port question. $PORT or 8200 — the same default the supervisor uses.
const port = process.env.PORT ?? "8200";
if (!signaledPorts.has(port)) {
  let who = null;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/__identity`, { signal: AbortSignal.timeout(1000) });
    if (r.ok) who = await r.json();
  } catch { /* nothing there, or not a Declare server — either way not ours to signal */ }
  if (who !== null && who.pid !== undefined) {
    console.log(`reload: ⚠ a dev server IS answering on :${port} — pid ${who.pid}, root ${who.root}, started ${who.started}`);
    console.log(`        but it was not started by this checkout's supervisor, so this build cannot reload it.`);
    console.log(`        It keeps serving the modules it loaded at birth. Stop it (kill ${who.pid}) and start one here.`);
    process.exit(0);
  }
}

if (pidFiles.length === 0) console.log("reload: no dev server running — nothing to signal");
else if (signaled === 0) console.log("reload: no reachable dev server — nothing reloaded");
