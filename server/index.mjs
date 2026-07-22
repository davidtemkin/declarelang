// server/index.mjs — the Declare dev server's entry point. Loads the config,
// builds the handler (server/create.mjs), prints the mount/proxy banner, and
// listens. The server itself is the factory; this file is its first caller.
//
//   npm start                          # http://127.0.0.1:8200/  (distro mode)
//   node server/index.mjs 8300         # a different port
//   node server/index.mjs --root frontend --proxy /intent=http://127.0.0.1:8000
//   # …or put a declare.json in your project and run from inside it — its
//   # location IS the root mount (docs/operational/embedding.md).
//
// The program URL is the app's canonical address (the OpenLaszlo model,
// …/calendar.lzx?lzt=…) — identical here and on the SW static host. One request
// per URL; docs/system-design/requests.md is the full surface.

import http from "node:http";
import path from "node:path";
import { createDeclareServer } from "./create.mjs";
import { loadConfig, ConfigError, CONFIG_NAME } from "./config.mjs";
import { MountError } from "./mounts.mjs";
import { ProxyError } from "./proxy.mjs";

let cfg;
try {
  cfg = loadConfig({ argv: process.argv.slice(2) });
} catch (e) {
  if (e instanceof ConfigError) { console.error(`config: ${e.message}`); process.exit(1); }
  throw e;
}

let server;
try {
  server = createDeclareServer({ ...cfg });
} catch (e) {
  if (e instanceof MountError || e instanceof ProxyError) { console.error(`${e.message}`); process.exit(1); }
  throw e;
}

const PORT = cfg.port;

http.createServer(server.handler)
  .on("upgrade", server.upgrade)
  .listen(PORT, "127.0.0.1", () => {
    // the banner — printed every start, because most of the "forgotten magic"
    // failure mode is really "the server knew and did not say" (mounts.mjs)
    console.log(`Declare dev server → http://127.0.0.1:${PORT}/\n`);
    console.log("  mounts");
    console.log(server.describeMounts(server.mounts));
    const px = server.proxy.describe();
    if (px) { console.log("  proxy"); console.log(px); }
    console.log("  build cache");
    console.log(`    ${server.buildCache}`);
    if (cfg.configPath) console.log(`\n  config: ${path.relative(process.cwd(), cfg.configPath) || CONFIG_NAME}`);
    console.log("");
  });

// ── dev reload: BUILD-SIGNALED, never filesystem-watched ─────────────────────
// This process watches nothing. A rebuild reloads it ONLY when the build asks:
// `npm run build:dev` runs tsc, then tools/reload-dev.mjs signals the supervisor
// (server/dev.mjs) to respawn this process with fresh modules (ESM offers no
// in-place purge). Nothing restarts on unrelated writes, and open pages — which
// hold no server connection once loaded and register no SW under the dev server
// — are left entirely alone.
