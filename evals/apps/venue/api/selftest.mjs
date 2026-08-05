// The fixture API's own self-test. The API is part of the instrument, and an
// instrument that rots silently is how a round of measurement gets thrown away
// — so every promise API.md makes to the solving agent is asserted here.
//
//   node evals/apps/venue/api/selftest.mjs        (starts its own server)
//
// Exits non-zero on the first broken promise.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 8399;
const B = `http://127.0.0.1:${PORT}`;

let passed = 0;
const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) { passed++; return; }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

const get = async (p) => {
  const r = await fetch(`${B}${p}`);
  return { status: r.status, body: await r.json() };
};
const post = async (p, body) => {
  const r = await fetch(`${B}${p}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
};

const server = spawn(process.execPath, [join(HERE, "server.mjs"), `--port=${PORT}`], { stdio: "ignore" });
process.on("exit", () => server.kill());

// wait for the port
for (let i = 0; i < 60; i++) {
  try { await get("/api/halls"); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
}

// ── the season ───────────────────────────────────────────────────────────────
const season = await get("/api/performances");
check("season returns 200", season.status === 200);
check("season is ~4,000 performances", season.body.performances.length === 4000, `got ${season.body.performances.length}`);
check("season is ordered by start time",
  season.body.performances.every((p, i, a) => i === 0 || a[i - 1].startsAt <= p.startsAt));
check("every performance carries the fields API.md documents",
  season.body.performances.every((p) => p.id && p.title && p.hallId && p.hall && p.startsAt && typeof p.priceFrom === "number"));

const search = await get("/api/performances?search=carmen");
check("search narrows the season", search.body.performances.length > 0 && search.body.performances.length < 4000,
  `${search.body.performances.length} matches`);
check("search matches on title, case-insensitively",
  search.body.performances.every((p) => /carmen/i.test(p.title)));
const hallFilter = await get("/api/performances?hall=studio");
check("hall filter restricts to that hall", hallFilter.body.performances.every((p) => p.hallId === "studio"));

// ── determinism: the whole premise ───────────────────────────────────────────
const again = await get("/api/performances");
check("the season is byte-identical on a second read",
  JSON.stringify(again.body) === JSON.stringify(season.body));

// ── seats ────────────────────────────────────────────────────────────────────
const perf = season.body.performances[0];
const map = await get(`/api/performances/${perf.id}/seats`);
check("a seat map returns 200", map.status === 200);
const seats = map.body.sections.flatMap((s) => s.rows.flatMap((r) => r.seats));
check("the hall has between 112 and 702 seats", seats.length >= 112 && seats.length <= 702, `${seats.length}`);
check("seat ids are unique", new Set(seats.map((s) => s.id)).size === seats.length);
check("every seat is available or sold", seats.every((s) => s.status === "available" || s.status === "sold"));
check("some seats are sold and some are not",
  seats.some((s) => s.status === "sold") && seats.some((s) => s.status === "available"));
check("row letters skip I and O", map.body.sections.every((s) => s.rows.every((r) => !"IO".includes(r.name))));
check("every section prices its seats", map.body.sections.every((s) => typeof s.price === "number" && s.price > 0));
check("an unknown performance 404s", (await get("/api/performances/nope/seats")).status === 404);

const open = () => seats.filter((s) => s.status === "available" && !/-13$/.test(s.id));

// ── holds ────────────────────────────────────────────────────────────────────
const [a, b] = open();
const held = await post("/api/holds", { performanceId: perf.id, seatIds: [a.id, b.id] });
check("holding free seats succeeds", held.status === 200, `${held.status} ${JSON.stringify(held.body)}`);
const heldAgain = await post("/api/holds", { performanceId: perf.id, seatIds: [a.id] });
check("holding an already-held seat conflicts", heldAgain.status === 409);
check("a conflict names the seats and carries a sentence",
  heldAgain.body.conflicts?.includes(a.id) && /Someone else took .* first\./.test(heldAgain.body.message ?? ""));

const cursed = seats.find((s) => /-13$/.test(s.id));
check("seat 13 looks available", cursed?.status === "available");
check("seat 13 always loses the race",
  (await post("/api/holds", { performanceId: perf.id, seatIds: [cursed.id] })).status === 409);

check("a seat from another hall is a 400, not a conflict",
  (await post("/api/holds", { performanceId: perf.id, seatIds: ["ZZZ-Q-9"] })).status === 400);

// ── bookings ─────────────────────────────────────────────────────────────────
// The seats held above are held by THIS client, so booking them must work —
// an app that holds before booking must not race itself.
const booked = await post("/api/bookings", {
  performanceId: perf.id, seatIds: [a.id, b.id], name: "Ada Lovelace", email: "ada@example.com",
});
check("a client can book the seats it just held", booked.status === 201, `${booked.status} ${JSON.stringify(booked.body)}`);
check("a booking returns a code", /^BK-\d{4}$/.test(booked.body.code ?? ""), booked.body.code);
const priceOf = new Map(map.body.sections.flatMap((s) => s.rows.flatMap((r) => r.seats.map((x) => [x.id, s.price]))));
check("a booking totals the true section prices",
  booked.body.total === priceOf.get(a.id) + priceOf.get(b.id),
  `got ${booked.body.total}, expected ${priceOf.get(a.id) + priceOf.get(b.id)}`);

check("a booking with no seats is refused", (await post("/api/bookings", { performanceId: perf.id, seatIds: [], name: "A", email: "a@b.co" })).status === 400);
check("a booking with no name is refused", (await post("/api/bookings", { performanceId: perf.id, seatIds: [open()[2].id], name: "", email: "a@b.co" })).status === 400);
const badMail = await post("/api/bookings", { performanceId: perf.id, seatIds: [open()[3].id], name: "A", email: "nope" });
check("a malformed email is refused with a sentence", badMail.status === 400 && /email/i.test(badMail.body.message ?? ""));
check("a seat from another hall is refused",
  (await post("/api/bookings", { performanceId: perf.id, seatIds: ["ZZZ-Q-9"], name: "A", email: "a@b.co" })).status === 400);

// ── the manufactured race (harness-only) ─────────────────────────────────────
const victim = season.body.performances[1];
const vMap = await get(`/api/performances/${victim.id}/seats`);
const vOpen = vMap.body.sections.flatMap((s) => s.rows.flatMap((r) => r.seats))
  .filter((s) => s.status === "available" && !/-13$/.test(s.id));
const took = await post("/api/_takeover", { performanceId: victim.id });
check("takeover reports what it took", took.status === 200 && took.body.taken > 0, JSON.stringify(took.body));
const lost = await post("/api/bookings", { performanceId: victim.id, seatIds: [vOpen[0].id], name: "A", email: "a@b.co" });
check("after takeover, a booking loses the race", lost.status === 409, `${lost.status}`);
check("the lost booking names the seat and carries the sentence",
  lost.body.conflicts?.includes(vOpen[0].id) && /Someone else took .* first\./.test(lost.body.message ?? ""));
check("after takeover, the seat map shows them sold",
  (await get(`/api/performances/${victim.id}/seats`)).body.sections
    .flatMap((s) => s.rows.flatMap((r) => r.seats)).filter((s) => s.status === "available").length === 0);

const untouched = season.body.performances[2];
const uMap = await get(`/api/performances/${untouched.id}/seats`);
const uOpen = uMap.body.sections.flatMap((s) => s.rows.flatMap((r) => r.seats))
  .find((s) => s.status === "available" && !/-13$/.test(s.id));
check("takeover touches only its own performance",
  (await post("/api/bookings", { performanceId: untouched.id, seatIds: [uOpen.id], name: "A", email: "a@b.co" })).status === 201);

// ── the stream ───────────────────────────────────────────────────────────────
const sse = await fetch(`${B}/api/events?performance=${season.body.performances[3].id}`);
check("the stream opens as an event stream", sse.headers.get("content-type")?.includes("text/event-stream"));
const reader = sse.body.getReader();
const chunk = await Promise.race([
  reader.read().then((r) => new TextDecoder().decode(r.value)),
  new Promise((r) => setTimeout(() => r(""), 2000)),
]);
check("the stream announces itself with a named open event", /event: open/.test(chunk), JSON.stringify(chunk.slice(0, 80)));
reader.cancel();

// ── report ───────────────────────────────────────────────────────────────────
server.kill();
console.log(`\nvenue fixture api — ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
