#!/usr/bin/env node
// build-fixture — generate murmur's fixtures/ from real media.
//
//   node api/build-fixture.mjs [--photos <dir>] [--out fixtures]
//
// Photographs are drawn from a corpus and bucketed by aspect ratio so the set
// spans 9:16 to 3:1 (a 1:1-only fixture hides every aspect bug by
// construction). Voice clips are synthesised with macOS `say`, encoded to AAC
// with `afconvert`, and their peak arrays computed from the decoded PCM — so
// `peaks` describes the audio that actually ships, not a plausible curve.
//
// REPRODUCIBILITY, precisely. Everything derived here is deterministic —
// people, text, ids, timestamps, reactions, which photograph lands where —
// EXCEPT the speech synthesiser, which is not bit-reproducible: rebuilding
// moves each clip's duration by a few tens of milliseconds and its peaks in
// the third decimal. That is why `fixtures/` is the artifact of record and is
// built ONCE. Both arms of a comparison read the same shipped bytes; nobody
// rebuilds between them. `selftest.mjs` checks the property that actually
// matters — that `durationMs` and `peaks` describe the audio on disk.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const TASK = resolve(HERE, "..");
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const CORPUS = arg("photos", join(homedir(), "Code/Mesa/sample-files/originals/jpeg"));
const OUT = resolve(TASK, arg("out", "fixtures"));

// ── the cast ─────────────────────────────────────────────────────────────────
// One person deliberately has no picture (initials fallback is a real case).
// Name lengths vary on purpose — a fixed-width name slot is a design bug the
// fixture should be able to expose.
const PEOPLE = [
  { id: "p1", name: "You", avatar: true },
  { id: "p2", name: "Priya Raman", avatar: true },
  { id: "p3", name: "Marco Bellini", avatar: true },
  { id: "p4", name: "Dana Ruiz", avatar: false },
  { id: "p5", name: "Kwame Osei-Bonsu", avatar: true },
  { id: "p6", name: "Ines", avatar: true },
  { id: "p7", name: "Tobias Lindqvist-Hane", avatar: true },
  { id: "p8", name: "Mei", avatar: true },
];

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

// ── photographs ──────────────────────────────────────────────────────────────
function dimsOf(files) {
  const out = [];
  const CHUNK = 200;
  for (let i = 0; i < files.length; i += CHUNK) {
    const batch = files.slice(i, i + CHUNK);
    const txt = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", ...batch], {
      encoding: "utf8", maxBuffer: 1 << 26,
    });
    let cur = null;
    for (const line of txt.split("\n")) {
      if (!line.startsWith(" ") && line.trim()) { cur = { file: line.trim() }; out.push(cur); }
      else if (cur && line.includes("pixelWidth")) cur.w = +line.split(":")[1];
      else if (cur && line.includes("pixelHeight")) cur.h = +line.split(":")[1];
    }
  }
  return out.filter((o) => o.w && o.h);
}

/** Pick `n` photographs spanning the corpus's aspect range, deterministically. */
function pickPhotos(n) {
  if (!existsSync(CORPUS)) throw new Error(`photo corpus not found: ${CORPUS} (pass --photos <dir>)`);
  const files = readdirSync(CORPUS).filter((f) => /\.jpe?g$/i.test(f)).sort().map((f) => join(CORPUS, f));
  const dims = dimsOf(files).map((d) => ({ ...d, ar: d.w / d.h }));
  // bucket by aspect ratio, then round-robin the buckets so the chosen set is
  // spread across shapes rather than clustered at whatever the corpus favours
  const buckets = new Map();
  for (const d of dims) {
    const k = d.ar.toFixed(2);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(d);
  }
  const keys = [...buckets.keys()].sort((a, b) => +a - +b);
  const picked = [];
  for (let round = 0; picked.length < n; round++) {
    let progressed = false;
    for (const k of keys) {
      const b = buckets.get(k);
      if (round < b.length && picked.length < n) { picked.push(b[round]); progressed = true; }
    }
    if (!progressed) break;
  }
  return picked;
}

