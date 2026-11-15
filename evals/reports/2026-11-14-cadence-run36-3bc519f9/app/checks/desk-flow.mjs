// At a desk: push back through the year and pull it open, open a session,
// then log yesterday's forgotten ride from the keyboard, correct it, and
// delete it — leaving the service as it was.
export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate((p, a) => window.__declare.find(p)[a], p, a);
  await drive.settleData();
  await drive.settleMotion();
  const total0 = (await read("app.sessions", "value")).sessions.length;
  const count0 = await read("app.sessions", "weekCount");
  const mins0 = await read("app.sessions", "weekMinutes");
  const streak0 = await read("app.sessions", "streak");

  // the year under the hand: a drag moves it by exactly the hand's travel
  const s0 = await read("app", "viewStart");
  const span0 = await read("app", "viewSpan");
  const w = await read("app.main.year.surface", "width");
  await drive.drag("app.main.year.surface", 300, 0);
  await expect.approx("app", "viewStart", s0 - 300 * span0 / w, 0.6);
  // a pinch opens it, about the fingers
  await drive.pinch("app.main.year.surface", 3);
  const span1 = await read("app", "viewSpan");
  if (!(span1 < span0 / 2)) throw new Error("pinch did not open the year: span " + span1);
  // the period it names and the totals follow it
  const label = await read("app", "periodLabel");
  await expect.text("app.main.year", label);
  // a preset glides to a fortnight
  await drive.click("app.main.year.controls.Fortnight");
  await drive.settleMotion();
  await expect.approx("app", "viewSpan", 14, 0.01);
  // a session from the list opens
  await drive.click("app.main.happened.rows.0");
  await drive.settleMotion();
  await expect.visible("app.detail._body.0.band");
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.equal(await read("app", "openId"), "");

  // log yesterday's ride: n opens the form; Ride, Yesterday, = for five
  // minutes more, 8 for the effort, ⌘↩
  await drive.key("n");
  await drive.settleMotion();
  await page.getByRole("option", { name: "Ride" }).click();
  await drive.click("app.logSheet._body.0.when.Yesterday");
  await drive.key("=");
  await drive.key("8");
  const form = "app.logSheet._body.0";
  await expect.equal(await read(form, "sport"), "ride");
  await expect.equal(await read(form, "effort"), 8);
  await expect.equal(await read(form, "day"), (await read("app", "todayN")) - 1);
  const minutes = await read(form, "minutes");
  await drive.key("Mod+Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { count: 1, body: { sport: "ride", effort: 8 } });
  await expect.equal(await read("app.sessions", "weekCount"), count0 + 1);
  await expect.equal(await read("app.sessions", "weekMinutes"), mins0 + minutes);
  await expect.equal(await read("app.sessions", "streak"), streak0);   // yesterday was already a day with a session
  const saved = await read("app.sessions", "lastSaved");

  // open it, correct its effort, then delete it
  await drive.set("app", "openId", saved.id);
  await drive.settleMotion();
  await drive.click("app.detail._body.0.actions.Correct");
  await drive.settleMotion();
  await drive.click("app.logSheet._body.0.feel.grid.\"effort 4\"");
  await drive.click("app.logSheet._body.0.saveButton");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("PUT", "/api/sessions/" + saved.id, { count: 1, body: { effort: 4 } });
  await expect.equal((await read("app.sessions", "lastSaved")).effort, 4);

  await drive.set("app", "openId", saved.id);
  await drive.settleMotion();
  await drive.click("app.detail._body.0.actions.Delete");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("DELETE", "/api/sessions/" + saved.id, { count: 1 });
  await expect.equal(await read("app.sessions", "weekCount"), count0);
  await expect.equal((await read("app.sessions", "value")).sessions.length, total0);
};
