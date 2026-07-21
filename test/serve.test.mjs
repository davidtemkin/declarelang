// test/serve.test.mjs — the embeddable server: the mount table, config
// discovery, the proxy, and the request handler over real HTTP. Covers the
// surface the rewrite of server/index.mjs introduced (mounts.mjs, config.mjs,
// proxy.mjs, create.mjs), which the rest of the suite does not touch.
//
// Two halves: pure-function cases (resolution, the startup guards, config
// precedence, proxy matching) that need no server, and integration cases that
// boot createDeclareServer on an ephemeral port in BOTH distro and workspace
// mode — including the ?build basename-collision regression and a live proxy.

import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { test, summarize } from "./harness.mjs";
import { createMounts, MountError } from "../server/mounts.mjs";
import { createProxy } from "../server/proxy.mjs";
import { loadConfig } from "../server/config.mjs";
import { createDeclareServer } from "../server/create.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const D = (p) => path.join(ROOT, p);

// ── mounts: resolution ───────────────────────────────────────────────────────
await test("mounts resolve a url in the root mount to its file", () => {
  const m = createMounts([{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }]);
  assert.equal(m.resolve("/apps/weather/weather.declare").rel, "apps/weather/weather.declare");
});
await test("mounts resolve the platform prefix to the platform dir", () => {
  const m = createMounts([{ prefix: "/", dir: D("apps") }, { prefix: "/declare/", dir: ROOT, platform: true }]);
  const hit = m.resolve("/declare/bundles/x.js");
  assert.equal(hit.rel, "bundles/x.js");
  assert.equal(hit.abs, D("bundles/x.js"));
});
await test("mounts: the bare prefix without a trailing slash still reaches its mount", () => {
  const m = createMounts([{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }]);
  assert.ok(m.resolve("/declare").rel !== undefined);
});
await test("mounts: a url escaping the mount dir with .. is rejected", () => {
  const m = createMounts([{ prefix: "/", dir: D("apps") }]);
  assert.equal(m.resolve("/../secret"), null);
});
await test("mounts.urlFor maps an absolute path back to its url", () => {
  const m = createMounts([{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }]);
  assert.equal(m.urlFor(D("apps/weather/weather.declare")), "/apps/weather/weather.declare");
});
await test("mounts.platformPrefix is the platform mount's prefix", () => {
  const m = createMounts([{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }]);
  assert.equal(m.platformPrefix, "/declare/");
});

// ── mounts: the startup guards (each MUST refuse, loudly) ─────────────────────
const refuses = (label, specs, needle) => test(`mounts refuse: ${label}`, () => {
  assert.throws(() => createMounts(specs), (e) => e instanceof MountError && e.message.includes(needle));
});
await refuses("no root mount", [{ prefix: "/x/", dir: ROOT }], "no root mount");
await refuses("two root mounts", [{ prefix: "/", dir: ROOT }, { prefix: "/", dir: D("apps") }], "more than one root");
await refuses("nested prefixes", [{ prefix: "/", dir: ROOT }, { prefix: "/a/", dir: ROOT }, { prefix: "/a/b/", dir: ROOT }], "may not nest");
await refuses("a prefix shadowing a real dir", [{ prefix: "/", dir: ROOT }, { prefix: "/apps/", dir: D("library") }], "shadows");
await refuses("a mount pointing at a missing dir", [{ prefix: "/", dir: ROOT }, { prefix: "/x/", dir: D("does-not-exist") }], "not a directory");
await test("mounts accept a valid disjoint table", () => {
  assert.doesNotThrow(() => createMounts([{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }]));
});

