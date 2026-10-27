// The Venue service — GIVEN to the agent as a contract (API.md), never as code. It runs
// from outside the sandbox (this app has fixtures/), so the harness endpoints below are
// out of the agent's reach.
//
//   node evals/apps/venue-checkout/api/server.mjs [--port=8350] [--seed=1] [--quiet]
//
// Deterministic for a seed: which seats are sold, which seats the event stream sells and
// in what order, and every order's code. State (sessions, orders, seats taken since boot)
// lives in this process; POST /api/_reset returns it to boot.
//
// Harness endpoints, absent from API.md:
//   POST /api/_reset    { sales?: boolean }   back to boot; sales:false stops the scripted
//                                             sales, so a test's seats are never sold under it
//   POST /api/_take     { performanceId, seatIds, silent? }  someone else buys these now;
//                                             the event stream says so unless silent (a sale
//                                             the app can only learn of when it pays)
//   GET  /api/_log                            every request since the last reset, in order

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const flag = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const PORT = Number(flag("port", 8350));
const SEED = Number(flag("seed", 1));
const QUIET = process.argv.includes("--quiet");
const ORDER_DELAY = 1500;
// Other buyers: one seat every SALE_EVERY in each performance someone is watching, on one
// clock however many streams are open, and never below SALE_FLOOR of the seats free at boot.
const SALE_EVERY = 12000;
const SALE_FLOOR = 0.6;