/** Copy a photo down to a sane delivery size. Returns the emitted basename. */
function emitPhoto(src, name, longEdge = 1600) {
  const dst = join(OUT, "photos", name);
  execFileSync("sips", ["-Z", String(longEdge), "-s", "format", "jpeg", "-s", "formatOptions", "72",
    src, "--out", dst], { stdio: "pipe" });
  return `photos/${name}`;
}

/** The corpus tops out at 16:9. A 3:1 panorama is the shape that breaks naive
 *  layout, so synthesise one by cropping the widest source we have. */
function emitPanorama(src, name) {
  const dst = join(OUT, "photos", name);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src,
    "-vf", "crop=iw:iw/3,scale=2400:800", "-q:v", "3", dst], { stdio: "pipe" });
  return `photos/${name}`;
}

function emitAvatar(src, name) {
  const dst = join(OUT, "avatars", name);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src,
    "-vf", "crop='min(iw,ih)':'min(iw,ih)',scale=256:256", "-q:v", "3", dst], { stdio: "pipe" });
  return `avatars/${name}`;
}

// ── voice ────────────────────────────────────────────────────────────────────
/** Voices are PINNED by name, never chosen by index out of `say -v ?`.
 *  That list contains novelty voices (Bells, Boing, Wobble) whose speech rate
 *  is nothing like speech: an early build picked one and produced a 131-second
 *  clip where the next build produced 46 seconds from identical input. A
 *  fixture that changes shape between builds cannot anchor a comparison, so a
 *  missing voice is a hard failure rather than a silent substitution. */
function requireVoices(names) {
  const txt = execFileSync("say", ["-v", "?"], { encoding: "utf8" });
  const have = new Set(txt.split("\n").map((l) => l.trim().split(/\s{2,}/)[0]).filter(Boolean));
  const missing = names.filter((n) => !have.has(n));
  if (missing.length) throw new Error(`speech voices not installed: ${missing.join(", ")}`);
}

/** Synthesise one clip, encode to AAC, and measure it. */
function emitVoice(text, name, voice, rate) {
  const aiff = join(OUT, `.tmp-${name}.aiff`);
  const dst = join(OUT, "voice", name);
  const sayArgs = ["-o", aiff, "-r", String(rate)];
  if (voice) sayArgs.push("-v", voice);
  execFileSync("say", [...sayArgs, text], { stdio: "pipe" });
  execFileSync("afconvert", ["-f", "m4af", "-d", "aac", "-b", "64000", aiff, dst], { stdio: "pipe" });
  rmSync(aiff, { force: true });

  // decode to mono 8kHz s16le and reduce to a fixed number of peaks — the
  // array in threads.json therefore describes the shipped audio
  const pcm = execFileSync("ffmpeg", ["-loglevel", "error", "-i", dst,
    "-f", "s16le", "-ac", "1", "-ar", "8000", "-"], { maxBuffer: 1 << 28 });
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const N = 64;
  const peaks = [];
  for (let i = 0; i < N; i++) {
    const lo = Math.floor((i * samples.length) / N), hi = Math.floor(((i + 1) * samples.length) / N);
    let max = 0;
    for (let j = lo; j < hi; j++) { const v = Math.abs(samples[j]); if (v > max) max = v; }
    peaks.push(Math.round((max / 32768) * 1000) / 1000);
  }
  const durationMs = Math.round((samples.length / 8000) * 1000);
  return { src: `voice/${name}`, durationMs, peaks };
}

const VOICE_SCRIPTS = [
  { name: "1.m4a", voice: "Samantha", from: "p2", rate: 180, text:
    "Hey, quick one. I'm at the hardware store and they have two kinds. Do you want the brass or the steel? Call me back." },
  { name: "2.m4a", voice: "Daniel", from: "p5", rate: 165, text:
    "So I walked the whole ridge this morning before the fog came in, and I think the drainage problem is further up than we thought. There's a spring about two hundred metres above the switchback that's been cutting straight down the fall line. If we don't intercept it the new tread is going to wash out by the second winter. I took some pictures. I'll send them when I've got a signal." },
  { name: "3.m4a", voice: "Karen", from: "p3", rate: 190, text:
    "Okay I read it. I liked it more than I expected to, but the middle section absolutely drags. Chapter eleven could go entirely and you would lose nothing." },
  { name: "4.m4a", voice: "Moira", from: "p7", rate: 172, text:
    "Right, so, I've been thinking about this since Tuesday and I want to lay out the whole thing properly because I don't think we've actually agreed on what we're solving. There are three separate problems and we keep talking about them as if they're one. The first is that nobody knows who is bringing what. The second is that the space we booked is too small for the number of people who said yes, and the third, which nobody wants to say out loud, is that the date does not work for half the people we actually want there. I think we should move it. I know that's annoying. But moving it two weeks solves two of the three problems on its own, and the third one gets much easier once we're not pretending. Have a think and tell me I'm wrong." },
];

