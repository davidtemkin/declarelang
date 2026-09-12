#!/usr/bin/env node
// selftest — does the fixture keep its promises, and is the feed deterministic?
//
//   node api/selftest.mjs [--port=8330]
//
// Starts nothing. Run the server first. A seeded schedule that silently drifts
// would corrupt a comparison without ever failing loudly, so the determinism
// checks matter as much as the consistency ones.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(resolve(HERE, ".."), "fixtures");
const hit = process.argv.find((a) => a.startsWith("--port="));
const PORT = Number(hit ? hit.slice(7) : 8330);
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const ok = (cond, what) => { cond ? pass++ : (fail++, console.log(`  ✗ ${what}`)); };
const section = (s) => console.log(`\n${s}`);

const get = async (p) => {
  const r = await fetch(BASE + p);
  if (!r.ok) throw new Error(`${p} → ${r.status}`);
  return r.headers.get("content-type")?.includes("json") ? r.json() : r.arrayBuffer();
};

// ── 1. history consistency ───────────────────────────────────────────────────
const H = await get("/threads.json");
section("history");

const people = new Set(H.people.map((p) => p.id));
ok(people.has(H.me), "`me` is a known person");
ok(H.people.some((p) => p.avatar === null), "at least one person has no picture");
ok(H.threads.length >= 5, "at least five conversations");
ok(H.threads.some((t) => t.participants.length > 2), "at least one group conversation");
ok(H.threads.some((t) => t.messages.length > 200), "at least one long conversation");
ok(H.sendable.length >= 4, "at least four sendable photographs");

const ids = new Set();
let photos = 0, voices = 0, reacted = 0, doubled = 0;
for (const t of H.threads) {
  ok(t.participants.includes(H.me), `${t.id}: you are in it`);
  ok(t.messages.length > 0, `${t.id}: not empty`);
  let last = 0;
  for (const m of t.messages) {
    ok(!ids.has(m.id), `${m.id}: id is unique`);
    ids.add(m.id);
    ok(t.participants.includes(m.from), `${m.id}: sender is a participant`);
    const at = Date.parse(m.at);
    ok(Number.isFinite(at), `${m.id}: timestamp parses`);
    ok(at >= last, `${m.id}: in order`);
    last = at;
    if (m.kind === "photo") { photos++; ok(existsSync(join(FIXTURES, m.src)), `${m.id}: ${m.src} exists`); }
    if (m.kind === "voice") {
      voices++;
      ok(existsSync(join(FIXTURES, m.src)), `${m.id}: ${m.src} exists`);
      ok(Array.isArray(m.peaks) && m.peaks.length >= 16, `${m.id}: has peaks`);
      ok(m.peaks.every((p) => p >= 0 && p <= 1), `${m.id}: peaks are 0–1`);
      // the array must describe the audio that actually ships
      const probed = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nk=1", join(FIXTURES, m.src)], { encoding: "utf8" }).trim()) * 1000;
      ok(Math.abs(probed - m.durationMs) < 400, `${m.id}: durationMs matches the file (${Math.round(probed)} vs ${m.durationMs})`);
    }
    if (m.kind === "text") ok(typeof m.text === "string" && m.text.length > 0, `${m.id}: has text`);
    if (m.reactions) {
      reacted++;
      for (const r of m.reactions) ok(t.participants.includes(r.person), `${m.id}: reactor is a participant`);
      const marks = m.reactions.map((r) => r.emoji);
      if (marks.length !== new Set(marks).size) doubled++;
    }
  }
  ok(ids.has(t.lastSeen), `${t.id}: lastSeen names a real message`);
}
ok(photos >= 8, `photographs in history (${photos})`);
ok(voices >= 3, `voice clips in history (${voices})`);
ok(reacted >= 5, `messages carrying reactions (${reacted})`);
ok(doubled >= 1, "at least one message carries the same mark from two people");

const unread = H.threads.filter((t) => t.lastSeen !== t.messages.at(-1).id);
ok(unread.length >= 2, `conversations with unread messages (${unread.length})`);
ok(unread.length < H.threads.length, "not every conversation is unread");

// ── 2. media shape ───────────────────────────────────────────────────────────
section("media");
const shapes = [...H.threads.flatMap((t) => t.messages.filter((m) => m.kind === "photo").map((m) => m.src)),
  ...H.sendable.map((s) => s.src)];
