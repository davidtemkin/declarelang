// The Cadence fixture API — GIVEN to the agent, never written by it.
//
// Fourteen months of training, deterministic from a seed: same request, same
// bytes, every run. Local socket, no internet, no randomness — the same posture
// as the venue fixture and the repo's own real-transport tests.
//
//   node evals/apps/cadence/api/server.mjs [--port=8320]
//
// The clock is frozen so aggregates are stable: "today" is always 2026-08-05.
// A real clock would make "this week" and "the streak" different numbers on
// different days, and an acceptance written against them would rot overnight.

import { createServer } from "node:http";

const PORT = Number((process.argv.find((a) => a.startsWith("--port=")) ?? "--port=8320").split("=")[1]);
const SEED = 0xCADE;
const TODAY = "2026-08-05";

function hash(str) {
  let h = SEED;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
const unit = (s) => hash(s) / 0xFFFFFFFF;
const pick = (s, arr) => arr[hash(s) % arr.length];

const DAY = 86400000;
const dayStr = (d) => new Date(d).toISOString().slice(0, 10);
const TODAY_MS = Date.parse(TODAY + "T00:00:00Z");

// ── the sports, and what a session of each looks like ────────────────────────
const SPORTS = {
  run:  { minutes: [22, 95], kmPerMin: 0.16, hr: [138, 172] },
  ride: { minutes: [40, 180], kmPerMin: 0.42, hr: [118, 158] },
  lift: { minutes: [35, 75], kmPerMin: 0, hr: [102, 134] },
  swim: { minutes: [25, 60], kmPerMin: 0.032, hr: [124, 154] },
};

const NOTES = [
  "Legs heavy from Tuesday.", "Felt strong the whole way.", "Cut it short — calf tight.",
  "Negative split, finally.", "Windy out on the flats.", "Easy day, kept it honest.",
  "New route through the park.", "Hot. Drank everything I had.",
  "Back squat felt light.", "Pool was empty for once.",
];

// ── the history ──────────────────────────────────────────────────────────────
// 14 months back from TODAY. Roughly four sessions a week, with a scatter of
// rest days, one injury fortnight, and a heavy block in the autumn — so a year
// view has shape rather than being uniform noise.
const SESSIONS = [];
{
  const START = TODAY_MS - 425 * DAY;
  const INJURY_FROM = TODAY_MS - 300 * DAY, INJURY_TO = INJURY_FROM + 15 * DAY;
  let n = 0;
  for (let t = START; t <= TODAY_MS; t += DAY) {
    const d = dayStr(t);
    if (t >= INJURY_FROM && t < INJURY_TO) continue;          // the injury fortnight
    // a heavy autumn block: more days on, harder
    const inBlock = t > TODAY_MS - 250 * DAY && t < TODAY_MS - 190 * DAY;
    const chance = inBlock ? 0.78 : 0.56;
    if (unit(`${d}:on`) > chance) continue;                   // a rest day
    const sport = pick(`${d}:sport`, inBlock ? ["run", "run", "ride", "lift"] : ["run", "ride", "lift", "swim"]);
    const s = SPORTS[sport];
    const span = s.minutes[1] - s.minutes[0];
    const minutes = Math.round(s.minutes[0] + unit(`${d}:min`) * span);
    const effort = Math.max(1, Math.min(10,
      Math.round((inBlock ? 6.4 : 5.2) + (unit(`${d}:eff`) - 0.5) * 5)));
    const hr = Math.round(s.hr[0] + (effort / 10) * (s.hr[1] - s.hr[0]));
    const km = s.kmPerMin === 0 ? null
      : Math.round(minutes * s.kmPerMin * (0.88 + unit(`${d}:km`) * 0.24) * 10) / 10;
    SESSIONS.push({
      id: `s${String(++n).padStart(4, "0")}`,
      date: d, sport, minutes, distanceKm: km, effort, heartAvg: hr,
      note: unit(`${d}:note`) > 0.78 ? pick(`${d}:whichnote`, NOTES) : null,
    });
  }
}
SESSIONS.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));   // newest first
const BY_ID = new Map(SESSIONS.map((s) => [s.id, s]));
let seq = SESSIONS.length;

// ── the session in progress ──────────────────────────────────────────────────
// Starts when the server does, so its elapsed time actually advances. Its shape
// is fixed; only the clock moves.
const STARTED = Date.now();
const live = () => {
  const secs = Math.floor((Date.now() - STARTED) / 1000);
  return {
    id: "live", date: TODAY, sport: "run",
    startedSecondsAgo: secs,
    minutes: Math.floor(secs / 60),
    distanceKm: Math.round(secs * 0.0027 * 10) / 10,
    heartNow: 142 + Math.round(8 * Math.sin(secs / 40)),
    effort: 6,
  };
};

