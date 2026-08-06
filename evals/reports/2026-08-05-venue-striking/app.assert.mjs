// Behaviour for The Venue — `node tools/verify.mjs my-apps/venue.declare
// --assert my-apps/venue.assert.mjs`.  The service must be up on 127.0.0.1:8310.
//
// Everything is driven through real input at real coordinates and asserted
// through the introspection bridge, so each check exercises the hit test a
// thumb would.

const settle = async (drive) => {
  await drive.settleData();
  await drive.wait(400);
  await drive.settleMotion();
};

const val = (page, path, attr) =>
  page.evaluate((p, a) => window.__declare.explain(p, a)?.value, path, attr);

// A chip in the filter ruler, by the word printed on it.
const chip = (page, label) =>
  page.evaluate((label) => {
    const r = window.__declare.inspect("app.season_.head.ruler.inner");
    for (const c of r.children) {
      const t = c.children.find((k) => k.name === "t");
      if (t && String(t.text || "") === label) return c.path;
    }
    return null;
  }, label);

// Seats in the plan, filtered by what the running program says about them.
const seats = (page, pick) =>
  page.evaluate((pick) => {
    const plan = window.__declare.inspect("app.hall.plan");
    const out = [];
    for (const c of plan.children) {
      if (c.kind !== "Seat") continue;
      const gone = window.__declare.explain(c.path, "gone").value;
      const tip = String(window.__declare.explain(c.path, "tip").value || "");
      const cursed = / 13 · /.test(tip);
      if (pick === "free" && !gone && !cursed) out.push(c.path);
      if (pick === "cursed" && !gone && cursed) out.push(c.path);
      if (pick === "gone" && gone) out.push(c.path);
    }
    return out;
  }, pick);