const ars = shapes.map((src) => {
  const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", join(FIXTURES, src)], { encoding: "utf8" });
  const w = +out.match(/pixelWidth: (\d+)/)[1], h = +out.match(/pixelHeight: (\d+)/)[1];
  return w / h;
});
ok(Math.min(...ars) <= 0.6, `something tall (min aspect ${Math.min(...ars).toFixed(2)})`);
ok(Math.max(...ars) >= 2.5, `something very wide (max aspect ${Math.max(...ars).toFixed(2)})`);
ok(new Set(ars.map((a) => a.toFixed(2))).size >= 5, "at least five distinct shapes");
ok(!H.threads.flatMap((t) => t.messages).some((m) => m.kind === "photo" && (m.w || m.h)),
  "photographs do not carry their dimensions");

// Range support is what makes a voice clip scrubbable. Without it a browser
// reports the duration, fires `seeked`, and silently leaves currentTime at 0 —
// G9 becomes unbuildable for every arm at once, and nothing says so out loud.
const clip = H.threads.flatMap((t) => t.messages).find((m) => m.kind === "voice").src;
const whole = await fetch(BASE + "/" + clip);
ok(whole.headers.get("accept-ranges") === "bytes", "media advertises byte ranges");
const part = await fetch(BASE + "/" + clip, { headers: { Range: "bytes=200-799" } });
ok(part.status === 206, `a range request is answered 206 (got ${part.status})`);
ok(part.headers.get("content-range")?.startsWith("bytes 200-799/"), "content-range names the slice");
ok((await part.arrayBuffer()).byteLength === 600, "the slice is the requested length");
const tail = await fetch(BASE + "/" + clip, { headers: { Range: "bytes=-100" } });
ok(tail.status === 206 && (await tail.arrayBuffer()).byteLength === 100, "a suffix range works");
const bad = await fetch(BASE + "/" + clip, { headers: { Range: "bytes=99999999-" } });
ok(bad.status === 416, `an unsatisfiable range is refused 416 (got ${bad.status})`);

// ── 3. the schedule is deterministic ─────────────────────────────────────────
section("schedule");
const s1 = await get("/schedule.json");
const s2 = await get("/schedule.json");
ok(JSON.stringify(s1) === JSON.stringify(s2), "two reads give the same plan");
ok(s1.live === false, "not running --live (a live server cannot be measured against)");
ok(s1.unbidden.length >= 15, `unbidden events planned (${s1.unbidden.length})`);
ok(s1.answer[s1.slowThread].message >= 6000, `the slow conversation is slow (${s1.slowThread}: ${s1.answer[s1.slowThread].message}ms)`);
const otherDelays = Object.entries(s1.answer).filter(([k]) => k !== s1.slowThread).map(([, v]) => v.message);
ok(Math.max(...otherDelays) < 4000, "every other conversation answers quickly");
const slowThread = H.threads.find((t) => t.id === s1.slowThread);
ok(slowThread && slowThread.messages.length > 200, "the slow conversation is the long one");
const late = s1.unbidden.filter((e) => e.thread === s1.slowThread && e.kind === "message");
ok(late.length >= 1, "something arrives unbidden in the long conversation");
const touched = new Set(s1.unbidden.map((e) => e.thread));
ok(touched.size >= 4, `unbidden events reach several conversations (${touched.size})`);

// ── 4. the feed delivers ─────────────────────────────────────────────────────
section("feed");
const frames = await new Promise((done, bad) => {
  const got = [];
  const ws = new WebSocket(`ws://localhost:${PORT}/live`);
  const timer = setTimeout(() => { ws.close(); done(got); }, 9000);
  ws.on("error", bad);
  ws.on("open", () => {
    setTimeout(() => ws.send(JSON.stringify({ t: "send", ref: "x1", thread: "t2", kind: "text", text: "hello" })), 300);
  });
  ws.on("message", (raw) => {
    const f = JSON.parse(String(raw));
    got.push(f);
    if (got.filter((g) => g.t === "message").length >= 2) { clearTimeout(timer); ws.close(); done(got); }
  });
});

ok(frames[0]?.t === "hello", "first frame is hello");
ok(frames[0]?.me === H.me, "hello names the same person as the history");
const sent = frames.find((f) => f.t === "sent");
ok(!!sent, "a send is answered with `sent`");
ok(sent?.ref === "x1", "`sent` carries the ref back");
ok(sent?.message?.from === H.me, "the sent message is from you");
ok(!ids.has(sent?.message?.id), "the sent message has a new id");
ok(!frames.some((f) => f.t === "message" && f.message?.id === sent?.message?.id),
  "your own message is not echoed back as a `message`");
ok(frames.some((f) => f.t === "composing" && f.state === "start"), "someone starts composing");
const answer = frames.find((f) => f.t === "message" && f.thread === "t2" && f.message.from !== H.me);
ok(!!answer, "the conversation answers");
ok(frames.some((f) => f.t === "message" && f.thread !== "t2"),
  "something arrives in a conversation you did not send to");

// ── done ─────────────────────────────────────────────────────────────────────
console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail ? 1 : 0);
