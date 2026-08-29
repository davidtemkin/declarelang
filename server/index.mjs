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
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createDeclareServer } from "./create.mjs";
import { loadConfig, ConfigError, CONFIG_NAME } from "./config.mjs";
import { MountError } from "./mounts.mjs";
import { ProxyError } from "./proxy.mjs";

const USAGE = `usage: declare dev [port] [--host <addr>] [--root <dir>] [--proxy <prefix>=<url>]
                   [--config <file> | --no-config] [--platform-prefix <p>] [--build-cache <dir>]

  port               default 8200 (also $PORT)
  --host <addr>      default 127.0.0.1; 0.0.0.0 to reach it from another device
  --root <dir>       the root mount (default: the directory of ${CONFIG_NAME}, else cwd)
  --proxy <p>=<url>  forward a url prefix to another server (repeatable)

Every start prints its identity (pid, root, started) and answers GET /__identity
with the same — if a page's console names a different server, THAT is the one
you are looking at. Docs: docs/operational/embedding.md`;

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) { console.log(USAGE); process.exit(0); }

let cfg;
try {
  cfg = loadConfig({ argv });
} catch (e) {
  if (e instanceof ConfigError) { console.error(`config: ${e.message}\n\n${USAGE}`); process.exit(1); }
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
const HOST = cfg.host;

// ── one port, one server ─────────────────────────────────────────────────────
// The OS does not enforce this for us: a listener on 0.0.0.0:8200 and one on
// 127.0.0.1:8200 coexist happily (macOS, Linux with SO_REUSEADDR — which Node
// sets), and then `curl localhost:8200` and a browser on another device reach
// DIFFERENT servers — each honestly serving its own tree. That is how "the dev
// server serves a stale build" was reported when no cache was stale at all
// (field report 2026-08-21). So before listening, ask: is anything already
// answering on this port? Loopback is the one address every binding of the
// port includes, so one probe covers both directions of the overlap.
async function whoHoldsPort(port) {
  const reachable = await new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
  });
  if (!reachable) return null;
  // Something answers. A Declare dev server names itself; anything else is
  // just "occupied".
  try {
    const r = await fetch(`http://127.0.0.1:${port}/__identity`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) return await r.json();
  } catch { /* not ours, or not HTTP */ }
  return {};
}

const holder = await whoHoldsPort(PORT);
if (holder !== null) {
  const who = holder.pid !== undefined
    ? `another Declare dev server — pid ${holder.pid}, root ${holder.root}, started ${holder.started}`
    : "a process that is not a Declare dev server";
  console.error(`port ${PORT} is already taken by ${who}.`);
  console.error(holder.pid !== undefined
    ? `  Two servers on one port number would each serve their own tree and you could not tell which one a page came from.\n  Stop it first:  kill ${holder.pid}   — or start this one elsewhere:  declare dev ${PORT + 1}`
    : `  Start this one elsewhere:  declare dev ${PORT + 1}`);
  process.exit(1);
}

// ── tied to the supervisor ───────────────────────────────────────────────────
// Under server/dev.mjs this process is a child with an IPC channel. When the
// supervisor goes — crash, kill -9, a closed terminal — the channel closes and
// this server goes with it, instead of living on as an orphan that holds the
// port, serves whatever modules it loaded at birth, and is invisible to
// tools/reload-dev.mjs (whose pid file died with the supervisor).
if (typeof process.send === "function") {
  process.on("disconnect", () => {
    console.log("dev server: supervisor gone — stopping with it");
    process.exit(0);
  });
}

http.createServer(server.handler)
  .on("upgrade", server.upgrade)
  .listen(PORT, HOST, () => {
    // the banner — printed every start, because most of the "forgotten magic"
    // failure mode is really "the server knew and did not say" (mounts.mjs)
    // Bound wide, name the LAN address too — the whole point of --host is a
    // URL another device can open.
    const shown = HOST === "0.0.0.0" || HOST === "::" ? "127.0.0.1" : HOST;
    console.log(`Declare dev server → http://${shown}:${PORT}/`);
    if (shown !== HOST) {
      for (const addrs of Object.values(os.networkInterfaces())) {
        for (const a of addrs ?? []) {
          if (a.family === "IPv4" && !a.internal) console.log(`                     http://${a.address}:${PORT}/  (LAN)`);
        }
      }
    }
    console.log("");
    // Identity first: the line to compare against a page's console when
    // something looks stale. (create.mjs — the same record is GET /__identity.)
    const id = server.identity();
    console.log(`  this server: pid ${id.pid} · started ${id.started} · toolchain ${id.toolchain}`);
    console.log("  mounts");
    console.log(server.describeMounts(server.mounts));
    const px = server.proxy.describe();
    if (px) { console.log("  proxy"); console.log(px); }
    console.log("  build cache");
    console.log(`    ${server.buildCache}`);
    if (cfg.configPath) console.log(`\n  config: ${path.relative(process.cwd(), cfg.configPath) || CONFIG_NAME}`);
    // The one line that makes the running program's introspection findable —
    // an agent built forty harnesses against a live app without discovering
    // explain()/slots() because nothing it ran ever said they existed
    // (field report 2026-08-19). This banner is something everyone runs.
    console.log("\n  every served app is inspectable while it runs:");
    console.log("    window.__declare in its console — __declare.help() lists the calls;");
    console.log("    __declare.build says when, from which files, and by which server the page was built;");
    console.log("    '?inspector' on the URL (or ⌥⌘D) opens the visual Inspector.");
    console.log("");
  });

// ── dev reload: BUILD-SIGNALED, never filesystem-watched ─────────────────────
// This process watches nothing. A rebuild reloads it ONLY when the build asks:
// `npm run build:dev` runs tsc, then tools/reload-dev.mjs signals the supervisor
// (server/dev.mjs) to respawn this process with fresh modules (ESM offers no
// in-place purge). Nothing restarts on unrelated writes, and open pages — which
// hold no server connection once loaded and register no SW under the dev server
// — are left entirely alone.