// ── conversation text ────────────────────────────────────────────────────────
const KESTREL = [
  ["p5", "the boiler's making the noise again"], ["p2", "the clanking one or the whistling one"],
  ["p5", "clanking"], ["p2", "that's the pressure. there's a valve behind the panel"],
  ["p4", "please do not take the panel off again"], ["p5", "I'm not going to take the panel off"],
  ["p5", "I took the panel off"], ["p4", "kwame"],
  ["p2", "did it help"], ["p5", "it is quieter. I don't know if that's good"],
  ["p1", "quieter is usually good"], ["p4", "quieter is how you get a flood"],
  ["p2", "I'll call the landlord tomorrow, I have to ring about the window anyway"],
  ["p5", "which window"], ["p2", "the one that doesn't close"],
  ["p4", "all of them don't close"], ["p2", "the one that REALLY doesn't close"],
  ["p1", "the bathroom one"], ["p2", "the bathroom one"],
  ["p5", "oh that one's been like that since I moved in"],
  ["p4", "that was four years ago"], ["p5", "yes"],
  ["p1", "kwame"], ["p2", "KWAME"],
  ["p5", "in my defence it's quite a nice breeze in summer"],
  ["p4", "it is february"], ["p5", "and it is very fresh in here"],
  ["p2", "I'm adding it to the list"], ["p1", "there's a list?"],
  ["p2", "there has been a list for two years"], ["PHOTO", null],
  ["p2", "exhibit A"], ["p4", "the list is magnificent"],
  ["p1", "why have I never seen the list"], ["p2", "you're on the list"],
  ["p5", "ha"], ["p1", "in what capacity"],
  ["p2", "'ask about the thing with the bins'"], ["p1", "that was ONE time"],
  ["p4", "it was three times"], ["p1", "it was one time that happened three times"],
  ["PHOTO", null], ["p4", "the bins, for the record"],
];

const PRIYA = [
  ["p2", "are you around this weekend"], ["p1", "should be, why"],
  ["p2", "there's a thing at the print studio, open house, they're doing demos"],
  ["p1", "what kind of demos"], ["p2", "letterpress mostly. some screen printing"],
  ["p1", "that's actually perfect timing, I've been trying to figure out the invitations"],
  ["p2", "that's exactly why I thought of you"], ["p1", "what time"],
  ["p2", "eleven to four, drop in"], ["p1", "let's go early, before it fills up"],
  ["p2", "eleven then"], ["p1", "eleven"],
  ["VOICE", "1.m4a"],
  ["p1", "brass"], ["p2", "brass it is"],
  ["p2", "they had a third kind but it was £40 and I refuse"],
  ["p1", "correct"], ["PHOTO", null],
  ["p2", "that's the one I was talking about"], ["p1", "oh that's lovely"],
  ["p1", "is that the actual colour"], ["p2", "it's warmer in person"],
  ["p1", "everything is warmer in person"], ["p2", "deep"],
];

const DANA = [
  ["p4", "did you get the thing I sent"], ["p1", "the spreadsheet?"],
  ["p4", "the spreadsheet"], ["p1", "I got it. I have questions"],
  ["p4", "everyone has questions. that's why it's a spreadsheet and not a sentence"],
  ["p1", "why is march empty"], ["p4", "march is aspirational"],
  ["p1", "dana"], ["p4", "march is a placeholder for a conversation we haven't had"],
  ["p1", "that's a very generous way to describe an empty column"],
  ["p4", "thank you"], ["p1", "I'll fill in what I know tonight"],
  ["p4", "🙏"], ["p1", "but I'm not touching march"],
  ["p4", "nobody is touching march"], ["p1", "good"],
];

