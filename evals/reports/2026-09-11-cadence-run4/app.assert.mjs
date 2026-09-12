// Behaviour checks for cadence.declare — node tools/verify.mjs my-apps/cadence.declare --assert my-apps/cadence-checks.mjs
// The service on 127.0.0.1:8320 must be running; its clock is frozen at 2026-08-05.

export default async ({ drive, expect }) => {
  await drive.settleData();
  await drive.settleMotion();

  // ── the history landed, and this week reads as the brief quotes it ──
  await expect.attr("app", "ready", true);
  await expect.text("app.rail.weekBlock.line.n.fig", "2");
  await expect.text("app.rail.weekBlock.line.n.u", "sessions");
  await expect.text("app.rail.weekBlock.line.d.ha.fig", "1");
  await expect.text("app.rail.weekBlock.line.d.ha.u", "h");
  await expect.text("app.rail.weekBlock.line.d.ma.fig", "24");
  await expect.text("app.rail.weekBlock.line.d.ma.u", "m");

  // ── the streak ──
  await expect.attr("app", "streak", 2);
  await expect.text("app.rail.streakBlock.on.fig", "2");
  await expect.text("app.rail.streakBlock.on.u", "days");
  await expect.hidden("app.rail.streakBlock.off");

  // ── seven days of shape, one per day of the week ──
  await expect.count("app.rail.shapeBlock.grid", "DayCol", 7);

  // ── the year is handled: a drag moves the period, and it is the same two
  //    scalars the sentence above the band reads ──
  const before = (await expect.explain("app", "center")).value;
  await drive.drag("app.yearWrap.band", 220, 0, 16);
  await drive.settleMotion();
  const after = (await expect.explain("app", "center")).value;
  if (!(after < before - 10)) await expect.fail(`drag did not pan the year: ${before} -> ${after}`);

  // ── pulling it open narrows the span ──
  const wide = (await expect.explain("app", "span")).value;
  await drive.click("app.yearWrap.ctl.zin");
  await drive.settleMotion();
  const open = (await expect.explain("app", "span")).value;
  if (!(open < wide)) await expect.fail(`zoom in did not open the band: ${wide} -> ${open}`);

  // ── Today comes back to today ──
  await drive.click("app.yearWrap.ctl.today");
  await drive.settleMotion();
  await expect.text("app.yearWrap.period", "Aug 2026");

  // ── adding one: everything is already filled in, and it is saveable ──
  await expect.hidden("app.composer");
  await drive.click("app.addBtn");
  await drive.settleMotion();
  await expect.visible("app.composer");
  await expect.attr("app", "canSave", true);
  await expect.visible("app.composer.form.col.fSport.row.t1");

  // ── choosing a sport re-aims what follows it ──
  await drive.click("app.composer.form.col.fSport.row.t3");   // lift — no distance
  await drive.settleMotion();
  await expect.attr("app", "draftSport", "lift");
  await expect.hidden("app.composer.form.col.fDist");

  // ── escape leaves without saving ──
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.hidden("app.composer");

  // ── picking a session opens its detail, and the detail is about that one ──
  await drive.click("app.rail.lastBlock.card");
  await drive.settleMotion();
  await expect.visible("app.detail");
  await expect.text("app.detail.body.col.sport", "Lift");
  await expect.text("app.detail.body.col.dur.ma.fig", "52");
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.hidden("app.detail");
};
