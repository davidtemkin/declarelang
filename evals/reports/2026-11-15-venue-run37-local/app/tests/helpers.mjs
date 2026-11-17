// Shared by the flow scripts: what is free right now, and a purchase made by
// someone else (a request from outside the app, with no session).

const SECTION = { ORCH: "Orchestra", GT: "Grand Tier", DC: "Dress Circle", BALC: "Balcony" };

export function seatName(id) {
  const [key, row, n] = id.split("-");
  return `${SECTION[key]}, row ${row}, seat ${n}`;
}

// `count` free seats in a section, as the app's own seat map has them, the
// nearest the section's middle first — where flying to the section lands.
export async function freeSeats(page, key, count, not = []) {
  const map = await page.evaluate(() => JSON.parse(JSON.stringify(window.__declare.find("app.seatMap").value)));
  const chosen = await page.evaluate(() => JSON.parse(JSON.stringify(window.__declare.find("app").chosen)));
  const section = map.sections.find((s) => s.key == key);
  const midRow = Math.floor((section.rows.length - 1) / 2);
  const all = [];
  section.rows.forEach((row, ri) => row.seats.forEach((s, k) => {
    if (s.status == "available" && !not.includes(s.id) && !chosen.includes(s.id))
      all.push({ id: s.id, d: Math.abs(ri - midRow) * 1.2 + Math.abs(k - (row.seats.length - 1) / 2) });
  }));
  return all.sort((a, b) => a.d - b.d).slice(0, count).map((s) => s.id);
}

export async function buyElsewhere(page, seatId, performanceId = "p01") {
  return page.evaluate(async ([seat, perf]) => {
    const r = await fetch("http://127.0.0.1:8350/api/orders", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ performanceId: perf, seatIds: [seat], email: "someone@example.com",
        payment: { card: { number: "5555555555554444", expMonth: 4, expYear: 2030, cvc: "123", name: "Someone Else" },
          billing: { line1: "1 Main St", line2: null, city: "Springfield", postalCode: "62704", country: "US" } } }),
    });
    return r.status;
  }, [seatId, performanceId]);
}


// The same purchase, started and not waited for: it is in flight while the
// person presses Pay, so the service sees it first.
export async function startElsewhere(page, seatId, performanceId = "p01") {
  await page.evaluate(([seat, perf]) => {
    window.__elsewhere = fetch("http://127.0.0.1:8350/api/orders", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ performanceId: perf, seatIds: [seat], email: "someone@example.com",
        payment: { card: { number: "5555555555554444", expMonth: 4, expYear: 2030, cvc: "123", name: "Someone Else" },
          billing: { line1: "1 Main St", line2: null, city: "Springfield", postalCode: "62704", country: "US" } } }),
    }).then((r) => r.status);
  }, [seatId, performanceId]);
}
