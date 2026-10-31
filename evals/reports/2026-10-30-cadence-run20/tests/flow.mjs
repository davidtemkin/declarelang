// The brief's core loop on a phone: the week and the streak as they stand,
// a session logged from the dock in two taps, both figures moving to take it
// in, then the session deleted again (which also leaves the service as it was).
export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect }) => {
  await drive.settleData();
  await drive.settleMotion();
  await expect.text("app.page.body.today.week", "2 sessions · 1h 24m");
  await expect.text("app.page.body.today.streakRow", "2 days");

  await drive.click("app.dock.add");
  await drive.settleMotion();
  await expect.visible("app.form.body.entry");
  await drive.click("app.form.body.entry.sports.Run");
  await drive.click("app.form.body.entry.saveButton");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { count: 1, body: { sport: "run", date: "2026-08-05" } });
  await expect.text("app.page.body.today.week", "3 sessions");
  await expect.text("app.page.body.today.streakRow", "3 days");
  await expect.text("app.page.body.today.last", "Run");

  // correct it: the form opens holding the session, and a PUT carries the change
  await drive.click("app.page.body.today.last");
  await drive.settleMotion();
  await drive.click("app.detail.body.info.actions.0");
  await drive.settleMotion();
  await expect.text("app.form.body.entry", "Correct this session");
  await drive.click("app.form.body.entry.felt.\"Effort 9\"");
  await drive.click("app.form.body.entry.saveButton");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("PUT", "/api/sessions/", { count: 1, body: { effort: 9, sport: "run" } });
  await expect.text("app.page.body.today.last", "effort 9");

  await drive.click("app.page.body.today.last");
  await drive.settleMotion();
  await drive.click("app.detail.body.info.actions.delete");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("DELETE", "/api/sessions/", { count: 1 });
  await expect.text("app.page.body.today.week", "2 sessions · 1h 24m");
  await expect.text("app.page.body.today.streakRow", "2 days");
};
