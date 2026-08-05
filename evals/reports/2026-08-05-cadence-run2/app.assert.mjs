// Cadence — the behaviour rung. Drives the real program in a real browser and
// asserts through the introspection bridge, never through DOM selectors.
//
//   node tools/verify.mjs my-apps/cadence.declare --assert my-apps/cadence.assert.mjs
//
// It talks to the given service on 127.0.0.1:8320, and it leaves the service
// exactly as it found it: the session it records, it deletes again.

export default async ({ drive, expect }) => {
  const read = async (path, field = "text") =>
    drive.page.evaluate(([p, f]) => {
      const n = window.__declare.inspect(p);
      return n === null ? null : (f === "text" ? n.text : n[f]);
    }, [path, field]);
  const attr = async (name) =>
    drive.page.evaluate((n) => { const a = window.__declare.find("app"); return a[n]; }, name);
  const fontSize = async (path) =>
    drive.page.evaluate((p) => { const n = window.__declare.find(p); return n === null ? null : n.fontSize; }, path);

  // the service is live and asynchronous — wait for the first settle
  for (let i = 0; i < 60; i++) {
    if (await attr("ready")) break;
    await drive.wait(100);
  }
  if (!(await attr("ready"))) return expect.fail("the service never answered — is it running on 127.0.0.1:8320?");
  await drive.settleMotion();

  // ── §2 Today: the copy, exactly ────────────────────────────────────────
  const week = await read("app.page.weekBlock.line");
  if (!/^\d+ sessions? · (\d+h( \d\dm)?|\d+m)$/.test(week)) return expect.fail(`week line reads "${week}"`);
  const streak = await read("app.page.stkBlock.line");
  if (!/^(no streak|\d+ days?)$/.test(streak)) return expect.fail(`streak reads "${streak}"`);

  // seven days of shape, one per day of the week
  await expect.count("app.page.weekBlock.bars", "DayBar", 7);

  // the last session, and the four formats
  const sub = await read("app.page.lastBlock.sub");
  if (!/\d+ bpm/.test(sub)) return expect.fail(`last session line reads "${sub}"`);

  // ── the session in progress is unmistakably running ────────────────────
  if (await attr("liveOn")) {
    await expect.visible("app.page.live");
    const clock = await read("app.page.live.clock");
    if (!/^\d+:\d\d(:\d\d)?$/.test(clock)) return expect.fail(`live clock reads "${clock}"`);
    await expect.text("app.page.live.tag", "RUNNING NOW");
  }

  // ── §6 the numbers are the hero: 6× between largest and smallest ───────
  const big = await fontSize("app.page.stkBlock.line");
  const small = await fontSize("app.page.brand");
  if (!(big >= 6 * small)) return expect.fail(`hero ${big}px is not 6× the smallest text ${small}px`);

  // ── §3 the year is handled: it moves under a drag, and zooms ───────────
  const before = await read("app.page.yearHead.label");
  await drive.drag("app.page.tl", 260, 0, 14);
  await drive.settleMotion();
  const after = await read("app.page.yearHead.label");
  if (after === before) return expect.fail(`the year did not move under the hand (still "${after}")`);
  // and it says what it is looking at, and what happened in it
  const line = await read("app.page.yearHead.stats");
  if (!/^\d+ sessions? · /.test(line)) return expect.fail(`period line reads "${line}"`);

  const span0 = await attr("tlSpan");
  await drive.page.mouse.wheel({ deltaY: -240 });
  await drive.wait(120);
  await drive.settleMotion();
  const span1 = await attr("tlSpan");
  if (!(span1 < span0 - 1)) return expect.fail(`the wheel did not pull the year open (${span0} → ${span1})`);

  // back to today, from the keyboard
  await drive.click("app.page.yearHead.home");
  await drive.settleMotion();

  // ── §4 picking a session ───────────────────────────────────────────────
  await drive.click("app.page.lastBlock");
  await drive.settleMotion();
  await expect.visible("app.overlay.sheet.detail");
  const hero = await read("app.overlay.sheet.detail.col.hero");
  if (!/^(\d+h( \d\dm)?|\d+m)$/.test(hero)) return expect.fail(`detail hero reads "${hero}"`);
  await expect.text("app.overlay.sheet.detail.col.where", "WHERE IT SITS");
  await drive.key("Escape");
  await drive.settleMotion();

  // ── §5 adding one, and everything derived from it ──────────────────────
  const weekBefore = await read("app.page.weekBlock.line");
  await drive.click("app.add");
  await drive.settleMotion();
  await expect.visible("app.overlay.sheet.compose");

  // what they are most likely to mean is already there
  if (!(await attr("cSport"))) return expect.fail("no sport was pre-chosen");
  if (!((await attr("cMin")) > 0)) return expect.fail("no duration was pre-filled");
  if ((await attr("cDate")) !== (await attr("today"))) return expect.fail("the date did not default to today");
  await expect.text("app.overlay.sheet.saveBar.why", "READY");

  await drive.click("app.overlay.sheet.compose.col.sports.1");   // Ride
  await drive.click("app.overlay.sheet.compose.col.eff.7");      // effort 8

  // the one place a keyboard is asked for, and only if they want it
  await drive.click("app.overlay.sheet.compose.col.noteF");
  await drive.type("Windy on the flats.");
  await drive.wait(120);
  if ((await attr("cNote")) !== "Windy on the flats.") return expect.fail("the note never reached the model");

  await drive.click("app.overlay.sheet.saveBar.btn");
  for (let i = 0; i < 40; i++) { if (!(await attr("saving"))) break; await drive.wait(100); }
  await drive.wait(300);
  await drive.settleMotion();

  const fail = await attr("failure");
  if (fail) return expect.fail(`saving reported "${fail}"`);
  const weekAfter = await read("app.page.weekBlock.line");
  if (weekAfter === weekBefore) return expect.fail(`the week did not take the new session in (still "${weekAfter}")`);

  // ── and correcting / removing one leaves the history as it was ─────────
  const id = await drive.page.evaluate(() => {
    const a = window.__declare.find("app");
    const rows = a.sessions();
    return rows.length === 0 ? null : "" + rows[0].id;
  });
  await drive.page.evaluate((i) => { const a = window.__declare.find("app"); a.select(i) }, id);
  await drive.settleMotion();
  await drive.click("app.overlay.sheet.detail.col.acts.del");
  for (let i = 0; i < 40; i++) { if (!(await attr("saving"))) break; await drive.wait(100); }
  await drive.wait(300);
  await drive.settleMotion();

  const weekBack = await read("app.page.weekBlock.line");
  if (weekBack !== weekBefore) return expect.fail(`removing it did not restore the week (${weekBack} ≠ ${weekBefore})`);
};
