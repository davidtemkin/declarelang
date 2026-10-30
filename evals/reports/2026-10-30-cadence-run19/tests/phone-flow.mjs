// npx declare-verify my-apps/cadence/cadence.declare --assert my-apps/cadence/checks/phone-flow.mjs
//
// On a phone: record today's session with nothing but Save, watch this week
// and the streak take it in, then delete it from the week's shape and watch
// them give it back. Leaves the service's history as it found it.

export const device = { width: 390, height: 844, touch: true };

const read = (page, path, attr) =>
  page.evaluate((p, a) => window.__declare.find(p)[a] ?? null, path, attr);

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.settleMotion();

  const count = await read(page, "app", "weekCount");
  const minutes = await read(page, "app", "weekMinutes");
  const streak = await read(page, "app", "streak");
  await expect.text("app.page.body.now.thisWeek.weekLine", `${count} sessions · `);

  // the common case: open the form, confirm what it suggests
  await drive.click("app.dock.logButton");
  await drive.settleMotion();
  await expect.visible("app.entrySheet.entry.saveButton");
  await expect.text("app.entrySheet.entry.saveButton", "today");
  await drive.click("app.entrySheet.entry.saveButton");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { count: 1 });

  await expect.attr("app", "weekCount", count + 1);
  await expect.attr("app", "streak", streak + 1);          // today now counts
  await expect.attr("app", "entryOpen", false);
  await expect.text("app.page.body.now.thisWeek.weekLine", `${count + 1} sessions · `);
  const added = await read(page, "app", "weekMinutes");
  if (!(added > minutes)) throw new Error(`week minutes did not grow: ${minutes} → ${added}`);

  // today's bar opens it; delete puts everything back
  await drive.click("app.page.body.now.shape.bars.6");
  await drive.settleMotion();
  await expect.attr("app", "detailOpen", true);
  await page.getByRole("button", { name: "Delete" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("DELETE", "/api/sessions/", { count: 1 });
  await expect.attr("app", "weekCount", count);
  await expect.attr("app", "streak", streak);
  await expect.attr("app", "weekMinutes", minutes);

  // the year under a finger: a sideways drag moves it by exactly the travel,
  // a pinch opens it about the fingers
  await drive.reveal("app.page.body.year.chart");
  const start = await read(page, "app", "start");
  const span = await read(page, "app", "span");
  const width = await read(page, "app.page.body.year.chart", "width");
  await drive.drag("app.page.body.year.chart", 120, 0);
  await expect.approx("app", "start", start - 120 * span / width, 0.6);
  await drive.pinch("app.page.body.year.chart", 2);
  await drive.settleMotion();
  const opened = await read(page, "app", "span");
  if (!(opened < span * 0.7)) throw new Error(`pinch did not open the year: span ${span} → ${opened}`);
};
