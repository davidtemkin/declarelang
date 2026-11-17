// The desk: today's figures, logging a session, correcting and deleting one,
// and handling the year. Resets the given service first (and last), since a
// live service remembers what earlier runs wrote.
const reset = (page) => page.evaluate(() => fetch("http://127.0.0.1:8320/api/_reset", { method: "POST" }).then((r) => r.json()));

export default async ({ drive, expect, page }) => {
  await reset(page);
  await drive.device({ width: 1440, height: 900, touch: false });
  await drive.settleData(); await drive.settleMotion();

  // Today, at a glance
  await expect.attr("app", "weekLine", "2 sessions · 1h 24m");
  await expect.attr("app", "streakLine", "2 days");
  await expect.text("app.body.today.week", "sessions");
  await expect.visible("app.body.today.live");
  await expect.visible("app.body.today.shape");
  await expect.text("app.body.today.lastBox", "Lift · Yesterday");

  // Log a ride today: open, choose Ride, two taps of +15, Save
  await drive.click("app.top.3");                 // "Log a session"
  await drive.settleMotion();
  await expect.visible("app.form.entry");
  await drive.click("app.form.entry.sports.1");   // Ride
  await drive.click("app.form.entry.long.2.4");   // +15
  await drive.click("app.form.entry.felt.1.6");   // effort 7
  const minutes = await drive.read("app.form.entry.minutes");
  await drive.click("app.form.entry.foot.1");     // Save
  await drive.settleData(); await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { body: { sport: "ride", date: "2026-08-05", minutes, effort: 7 } });
  await expect.equal(await drive.read("app.formOpen"), false);
  await expect.attr("app", "weekLine", `3 sessions · ${fmt(84 + minutes)}`);
  await expect.attr("app", "streakLine", "3 days");
  await expect.equal(Math.round(await drive.read("app.weekCountShown")), 3);   // the figure travelled there
  await expect.text("app.body.today.lastBox", "Ride · Today");

  // Open it from the last-session card, correct the effort, then delete it and undo
  await drive.click("app.body.today.lastBox.last");
  await drive.settleMotion();
  await expect.text("app.detail", "Effort 7 of 10");
  await expect.text("app.detail", "rides");
  await drive.click("app.detail.card.actions.0");     // Correct it
  await drive.settleMotion();
  await expect.visible("app.form.entry");
  await drive.click("app.form.entry.felt.1.8");     // effort 9
  await drive.click("app.form.entry.foot.1");       // Save changes
  await drive.settleData(); await drive.settleMotion();
  await expect.request("PUT", /\/api\/sessions\/s0\d+/, { body: { effort: 9 } });
  await expect.text("app.body.today.lastBox", "effort 9");

  await drive.click("app.body.today.lastBox.last");
  await drive.settleMotion();
  await drive.click("app.detail.card.actions.1");      // Delete
  await drive.settleData(); await drive.settleMotion();
  await expect.request("DELETE", /\/api\/sessions\/s0\d+/);
  await expect.attr("app", "weekLine", "2 sessions · 1h 24m");
  await expect.attr("app", "streakLine", "2 days");

  // The year: drag back through the months, open it to a fortnight, pick a session
  const before = await drive.read("app.periodLabel");
  await drive.drag("app.body.year.chart", 700, 0);
  await drive.settleMotion();
  const after = await drive.read("app.periodLabel");
  if (before == after) throw new Error("dragging the year did not move it: " + after);
  await drive.click("app.body.year.tools.1.0");     // 2 weeks
  await drive.settleMotion();
  await expect.equal(Math.round(await drive.read("app.span")), 14);
  await drive.pinch("app.body.year.chart", 0.5);    // squeeze it shut a little
  await drive.settleMotion();
  if ((await drive.read("app.span")) <= 14) throw new Error("pinching did not zoom out");
  await drive.click("app.body.year.hardest");
  await drive.settleMotion();
  await expect.visible("app.detail.card");
  await drive.key("Escape");
  await drive.settleMotion();

  // From the keyboard: n opens the form
  await drive.key("n");
  await drive.settleMotion();
  await expect.visible("app.form.entry");
  await drive.key("Escape");
  await drive.settleMotion();
  await reset(page);
};

function fmt(m) { const h = Math.floor(m / 60); return h == 0 ? m + "m" : h + "h " + (m % 60) + "m"; }
