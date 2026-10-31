// The brief's own story, against a private copy of the service on :8399 so the
// shared one on :8320 is never written to:
//   node task/api/server.mjs --port=8399
// Log yesterday's ride and watch this week and the streak take it in; open it,
// delete it, and watch them give it back; then handle the year.
export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect }) => {
  const read = (p, a) => drive.page.evaluate(([p, a]) => { const v = window.__declare.find(p)[a]; return v === undefined ? null : v; }, [p, a]);

  await drive.set("app", "api", "http://127.0.0.1:8399");
  await drive.settleData();
  await drive.settleMotion();

  const count0 = await read("app.sessions", "weekCount");
  const minutes0 = await read("app.sessions", "weekMinutes");
  const streak0 = await read("app.sessions", "streak");
  await expect.text("app.page.body.now.thisWeek", `${count0} sessions ·`);

  // a ride, yesterday: the sheet's defaults, one tap on the day, one on the sport, save
  await drive.click("app.fabDock.fab");
  await drive.settleMotion();
  await expect.visible("app.entrySheet");
  await drive.click('app.entrySheet."Yesterday"');
  await drive.click('app.entrySheet."Ride"');
  await drive.click('app.entrySheet."Save"');
  await drive.settleData();
  await drive.settleMotion();

  await expect.request("POST", "/api/sessions", { count: 1, body: { sport: "ride", date: "2026-08-04" } });
  await expect.equal(await read("app.sessions", "weekCount"), count0 + 1);
  await expect.approx("app", "weekCount", count0 + 1, 0.01);    // the sprung figure arrived too
  await expect.text("app.page.body.now.thisWeek", `${count0 + 1} sessions ·`);
  await expect.equal((await read("app.sessions", "weekMinutes")) > minutes0, true);
  await expect.equal(await read("app.sessions", "streak"), streak0);     // yesterday already had a session

  // open it from the week's shape (Tuesday), and delete it
  await drive.click("app.page.body.now.shape.days.1");
  await drive.settleMotion();
  await expect.visible("app.detailSheet");
  await drive.click('app.detailSheet."Delete"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("DELETE", "/api/sessions/", { count: 1 });
  await expect.equal(await read("app.sessions", "weekCount"), count0);

  // Undo records it again; then correct it to 90 minutes, and delete it for good
  await drive.click('app.toast."Undo"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.equal(await read("app.sessions", "weekCount"), count0 + 1);
  const back = await drive.page.evaluate(() => window.__declare.find("app.sessions").latest.id);
  await drive.page.evaluate((id) => { window.__declare.find("app").openEdit(id); return null; }, back);
  await drive.settleMotion();
  await drive.click('app.entrySheet."More"');
  await drive.click('app.entrySheet."Save correction"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("PUT", "/api/sessions/" + back, { count: 1 });
  await expect.equal(await drive.page.evaluate((id) => window.__declare.find("app.sessions").byId(id).minutes, back) > 0, true);
  await drive.page.evaluate((id) => { window.__declare.find("app").remove(id); return null; }, back);
  await drive.settleData();
  await expect.equal(await read("app.sessions", "weekCount"), count0);

  // the year: a drag moves the window by the finger's travel, a pinch opens it
  const start0 = await read("app", "start");
  const span0 = await read("app", "span");
  await drive.drag("app.page.body.year.surface", 120, 0);
  await expect.equal((await read("app", "start")) < start0, true);
  await drive.pinch("app.page.body.year.surface", 3);
  await expect.equal((await read("app", "span")) < span0 / 2, true);
  await drive.click('app.page.body.year.zooms."Season"');
  await drive.settleMotion();
  await expect.approx("app", "span", 91, 0.5);
};
