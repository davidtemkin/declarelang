// server/toolchain.mjs — the dev server's hand on a RELOADABLE toolchain.
// create.mjs must never compile with yesterday's compiler: the toolchain
// modules live in a worker realm (toolchain-worker.mjs), and before every
// delegated operation the dist fingerprint — file names + mtimes over
// runtime/dist and compiler/dist, the same probe the /build cache keys on —
// is re-checked. A mismatch respawns the worker: a fresh module registry,
// the honest reload ESM cannot perform in place. This is the server-side
// twin of the browser's invalidation (BUILD_ID drops every cached compile
// when the platform changes), so both transports revalidate against the
// same fact and stay in identical-output parity.
//
// An installed (node_modules) platform's dists never change, so its
// fingerprint is constant and the worker simply lives forever — no gate
// needed. The supervisor respawn (server/dev.mjs, `npm run build:dev`)
// remains the reload for the SERVER's own code; this realm covers exactly
// the toolchain.

import { Worker } from "node:worker_threads";
import path from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

export function createToolchain(platformDir) {
  const dists = [path.join(platformDir, "runtime", "dist"), path.join(platformDir, "compiler", "dist")];

  function fingerprint() {
    let acc = "";
    for (const dist of dists) {
      if (!existsSync(dist)) continue;
      for (const f of readdirSync(dist)) if (f.endsWith(".js")) acc += f + statSync(path.join(dist, f)).mtimeMs + ";";
    }
    return createHash("sha256").update(acc).digest("hex").slice(0, 8);
  }

  let live = null; // { fp, worker, pending: Map<id, {resolve, reject}>, nextId }
  let spawns = 0;

  const failAll = (s, why) => {
    for (const { reject } of s.pending.values()) reject(new Error(why));
    s.pending.clear();
  };

  function ensure() {
    const fp = fingerprint();
    if (live !== null && live.fp === fp) return live;
    if (live !== null) {
      const old = live;
      live = null;
      failAll(old, "toolchain reloaded mid-flight — retry");
      old.worker.terminate();
    }
    const worker = new Worker(new URL("./toolchain-worker.mjs", import.meta.url));
    const s = { fp, worker, pending: new Map(), nextId: 1 };
    worker.on("message", (m) => {
      const p = s.pending.get(m.id);
      if (!p) return;
      s.pending.delete(m.id);
      if (s.pending.size === 0) worker.unref(); // idle again — release the loop
      if (m.error !== undefined) p.reject(new Error(m.error));
      else p.resolve(m.result);
    });
    worker.on("error", (e) => { if (live === s) live = null; failAll(s, "toolchain worker error: " + e.message); });
    worker.on("exit", (code) => { if (live === s) live = null; failAll(s, "toolchain worker exited (" + code + ")"); });
    // Idle, the realm must never hold the process open (a test's last compile
    // done, the process should exit) — but an IN-FLIGHT call must: ref/unref
    // track the pending set, so the event loop lives exactly as long as work does.
    worker.unref();
    live = s;
    spawns++;
    if (spawns > 1) console.log(`toolchain: dist changed — realm respawned (fingerprint ${fp})`);
    return s;
  }

  function call(type, payload) {
    const s = ensure();
    return new Promise((resolve, reject) => {
      const id = s.nextId++;
      if (s.pending.size === 0) s.worker.ref(); // first in-flight op holds the loop
      s.pending.set(id, { resolve, reject });
      s.worker.postMessage({ type, id, ...payload });
    });
  }

  return {
    compile: (source, opts) => call("compile", { source, opts }),
    compileTracked: (source, opts) => call("compileTracked", { source, opts }),
    extract: (source, originDir, opts = {}) => call("extract", { source, originDir, ...opts }),
    production: (args) => call("production", { args }),
    fresh: (closure, props) => call("fresh", { closure, props }),
    highlight: (src) => call("highlight", { src }),
    metrics: (src) => call("metrics", { src }),
    fingerprint,
    stats: () => ({ spawns }),
  };
}
