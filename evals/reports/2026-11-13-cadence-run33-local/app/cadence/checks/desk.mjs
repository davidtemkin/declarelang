// The desk flow: the first glance, the year under the hand, then logging a
// forgotten session, correcting it, and deleting it. It leaves the service's
// history as it found it (what it adds, it deletes).
export default async ({ drive, expect }) => {
  // the first glance: the exact copy
  const count0 = await drive.read("app.weekCount");
  const minutes0 = await drive.read("app.weekMinutes");
  const line0 = await drive.read("app.weekLine");
  if (!/^\d+ sessions? · (\d+h( \d+m)?|\d+m)$/.test(line0)) throw new Error("week line reads: " + line0);
  await expect.text("app.page.col.todayBand.glance.thisWeek", line0);
  const streak0 = await drive.read("app.streakLine");
  if (!/^(\d+ days?|no streak)$/.test(streak0)) throw new Error("streak reads: " + streak0);
  await expect.visible("app.page.col.todayBand.glance.live");

  // the year: a drag moves back through time, a pinch opens it up, and the period follows
  const start0 = await drive.read("app.viewStart");
  await drive.drag("app.page.col.year.strip", 300, 0);
  const start1 = await drive.read("app.viewStart");
  if (!(start1 < start0 - 5)) throw new Error(`a drag right should move back in time: ${start0} → ${start1}`);
  const span0 = await drive.read("app.viewSpan");
  await drive.pinch("app.page.col.year.strip", 3);
  const span1 = await drive.read("app.viewSpan");
  if (!(span1 < span0 / 2)) throw new Error(`a pinch out should narrow the period: ${span0} → ${span1}`);
  const label = await drive.read("app.periodLabel");
  await expect.text("app.page.col.year.head", label);
  await drive.click("app.page.col.year.zoom.Everything");
  await drive.settleMotion();
  await drive.click("app.page.col.year.zoom.Now");
  await drive.settleMotion();

  // log yesterday's ride that was forgotten
  await drive.key("n");
  await drive.settleMotion();
  await drive.click("app.entrySheet.form.Ride");
  await drive.click("app.entrySheet.form.Yesterday");
  await drive.click("app.entrySheet.form.save");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { count: 1, body: { sport: "ride", date: "2026-08-04" } });
  const count1 = await drive.read("app.weekCount");
  const minutes1 = await drive.read("app.weekMinutes");
  if (count1 != count0 + 1 || !(minutes1 > minutes0)) throw new Error(`week did not take it in: ${count0}/${minutes0} → ${count1}/${minutes1}`);
  await expect.text("app.page.col.todayBand.glance.thisWeek", await drive.read("app.weekLine"));
  await expect.equal(await drive.read("app.entering"), false);

  // correct it: five minutes longer
  await drive.click("app.page.col.todayBand.side.lastCard");
  await drive.settleMotion();
  await expect.text("app.detailSheet", "Ride");
  await drive.click("app.detailSheet.Edit");
  await drive.settleMotion();
  await drive.click('app.entrySheet.form."More how long"');
  await drive.click("app.entrySheet.form.save");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("PUT", "/api/sessions/", { count: 1 });
  const minutes2 = await drive.read("app.weekMinutes");
  if (minutes2 != minutes1 + 5) throw new Error(`correction not taken in: ${minutes1} → ${minutes2}`);

  // and delete it: two presses, the second the confirmation
  await drive.click("app.page.col.todayBand.side.lastCard");
  await drive.settleMotion();
  await drive.click("app.detailSheet.Delete");
  await drive.click('app.detailSheet."Delete — sure?"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("DELETE", "/api/sessions/", { count: 1 });
  const count3 = await drive.read("app.weekCount");
  const minutes3 = await drive.read("app.weekMinutes");
  if (count3 != count0 || minutes3 != minutes0) throw new Error(`delete not taken in: ${count3}/${minutes3}`);
  await expect.equal(await drive.read("app.weekLine"), line0);
};
