// The Venue fixture API — GIVEN to the agent, never written by it.
//
// Why it exists: an app-scale eval should exercise remote, asynchronous,
// fallible, mutable data, because that is what real applications have. But an
// agent that writes its own backend is being measured on Node, not on Declare,
// and a self-built server is invisible to every rung of the verify ladder. So
// the server is fixed, local, and deterministic — the same posture as the
// repo's own real-transport tests (test/network-browser.test.mjs, the /__sse
// and /__ws fixtures): a real socket, no internet, no randomness.
//
//   node evals/apps/venue/api/server.mjs [--port 8300]
//
// Everything it serves is a pure function of the seed below. Same request,
// same bytes, run to run, machine to machine — including which seats are sold
// and which SSE events arrive in what order.

import { createServer } from "node:http";

const PORT = Number((process.argv.find((a) => a.startsWith("--port=")) ?? "--port=8310").split("=")[1]);
const SEED = 0x5EA7;

// ── deterministic noise ──────────────────────────────────────────────────────
// A string hash, so every derived fact (is this seat sold, how full is this
// performance) is reproducible from its own identity rather than from call
// order — no generator state, no dependence on what was asked for first.
function hash(str) {
  let h = SEED;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
const unit = (str) => hash(str) / 0xFFFFFFFF; // 0..1

// ── the halls ────────────────────────────────────────────────────────────────
const ROWS = "ABCDEFGHJKLMNPQRSTUV"; // no I, no O — the convention real houses use

const HALLS = {
  grand: {
    id: "grand", name: "Grand Hall",
    sections: [
      { key: "ORCH", name: "Orchestra", rows: 18, seats: 22, price: 145 },
      { key: "MEZZ", name: "Mezzanine", rows: 9, seats: 20, price: 95 },
      { key: "BALC", name: "Balcony", rows: 7, seats: 18, price: 55 },
    ],
  },
  playhouse: {
    id: "playhouse", name: "Playhouse",
    sections: [
      { key: "ORCH", name: "Orchestra", rows: 12, seats: 16, price: 80 },
      { key: "BALC", name: "Balcony", rows: 6, seats: 14, price: 45 },
    ],
  },
  studio: {
    id: "studio", name: "Studio",
    // 14 across, not 12: seat 13 is the seat that always loses the race, and a
    // hall too narrow to have one would make that promise a lie in this house.
    sections: [{ key: "FLR", name: "Floor", rows: 8, seats: 14, price: 35 }],
  },
};

// ── the season ───────────────────────────────────────────────────────────────
const WORKS = [
  "The Marriage of Figaro", "Swan Lake", "A Winter's Tale", "Rigoletto", "The Nutcracker",
  "Hedda Gabler", "Carmen", "The Rite of Spring", "Waiting for Godot", "La Bohème",
  "Giselle", "The Cherry Orchard", "Tosca", "Romeo and Juliet", "Don Giovanni",
  "The Seagull", "Sleeping Beauty", "Othello", "Madama Butterfly", "Coppélia",
  "Uncle Vanya", "The Magic Flute", "Petrushka", "King Lear", "Turandot",
  "Cinderella", "A Doll's House", "Aida", "The Firebird", "Twelfth Night",
  "Eugene Onegin", "Raymonda", "Long Day's Journey", "Falstaff", "Onegin",
  "The Tempest", "Norma", "Manon", "Three Sisters", "Parsifal",
];

const HALL_IDS = Object.keys(HALLS);
const SEASON_START = Date.UTC(2026, 8, 1); // 2026-09-01
const DAY = 86400000;
const PERFORMANCE_COUNT = 4000;

// One pass, built once at boot: 4,000 performances across a 300-day season.
const PERFORMANCES = Array.from({ length: PERFORMANCE_COUNT }, (_, i) => {
  const id = `p${String(i + 1).padStart(4, "0")}`;
  const title = WORKS[hash(`${id}:work`) % WORKS.length];
  const hallId = HALL_IDS[hash(`${id}:hall`) % HALL_IDS.length];
  const day = hash(`${id}:day`) % 300;
  const slot = [1930, 1400, 2000, 1500][hash(`${id}:slot`) % 4];
  const at = new Date(SEASON_START + day * DAY + (Math.floor(slot / 100) * 60 + (slot % 100)) * 60000);
  const cheapest = Math.min(...HALLS[hallId].sections.map((s) => s.price));
  return {
    id, title,
    hallId, hall: HALLS[hallId].name,
    startsAt: at.toISOString(),
    priceFrom: cheapest,
  };
}).sort((a, b) => (a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : a.id < b.id ? -1 : 1));

const BY_ID = new Map(PERFORMANCES.map((p) => [p.id, p]));

// ── seats ────────────────────────────────────────────────────────────────────
// A performance's seat map is derived, never stored: whether a seat is already
// sold is a function of (performance, seat). Occupancy varies 25%–92% across
// the season so both a nearly-empty house and a nearly-full one are reachable.
function seatsFor(performanceId) {
  const perf = BY_ID.get(performanceId);
  if (!perf) return null;
  const fill = 0.25 + unit(`${performanceId}:fill`) * 0.67;
  const sections = HALLS[perf.hallId].sections.map((sec) => ({
    key: sec.key,
    name: sec.name,
    price: sec.price,
    rows: Array.from({ length: sec.rows }, (_, r) => ({
      name: ROWS[r],
      seats: Array.from({ length: sec.seats }, (_, s) => {
        const id = `${sec.key}-${ROWS[r]}-${s + 1}`;
        // Seat 13 of every row always LOOKS available and always loses the
        // race on hold — the deterministic write failure (see API.md).
        const sold = s + 1 === 13 ? false : unit(`${performanceId}:${id}`) < fill;
        return { id, number: s + 1, status: sold ? "sold" : "available" };
      }),
    })),
  }));
  return { performanceId, hall: HALLS[perf.hallId].name, sections };
}

const isCursed = (seatId) => /-13$/.test(seatId);

// Two sets, and the distinction is the whole conflict model:
//
//   held — this client claimed it through POST /api/holds. It blocks a second
//          hold, but it must NOT block this client's own booking, or an app
//          that holds before booking would race itself.
//   gone — somebody ELSE has it: taken by the SSE sales feed, or handed over
//          wholesale by the harness's /api/_takeover. Blocks both.
//
// Both reset when the server restarts, which is how every run starts identical.
const held = new Map();
const gone = new Map();
const setFor = (m, pid) => m.get(pid) ?? m.set(pid, new Set()).get(pid);
const heldFor = (pid) => setFor(held, pid);
const goneFor = (pid) => setFor(gone, pid);

let bookingSeq = 0;

// Both write paths validate identically, and the only difference is whether
// THIS client's own holds count against it: they block a second hold, they must
// not block the booking that follows them. Everything else — a seat that isn't
// in this hall, one already sold, one somebody else took — is the same answer
// on both endpoints, which is what keeps the two from drifting apart.
function checkSeats(map, performanceId, ids, { ownHoldsBlock }) {
  const all = new Map(map.sections.flatMap((s) => s.rows.flatMap((r) => r.seats)).map((s) => [s.id, s]));
  const unknown = ids.filter((id) => !all.has(id));
  if (unknown.length) {
    return { code: 400, body: { error: "no such seat", unknown, message: `No seat ${unknown.join(", ")} in this hall.` } };
  }
  const taken = heldFor(performanceId), lost = goneFor(performanceId);
  const conflicts = ids.filter((id) =>
    isCursed(id) || all.get(id).status === "sold" || lost.has(id) || (ownHoldsBlock && taken.has(id)));
  if (conflicts.length) {
    return { code: 409, body: { error: "seats unavailable", conflicts, message: `Someone else took ${conflicts.join(", ")} first.` } };
  }
  return null;
}

// ── SSE: other people buying seats ───────────────────────────────────────────
// A scripted sequence, not a random one: the Nth event for a performance is
// always the same seat. A client that connects twice sees the same story.
function scriptedSales(performanceId, n) {
  const map = seatsFor(performanceId);
  if (!map) return [];
  const open = map.sections.flatMap((s) => s.rows.flatMap((r) => r.seats))
    .filter((s) => s.status === "available" && !isCursed(s.id))
    .map((s) => s.id);
  return Array.from({ length: n }, (_, i) => open[hash(`${performanceId}:sale:${i}`) % open.length]);
}

// ── plumbing ─────────────────────────────────────────────────────────────────
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const send = (res, code, body) => {
  const json = JSON.stringify(body);
  res.writeHead(code, { ...CORS, "content-type": "application/json; charset=utf-8" });
  res.end(json);
};

const readBody = (req) => new Promise((resolve) => {
  let buf = "";
  req.on("data", (c) => (buf += c));
  req.on("end", () => { try { resolve(JSON.parse(buf || "{}")); } catch { resolve({}); } });
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }

  // GET /api/performances[?search=&hall=]
  if (path === "/api/performances" && req.method === "GET") {
    const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
    const hall = url.searchParams.get("hall");
    let out = PERFORMANCES;
    if (search) out = out.filter((p) => p.title.toLowerCase().includes(search));
    if (hall) out = out.filter((p) => p.hallId === hall);
    return send(res, 200, { performances: out });
  }

  // GET /api/performances/:id/seats
  const seatMatch = path.match(/^\/api\/performances\/([^/]+)\/seats$/);
  if (seatMatch && req.method === "GET") {
    const map = seatsFor(seatMatch[1]);
    if (!map) return send(res, 404, { error: "no such performance" });
    const takenNow = heldFor(seatMatch[1]), lost = goneFor(seatMatch[1]);
    for (const sec of map.sections) {
      for (const row of sec.rows) {
        for (const seat of row.seats) if (takenNow.has(seat.id) || lost.has(seat.id)) seat.status = "sold";
      }
    }
    return send(res, 200, map);
  }

  // GET /api/performances/:id
  const oneMatch = path.match(/^\/api\/performances\/([^/]+)$/);
  if (oneMatch && req.method === "GET") {
    const p = BY_ID.get(oneMatch[1]);
    return p ? send(res, 200, p) : send(res, 404, { error: "no such performance" });
  }

  // GET /api/halls
  if (path === "/api/halls" && req.method === "GET") {
    return send(res, 200, { halls: Object.values(HALLS) });
  }

  // POST /api/holds  { performanceId, seatIds }
  if (path === "/api/holds" && req.method === "POST") {
    const { performanceId, seatIds } = await readBody(req);
    const map = seatsFor(performanceId);
    if (!map) return send(res, 404, { error: "no such performance" });
    const ids = Array.isArray(seatIds) ? seatIds : [];
    const bad = checkSeats(map, performanceId, ids, { ownHoldsBlock: true });
    if (bad) return send(res, bad.code, bad.body);
    const taken = heldFor(performanceId);
    for (const id of ids) taken.add(id);
    return send(res, 200, { performanceId, held: ids, expiresInSeconds: 600 });
  }

  // POST /api/bookings  { performanceId, seatIds, name, email }
  if (path === "/api/bookings" && req.method === "POST") {
    const { performanceId, seatIds, name, email } = await readBody(req);
    const map = seatsFor(performanceId);
    if (!map) return send(res, 404, { error: "no such performance" });
    const ids = Array.isArray(seatIds) ? seatIds : [];
    if (!ids.length) return send(res, 400, { error: "no seats", message: "Choose at least one seat." });
    if (!name || !String(name).trim()) return send(res, 400, { error: "name required", message: "A name is required." });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email ?? ""))) {
      return send(res, 400, { error: "email invalid", message: "That email address doesn't look right." });
    }
    const bad = checkSeats(map, performanceId, ids, { ownHoldsBlock: false });
    if (bad) return send(res, bad.code, bad.body);
    const price = new Map(map.sections.flatMap((s) => s.rows.flatMap((r) => r.seats.map((seat) => [seat.id, s.price]))));
    const total = ids.reduce((sum, id) => sum + (price.get(id) ?? 0), 0);
    const code = `BK-${String(++bookingSeq).padStart(4, "0")}`;
    return send(res, 201, { code, performanceId, seats: ids, total, name, email });
  }

  // POST /api/_reset — HARNESS ONLY, absent from API.md.
  // Holds, takeovers and bookings accumulate in this process, so a second run
  // against the same server starts in the first run's wreckage: seats already
  // sold, a performance already taken over wholesale. Determinism is this
  // fixture's whole claim, so acceptance resets before it looks at anything and
  // no run has to remember to restart the process.
  if (path === "/api/_reset" && req.method === "POST") {
    held.clear();
    gone.clear();
    bookingSeq = 0;
    return send(res, 200, { reset: true });
  }

  // GET /api/events?performance=:id — SSE, other buyers taking seats
  if (path === "/api/events" && req.method === "GET") {
    const pid = url.searchParams.get("performance");
    if (!BY_ID.has(pid)) return send(res, 404, { error: "no such performance" });
    res.writeHead(200, {
      ...CORS,
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const script = scriptedSales(pid, 40);
    let i = 0;
    res.write(`event: open\ndata: {"performance":"${pid}"}\n\n`);
    const timer = setInterval(() => {
      if (i >= script.length) return clearInterval(timer);
      const seatId = script[i++];
      goneFor(pid).add(seatId);
      res.write(`event: seatchanged\ndata: ${JSON.stringify({ seatId, status: "sold" })}\n\n`);
    }, 3000);
    req.on("close", () => clearInterval(timer));
    return;
  }

  // POST /api/_takeover { performanceId } — HARNESS ONLY, absent from API.md.
  // Hands every still-available seat in a performance to "somebody else", so
  // the next hold or booking is guaranteed to lose the race. A real race is
  // unreproducible by definition; this manufactures one on demand, which is
  // the only way acceptance can check the losing path deterministically.
  if (path === "/api/_takeover" && req.method === "POST") {
    const { performanceId } = await readBody(req);
    const map = seatsFor(performanceId);
    if (!map) return send(res, 404, { error: "no such performance" });
    const lost = goneFor(performanceId);
    let n = 0;
    for (const sec of map.sections) {
      for (const row of sec.rows) {
        for (const seat of row.seats) if (seat.status === "available") { lost.add(seat.id); n++; }
      }
    }
    return send(res, 200, { performanceId, taken: n });
  }

  send(res, 404, { error: "no such endpoint", path });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`venue fixture api — http://127.0.0.1:${PORT}`);
  console.log(`${PERFORMANCES.length} performances · ${Object.keys(HALLS).length} halls · deterministic (seed 0x${SEED.toString(16).toUpperCase()})`);
});
