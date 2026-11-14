// On a phone, one-handed: the year moves under a finger, and a session is
// recorded with a tap on the dock and a tap on Save. Cleans up after itself.

export const device = { width: 390, height: 844, touch: true };

const num = (drive, path, attr) => drive.page.evaluate(([p, a]) => window.__declare.find(p)[a], [path, attr]);

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.settleMotion();

  // ── the year: a sideways drag moves it back in time, by the finger's travel
  await drive.reveal("app.page.year.surface");
  const start0 = await num(drive, "app", "viewStart");
  const span0 = await num(drive, "app", "viewSpan");
  await drive.drag("app.page.year.surface", 175, 0);
  await drive.settleMotion();
  const start1 = await num(drive, "app", "viewStart");
  const width = await num(drive, "app.page.year.surface", "width");
  await expect.equal(Math.abs((start0 - start1) - 175 * span0 / width) < 2, true, `moved ${start0 - start1} days`);
  await expect.equal(await num(drive, "app", "atToday"), false);

  // pinched open, it shows fewer days; the label says which
  await drive.pinch("app.page.year.surface", 3);
  await drive.settleMotion();
  const span1 = await num(drive, "app", "viewSpan");
  await expect.equal(span1 < span0 / 2, true, `span ${span0} → ${span1}`);

  // a tap on a bar opens its session
  await drive.click("app.page.year.list.0");
  await drive.settleMotion();
  await expect.visible("app.detailSheet.page");
  await drive.key("Escape");
  await drive.settleMotion();
  await drive.click("app.page.year.foot.1");      // back to today
  await drive.settleMotion();
  await expect.equal(await num(drive, "app", "atToday"), true);

  // ── just finished: the dock, then Save. Two taps.
  const streak0 = await num(drive, "app", "streak");
  const count0 = await num(drive, "app", "shownCount");
  await drive.click("app.dock.log");
  await drive.settleMotion();
  await expect.text("app.entrySheet.form.send", "Save Run");
  await drive.click("app.entrySheet.form.send");
  await drive.settleData();
  await drive.settleMotion();
  const made = await num(drive, "app.create", "value");
  await expect.equal(made.date, "2026-08-05");
  await expect.equal(made.sport, "run");
  await expect.equal(await num(drive, "app", "entryOpen"), false);
  await expect.equal(await num(drive, "app", "streak"), streak0 + 1);
  await expect.equal(await num(drive, "app", "shownCount"), count0 + 1);

  // clean up
  await drive.set("app", "selId", made.id);
  await drive.set("app", "detailOpen", true);
  await drive.settleMotion();
  await drive.reveal("app.detailSheet.page.actions");
  await drive.click("app.detailSheet.page.actions.1");
  await drive.settleData();
  await drive.settleMotion();
  await expect.equal(await num(drive, "app", "streak"), streak0);
};
