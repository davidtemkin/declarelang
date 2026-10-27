// The phone's main flow: log a session in a few taps, watch this week and the
// streak take it in, then correct it and delete it again (leaving the service
// as it was). Then handle the year: drag it, pinch it open.
//   npx declare-verify my-apps/cadence/cadence.declare --assert my-apps/cadence/flow.mjs
export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect }) => {
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "weekCopy", "2 sessions · 1h 24m");
  await expect.attr("app", "streakCopy", "2 days");

  // log today's session: open the form, confirm what it guessed
  await drive.click("app.dock.logFab");
  await drive.settleMotion();
  await drive.click('app.logSheet."Save session"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { count: 1 });
  await expect.attr("app", "formOpen", false);
  await expect.attr("app", "streakCopy", "3 days");
  await expect.approx("app.weekCount", "shown", 3, 0.01);

  // open it, correct it: ten minutes longer
  await drive.set("app", "detailOpen", true);
  await drive.settleMotion();
  await drive.click("app.detail.Edit");
  await drive.settleMotion();
  await drive.click("app.logSheet.More");
  await drive.click("app.logSheet.More");
  await drive.click('app.logSheet."Save changes"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("PUT", "/api/sessions/", { count: 1 });
  await expect.attr("app", "formOpen", false);

  // delete it again
  await drive.set("app", "detailOpen", true);
  await drive.settleMotion();
  await drive.click("app.detail.Delete");
  await drive.settleMotion();
  await drive.click('app.confirmDelete.Delete');
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("DELETE", "/api/sessions/", { count: 1 });
  await expect.attr("app", "weekCopy", "2 sessions · 1h 24m");
  await expect.attr("app", "streakCopy", "2 days");

  // the year under the hand: a drag right goes back in time, a pinch opens it
  await expect.approx("app", "vSpan", 91, 0.5);
  await drive.drag("app.page.year.surface", 200, 0);
  await drive.settleMotion();
  await expect.approx("app", "vSpan", 91, 0.5);
  await drive.pinch("app.page.year.surface", 3);
  await drive.settleMotion();
  await expect.approx("app", "vSpan", 30.3, 2);
};
