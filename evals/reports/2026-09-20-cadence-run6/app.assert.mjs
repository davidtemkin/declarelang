// Rung 5 — the behaviour the brief names, driven with real input.
//
//   node tools/verify.mjs my-apps/cadence.declare --rung=5 --assert my-apps/tests/assert.mjs
//
// The service on :8320 is the app's backend here, exactly as in the browser, so
// the add/correct/delete run at the end put the history back as they found it.

const near = (a, b, tol) => Math.abs(a - b) <= tol;

export default async ({ drive, expect }) => {
  const read = (path, attr) => drive.page.evaluate((p, a) => {
    const n = window.__declare.find(p);
    const v = n != null && a in n ? n[a] : window.__declare.explain(p, a)?.value;
    return v === undefined ? null : v;
  }, path, attr);
  const app = (attr) => read("app", attr);
  const log = (attr) => read("app.log", attr);

  // ── the data landed, and the service's frozen clock is the one in use ──
  await drive.wait(1500);
  await expect.text("app.bar.when", "5 Aug 2026");

  // ── this week and the streak read exactly ──
  await expect.text("app.page.today.hero.wkBlock.wkCap", "This week");
  await expect.text("app.page.today.hero.wkBlock.wk.1", "sessions");
  await expect.text("app.page.today.hero.stBlock.st.d", "days");

  // The rung's window is 1024x768; the year sits below that fold, so bring it
  // into the frame the way a reader would before driving it.
  const scrollTo = async (y) => {
    await drive.page.evaluate((v) => { window.scrollTo(0, v); return null; }, y);
    await drive.wait(250);
  };
  // put the whole rail in the frame, wherever the page has grown to
  await scrollTo(await drive.page.evaluate(() => {
    const r = window.__declare.find("app.page.year.rail");
    return Math.max(0, r.rootOrigin().y - 120);
  }));

  // ── the year: a drag moves the frame, and only the frame ──
  const span0 = await app("span");
  const center0 = await app("center");
  await drive.drag("app.page.year.rail", 220, 0, 12);
  await drive.wait(150);
  const center1 = await app("center");
  if (!(center1 < center0 - 4)) await expect.fail(`dragging right should walk the frame back in time: ${center0} → ${center1}`);
  if (!near(await app("span"), span0, 0.001)) await expect.fail("a pan must not change the zoom");

  // ── the zoom pair pulls it open and squeezes it shut ──
  await drive.click("app.page.year.hint.zoomIn");
  await drive.settleMotion();
  const spanIn = await app("span");
  if (!(spanIn < span0 - 1)) await expect.fail(`zooming in should shorten the span: ${span0} → ${spanIn}`);
  await drive.click("app.page.year.hint.zoomOut");
  await drive.settleMotion();
  if (!(await app("span") > spanIn)) await expect.fail("zooming out should lengthen the span");

  // ── Today brings the frame home ──
  await drive.click("app.page.year.hint.todayBtn");
  await drive.settleMotion();
  const todayNum = await log("todayNum");
  if (!(await app("center") > todayNum - 90)) await expect.fail("Today should return the frame to the present");

  // ── a tap on the surface lands on a session ──
  await drive.click("app.page.year.rail");
  await drive.settleMotion();
  if (await app("selId") === "") await expect.fail("a tap on the year should land on a session");
  await drive.key("Escape");
  await drive.settleMotion();

  await scrollTo(0);

  // ── a session opens from the card it was touched on ──
  await drive.click("app.page.lastCard");
  await drive.settleMotion();
  await expect.visible("app.detail.card");
  const lastSport = await drive.page.evaluate(() => window.__declare.find("app.log").last.sport);
  await expect.text("app.detail.card.body.col.name.n", lastSport[0].toUpperCase() + lastSport.slice(1));
  await drive.key("Escape");
  await drive.settleMotion();
  if (await app("selId") !== "") await expect.fail("Escape should close the detail");

  // ── adding one: the sheet opens pre-filled, and nothing is outstanding ──
  const before = { n: await log("weekCount"), m: await log("weekMinutes"), all: await log("streak") };
  const addBtn = (await app("phone")) ? "app.plus" : "app.bar.add";
  await drive.click(addBtn);
  await drive.settleMotion();
  await expect.visible("app.sheet.panel");
  const sport = await app("cSport");
  if (!["run", "ride", "lift", "swim"].includes(sport)) await expect.fail("the sheet should open on a sport");
  if (!(await app("cMin") > 0)) await expect.fail("the sheet should open on a duration");
  if (await app("cDay") !== todayNum) await expect.fail("the sheet should open on today");
  if (await app("cProblem") !== "") await expect.fail("nothing should be outstanding on an untouched draft");

  await drive.click("app.sheet.panel.body.scroller.col.sports.0");   // Run
  await drive.wait(150);
  await drive.click("app.sheet.panel.body.scroller.col.quick.1");    // 45 minutes
  await drive.wait(150);
  if (await app("cMin") !== 45) await expect.fail("a quick duration should set the duration");
  // Take the animation clock before saving, so the proof that the figure
  // TRAVELS is exact: the data lands, motion does not advance, and the digits
  // are still behind their new value until the clock is handed back.
  await drive.page.evaluate(() => { window.__declare.clock.manual(); return null; });
  await drive.click("app.sheet.panel.body.foot.go");
  await drive.wait(1600);

  if (await app("composing")) await expect.fail("a saved session should close the sheet");
  const after = { n: await log("weekCount"), m: await log("weekMinutes") };
  if (after.n !== before.n + 1) await expect.fail(`the week's count should take the new session in: ${before.n} → ${after.n}`);
  if (after.m !== before.m + 45) await expect.fail(`the week's total should take the new session in: ${before.m} → ${after.m}`);

  // the figure travels to its new value rather than cutting to it
  const mid = await read("app.page.today.hero.wkBlock.wk.0", "shown");
  if (near(mid, after.n, 0.0001))
    await expect.fail(`the count cut to ${after.n} instead of travelling there`);
  await drive.settleMotion();
  if (!near(await read("app.page.today.hero.wkBlock.wk.0", "shown"), after.n, 0.02))
    await expect.fail("the count should arrive at its new value");

  // ── and deleting it puts the history back ──
  await drive.click("app.page.lastCard");
  await drive.settleMotion();
  await drive.click("app.detail.card.body.col.actions.del");
  await drive.wait(400);
  await drive.click("app.confirm.panel.col.btns.rowInner.1");        // "Delete"
  await drive.wait(1600);
  const back = { n: await log("weekCount"), m: await log("weekMinutes"), all: await log("streak") };
  if (back.n !== before.n || back.m !== before.m)
    await expect.fail(`deleting should put the week back: ${JSON.stringify(back)} vs ${JSON.stringify(before)}`);
};
