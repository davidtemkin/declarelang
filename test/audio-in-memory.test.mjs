// Audio's inMemory and play(): a sound held in memory is decoded whole and each play() starts a voice of its own,
// overlapping; playing reads true while any voice sounds, and false stops them all. A
// streamed sound's play() starts it over, and an assignment to position always seeks.
// Where the page may not yet sound, its play is refused and playing goes back to
// false. test/probe/audio-in-memory.declare.
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize } from "./harness.mjs";
import { createDeclareServer } from "../server/create.mjs";
import { launchChrome } from "../tools/internal/chrome.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});
const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${httpServer.address().port}`;

async function open(browser) {
  const pg = await browser.newPage();
  await pg.evaluateOnNewDocument(() => {
    window.__voices = 0; window.__seeks = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) { window.__voices++; return start.apply(this, a); };
    const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentTime");
    Object.defineProperty(HTMLMediaElement.prototype, "currentTime", { get: d.get, set(v) { window.__seeks.push(v); d.set.call(this, v); }, configurable: true });
  });
  await pg.goto(`${B}/test/probe/audio-in-memory.declare`, { waitUntil: "networkidle0", timeout: 60000 });
  await pg.waitForFunction("window.__app != null && window.__declare.find('app.held').loaded && window.__declare.find('app.stream').loaded", { timeout: 30000 });
  return pg;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

{
  const browser = await launchChrome({ args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
  const pg = await open(browser);
  // the page's audio wakes on the first press, as a person's would
  await pg.keyboard.press("Shift");

  await test("plays of a sound held in memory are voices of their own, overlapping", async () => {
    const r = await pg.evaluate(async () => {
      const c = window.__declare.find("app.held");
      c.play(); c.play();
      const during = { voices: window.__voices, playing: c.playing };
      await new Promise((r) => setTimeout(r, c.duration * 1000 + 300));
      return { during, after: { playing: c.playing, ended: c.ended } };
    });
    assert.equal(r.during.voices, 2, "two plays, two voices");
    assert.equal(r.during.playing, true);
    assert.deepEqual(r.after, { playing: false, ended: true }, "playing goes false and ended true when the last voice ends");
  });

  await test("playing = false stops every voice of a sound held in memory", async () => {
    const r = await pg.evaluate(async () => {
      const c = window.__declare.find("app.held");
      c.play(); c.play();
      c.playing = false;
      await new Promise((r) => setTimeout(r, 50));
      return { playing: c.playing, ended: c.ended };
    });
    assert.equal(r.playing, false);
  });

  await test("a streamed sound's play() starts it over, and an assignment to position seeks", async () => {
    const r = await pg.evaluate(async () => {
      const s = window.__declare.find("app.stream");
      s.playing = true;
      await new Promise((r) => setTimeout(r, 120));
      window.__seeks.length = 0;
      s.play();
      const restarted = window.__seeks.slice();
      s.position = 0.05;
      await new Promise((r) => setTimeout(r, 20));
      return { restarted, seeks: window.__seeks.slice(), playing: s.playing };
    });
    assert.deepEqual(r.restarted, [0], "play() put the playhead back to the start");
    assert.ok(r.seeks.includes(0.05), `an assignment near the playhead still seeks (${JSON.stringify(r.seeks)})`);
    assert.equal(r.playing, true);
  });
  await browser.close();
}

{
  // the default policy, and no press: the page may not sound yet
  const browser = await launchChrome({ args: ["--no-sandbox"] });
  const pg = await open(browser);
  await test("a sound held in memory asked to play before the page may sound is refused, and says so", async () => {
    const r = await pg.evaluate(async () => {
      const c = window.__declare.find("app.held");
      c.play();
      await new Promise((r) => setTimeout(r, 50));
      return { voices: window.__voices, playing: c.playing };
    });
    assert.deepEqual(r, { voices: 0, playing: false });
  });
  await browser.close();
}

httpServer.close();
summarize("audio-in-memory");
