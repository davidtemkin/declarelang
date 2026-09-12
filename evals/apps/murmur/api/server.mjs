#!/usr/bin/env node
// server — murmur's conversation service: history, media, and a live feed.
//
//   node api/server.mjs --port=8330 --seed=1 [--live]
//
// The feed is DETERMINISTIC for a seed. Every unbidden event has a fixed
// offset from the moment a client connects, and every answer-to-a-send has a
// fixed delay, so two runs — or two different applications — see the same
// conversation happen at the same moments. That is what makes captures from
// different implementations comparable at all. `--live` randomises the
// schedule for hands-on play; it is not for measuring.
//
// Each connection gets its own schedule, timed from its own connect.

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, createReadStream } from "node:fs";
import { join, resolve, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const HERE = dirname(fileURLToPath(import.meta.url));
const TASK = resolve(HERE, "..");
const FIXTURES = join(TASK, "fixtures");

const flag = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const PORT = Number(flag("port", 8330));
const SEED = Number(flag("seed", 1));
const LIVE = process.argv.includes("--live");

if (!existsSync(join(FIXTURES, "threads.json"))) {
  console.error(`no fixtures — run: node api/build-fixture.mjs`);
  process.exit(2);
}
const HISTORY = JSON.parse(readFileSync(join(FIXTURES, "threads.json"), "utf8"));

// ── seeded rng ───────────────────────────────────────────────────────────────
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── how quickly each conversation answers a send ─────────────────────────────
// t4 is slow ON PURPOSE: it is the long one, so it is where you can scroll back
// into history and still be there when something arrives (brief S8 / G4).
const ANSWER = {
  t1: { composing: 700, message: 2200 },
  t2: { composing: 650, message: 2000 },
  t3: { composing: 800, message: 2400 },
  t4: { composing: 3800, message: 9200 },
  t5: { composing: 700, message: 2100 },
  t6: { composing: 900, message: 2600 },
};
const SLOW_THREAD = "t4";

// what a conversation says back when you send into it
const ANSWERS = {
  t1: [["p2", "ok noted"], ["p4", "adding it to the list"], ["p5", "on it"]],
  t2: [["p2", "perfect"], ["p2", "see you at eleven"], ["p2", "ha, yes"]],
  t3: [["p4", "got it"], ["p4", "I'll look tonight"], ["p4", "not touching march"]],
  t4: [["p5", "makes sense to me"], ["p7", "agreed, let's do that"], ["p5", "I'll add it to the write-up"]],
  t5: [["p3", "exactly"], ["p3", "thought you'd say that"], ["p3", "😂"]],
  t6: [["p6", "outrageous"], ["p8", "seconded"], ["p7", "this is why we can't have nice books"]],
};

// ── the unbidden schedule ────────────────────────────────────────────────────
// offsets in ms from connect. Deliberately spread across conversations the app
// is probably NOT showing, so the list has to react (G2), and with one landing
// in the long conversation late enough to be scrolled back into (G4).
const PLAN = [
  { at: 4200, kind: "composing", thread: "t3", person: "p4" },
  { at: 6100, kind: "message", thread: "t3", person: "p4", text: "actually — one more column question" },
  { at: 12000, kind: "message", thread: "t6", person: "p8", text: "six hundred pages of WHAT though" },
  { at: 16500, kind: "reaction", thread: "t1", back: 3, person: "p2", emoji: "😂" },
  { at: 21000, kind: "seen", thread: "t2", person: "p2" },
  { at: 26000, kind: "composing", thread: "t1", person: "p5" },
  { at: 28900, kind: "message", thread: "t1", person: "p5", text: "the clanking is back by the way" },
  { at: 35000, kind: "reaction", thread: "t4", back: 2, person: "p7", emoji: "👀" },
  { at: 41000, kind: "message", thread: "t5", person: "p3", text: "walked past again today. still that colour." },
  { at: 52000, kind: "composing", thread: "t6", person: "p6" },
  { at: 54800, kind: "message", thread: "t6", person: "p6", text: "weather. it is six hundred pages of weather." },
  { at: 63000, kind: "composing", thread: "t2", person: "p2" },
  { at: 64500, kind: "composing-stop-only", thread: "t2", person: "p2" },
  { at: 72000, kind: "message", thread: "t3", person: "p4", text: "never mind, worked it out" },
  { at: 86000, kind: "reaction", thread: "t6", back: 1, person: "p3", emoji: "💀" },
  { at: 97000, kind: "message", thread: "t1", person: "p2", text: "landlord says thursday between 9 and 1" },
  { at: 112000, kind: "composing", thread: "t4", person: "p7" },
  { at: 115400, kind: "message", thread: "t4", person: "p7", text: "started the amendment paperwork, it's worse than I remembered" },
  { at: 131000, kind: "seen", thread: "t1", person: "p4" },
  { at: 148000, kind: "message", thread: "t6", person: "p7", text: "I'm bringing a shorter book to the next one out of protest" },
  { at: 166000, kind: "message", thread: "t2", person: "p2", text: "they've moved it to the back room, less crowded" },
  { at: 191000, kind: "message", thread: "t4", person: "p5", text: "photos are in. they do the arguing." },
  { at: 214000, kind: "message", thread: "t5", person: "p3", text: "the tree is still winning" },
  { at: 238000, kind: "message", thread: "t1", person: "p4", text: "who is going to be here thursday morning" },
];

// message ids continue where the history stopped
let maxId = 0;
for (const t of HISTORY.threads)
  for (const m of t.messages) maxId = Math.max(maxId, Number(m.id.slice(1)));

/** Build one connection's schedule. Seeded — the same seed gives the same plan. */
function buildSchedule(seed) {
  const r = rng(seed);
  return PLAN.map((e) => {
    const jitter = LIVE ? Math.round((r() - 0.5) * 4000) : 0;
    return { ...e, at: Math.max(500, e.at + jitter) };
  });
}

/** The message a plan entry becomes, at fire time. */
function messageFrom(e, idFn) {
  return { id: idFn(), from: e.person, at: new Date().toISOString(), kind: "text", text: e.text };
}

function targetMessage(threadId, back) {
  const t = HISTORY.threads.find((x) => x.id === threadId);
  return t.messages[Math.max(0, t.messages.length - 1 - back)].id;
}

// ── http ─────────────────────────────────────────────────────────────────────
const MIME = { ".json": "application/json", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".m4a": "audio/mp4", ".mp4": "video/mp4" };

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const cors = { "Access-Control-Allow-Origin": "*" };

  if (url.pathname === "/threads.json") {
    res.writeHead(200, { ...cors, "content-type": "application/json" });
    return res.end(JSON.stringify(HISTORY));
  }
  if (url.pathname === "/schedule.json") {
    res.writeHead(200, { ...cors, "content-type": "application/json" });
    return res.end(JSON.stringify({
      seed: SEED, live: LIVE, slowThread: SLOW_THREAD, answer: ANSWER,
      unbidden: buildSchedule(SEED),
    }, null, 1));
  }

  // media, from fixtures/ only
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "").replace(/^\//, "");
  const file = join(FIXTURES, rel);
  if (rel && file.startsWith(FIXTURES) && existsSync(file) && statSync(file).isFile()) {
    const type = MIME[extname(file)] ?? "application/octet-stream";
    const size = statSync(file).size;
    const base = { ...cors, "content-type": type, "cache-control": "no-store",
      "accept-ranges": "bytes" };

    // RANGE REQUESTS ARE NOT OPTIONAL for the voice clips. Without them a
    // browser will report a clip's duration, fire `seeked`, and then silently
    // refuse to move `currentTime` off zero — so a scrubber cannot be built
    // against this service at all, and BOTH arms fail G9/S13 for a reason that
    // has nothing to do with either of them. Measured, not assumed: seeking to
    // 66% left currentTime at 0 until this landed.
    const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    if (range) {
      let start = range[1] === "" ? null : Number(range[1]);
      let end = range[2] === "" ? null : Number(range[2]);
      if (start === null) { start = Math.max(0, size - (end ?? 0)); end = size - 1; }
      else if (end === null || end >= size) end = size - 1;
      if (start > end || start >= size) {
        res.writeHead(416, { ...cors, "content-range": `bytes */${size}` });
        return res.end();
      }
      res.writeHead(206, { ...base, "content-range": `bytes ${start}-${end}/${size}`,
        "content-length": end - start + 1 });
      return createReadStream(file, { start, end }).pipe(res);
    }

    res.writeHead(200, { ...base, "content-length": size });
    return createReadStream(file).pipe(res);
  }
  res.writeHead(404, cors);
  res.end("not found");
});

