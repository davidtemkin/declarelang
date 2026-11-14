// Log a session on a phone, see this week and the streak take it in, then
// delete it again (which also leaves the service as it was).
export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect }) => {
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "weekCount", 2);
  await expect.attr("app", "streak", 2);
  await expect.text("app.page.body.today.week", "2 sessions · 1h 24m");

  await drive.click("app.dock.0");
  await drive.settleMotion();
  await drive.click('app.entry."Run"');
  await drive.click('app.entry."Save"');
  await drive.settleData();
  await drive.settleMotion();

  await expect.attr("app", "weekCount", 3);
  await expect.attr("app", "streak", 3);
  await expect.text("app.page.body.today.week", "3 sessions");
  await expect.request("POST", "/api/sessions", { count: 1, body: { sport: "run", date: "2026-08-05" } });

  // the new one is the last session; open it and delete it
  await drive.click("app.page.body.today.now.2");
  await drive.settleMotion();
  await expect.text("app.detail", "Run");
  await drive.click('app.detail."Delete"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "weekCount", 2);
  await expect.attr("app", "streak", 2);
  await expect.text("app.page.body.today.week", "2 sessions · 1h 24m");
};
