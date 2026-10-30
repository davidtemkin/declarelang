// npx declare-verify my-apps/cadence/cadence.declare --assert my-apps/cadence/flow-phone.mjs
//
// On a phone: log a run two days back (the empty Sunday), watch the week and
// the streak take it in, correct it, then delete it — so the service ends as
// it began.

export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect }) => {
  await drive.settleData();
  await expect.attr("app", "weekCount", 4);
  await expect.attr("app", "streak", 2);

  // Log: a few taps, no keyboard.
  await drive.click("app.dock.logButton");
  await drive.settleMotion();
  await drive.click('app.entrySheet."Run"');
  await drive.click('app.entrySheet."A day earlier"');
  await drive.click('app.entrySheet."A day earlier"');
  await drive.click('app.entrySheet."A day earlier"');
  await drive.click('app.entrySheet."Effort 8"');
  await drive.click('app.entrySheet."Save session"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { count: 1, body: { sport: "run", date: "2026-08-02", effort: 8 } });

  // Everything derived from the history is true of it at once.
  await expect.attr("app", "weekCount", 5);
  await expect.attr("app", "streak", 5);
  await expect.attr("app", "entryOpen", false);
  await expect.attr("app.page.body.now.thisWeek.line", "accessibilityLabel", "5 sessions · 5h 11m");
  await expect.attr("app.page.body.now.streak.days", "accessibilityLabel", "5 days");

  // Correct it: open the new session from Sunday's bar, Edit, five minutes more.
  await drive.click("app.page.body.now.shape.3");
  await drive.settleMotion();
  await expect.attr("app", "detailOpen", true);
  await drive.click('app.detailSheet."Edit"');
  await drive.settleMotion();
  await drive.click('app.entrySheet."Five minutes more"');
  await drive.click('app.entrySheet."Save session"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("PUT", /\/api\/sessions\/s\d+/, { count: 1 });
  await expect.attr("app", "weekCount", 5);

  // Delete it.
  await drive.click("app.page.body.now.shape.3");
  await drive.settleMotion();
  await drive.click('app.detailSheet."Delete"');
  await drive.settleMotion();
  await drive.click('app.dlg."Delete"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("DELETE", /\/api\/sessions\/s\d+/, { count: 1 });
  await expect.attr("app", "weekCount", 4);
  await expect.attr("app", "streak", 2);
  await expect.attr("app.page.body.now.thisWeek.line", "accessibilityLabel", "4 sessions · 4h 11m");
  await expect.attr("app.page.body.now.thisWeek.line", "html", "<span class='fig'>4</span> sessions · <span class='fig'>4</span><span class='unit'>h </span><span class='fig'>11</span><span class='unit'>m</span>");
};