export default async ({ drive, expect, page }) => {
  // ── 2. Finding a performance ───────────────────────────────────────────
  await settle(drive);
  await expect.text("app.season_.head.count", "4,000 performances");

  // the list is windowed, not paged: 4,000 records, a handful of views
  const built = await page.evaluate(() =>
    window.__declare.inspect("app.season_.list.inner").children.length);
  if (built > 60) expect.fail(`the season materialised ${built} rows — it should window`);
  if (!(await val(page, "app.season_.list.inner", "virtualized")))
    expect.fail("the season list is not virtualized");

  // search narrows, and the count follows
  await drive.click("app.season_.head.find.q");
  await drive.type("Carmen");
  await drive.wait(350);
  await expect.text("app.season_.head.count", "104 performances");

  // a hall and a month narrow it further — down to the singular form
  const grand = await chip(page, "GRAND");
  const jan = await chip(page, "JAN");
  if (!grand || !jan) expect.fail("could not find the hall/month chips in the ruler");
  await drive.click(grand);
  await drive.click(jan);
  await drive.wait(250);
  await expect.text("app.season_.head.count", "1 performance");

  // ── 5. Something travels when the season becomes a hall ────────────────
  await page.evaluate(() => window.__declare.clock.manual());
  await drive.click("app.season_.list.inner.0");
  // one frame to arm the spring, then the travel proper
  await page.evaluate(() => { window.__declare.clock.step(16); window.__declare.clock.step(200); });
  const mid = await val(page, "app", "t");
  if (!(mid > 0.02 && mid < 0.98)) expect.fail(`the season→hall morph is a cut, not a travel (t = ${mid})`);
  const heroY = await val(page, "app.hero", "y");
  if (!(heroY > 2)) expect.fail(`the hero is not travelling from the row it was tapped on (y = ${heroY})`);
  await page.evaluate(() => { window.__declare.clock.settleMotion(4000); window.__declare.clock.auto(); });
  await settle(drive);

  // the address is the performance, so this is deep-linkable and back works
  const where = await val(page, "app", "location");
  if (!/^p\d{4}$/.test(String(where))) expect.fail(`location should name the performance, got ${where}`);
  await expect.text("app.hero.title", "Carmen");

  // ── 3. Choosing seats ──────────────────────────────────────────────────
  const free = await seats(page, "free");
  if (free.length < 4) expect.fail(`only ${free.length} free seats found in the plan`);
  const gone = await seats(page, "gone");
  if (gone.length < 10) expect.fail("the plan shows no sold seats at all");

  // free / yours / gone differ in more than hue: they differ in size
  const sizeOf = async (p) => await val(page, p + ".m", "scale");
  const freeSize = await sizeOf(free[0]);
  const goneSize = await sizeOf(gone[0]);

  await drive.click(free[0]);
  await drive.click(free[1]);
  await settle(drive);
  const yoursSize = await sizeOf(free[0]);
  if (!(yoursSize > freeSize && freeSize > goneSize))
    expect.fail(`the three seat states are not three sizes (yours ${yoursSize}, free ${freeSize}, gone ${goneSize})`);

  const two = await val(page, "app", "summary");
  if (!/^2 seats · \$\d/.test(String(two))) expect.fail(`the summary reads "${two}"`);
  const total = await val(page, "app", "pickTotal");
  const prices = await page.evaluate(() =>
    (window.__declare.explain("app", "picks").value || []).reduce((s, p) => s + p.price, 0));
  if (total !== prices) expect.fail(`the total (${total}) is not the sum of the chosen seats (${prices})`);
  await expect.text("app.hall.rail.col.sum", `2 seats · $${total}`);

  // unchoosing is the same gesture
  await drive.click(free[1]);
  await settle(drive);
  if (!/^1 seat · /.test(String(await val(page, "app", "summary"))))
    expect.fail("picking a chosen seat again did not give it back");

  // a sold seat is not a choice
  await drive.click(gone[0]);
  await settle(drive);
  if (!/^1 seat · /.test(String(await val(page, "app", "summary"))))
    expect.fail("a sold seat was allowed into the selection");

  // ── 4. Someone else took it first ──────────────────────────────────────
  // Seat 13 of every row always loses the race, so the losing path is
  // reproducible: the service's sentence is shown as given, and the seat
  // does not stay in the selection as though we had it.
  const cursed = await seats(page, "cursed");
  if (cursed.length === 0) expect.fail("no contested seat to test the losing path with");
  await drive.click(cursed[0]);
  await drive.wait(1400);
  await settle(drive);
  const said = String(await val(page, "app", "notice"));
  if (!/^Someone else took .* first\.$/.test(said))
    expect.fail(`the service's own sentence was not shown — got "${said}"`);
  if (!/^1 seat · /.test(String(await val(page, "app", "summary"))))
    expect.fail("a lost seat is still sitting in the selection");
  if ((await val(page, cursed[0] + "", "gone")) !== true)
    expect.fail("a lost seat is still drawn as free");

  // ── 3. The room must not lie about what is still free ──────────────────
  // The service publishes other people's purchases on an event stream, about
  // one every three seconds. Watch for two of them.
  const goneBefore = (await seats(page, "gone")).length;
  await drive.wait(7000);
  await settle(drive);
  const goneAfter = (await seats(page, "gone")).length;
  if (goneAfter <= goneBefore)
    expect.fail(`the room did not follow the sales feed (${goneBefore} → ${goneAfter} seats gone)`);

  // ── 4. The requirement is apparent before they try ─────────────────────
  if ((await val(page, "app.hall.rail.col.form.go", "disabled")) !== true)
    expect.fail("Confirm is live before a name and an email exist");
  await drive.click("app.hall.rail.col.form.nf");
  await drive.type("Ada Lovelace");
  await drive.click("app.hall.rail.col.form.mf");
  await drive.type("not-an-address");
  await drive.wait(200);
  if ((await val(page, "app.hall.rail.col.form.go", "disabled")) !== true)
    expect.fail("Confirm is live with a malformed email");
  await drive.type("@example.com");
  await drive.wait(200);
  if ((await val(page, "app.hall.rail.col.form.go", "disabled")) !== false)
    expect.fail("Confirm stays dead with a good name and email");

  // ── 4. A booking that succeeds ─────────────────────────────────────────
  await drive.click("app.hall.rail.col.form.go");
  await settle(drive);
  const code = String(await val(page, "app", "bookedCode"));
  if (!/^BK-\d{4}$/.test(code)) expect.fail(`no confirmation code came back — got "${code}"`);
  await expect.visible("app.door.stub");
  await expect.text("app.door.stub.code", code);
  await expect.text("app.door.stub.body.t", "Carmen");

  // …and they can start again
  await drive.click("app.door.again");
  await settle(drive);
  await expect.hidden("app.door");
  await expect.text("app.season_.head.count", "1 performance");

  // ── 6. On a phone ──────────────────────────────────────────────────────
  // A phone: 390 points wide, touch, and a real device pixel ratio. (`isMobile`
  // is deliberately off — the verify host page carries no viewport meta, so
  // mobile emulation would hand the app Chrome's 980pt fallback viewport.)
  // Puppeteer reloads the page when touch emulation changes, so this starts
  // the journey over rather than continuing the one above.
  await page.setViewport({ width: 390, height: 844, hasTouch: true, deviceScaleFactor: 3 });
  await drive.wait(600);
  await settle(drive);
  if ((await val(page, "app", "width")) !== 390) expect.fail("the phone viewport did not reach the app");
  if ((await val(page, "app", "compact")) !== true) expect.fail("a 390pt window is not in the compact arrangement");
  await expect.text("app.season_.head.count", "4,000 performances");

  // the Grand Hall — 702 seats on a 390pt screen, the hard case
  await drive.click("app.season_.head.find.q");
  await drive.type("Carmen");
  await drive.wait(350);
  const grand2 = await chip(page, "GRAND");
  await drive.click(grand2);
  await drive.wait(250);
  await drive.click("app.season_.list.inner.0");
  await settle(drive);
  if (String(await val(page, "app.hero.meta", "text")).indexOf("GRAND HALL") < 0)
    expect.fail("did not reach the Grand Hall on the phone");

  // nothing important is off the side of the phone
  const wide = await page.evaluate(() => {
    const w = window.__declare.inspect("app").width;
    const bad = [];
    const walk = (n) => {
      if (n.shown && n.width > 0 && n.rootX + n.width > w + 1 && n.kind !== "Seat" && n.kind !== "SectionGround")
        bad.push(n.path + " (" + Math.round(n.rootX + n.width) + " > " + w + ")");
      n.children.forEach(walk);
    };
    walk(window.__declare.inspect("app.hall"));
    return bad;
  });
  if (wide.length) expect.fail("content runs off the phone's edge: " + wide.slice(0, 4).join(", "));

  // the whole house fits without pinching, and the room is not scrolled
  const planH = await val(page, "app", "planH");
  const visH = await val(page, "app", "visH");
  if (planH > visH + 1) expect.fail(`the plan (${planH}) does not fit the phone's room (${visH})`);

  // a tap in the plan opens that seat's ROW at thumb size — the phone answer
  const pfree = await seats(page, "free");
  await drive.click(pfree[0]);
  await settle(drive);
  if (String(await val(page, "app", "railKey")) === "")
    expect.fail("tapping the plan on a phone did not open the row rail");
  await expect.visible("app.hall.dock.rail");
  if ((await val(page, "app", "pickN")) !== 0)
    expect.fail("a tap in the plan on a phone chose a seat instead of opening its row");

  // every seat in the rail is a real thumb target, and none of them is cut off
  const rail = await page.evaluate(() => {
    const s = window.__declare.inspect("app.hall.dock.rail.strip");
    return s.children.filter((c) => c.kind === "RailSeat")
      .map((c) => ({ path: c.path, w: c.width, h: c.height, right: c.rootX + c.width, bottom: c.rootY + c.height }));
  });
  if (rail.length < 20) expect.fail(`the row rail shows only ${rail.length} of the row's 22 seats`);
  for (const r of rail) {
    if (r.w < 40 || r.h < 44) expect.fail(`a rail seat is ${r.w}×${r.h} — under the thumb floor`);
    if (r.right > 391) expect.fail(`a rail seat runs off the phone at ${r.right}`);
    if (r.bottom > 845) expect.fail(`a rail seat falls off the bottom at ${r.bottom}`);
  }

  // and picking in the rail is what chooses the seat
  const pickable = await page.evaluate(() => {
    const s = window.__declare.inspect("app.hall.dock.rail.strip");
    for (const c of s.children) {
      if (c.kind !== "RailSeat") continue;
      if (window.__declare.explain(c.path, "gone").value !== false) continue;
      const n = c.children.find((k) => k.name === "m")?.children.find((k) => k.name === "n");
      if (n && String(n.text) !== "13") return c.path;   // seat 13 always loses the race
    }
    return null;
  });
  if (!pickable) expect.fail("no free seat in the opened row");
  await drive.click(pickable);
  await settle(drive);
  if ((await val(page, "app", "pickN")) < 1) expect.fail("a tap in the row rail chose nothing");
  await expect.visible("app.hall.dock.bar");
  await expect.text("app.hall.dock.bar.s", String(await val(page, "app", "summary")));

  // every hall's rows, not just the one that happens to be open: the rail
  // reserves exactly the height its wrapping needs, in each of the three houses
  const openRow = String(await val(page, "app", "railKey"));
  const halls = await page.evaluate(() => {
    const v = window.__declare.explain("app.house", "value").value;
    return (v.rows || []).map((r) => r.key);
  });
  for (const k of [halls[0], halls[Math.floor(halls.length / 2)], halls[halls.length - 1]]) {
    await page.evaluate((k) => window.__declare.evaluate("app", `railKey = "${k}"`), k);
    await drive.wait(220);
    const off = await page.evaluate(() => {
      const s = window.__declare.inspect("app.hall.dock.rail.strip");
      const h = window.__declare.inspect("app").height;
      return s.children.filter((c) => c.kind === "RailSeat")
        .filter((c) => c.rootY + c.height > h + 1 || c.rootX + c.width > 391).length;
    });
    if (off) expect.fail(`${off} seats of row ${k} fall outside the phone`);
  }
  await page.evaluate((k) => window.__declare.evaluate("app", `railKey = "${k}"`), openRow);
  await drive.wait(250);

  // stepping to the next row keeps the picking surface without leaving the room
  const before = String(await val(page, "app", "railKey"));
  await drive.click("app.hall.dock.rail.hdr.next");
  await settle(drive);
  if (String(await val(page, "app", "railKey")) === before)
    expect.fail("the rail's next-row control did not move");
  if ((await val(page, "app", "pickN")) < 1)
    expect.fail("stepping rows lost the selection");
};