// ── config: discovery, precedence, mode ──────────────────────────────────────
await test("config with no file is distro mode (root === platform install)", () => {
  const c = loadConfig({ argv: [], cwd: os.tmpdir() });
  assert.equal(c.mode, "distro");
  const root = c.mountSpecs.find((m) => m.prefix === "/");
  assert.equal(path.resolve(root.dir), ROOT);
});
await test("config: a declare.json's location becomes the root mount (workspace mode)", () => {
  const ws = mkdtempSync(path.join(os.tmpdir(), "declare-ws-"));
  try {
    writeFileSync(path.join(ws, "declare.json"), JSON.stringify({ proxy: { "/api": "http://127.0.0.1:9" } }));
    const c = loadConfig({ argv: [], cwd: ws });
    assert.equal(c.mode, "workspace");
    assert.equal(path.resolve(c.mountSpecs.find((m) => m.prefix === "/").dir), path.resolve(ws));
    // the platform mount still points at the installation
    assert.equal(path.resolve(c.mountSpecs.find((m) => m.platform).dir), ROOT);
    assert.equal(c.proxy["/api"], "http://127.0.0.1:9");
  } finally { rmSync(ws, { recursive: true, force: true }); }
});
await test("config: a --proxy flag overrides the file per-prefix", () => {
  const ws = mkdtempSync(path.join(os.tmpdir(), "declare-ws-"));
  try {
    writeFileSync(path.join(ws, "declare.json"), JSON.stringify({ proxy: { "/api": "http://from-file:1" } }));
    const c = loadConfig({ argv: ["--proxy", "/api=http://from-flag:2"], cwd: ws });
    assert.equal(c.proxy["/api"], "http://from-flag:2");
  } finally { rmSync(ws, { recursive: true, force: true }); }
});
await test("config: a bare numeric arg sets the port", () => {
  assert.equal(loadConfig({ argv: ["8300"], cwd: os.tmpdir() }).port, 8300);
});

// ── proxy: matching ──────────────────────────────────────────────────────────
await test("proxy matches a prefix at a path boundary, not a substring", () => {
  const px = createProxy({ "/intent": "http://127.0.0.1:8000" });
  assert.ok(px.match("/intent"));
  assert.ok(px.match("/intent/foo"));
  assert.ok(px.match("/intent?q=1"));
  assert.equal(px.match("/intentional"), null);
  assert.equal(px.match("/other"), null);
});
await test("proxy: the longest matching prefix wins", () => {
  const px = createProxy({ "/api": "http://a:1", "/api/auth": "http://b:2" });
  assert.equal(px.match("/api/auth/login").target.origin, "http://b:2");
  assert.equal(px.match("/api/things").target.origin, "http://a:1");
});

// ── integration: boot the real handler over HTTP ─────────────────────────────
function listen(server) {
  return new Promise((resolve) => {
    const s = http.createServer(server.handler).on("upgrade", server.upgrade);
    s.listen(0, "127.0.0.1", () => resolve({ s, port: s.address().port }));
  });
}
const GET = (port, urlPath, headers = {}) =>
  fetch(`http://127.0.0.1:${port}${urlPath}`, { headers: { "sec-fetch-mode": "navigate", accept: "text/html", ...headers }, redirect: "manual" });

// a scratch build cache so these tests never touch the machine cache
const CACHE = mkdtempSync(path.join(os.tmpdir(), "declare-buildcache-"));

// ── distro mode ──────────────────────────────────────────────────────────────
await (async () => {
  const server = createDeclareServer({
    mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
    buildCache: CACHE, mode: "distro",
  });
  const { s, port } = await listen(server);
  try {
    await test("distro: a program runs (200) and its page carries the no-SW marker", async () => {
      const r = await GET(port, "/apps/weather/weather.declare");
      assert.equal(r.status, 200);
      assert.match(await r.text(), /__declareServer/);
    });
    await test("distro: a static asset serves", async () => {
      assert.equal((await GET(port, "/apps/weather/data/weather.json")).status, 200);
    });
    await test("distro: the platform prefix serves the same tree", async () => {
      assert.equal((await GET(port, "/declare/apps/weather/data/weather.json")).status, 200);
    });
    await test("distro: ?build redirects to a path-shaped build url", async () => {
      const r = await GET(port, "/apps/weather/weather.declare?build");
      assert.equal(r.status, 302);
      assert.equal(new URL(r.headers.get("location"), "http://x").pathname, "/build/apps/weather/");
    });
    await test("distro: POST /compile?main= resolves originDir (no crash on a relative include world)", async () => {
      const r = await fetch(`http://127.0.0.1:${port}/compile?main=${encodeURIComponent("/apps/weather/weather.declare")}`,
        { method: "POST", body: "App [ label: Text [ text = \"hi\" ] ]" });
      const j = await r.json();
      assert.ok(j.source, "expected a compiled source back");
    });
  } finally { s.close(); }
})();