const BOOKCLUB = [
  ["p6", "so are we all pretending we finished it"], ["p3", "I finished it"],
  ["p7", "I finished it twice, which I regret"], ["p8", "I finished the first half twice"],
  ["p6", "that's the same as not finishing it"], ["p8", "it is not"],
  ["p3", "it's really not the same"], ["p6", "explain"],
  ["p8", "the first half is a different book. the second half is when he gets bored"],
  ["p7", "that is a genuinely good point and I hate it"],
  ["VOICE", "3.m4a"],
  ["p6", "chapter eleven is my favourite chapter"], ["p3", "of course it is"],
  ["p6", "what does that mean"], ["p3", "nothing! nothing"],
  ["p8", "it means chapter eleven is where the plot stops to look at some weather"],
  ["p6", "the weather is DOING something"], ["p7", "the weather is doing a great deal"],
  ["p3", "the weather is the only character with an arc"], ["p6", "I'm leaving"],
  ["p8", "next one should be shorter"], ["p7", "next one should be funnier"],
  ["p6", "next one is my pick and it is neither"], ["p3", "😀"],
  ["p8", "how long"], ["p6", "six hundred pages"], ["p7", "ines"],
  ["p6", "six hundred TREMENDOUS pages"], ["p8", "how many of them are weather"],
  ["p6", "blocked"], ["PHOTO", null], ["p8", "this was the edition I read"],
  ["p7", "that cover is a war crime"], ["PHOTO", null],
  ["p6", "mine's nicer"], ["p3", "mine is nicest and I will not be taking questions"],
];

const MARCO = [
  ["p3", "walked past the old place today"], ["p1", "how does it look"],
  ["PHOTO", null], ["p1", "they painted it"], ["p3", "they painted it"],
  ["p1", "that's a choice"], ["p3", "it's certainly a colour"],
  ["p1", "was the tree always that big"], ["p3", "the tree has been busy"],
  ["PHOTO", null], ["p3", "and they took the railing out"],
  ["p1", "no!"], ["p3", "yes"], ["p1", "I liked that railing"],
  ["p3", "everyone liked that railing"], ["PHOTO", null],
  ["p3", "anyway. thought you'd want to see"], ["p1", "I did. mixed feelings but I did"],
  ["p3", "that's the correct response"],
];

// deep history for the long thread — a pool, cycled deterministically, then a
// hand-authored tail so the part anyone actually reads is plausible
const TRAIL_POOL = [
  "got the permits back, all three sections approved",
  "anyone free saturday",
  "I can do saturday morning but not the afternoon",
  "bring the loppers, the corridor above the creek has closed right in",
  "how many of us are on for next weekend",
  "four confirmed, maybe five",
  "the county wants the survey before the end of the month",
  "rain forecast thursday, might want to move it",
  "moved to sunday then",
  "sunday works",
  "does anyone have the key for the lower gate",
  "I have it, I'll drop it in the box",
  "tread is holding up well on the north side",
  "the culvert is completely blocked again",
  "third time this year",
  "we need a bigger culvert honestly",
  "budget says we need a smaller creek",
  "😂",
  "I'll bring the mattock",
  "who's bringing water",
  "there's a spigot at the trailhead now",
  "since when",
  "since the parks people came through in june",
  "that's the best news I've had all week",
  "flagged the reroute this morning, tape is up",
  "how far does the reroute run",
  "about two hundred metres, it rejoins above the switchback",
  "that grade is going to be brutal",
  "it's better than what's there",
  "everything is better than what's there",
];
const TRAIL_TAIL = [
  ["p5", "walked the ridge before the fog came in"], ["VOICE", "2.m4a"],
  ["p7", "two hundred metres above the switchback? that's above the reroute"],
  ["p5", "it's above everything we flagged"], ["p7", "so the reroute doesn't help"],
  ["p5", "the reroute helps with the grade. it does nothing for the water"],
  ["p1", "can we intercept it higher"], ["p5", "we can, but that's outside the permit boundary"],
  ["p7", "of course it is"], ["p5", "here, look at it"],
  ["PHOTO", null], ["p5", "you can see where it's been cutting"],
  ["PANO", null], ["p5", "and that's the whole ridge from the top"],
  ["p1", "that is a very wide picture"], ["p5", "it is a very wide ridge"],
  ["p1", "that's a lot deeper than I pictured"], ["p7", "that's not a rill, that's a gully"],
  ["p5", "that's what I said to the ranger"], ["p1", "what did the ranger say"],
  ["p5", "the ranger said ‘huh’"], ["p7", "comprehensive"],
  ["p1", "so what are the options"], ["p5", "amend the permit, or armour the crossing and accept we redo it"],
  ["p7", "how often is 'redo it'"], ["p5", "every two winters. maybe three if we're lucky"],
  ["p1", "and the amendment takes how long"], ["p5", "six weeks if nobody objects"],
  ["p7", "somebody always objects"], ["p5", "somebody always objects"],
  ["p1", "let's start the amendment anyway. worst case we've lost six weeks"],
  ["p7", "agreed"], ["p5", "I'll write it up tonight"],
  ["p7", "put the photos in, the photos do the arguing"],
  ["p5", "that's the plan"], ["p1", "thank you for walking it"],
  ["p5", "it was a good morning to be up there honestly"],
];

