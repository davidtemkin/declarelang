// test/streams-browser.test.mjs — the streams LANGUAGE tests at the real-
// transport tier. test/streams.test.mjs proves the whole Stream state machine
// over stub factories (the model tier); this suite proves the one thing stubs
// cannot: the browser factories themselves. EventStream dials a real
// EventSource against the dev server's /__sse fixture route (the
// addEventListener named-event path that `listenTo` exists for); Socket dials
// a real WebSocket against a TEST-OWNED /__ws echo — the `ws` package
// (devDependency, like puppeteer-core: users never install it), attached to
// this suite's own http server so the shipped server carries no dependency
// and no fixture code. Every assertion is about declared language behavior;
// the servers are scaffolding.
//
// Same puppeteer-core + findChrome setup as perceptual.test.mjs, so it runs
// wherever that one does.

import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { WebSocketServer } from "ws";
import { test, summarize } from "./harness.mjs";
import { createDeclareServer } from "../server/create.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function findChrome() {
  for (const c of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean))
    if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}

// distro mode, in-process, on an ephemeral port
const server = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});
// /__ws — the echo the Socket fixture dials: text frames come back "echo:"-
// prefixed. Routed ahead of the server's own upgrade listener (proxy traffic).
const wss = new WebSocketServer({ noServer: true });
wss.on("connection", (sock) => sock.on("message", (data) => sock.send("echo:" + data)));
const httpServer = http.createServer(server.handler).on("upgrade", (req, socket, head) => {
  if (req.url === "/__ws") wss.handleUpgrade(req, socket, head, (sock) => wss.emit("connection", sock, req));
  else server.upgrade(req, socket, head);
});
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${httpServer.address().port}`;

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
page.on("requestfailed", (r) => { if (!r.url().endsWith("favicon.ico")) errs.push("REQFAIL " + r.url().slice(-60)); });

try {
  await test("an EventStream receives named SSE events through a real EventSource", async () => {
    // test/fixtures/sse-live.declare: listenTo = ["tick"] against /__sse —
    // both named events land in order through the handler, and the constraint
    // carries the accumulated state to the screen.
    await page.goto(`${B}/test/fixtures/sse-live.declare`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForFunction(() => document.body.innerText.includes("sse:alphabeta"), { timeout: 15000 });
    assert.ok(await page.evaluate(() => document.body.innerText.includes("sse:alphabeta")),
      "both named events should land in order through the handler");
  });

  await test("a Socket sends and receives text frames through a real WebSocket", async () => {
    // test/fixtures/ws-live.declare: onOpen sends "ping", the echo lands in
    // onMessage, the constraint shows it — dial, send discipline, and the
    // text-frame receive path of the browser factory, end to end.
    await page.goto(`${B}/test/fixtures/ws-live.declare`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForFunction(() => document.body.innerText.includes("ws:echo:ping"), { timeout: 15000 });
    assert.ok(await page.evaluate(() => document.body.innerText.includes("ws:echo:ping")),
      "the echo should come back through onMessage");
  });

  await test("no page errors or failed requests through the run", () => {
    assert.deepEqual(errs, []);
  });
} finally {
  await browser.close();
  wss.close();
  httpServer.close();
}

summarize("streams (browser transport)");
