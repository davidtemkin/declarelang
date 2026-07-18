// dev.mjs — the dev supervisor: the SERVER-SIDE twin of the service worker's
// version check (David's framing). In static deployment the SW drops its
// cache bucket when version.json's BUILD_ID bumps; in dev the stale thing is
// not the browser but THIS PROCESS — server/index.mjs imports compiler/dist
// once at startup, and ESM has no cache purge, so a rebuild (tsc, esbuild,
// gen-themes) leaves the running server compiling with yesterday's compiler.
//
// The honest reload is a respawn: index.mjs watches the build outputs and
// exits with code 42 when they change; this supervisor restarts it. Any
// other exit passes through (Ctrl-C stops both).
//
//   npm start            → node server/dev.mjs   (watch + respawn)
//   node server/index.mjs → the bare server, no watching (CI, one-offs)

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, "index.mjs");
const RELOAD_EXIT = 42;

let child = null;
let stopping = false;

const start = () => {
  child = spawn(process.execPath, [SERVER], {
    stdio: "inherit",
    env: { ...process.env, DECLARE_DEV_WATCH: "1" },
  });
  child.on("exit", (code) => {
    if (stopping) process.exit(code ?? 0);
    if (code === RELOAD_EXIT) {
      console.log("dev: build changed — restarting the server with the fresh modules");
      start();
    } else {
      process.exit(code ?? 0);
    }
  });
};

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopping = true;
    child?.kill(sig);
  });
}

start();