// ── assembly ─────────────────────────────────────────────────────────────────
const NOW = Date.UTC(2026, 7, 10, 9, 0, 0);           // fixed "now"
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

let mid = 0;
const nextId = () => `m${String(++mid).padStart(4, "0")}`;

function buildThread({ id, title, participants, script, startAgo, spacing, photos, pano, voices, rand }) {
  const messages = [];
  let t = NOW - startAgo;
  for (const [who, payload] of script) {
    t += Math.round(spacing * (0.35 + rand() * 1.4));
    if (who === "PHOTO" || who === "PANO") {
      const p = who === "PANO" ? pano : photos.shift();
      if (!p) throw new Error(`${id}: script asks for more photographs than it was given`);
      const from = participants[1 + Math.floor(rand() * (participants.length - 1))];
      messages.push({ id: nextId(), from, at: new Date(t).toISOString(), kind: "photo", src: p.src, alt: p.alt });
    } else if (who === "VOICE") {
      const v = voices.get(payload);
      messages.push({ id: nextId(), from: v.from, at: new Date(t).toISOString(), kind: "voice",
        src: v.src, durationMs: v.durationMs, peaks: v.peaks });
    } else {
      messages.push({ id: nextId(), from: who, at: new Date(t).toISOString(), kind: "text", text: payload });
    }
  }
  return { id, title, participants, lastSeen: null, messages };
}