// ── the live feed ────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: "/live" });

wss.on("connection", (ws) => {
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  const send = (o) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(o)); };
  let localMax = maxId;
  const idFn = () => `m${String(++localMax).padStart(4, "0")}`;

  send({ t: "hello", me: HISTORY.me, serverNow: Date.now() });

  for (const e of buildSchedule(SEED)) {
    if (e.kind === "composing") {
      at(e.at, () => send({ t: "composing", thread: e.thread, person: e.person, state: "start" }));
    } else if (e.kind === "composing-stop-only") {
      // someone begins writing and thinks better of it — no message follows
      at(e.at, () => send({ t: "composing", thread: e.thread, person: e.person, state: "stop" }));
    } else if (e.kind === "message") {
      at(e.at, () => {
        send({ t: "composing", thread: e.thread, person: e.person, state: "stop" });
        send({ t: "message", thread: e.thread, message: messageFrom(e, idFn) });
      });
    } else if (e.kind === "reaction") {
      at(e.at, () => send({ t: "reaction", thread: e.thread, message: targetMessage(e.thread, e.back),
        person: e.person, emoji: e.emoji }));
    } else if (e.kind === "seen") {
      at(e.at, () => {
        const t = HISTORY.threads.find((x) => x.id === e.thread);
        send({ t: "seen", thread: e.thread, person: e.person, through: t.messages.at(-1).id });
      });
    }
  }

  let answered = 0;
  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }

    if (msg.t === "send") {
      const m = { id: idFn(), from: HISTORY.me, at: new Date().toISOString(),
        ...(msg.kind === "photo" ? { kind: "photo", src: msg.src, alt: msg.alt ?? "" }
                                 : { kind: "text", text: String(msg.text ?? "") }) };
      send({ t: "sent", ref: msg.ref ?? null, message: m });

      // the conversation answers — slowly, in the one that is slow on purpose
      const delay = ANSWER[msg.thread] ?? ANSWER.t1;
      const pool = ANSWERS[msg.thread] ?? ANSWERS.t1;
      const [person, text] = pool[answered++ % pool.length];
      at(delay.composing, () => send({ t: "composing", thread: msg.thread, person, state: "start" }));
      at(delay.message, () => {
        send({ t: "composing", thread: msg.thread, person, state: "stop" });
        send({ t: "message", thread: msg.thread,
          message: { id: idFn(), from: person, at: new Date().toISOString(), kind: "text", text } });
      });
      return;
    }

    if (msg.t === "react") {
      send({ t: "reaction", thread: msg.thread, message: msg.message,
        person: HISTORY.me, emoji: msg.emoji });
    }
  });

  ws.on("close", () => timers.forEach(clearTimeout));
});

server.listen(PORT, () => {
  const n = HISTORY.threads.reduce((a, t) => a + t.messages.length, 0);
  console.log(`murmur service · http://localhost:${PORT}`);
  console.log(`  ${HISTORY.threads.length} conversations · ${n} messages · seed ${SEED}${LIVE ? " · LIVE (not for measuring)" : ""}`);
  console.log(`  history  GET /threads.json      media  GET /photos|voice|avatars/…`);
  console.log(`  feed     ws://localhost:${PORT}/live      plan  GET /schedule.json`);
});
