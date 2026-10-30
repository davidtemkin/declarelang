// npx declare-verify my-apps/cadence/cadence.declare --assert my-apps/cadence/flow-desk.mjs
//
// At a desk: N opens the form, the duration is typed, Return-free save, then
// the session is deleted again so the service ends as it began.

export default async ({ drive, expect }) => {
  await drive.settleData();
  await expect.attr("app", "weekCount", 4);

  await drive.key("n");
  await drive.settleMotion();
  await expect.attr("app", "entryOpen", true);
  await drive.click('app.entrySheet."Swim"');
  await drive.selectAll('app.entrySheet."Minutes"');
  await drive.type("75");
  await drive.click('app.entrySheet."Save session"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { count: 1, body: { sport: "swim", date: "2026-08-05", minutes: 75 } });
  await expect.attr("app", "weekCount", 5);
  await expect.attr("app", "weekMinutes", 326);
  await expect.attr("app", "streak", 3);

  // Today's bar now holds it; open it and delete it.
  await drive.click("app.page.body.now.shape.6");
  await drive.settleMotion();
  await drive.click('app.detailSheet."Delete"');
  await drive.settleMotion();
  await drive.click('app.dlg."Delete"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("DELETE", /\/api\/sessions\/s\d+/, { count: 1 });
  await expect.attr("app", "weekCount", 4);
  await expect.attr("app", "streak", 2);
};