// ── workspace mode + the ?build collision regression ─────────────────────────
await (async () => {
  const ws = mkdtempSync(path.join(os.tmpdir(), "declare-ws-"));
  // two DIFFERENT programs sharing the basename "weather" — the exact collision
  mkdirSync(path.join(ws, "shop"), { recursive: true });
  writeFileSync(path.join(ws, "shop", "shop.declare"), 'App [ label: Text [ text = "workspace shop" ] ]\n');
  const server = createDeclareServer({
    mountSpecs: [{ prefix: "/", dir: ws }, { prefix: "/declare/", dir: ROOT, platform: true }],
    proxy: { "/api": "http://127.0.0.1:1" }, buildCache: CACHE, mode: "workspace",
  });
  const { s, port } = await listen(server);
  try {
    await test("workspace: a program whose source is OUTSIDE the distro runs", async () => {
      assert.equal((await GET(port, "/shop/shop.declare")).status, 200);
    });
    await test("workspace: the platform is served from the installation via /declare/", async () => {
      assert.equal((await GET(port, "/declare/apps/weather/weather.declare")).status, 200);
    });
    await test("workspace: the run page boots the platform from the /declare/ prefix", async () => {
      const html = await (await GET(port, "/shop/shop.declare")).text();
      assert.match(html, /\/declare\/bundles\/declare-boot\.js/);
    });
    await test("workspace: ?build addresses the program by its own path", async () => {
      const r = await GET(port, "/shop/shop.declare?build");
      assert.equal(new URL(r.headers.get("location"), "http://x").pathname, "/build/shop/");
    });
  } finally { s.close(); rmSync(ws, { recursive: true, force: true }); }
})();

// ── the collision, proven: two same-named programs build to DIFFERENT bytes ──
await test("regression: same-named programs in different mounts do not collide", async () => {
  const a = mkdtempSync(path.join(os.tmpdir(), "declare-a-"));
  const b = mkdtempSync(path.join(os.tmpdir(), "declare-b-"));
  mkdirSync(path.join(a, "weather")); mkdirSync(path.join(b, "weather"));
  // distinct source → distinct compiled bytes; if the cache keyed on basename,
  // the second build would serve the first (the original bug).
  writeFileSync(path.join(a, "weather", "weather.declare"), 'App [ t: Text [ text = "AAA-alpha" ] ]\n');
  writeFileSync(path.join(b, "weather", "weather.declare"), 'App [ t: Text [ text = "BBB-beta" ] ]\n');
  const mk = (dir) => createDeclareServer({
    mountSpecs: [{ prefix: "/", dir }, { prefix: "/declare/", dir: ROOT, platform: true }],
    buildCache: CACHE, mode: "workspace",
  });
  const A = await listen(mk(a)), B = await listen(mk(b));
  try {
    const ja = await (await fetch(`http://127.0.0.1:${A.port}/build/weather/`)).text();
    const jb = await (await fetch(`http://127.0.0.1:${B.port}/build/weather/`)).text();
    // both build; each build's app.<hash>.js name differs because the source differs
    const nameA = (ja.match(/app\.[0-9a-f]+\.js/) || [])[0];
    const nameB = (jb.match(/app\.[0-9a-f]+\.js/) || [])[0];
    assert.ok(nameA && nameB, "both should produce a build");
    assert.notEqual(nameA, nameB, "distinct sources must produce distinct build artifacts");
  } finally {
    A.s.close(); B.s.close();
    rmSync(a, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true });
  }
});

// ── a live proxy forward (a real upstream on an ephemeral port) ──────────────
await test("proxy forwards a matched prefix to the upstream, streaming the body", async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, saw: req.url, host: req.headers.host }));
  });
  await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
  const upPort = upstream.address().port;
  const server = createDeclareServer({
    mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
    proxy: { "/api": `http://127.0.0.1:${upPort}` }, buildCache: CACHE, mode: "distro",
  });
  const { s, port } = await listen(server);
  try {
    const j = await (await fetch(`http://127.0.0.1:${port}/api/intent?q=x`)).json();
    assert.equal(j.ok, true);
    assert.equal(j.saw, "/api/intent?q=x");
    assert.equal(j.host, `127.0.0.1:${upPort}`, "upstream should see its own Host header");
  } finally { s.close(); upstream.close(); }
});

// a proxy prefix that shadows a mount must refuse at construction
await test("a proxy prefix shadowing a mount is refused at startup", () => {
  assert.throws(() => createDeclareServer({
    mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
    proxy: { "/declare": "http://127.0.0.1:1" }, buildCache: CACHE, mode: "distro",
  }), /shadows a mount/);
});

rmSync(CACHE, { recursive: true, force: true });
summarize("serve (embeddable server)");