function hash(str) {
  let h = (0x5ea7 ^ SEED) >>> 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  // a final mix, so ids that differ only in their last digits land far apart
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
const unit = (str) => hash(str) / 0xffffffff;

// ── the hall ────────────────────────────────────────────────────────────────
// Rows widen toward the back, as a horseshoe house's do. Row letters skip I and O.
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const SECTIONS = [
  { key: "ORCH", name: "Orchestra", priceCents: 8000, feeCents: 700, rows: [18, 18, 20, 20, 22, 22, 24, 24, 24, 24, 24, 24, 22, 22] },
  { key: "GT", name: "Grand Tier", priceCents: 6500, feeCents: 600, rows: [26, 26, 28, 28, 28] },
  { key: "DC", name: "Dress Circle", priceCents: 5000, feeCents: 500, rows: [26, 28, 28, 30, 30] },
  { key: "BALC", name: "Balcony", priceCents: 3500, feeCents: 400, rows: [30, 32] },
];
const SEAT = new Map(); // id → { section, row, number, priceCents, feeCents }
for (const s of SECTIONS) {
  s.rows.forEach((n, r) => {
    for (let k = 1; k <= n; k++) {
      SEAT.set(`${s.key}-${LETTERS[r]}-${k}`, { section: s.name, sectionKey: s.key, row: LETTERS[r], number: k, rowLength: n, priceCents: s.priceCents, feeCents: s.feeCents });
    }
  });
}
const SEAT_COUNT = SEAT.size;
const seatName = (id) => { const s = SEAT.get(id); return `${s.section}, row ${s.row}, seat ${s.number}`; };

// ── the run ─────────────────────────────────────────────────────────────────
// Twenty performances from Friday 13 November: Wednesday, Friday and Saturday
// evenings at 7:30pm, Sunday afternoons at 2:00pm. Times are the hall's local time.
const PERFORMANCES = [];
for (let day = 0; PERFORMANCES.length < 20; day++) {
  const d = new Date(Date.UTC(2026, 10, 13 + day));
  const wd = d.getUTCDay();
  const time = wd === 0 ? "14:00" : wd === 3 || wd === 5 || wd === 6 ? "19:30" : null;
  if (!time) continue;
  const date = d.toISOString().slice(0, 10);
  const [h, m] = time.split(":").map(Number);
  const doors = `${String(h - (m < 45 ? 1 : 0)).padStart(2, "0")}:${String((m + 15) % 60).padStart(2, "0")}`;
  PERFORMANCES.push({ id: `p${String(PERFORMANCES.length + 1).padStart(2, "0")}`, startsAt: `${date}T${time}`, doorsAt: `${date}T${doors}` });
}
// How full each is at boot: opening night about half, two nearly gone, the rest spread.
// Seats toward the middle of a row sell first, as they do.
const FILL = PERFORMANCES.map((p, i) => (i === 0 ? 0.5 : i === 5 || i === 14 ? 0.96 : 0.2 + unit(`${p.id}:fill`) * 0.6));
const centrality = (s) => 1 - Math.abs(s.number - (s.rowLength + 1) / 2) / (s.rowLength / 2);
const BOOT_SOLD = new Map(PERFORMANCES.map((p, i) => [p.id, new Set([...SEAT].filter(([id, s]) =>
  unit(`${p.id}:${id}`) < FILL[i] * (0.6 + 0.8 * centrality(s))).map(([id]) => id))]));

// ── state ───────────────────────────────────────────────────────────────────
let sold; // performanceId → Set of seat ids sold since boot (orders, sales, _take)
let sessions; // token → email
let orderSeq;
let log;
let salesOn;
let saleSeq; // performanceId → how many scripted sales so far
const feeds = new Map(); // performanceId → Set of { res, timer, i }
function reset({ sales = true } = {}) {
  sold = new Map(PERFORMANCES.map((p) => [p.id, new Set()]));
  sessions = new Map();
  orderSeq = 0;
  log = [];
  salesOn = sales && !QUIET;
  saleSeq = new Map(PERFORMANCES.map((p) => [p.id, 0]));
}
reset();

const isSold = (pid, id) => BOOT_SOLD.get(pid).has(id) || sold.get(pid).has(id);
const seatsLeft = (pid) => [...SEAT.keys()].filter((id) => !isSold(pid, id)).length;

function sell(pid, ids, { silent = false } = {}) {
  for (const id of ids) {
    if (isSold(pid, id)) continue;
    sold.get(pid).add(id);
    if (!silent) for (const f of feeds.get(pid) ?? []) f.res.write(`event: seatchanged\ndata: ${JSON.stringify({ seatId: id, status: "sold" })}\n\n`);
  }
}

// The scripted sales: the Nth sale of a performance is always the same seat, chosen
// among those free at boot, skipping any sold since.
function nextSale(pid) {
  const open = [...SEAT.keys()].filter((id) => !BOOT_SOLD.get(pid).has(id));
  for (let tries = 0; tries < 50; tries++) {
    const n = saleSeq.get(pid);
    saleSeq.set(pid, n + 1);
    const id = open[hash(`${pid}:sale:${n}`) % open.length];
    if (!isSold(pid, id)) return id;
  }
  return null;
}

// ── accounts and cards ──────────────────────────────────────────────────────
const ACCOUNT = {
  email: "ada@example.com",
  password: "correct horse battery",
  me: {
    name: "Ada Lovelace",
    email: "ada@example.com",
    billing: { line1: "12 Marchmont Street", line2: null, city: "London", postalCode: "WC1N 1AB", country: "GB" },
    cards: [
      { id: "card_1", brand: "visa", last4: "4242", expMonth: 4, expYear: 2028 },
      { id: "card_2", brand: "mastercard", last4: "4444", expMonth: 8, expYear: 2026 },
    ],
  },
};
// A second account with a short sign-in, for a person testing by hand: the same address
// and cards as Ada's. The acceptance (drive.mjs) signs in as Ada.
const TESTER = { email: "a@a.co", password: "pass", me: { ...ACCOUNT.me, name: "Alex Tester", email: "a@a.co" } };
const ACCOUNTS = [ACCOUNT, TESTER];
const accountOf = (email) => ACCOUNTS.find((a) => a.email === email) ?? null;

const brandOf = (n) => (/^4/.test(n) ? "visa" : /^(5[1-5]|2[2-7])/.test(n) ? "mastercard" : /^3[47]/.test(n) ? "amex" : /^6(011|5)/.test(n) ? "discover" : null);
const luhn = (n) => {
  let sum = 0;
  for (let i = 0; i < n.length; i++) {
    let d = Number(n[n.length - 1 - i]);
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
};
const expired = (m, y) => {
  const now = new Date();
  return y < now.getFullYear() || (y === now.getFullYear() && m < now.getMonth() + 1);
};
const POSTAL = {
  US: /^\d{5}(-\d{4})?$/,
  CA: /^[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d$/,
  GB: /^[A-Za-z]{1,2}\d[A-Za-z\d]? ?\d[A-Za-z]{2}$/,
};
const WRONG_POSTAL = new Set(["10001", "M5V2T6", "SW1A1AA"]);

// ── plumbing ────────────────────────────────────────────────────────────────
function cors(req) {
  const origin = req.headers.origin;
  return origin
    ? { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "Origin" }
    : { "access-control-allow-origin": "*" };
}
const send = (req, res, code, body, extra = {}) => {
  res.writeHead(code, { ...cors(req), "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve) => {
  let buf = "";
  req.on("data", (c) => (buf += c));
  req.on("end", () => { try { resolve(JSON.parse(buf || "{}")); } catch { resolve(null); } });
});
const sessionOf = (req) => {
  const m = /(?:^|;\s*)vn_session=([^;]+)/.exec(req.headers.cookie ?? "");
  return m && sessions.has(m[1]) ? { token: m[1], email: sessions.get(m[1]) } : null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const invalid = (field, message) => ({ code: 422, body: { error: "invalid", field, message } });

// An order, checked in the order a real processor would: the request's shape, the
// session, what can be told from the details alone, the seats, then the bank.
function checkOrder(req, b) {
  const perf = PERFORMANCES.find((p) => p.id === b?.performanceId);
  const ids = Array.isArray(b?.seatIds) ? b.seatIds : [];
  if (!perf || !ids.length || ids.some((id) => !SEAT.has(id)) || new Set(ids).size !== ids.length || !b.payment) {
    return { code: 400, body: { error: "bad_request", message: "That order isn't complete." } };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(b.email ?? ""))) return invalid("email", "That email address doesn't look right.");
  const p = b.payment;
  let card;
  if (p.savedCardId !== undefined) {
    const who = sessionOf(req);
    if (!who) return { code: 401, body: { error: "signed_out", message: "Sign in again to use a saved card." } };
    card = accountOf(who.email)?.me.cards.find((c) => c.id === p.savedCardId);
    if (!card) return { code: 400, body: { error: "bad_request", message: "That card isn't on your account." } };
    if (expired(card.expMonth, card.expYear)) return invalid("expiry", "That card has expired.");
    if (!/^\d{3}$/.test(String(p.cvc ?? ""))) return invalid("cvc", "The security code should be 3 digits.");
    card = { ...card, number: null, cvc: String(p.cvc), saved: true };
  } else {
    const c = p.card ?? {};
    const number = String(c.number ?? "").replace(/[\s-]/g, "");
    const brand = brandOf(number);
    if (!/^\d{13,19}$/.test(number) || !luhn(number) || !brand) return invalid("number", "That card number isn't valid.");
    const m = Number(c.expMonth), y = Number(c.expYear);
    if (!(m >= 1 && m <= 12) || !(y >= 2000) || expired(m, y)) return invalid("expiry", "That expiry date isn't valid.");
    const cvcLen = brand === "amex" ? 4 : 3;
    if (!new RegExp(`^\\d{${cvcLen}}$`).test(String(c.cvc ?? ""))) return invalid("cvc", `The security code should be ${cvcLen} digits.`);
    if (!String(c.name ?? "").trim()) return { code: 400, body: { error: "bad_request", message: "The name on the card is missing." } };
    const bill = p.billing ?? {};
    if (!String(bill.line1 ?? "").trim() || !String(bill.city ?? "").trim() || !POSTAL[bill.country]) {
      return { code: 400, body: { error: "bad_request", message: "The billing address isn't complete." } };
    }
    if (!POSTAL[bill.country].test(String(bill.postalCode ?? "").trim())) return invalid("postalCode", "That postal code doesn't match the country.");
    card = { number, brand, last4: number.slice(-4), cvc: String(c.cvc), postal: String(bill.postalCode).replace(/\s/g, "").toUpperCase() };
  }
  const conflicts = ids.filter((id) => isSold(perf.id, id));
  if (conflicts.length) {
    const names = conflicts.map(seatName);
    const message = conflicts.length === 1
      ? `${names[0]} was just taken by someone else.`
      : `${names.slice(0, -1).join("; ")} and ${names.at(-1)} were just taken by someone else.`;
    return { code: 409, body: { error: "unavailable", conflicts, message } };
  }
  if (card.saved) {
    if (card.id === "card_1" && card.cvc === "000") return { code: 402, body: { error: "card_declined", message: "Your bank declined the payment." } };
  } else {
    if (card.number === "4000000000000002") return { code: 402, body: { error: "card_declined", message: "Your bank declined the payment." } };
    if (card.number === "4000000000009995") return { code: 402, body: { error: "insufficient_funds", message: "The card doesn't have enough funds for this payment." } };
    if (card.number === "4000000000000127") return invalid("cvc", "The security code doesn't match this card.");
    if (WRONG_POSTAL.has(card.postal)) return invalid("postalCode", "The postal code doesn't match the card's billing address.");
  }
  // accepted
  sell(perf.id, ids);
  const seq = ++orderSeq;
  const tail = (hash(`order:${seq}`) >>> 0).toString(36).toUpperCase().padStart(6, "X").slice(-6);
  const code = `VN-${tail}`;
  return {
    code: 201,
    body: {
      code,
      email: b.email,
      totalCents: ids.reduce((sum, id) => sum + SEAT.get(id).priceCents + SEAT.get(id).feeCents, 0),
      brand: card.brand,
      last4: card.last4,
      performanceId: perf.id,
      tickets: ids.map((id, i) => {
        const s = SEAT.get(id);
        return { seatId: id, section: s.section, row: s.row, number: s.number, barcode: `${code.replace("-", "")}-${String(i + 1).padStart(2, "0")}` };
      }),
    },
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...cors(req),
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "content-type",
      "access-control-max-age": "600",
    });
    return res.end();
  }
  const body = req.method === "POST" ? await readBody(req) : undefined;
  if (!path.startsWith("/api/_")) {
    log.push({ t: Date.now(), method: req.method, path: path + url.search, body, session: sessionOf(req) !== null });
  }

  if (path === "/api/production" && req.method === "GET") {
    return send(req, res, 200, {
      title: "The Marriage of Figaro",
      hall: "Grand Hall",
      runningTime: "3h 10m",
      performances: PERFORMANCES.map((p) => ({ ...p, priceFromCents: 3500, seatsLeft: seatsLeft(p.id), seats: SEAT_COUNT })),
    });
  }

  const seatsMatch = /^\/api\/performances\/([^/]+)\/seats$/.exec(path);
  if (seatsMatch && req.method === "GET") {
    const pid = seatsMatch[1];
    if (!PERFORMANCES.some((p) => p.id === pid)) return send(req, res, 404, { error: "not_found", message: "There's no such performance." });
    return send(req, res, 200, {
      performanceId: pid,
      sections: SECTIONS.map((s) => ({
        key: s.key, name: s.name, priceCents: s.priceCents, feeCents: s.feeCents,
        rows: s.rows.map((n, r) => ({
          name: LETTERS[r],
          seats: Array.from({ length: n }, (_, k) => {
            const id = `${s.key}-${LETTERS[r]}-${k + 1}`;
            return { id, number: k + 1, status: isSold(pid, id) ? "sold" : "available" };
          }),
        })),
      })),
    });
  }

  if (path === "/api/events" && req.method === "GET") {
    const pid = url.searchParams.get("performance");
    if (!PERFORMANCES.some((p) => p.id === pid)) return send(req, res, 404, { error: "not_found", message: "There's no such performance." });
    res.writeHead(200, { ...cors(req), "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(": open\n\n");
    const f = { res };
    if (!feeds.has(pid)) feeds.set(pid, new Set());
    feeds.get(pid).add(f);
    req.on("close", () => feeds.get(pid).delete(f));
    return;
  }

  if (path === "/api/session" && req.method === "POST") {
    const acct = accountOf(body?.email?.trim?.().toLowerCase());
    if (acct && body?.password === acct.password) {
      const token = randomBytes(18).toString("base64url");
      sessions.set(token, acct.email);
      return send(req, res, 200, { name: acct.me.name, email: acct.email }, {
        "set-cookie": `vn_session=${token}; Path=/; HttpOnly; SameSite=Lax`,
      });
    }
    return send(req, res, 401, { error: "bad_credentials", message: "That email and password don't match." });
  }
  if (path === "/api/session" && req.method === "DELETE") {
    const who = sessionOf(req);
    if (who) sessions.delete(who.token);
    return send(req, res, 204, undefined, { "set-cookie": "vn_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" });
  }
  if (path === "/api/me" && req.method === "GET") {
    const who = sessionOf(req);
    return who && accountOf(who.email)
      ? send(req, res, 200, accountOf(who.email).me)
      : send(req, res, 401, { error: "signed_out", message: "You're not signed in." });
  }

  if (path === "/api/orders" && req.method === "POST") {
    await sleep(ORDER_DELAY);
    const out = checkOrder(req, body);
    return send(req, res, out.code, out.body);
  }

  // ── harness only ──
  if (path === "/api/_reset" && req.method === "POST") {
    reset({ sales: body?.sales !== false });
    return send(req, res, 200, { reset: true, sales: salesOn });
  }
  if (path === "/api/_take" && req.method === "POST") {
    const pid = body?.performanceId;
    if (!PERFORMANCES.some((p) => p.id === pid)) return send(req, res, 404, { error: "not_found" });
    const ids = (body.seatIds ?? []).filter((id) => SEAT.has(id));
    sell(pid, ids, { silent: body.silent === true });
    return send(req, res, 200, { taken: ids });
  }
  if (path === "/api/_log" && req.method === "GET") return send(req, res, 200, { requests: log });

  send(req, res, 404, { error: "not_found", message: "There's no such endpoint." });
});

setInterval(() => {
  if (!salesOn) return;
  for (const p of PERFORMANCES) {
    if (!feeds.get(p.id)?.size) continue;
    const bootFree = SEAT_COUNT - BOOT_SOLD.get(p.id).size;
    if (seatsLeft(p.id) <= bootFree * SALE_FLOOR) continue;
    const id = nextSale(p.id);
    if (id) sell(p.id, [id]);
  }
}, SALE_EVERY);

server.listen(PORT, "127.0.0.1", () => {
  console.log(`venue service — http://127.0.0.1:${PORT} · ${PERFORMANCES.length} performances · ${SEAT_COUNT} seats · seed ${SEED}${QUIET ? " · quiet" : ""}`);
});