// ── plumbing ─────────────────────────────────────────────────────────────────
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type",
};
const send = (res, code, body) => {
  res.writeHead(code, { ...CORS, "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};
const readBody = (req) => new Promise((r) => {
  let b = ""; req.on("data", (c) => (b += c));
  req.on("end", () => { try { r(JSON.parse(b || "{}")); } catch { r({}); } });
});

const VALID_SPORT = (s) => Object.prototype.hasOwnProperty.call(SPORTS, s);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }

  // GET /api/today — the frozen clock, so every derived number is stable
  if (p === "/api/today" && req.method === "GET") return send(res, 200, { today: TODAY });

  // GET /api/sessions[?from=&to=&sport=]
  if (p === "/api/sessions" && req.method === "GET") {
    const from = url.searchParams.get("from"), to = url.searchParams.get("to");
    const sport = url.searchParams.get("sport");
    let out = SESSIONS;
    if (from) out = out.filter((s) => s.date >= from);
    if (to) out = out.filter((s) => s.date <= to);
    if (sport) out = out.filter((s) => s.sport === sport);
    return send(res, 200, { sessions: out });
  }

  // GET /api/sessions/:id
  const one = p.match(/^\/api\/sessions\/([^/]+)$/);
  if (one && req.method === "GET") {
    const s = BY_ID.get(one[1]);
    return s ? send(res, 200, s) : send(res, 404, { error: "no such session" });
  }

  // GET /api/live — the session in progress, or null
  if (p === "/api/live" && req.method === "GET") return send(res, 200, { session: live() });

  // POST /api/sessions — record one that already happened
  if (p === "/api/sessions" && req.method === "POST") {
    const b = await readBody(req);
    const bad = [];
    if (!VALID_SPORT(b.sport)) bad.push("sport must be one of run, ride, lift, swim");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date ?? ""))) bad.push("date must be YYYY-MM-DD");
    if (String(b.date) > TODAY) bad.push("a session cannot be in the future");
    if (!(Number(b.minutes) > 0)) bad.push("minutes must be above zero");
    if (b.effort !== undefined && !(Number(b.effort) >= 1 && Number(b.effort) <= 10)) bad.push("effort runs from 1 to 10");
    if (bad.length) return send(res, 400, { error: "invalid session", problems: bad, message: bad[0] });

    const s = {
      id: `s${String(++seq).padStart(4, "0")}`,
      date: b.date, sport: b.sport, minutes: Math.round(Number(b.minutes)),
      distanceKm: b.distanceKm === null || b.distanceKm === undefined ? null : Math.round(Number(b.distanceKm) * 10) / 10,
      effort: b.effort === undefined ? 5 : Math.round(Number(b.effort)),
      heartAvg: b.heartAvg === undefined ? null : Math.round(Number(b.heartAvg)),
      note: b.note ?? null,
    };
    SESSIONS.push(s);
    SESSIONS.sort((a, z) => (a.date < z.date ? 1 : a.date > z.date ? -1 : 0));
    BY_ID.set(s.id, s);
    return send(res, 201, s);
  }

  // PUT /api/sessions/:id — correct one
  if (one && req.method === "PUT") {
    const s = BY_ID.get(one[1]);
    if (!s) return send(res, 404, { error: "no such session" });
    const b = await readBody(req);
    for (const k of ["sport", "date", "minutes", "distanceKm", "effort", "heartAvg", "note"]) {
      if (b[k] !== undefined) s[k] = b[k];
    }
    return send(res, 200, s);
  }

  // DELETE /api/sessions/:id
  if (one && req.method === "DELETE") {
    const s = BY_ID.get(one[1]);
    if (!s) return send(res, 404, { error: "no such session" });
    BY_ID.delete(s.id);
    SESSIONS.splice(SESSIONS.indexOf(s), 1);
    return send(res, 200, { deleted: s.id });
  }

  // POST /api/_reset — HARNESS ONLY, absent from API.md
  if (p === "/api/_reset" && req.method === "POST") {
    for (const s of [...SESSIONS]) if (Number(s.id.slice(1)) > 100000) SESSIONS.splice(SESSIONS.indexOf(s), 1);
    // rebuild from the deterministic set: drop everything added this run
    const keep = SESSIONS.filter((s) => Number(s.id.slice(1)) <= seqAtBoot);
    SESSIONS.length = 0; SESSIONS.push(...keep);
    BY_ID.clear(); for (const s of SESSIONS) BY_ID.set(s.id, s);
    seq = seqAtBoot;
    return send(res, 200, { reset: true, sessions: SESSIONS.length });
  }

  send(res, 404, { error: "no such endpoint", path: p });
});

const seqAtBoot = seq;

server.listen(PORT, "127.0.0.1", () => {
  console.log(`cadence fixture api — http://127.0.0.1:${PORT}`);
  console.log(`${SESSIONS.length} sessions · today is ${TODAY} (frozen) · deterministic (seed 0x${SEED.toString(16).toUpperCase()})`);
});
