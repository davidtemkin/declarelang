// dev.mjs — the dev supervisor. server/index.mjs imports compiler/dist once at
// startup, and ESM has no cache purge, so after a rebuild (tsc, esbuild) the
// running server would keep compiling with yesterday's compiler. The honest
// reload is a respawn — but it happens ONLY when the BUILD explicitly asks for
// it, never from watching the filesystem.
//
// The trigger is a signal, not a watcher: `npm run build:dev` runs the build
// and then tools/reload-dev.mjs, which SIGUSR2s this supervisor; the supervisor
// respawns the server with fresh modules and says so. Nothing reloads on
// unrelated writes, and open browser pages (no server connection once loaded,
// no SW under the dev server) are left entirely alone.
//
//   npm start                    → node server/dev.mjs   (supervisor; build:dev reloads it)
//   node server/dev.mjs 8300     → a different port (args forward to index.mjs)
//   node server/dev.mjs --root … → mount/proxy flags forward too (see index.mjs)
//   npm run build:dev            → build, then signal the running supervisor to reload
//   node server/index.mjs        → the bare server, no supervisor (CI, one-offs)

import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, "index.mjs");
// tools/reload-dev.mjs finds the supervisor through this file (the build has no
// other handle on the running process). Keyed by PORT so two dev servers — say
// the app on 8300 and the test suite's `npm start` on 8200 — never clobber each
// other's handle. The port can arrive as $PORT or as a bare numeric arg (the
// form index.mjs accepts, `node server/dev.mjs 8300`); mirror both here.
const argPort = process.argv.slice(2).find((a) => /^\d+$/.test(a));
const PORT = process.env.PORT ?? argPort ?? "8200";
const PID_FILE = path.join(HERE, `.dev-reload.${PORT}.pid`);

let child = null;
let stopping = false;
let reloading = false;

const cleanup = () => { try { unlinkSync(PID_FILE); } catch { /* already gone */ } };

const start = () => {
  child = spawn(process.execPath, [SERVER, ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env } });
  child.on("exit", (code, signal) => {
    child = null;
    if (reloading) { reloading = false; start(); return; } // a build-signaled respawn
    cleanup();
    process.exit(code ?? (signal ? 1 : 0));                // the server stopped on its own → so do we
  });
};

// Build-signaled reload — the ONLY thing that restarts the server.
process.on("SIGUSR2", () => {
  if (child === null || reloading || stopping) return;
  console.log("dev: ◆ build signaled a reload — restarting the server with fresh modules");
  reloading = true;
  child.kill("SIGTERM"); // the exit handler above respawns
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopping = true;
    if (child !== null) child.kill(sig);
    else { cleanup(); process.exit(0); }
  });
}

writeFileSync(PID_FILE, String(process.pid));
start();
