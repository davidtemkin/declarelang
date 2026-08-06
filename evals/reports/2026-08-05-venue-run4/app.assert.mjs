// Rung 5 — the brief's "what done looks like", driven end to end.
//
//   node tools/verify.mjs my-apps/venue.declare --assert my-apps/venue.assert.mjs
//
// The fixture service must be running on 127.0.0.1:8310. Holds, takeovers and
// bookings accumulate in that process, so the run resets it first.

const API = "http://127.0.0.1:8310";

const reset = () => fetch(`${API}/api/_reset`, { method: "POST" }).then((r) => r.json());
const takeover = (id) =>
  fetch(`${API}/api/_takeover`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ performanceId: id }),
  }).then((r) => r.json());

export default async ({ drive, expect }) => {
  await reset();

  const read = (path, attr) => drive.page.evaluate(
    (p, a) => JSON.parse(JSON.stringify(window.__declare.find(p)[a] ?? null)), path, attr);
  const node = (path) => drive.page.evaluate((p) => window.__declare.inspect(p), path);

  // ── 1. the season arrives, and the count reads exactly ──────────────────
  await drive.settleData();
  await drive.wait(400);
  await drive.settleMotion();
  await expect.text("app.board.count", "4,000 performances");

  // ── 2. search narrows it, immediately and in memory ─────────────────────
  await drive.click("app.board.find");
  await drive.type("Carmen");
  await drive.wait(200);
  await drive.settleMotion();
  const carmen = await read("app", "matchCount");
  if (!(carmen > 0 && carmen < 4000)) await expect.fail(`search did not narrow: ${carmen}`);
  await expect.text("app.board.count", `${carmen} performances`);

  // one hall only
  await drive.page.evaluate(() => { window.__declare.find("app").setHall("studio"); return null; });
  await drive.wait(150);
  const studio = await read("app", "matchCount");
  if (!(studio > 0 && studio < carmen)) await expect.fail(`hall did not narrow: ${studio} of ${carmen}`);
  await drive.page.evaluate(() => { window.__declare.find("app").setHall(""); return null; });
  await drive.wait(150);

  // singular reads "1 performance"
  await drive.page.evaluate(() => { window.__declare.find("app").setQuery("__nothing__"); return null; });
  await drive.wait(150);
  await expect.text("app.board.count", "0 performances");
  await drive.page.evaluate(() => { window.__declare.find("app").setQuery("Carmen"); return null; });
  await drive.wait(150);

  // ── 3. four thousand rows, a dozen views ───────────────────────────────
  await drive.page.evaluate(() => { window.__declare.find("app").setQuery(""); return null; });
  await drive.wait(200);
  await drive.settleMotion();
  const built = (await node("app.board.list.inner")).children.length;
  if (built > 60) await expect.fail(`the whole season materialized: ${built} row views`);

  // ── 4. into the room ────────────────────────────────────────────────────
  await drive.page.evaluate(() => { window.__declare.find("app").openPerf("p2071"); return null; }); // Carmen, Grand Hall
  await drive.settleData();
  await drive.wait(500);
  await drive.settleMotion();
  await expect.visible("app.room");
  await expect.text("app.room.head.title", "Carmen");
  await expect.text("app.room.head.sub", "Grand Hall");

  const secs = (await node("app.room.plan.secs")).children.length;
  if (secs !== 3) await expect.fail(`Grand Hall should lay out 3 sections, got ${secs}`);

  // every seat in the house is there: 18*22 + 9*20 + 7*18 = 702
  const seats = await drive.page.evaluate(() => {
    const secs = window.__declare.inspect("app.room.plan.secs").children;
    let n = 0;
    for (const s of secs) for (const r of s.children) n += r.children.filter((c) => c.kind === "Seat").length;
    return n;
  });
  if (seats !== 702) await expect.fail(`expected 702 seats in the Grand Hall, got ${seats}`);

  // ── 5. three seats across two sections, and the total comes out right ───
  const pick = await drive.page.evaluate(() => {
    const app = window.__declare.find("app");
    const map = app.seatSrc.value;
    const out = [];
    for (const sec of map.sections) {
      for (const row of sec.rows) {
        for (const seat of row.seats) {
          // seat 13 always loses the race — keep it out of the honest run
          if (seat.status === "available" && seat.number !== 13) { out.push([seat.id, sec.price]); break; }
        }
        if (out.length && out[out.length - 1][0].startsWith(sec.key)) break;
      }
    }
    return out;
  });
  const chosen = [pick[0], pick[1], pick[2] ?? pick[0]];
  // two from the first section, one from the second — scattered across two
  const ids = await drive.page.evaluate((first, second) => {
    const app = window.__declare.find("app");
    const map = app.seatSrc.value;
    const free = (key, n) => map.sections.find((s) => s.key === key).rows
      .flatMap((r) => r.seats).filter((s) => s.status === "available" && s.number !== 13).slice(0, n);
    const a = free(first, 2), b = free(second, 1);
    return [...a.map((s) => s.id), ...b.map((s) => s.id)];
  }, pick[0][0].split("-")[0], pick[1][0].split("-")[0]);

  for (const id of ids) {
    await drive.page.evaluate((sid) => { window.__declare.find("app").pickSeat(sid, false); return null; }, id);
  }
  await drive.wait(200);
  await drive.settleMotion();

  const expectTotal = await drive.page.evaluate((sel) => {
    const app = window.__declare.find("app");
    const map = app.seatSrc.value;
    return sel.reduce((t, id) => t + map.sections.find((s) => s.key === id.split("-")[0]).price, 0);
  }, ids);
  await expect.text("app.room.bar.sum", `3 seats · $${expectTotal}`);
  await expect.visible("app.room.bar.sum");

  // ── 6. the requirement is apparent before the attempt ──────────────────
  await expect.text("app.room.bar.msg", "Add a name and an email address.");
  await expect.attr("app.room.bar.go", "disabled", true);

  // a name alone is not enough, and a malformed address is not enough
  await drive.page.evaluate(() => { window.__declare.find("app").who = "Ada Lovelace"; return null; });
  await drive.wait(120);
  await expect.attr("app.room.bar.go", "disabled", true);
  await drive.page.evaluate(() => { window.__declare.find("app").mail = "ada@"; return null; });
  await drive.wait(120);
  await expect.attr("app.room.bar.go", "disabled", true);
  await expect.text("app.room.bar.msg", "Add a name and an email address.");

  await drive.page.evaluate(() => { window.__declare.find("app").mail = "ada@example.com"; return null; });
  await drive.wait(120);
  await expect.attr("app.room.bar.go", "disabled", false);

  // ── 7. a real click on the button books it, and a code comes back ──────
  await drive.click("app.room.bar.go");
  await drive.settleData();
  await drive.wait(600);
  await drive.settleMotion();
  await expect.visible("app.ticket");
  const code = await read("app", "confCode");
  if (!/^BK-\d{4}$/.test(code)) await expect.fail(`no confirmation code: ${JSON.stringify(code)}`);
  await expect.text("app.ticket.line", `3 seats · $${expectTotal}`);
  await expect.text("app.ticket.what", "Carmen");

  // ── 8. start again, for another performance ────────────────────────────
  await drive.click("app.ticket.again");
  await drive.wait(400);
  await drive.settleMotion();
  await expect.hidden("app.ticket");
  await expect.visible("app.board");
  await expect.text("app.board.count", "4,000 performances");

  // ── 9. somebody else got there first ───────────────────────────────────
  await drive.page.evaluate(() => { window.__declare.find("app").openPerf("p2628"); return null; }); // Carmen, Playhouse
  await drive.settleData();
  await drive.wait(500);
  await drive.settleMotion();

  const lost = await drive.page.evaluate(() => {
    const app = window.__declare.find("app");
    const map = app.seatSrc.value;
    return map.sections[0].rows.flatMap((r) => r.seats)
      .filter((s) => s.status === "available" && s.number !== 13).slice(0, 2).map((s) => s.id);
  });
  for (const id of lost) {
    await drive.page.evaluate((sid) => { window.__declare.find("app").pickSeat(sid, false); return null; }, id);
  }
  await drive.wait(150);
  const held = await read("app", "chosen");
  if (held.join() !== lost.join()) await expect.fail(`selection is ${held.join()}, expected ${lost.join()}`);

  await takeover("p2628"); // every free seat now belongs to somebody else

  await drive.page.evaluate(() => {
    const app = window.__declare.find("app");
    app.who = "Ada Lovelace";
    app.mail = "ada@example.com";
    return null;
  });
  await drive.wait(150);
  await drive.click("app.room.bar.go");
  await drive.settleData();
  await drive.wait(600);
  await drive.settleMotion();

  // the service's own sentence, shown as it was given
  const notice = await read("app", "notice");
  if (!/^Someone else took .* first\.$/.test(notice)) {
    await expect.fail(`the service's sentence was not shown: ${JSON.stringify(notice)}`);
  }
  await expect.text("app.room.bar.msg", notice);
  await expect.hidden("app.ticket");

  // and the seats that were lost are not still sitting in the selection
  const still = await read("app", "chosen");
  if (still.length !== 0) await expect.fail(`lost seats still selected: ${JSON.stringify(still)}`);
  const goneNow = await read("app", "gone");
  for (const id of lost) {
    if (!goneNow.includes(id)) await expect.fail(`${id} was lost but the room still offers it`);
  }
  // ...and the person can carry on: the bar is still up, saying why
  await expect.visible("app.room.bar.msg");
  await expect.visible("app.room");

  // ── 10. everything above again, but only through what a finger reaches ──
  await drive.click("app.room.head.back");
  await drive.wait(400);
  await drive.settleMotion();
  await expect.visible("app.board");

  // scrolling the season: a real wheel over the list, and the window follows
  const before = await drive.page.evaluate(() =>
    window.__declare.inspect("app.board.list.inner").children.map((c) => c.path).slice(0, 3));
  const box = await node("app.board.list");
  await drive.page.mouse.move(box.rootX + box.width / 2, box.rootY + box.height / 2);
  await drive.page.mouse.wheel({ deltaY: 3000 });
  await drive.wait(400);
  const scrolled = await read("app.board.list", "scrollY");
  if (!(scrolled > 100)) await expect.fail(`the season did not scroll: scrollY ${scrolled}`);
  const after = await drive.page.evaluate(() => ({
    n: window.__declare.inspect("app.board.list.inner").children.length,
    windowed: window.__declare.find("app.board.list.inner").virtualized,
  }));
  if (!after.windowed) await expect.fail("the season list is not windowed");
  if (after.n > 60) await expect.fail(`the whole season materialized while scrolling: ${after.n}`);
  if (before.join() === "" ) await expect.fail("no rows were built at all");

  // a real click on a real row opens that performance's hall
  await drive.page.mouse.wheel({ deltaY: -6000 });
  await drive.wait(400);
  const rowId = await drive.page.evaluate(() =>
    window.__declare.find("app").shown.value.rows[0].id);
  await drive.click("app.board.list.inner.0");
  await drive.settleData();
  await drive.wait(600);
  await drive.settleMotion();
  await expect.visible("app.room");
  const opened = await read("app", "perfId");
  if (opened !== rowId) await expect.fail(`clicking the first row opened ${opened}, not ${rowId}`);

  // a real click on a real seat chooses it, and again unchooses it
  const seatPath = await drive.page.evaluate(() => {
    const secs = window.__declare.inspect("app.room.plan.secs").children;
    for (const s of secs) {
      for (const r of s.children) {
        for (const c of r.children) {
          const v = c.kind === "Seat" ? window.__declare.find(c.path) : null;
          // seat 13 always loses the race by construction — §9 already drove
          // that path; this one is the ordinary booking
          if (v !== null && !v.gone && !/-13$/.test(v.tip.split(" ")[0])) return c.path;
        }
      }
    }
    return null;
  });
  if (seatPath === null) await expect.fail("no free seat to click");
  await drive.click(seatPath);
  await drive.wait(300);
  await drive.settleMotion();
  const one = await read("app", "chosen");
  if (one.length !== 1) await expect.fail(`clicking a seat chose ${JSON.stringify(one)}`);
  await expect.visible("app.room.bar.sum");
  await expect.text("app.room.bar.sum", `1 seat · $${await read("app", "total")}`);

  await drive.click(seatPath);
  await drive.wait(300);
  await drive.settleMotion();
  const none = await read("app", "chosen");
  if (none.length !== 0) await expect.fail(`clicking it again left ${JSON.stringify(none)}`);
  // nothing chosen, so there is no summary to show
  await expect.hidden("app.room.bar.sum");

  // typing the name and the address through the keyboard, then booking
  await drive.click(seatPath);
  await drive.wait(200);
  await drive.settleMotion();   // the bar is still rising, and it clips its contents
  // both fields still hold what the refused booking was made with — clearing
  // the app's own slots empties them, which is the controlled field's whole
  // point (nothing else can clear a native input)
  await drive.page.evaluate(() => {
    const app = window.__declare.find("app");
    app.who = "";
    app.mail = "";
    return null;
  });
  await drive.wait(150);
  await expect.text("app.room.bar.nameF", "");
  await drive.click("app.room.bar.nameF");
  await drive.type("Grace Hopper");
  await drive.click("app.room.bar.mailF");
  await drive.type("grace@example.com");
  await drive.wait(250);
  await expect.attr("app.room.bar.go", "disabled", false);
  await expect.text("app.room.bar.msg", "");
  await drive.click("app.room.bar.go");
  await drive.settleData();
  await drive.wait(700);
  await drive.settleMotion();
  const why = await read("app", "notice");
  if (why !== "") await expect.fail(`the typed booking was refused: ${why} (seat ${seatPath})`);
  await expect.visible("app.ticket");
  const code2 = await read("app", "confCode");
  if (!/^BK-\d{4}$/.test(code2)) await expect.fail(`no code from the typed booking: ${code2}`);

  // ── 11. other people are buying while this person looks ────────────────
  await drive.click("app.ticket.again");
  await drive.wait(400);
  await drive.settleMotion();
  await drive.page.evaluate(() => { window.__declare.find("app").openPerf("p0641"); return null; });
  await drive.settleData();
  await drive.wait(500);
  await drive.settleMotion();
  const goneBefore = (await read("app", "gone")).length;
  await expect.attr("app.sales", "status", "open");
  await drive.wait(7000); // the service sells a seat about every three seconds
  const goneAfter = await read("app", "gone");
  if (goneAfter.length <= goneBefore) {
    await expect.fail(`the sales stream changed nothing in ${JSON.stringify(goneAfter)}`);
  }
  // a seat the stream took is no longer offered
  const stolen = goneAfter[0];
  const stillFree = await drive.page.evaluate((sid) => {
    const secs = window.__declare.inspect("app.room.plan.secs").children;
    for (const s of secs) for (const r of s.children) for (const c of r.children) {
      if (c.kind === "Seat" && window.__declare.find(c.path).tip.startsWith(sid)) {
        return !window.__declare.find(c.path).gone;
      }
    }
    return false;
  }, stolen);
  if (stillFree) await expect.fail(`${stolen} was sold but the room still offers it`);

  // ── 12. one performance reads "1 performance" ──────────────────────────
  //
  // No title-and-hall pair in this season narrows to a single performance
  // (every title plays at least 85 times), so the singular is reached by
  // handing the source one record and letting the same constraint answer.
  await drive.click("app.room.head.back");
  await drive.wait(400);
  await drive.settleMotion();
  await drive.page.evaluate(() => {
    const app = window.__declare.find("app");
    app.src.value = { performances: [{ id: "p0001", title: "Solo", hallId: "studio",
      hall: "Studio", startsAt: "2026-09-01T20:00:00.000Z", priceFrom: 35 }] };
    return null;
  });
  await drive.wait(250);
  await expect.text("app.board.count", "1 performance");
  await drive.page.evaluate(() => { window.__declare.find("app").src.fetch(); return null; });
  await drive.settleData();
  await drive.wait(400);
  await expect.text("app.board.count", "4,000 performances");

  // ── 13. the URL is where "which performance" lives ─────────────────────
  await drive.page.evaluate(() => { window.__declare.find("app").location = "p2071"; return null; });
  await drive.settleData();
  await drive.wait(600);
  await drive.settleMotion();
  await expect.visible("app.room");
  await expect.text("app.room.head.title", "Carmen");
  const seatsHere = await drive.page.evaluate(() =>
    window.__declare.inspect("app.room.plan.secs").children.length);
  if (seatsHere !== 3) await expect.fail(`a location write did not fetch the hall: ${seatsHere} sections`);
  await drive.page.evaluate(() => { window.__declare.find("app").location = ""; return null; });
  await drive.wait(500);
  await drive.settleMotion();
  await expect.visible("app.board");

  // ── 14. a room entered a second time is read a second time ─────────────
  //
  // The season sells while nobody is looking; coming back to a hall must show
  // what is free NOW, not what was free on the first visit.
  const freeSeats = () => drive.page.evaluate(() => {
    const secs = window.__declare.inspect("app.room.plan.secs").children;
    let n = 0;
    for (const s of secs) for (const r of s.children) for (const c of r.children) {
      if (c.kind === "Seat" && !window.__declare.find(c.path).gone) n++;
    }
    return n;
  });

  await drive.page.evaluate(() => { window.__declare.find("app").openPerf("p2071"); return null; });
  await drive.settleData();
  await drive.wait(700);
  await drive.settleMotion();
  const firstVisit = await freeSeats();
  if (firstVisit < 10) await expect.fail(`the first visit found only ${firstVisit} free seats`);

  await drive.click("app.room.head.back");
  await drive.wait(400);
  await drive.settleMotion();
  await takeover("p2071");           // the whole hall goes while the person is away

  await drive.page.evaluate(() => { window.__declare.find("app").openPerf("p2071"); return null; });
  await drive.settleData();
  await drive.wait(900);
  await drive.settleMotion();
  const secondVisit = await freeSeats();
  if (secondVisit !== 0) await expect.fail(
    `the second visit still offers ${secondVisit} seats the hall no longer has`);

  await reset();
};