function main() {
  rmSync(OUT, { recursive: true, force: true });
  for (const d of ["photos", "voice", "avatars"]) mkdirSync(join(OUT, d), { recursive: true });

  console.log("picking photographs …");
  const picked = pickPhotos(26);
  const inThread = [], sendable = [];
  picked.forEach((p, i) => {
    const base = p.file.split("/").pop().replace(/\.jpe?g$/i, "");
    const alt = base.replace(/([a-z])([A-Z])/g, "$1 $2");
    if (i < 18) inThread.push({ ...emitPhotoEntry(p, `${i + 1}.jpg`, alt) });
    else sendable.push({ ...emitPhotoEntry(p, `send-${i - 17}.jpg`, alt) });
  });
  // the shape the corpus does not contain — placed deliberately, not drawn
  // from the pool, so it is guaranteed to appear in a conversation
  const widest = picked.reduce((a, b) => (b.ar > a.ar ? b : a));
  const pano = { src: emitPanorama(widest.file, "pano.jpg"), alt: "The whole ridge, seen from the top" };

  console.log("cropping avatars …");
  const avatarSrc = picked.slice().reverse();
  const avatars = new Map();
  for (const person of PEOPLE) {
    if (!person.avatar) continue;
    avatars.set(person.id, emitAvatar(avatarSrc.shift().file, `${person.id}.jpg`));
  }

  console.log("synthesising voice …");
  requireVoices(VOICE_SCRIPTS.map((v) => v.voice));
  const voices = new Map();
  for (const v of VOICE_SCRIPTS) {
    process.stdout.write(`  ${v.name} (${v.voice}) …`);
    const made = emitVoice(v.text, v.name, v.voice, v.rate);
    const wps = v.text.split(/\s+/).length / (made.durationMs / 1000);
    if (wps < 1.6 || wps > 4.5) throw new Error(`${v.name}: ${wps.toFixed(1)} words/sec is not speech — wrong voice?`);
    console.log(` ${(made.durationMs / 1000).toFixed(1)}s`);
    voices.set(v.name, { ...made, from: v.from });
  }

  console.log("assembling conversations …");
  const rand = rng(20260810);
  const pool = inThread.slice();
  const take = (n) => pool.splice(0, n);

  const trailScript = [];
  for (let i = 0; i < 268; i++) {
    const who = ["p5", "p7", "p1", "p5", "p7"][i % 5];
    trailScript.push([who, TRAIL_POOL[i % TRAIL_POOL.length]]);
  }
  trailScript.push(...TRAIL_TAIL);

  const threads = [
    buildThread({ id: "t1", title: "Kestrel Street", participants: ["p1", "p2", "p4", "p5"],
      script: KESTREL, startAgo: 6 * DAY, spacing: 9 * MIN, photos: take(2), voices, rand }),
    buildThread({ id: "t2", title: null, participants: ["p1", "p2"],
      script: PRIYA, startAgo: 3 * DAY, spacing: 26 * MIN, photos: take(1), voices, rand }),
    buildThread({ id: "t3", title: null, participants: ["p1", "p4"],
      script: DANA, startAgo: 19 * HOUR, spacing: 14 * MIN, photos: take(0), voices, rand }),
    buildThread({ id: "t4", title: "Trail crew", participants: ["p1", "p5", "p7"],
      script: trailScript, startAgo: 22 * DAY, spacing: 96 * MIN, photos: take(3), pano, voices, rand }),
    buildThread({ id: "t5", title: null, participants: ["p1", "p3"],
      script: MARCO, startAgo: 2 * DAY, spacing: 21 * MIN, photos: take(6), voices, rand }),
    buildThread({ id: "t6", title: "Book club", participants: ["p1", "p3", "p6", "p7", "p8"],
      script: BOOKCLUB, startAgo: 5 * DAY, spacing: 17 * MIN, photos: take(2), voices, rand }),
  ];

  // reactions — some messages carry several, and one mark is carried twice
  const react = (tid, idx, list) => {
    const th = threads.find((t) => t.id === tid);
    const m = th.messages[idx < 0 ? th.messages.length + idx : idx];
    m.reactions = list.map(([person, emoji]) => ({ person, emoji }));
  };
  react("t1", 6, [["p2", "😱"], ["p4", "😱"], ["p1", "💀"]]);
  react("t1", -4, [["p5", "😂"]]);
  react("t2", 5, [["p2", "❤️"]]);
  react("t4", -6, [["p7", "👍"], ["p1", "👍"]]);
  react("t4", -20, [["p1", "😮"], ["p7", "😮"], ["p5", "🔥"]]);
  react("t6", 8, [["p6", "🤨"], ["p3", "💯"], ["p7", "💯"], ["p8", "😂"]]);
  react("t6", -2, [["p3", "😂"], ["p7", "😂"], ["p8", "😂"]]);

  // unread state: two threads have arrived-since-last-looked, the rest are read
  for (const t of threads) t.lastSeen = t.messages[t.messages.length - 1].id;
  threads.find((t) => t.id === "t1").lastSeen = threads.find((t) => t.id === "t1").messages.at(-5).id;
  threads.find((t) => t.id === "t6").lastSeen = threads.find((t) => t.id === "t6").messages.at(-3).id;

  const people = PEOPLE.map((p) => ({ id: p.id, name: p.name, avatar: avatars.get(p.id) ?? null }));
  const doc = { me: "p1", people, sendable, threads };
  writeFileSync(join(OUT, "threads.json"), JSON.stringify(doc, null, 1) + "\n");

  const counts = threads.map((t) => `${t.id}:${t.messages.length}`).join(" ");
  console.log(`\nfixtures → ${OUT}`);
  console.log(`  ${people.length} people · ${threads.length} conversations (${counts})`);
  console.log(`  ${inThread.length} photographs in history · ${sendable.length} sendable · ${voices.size} voice clips`);
}

function emitPhotoEntry(p, name, alt) {
  return { src: emitPhoto(p.file, name), alt };
}

main();
