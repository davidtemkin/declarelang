// On a phone: log a session in a few taps, watch the week and the streak take
// it in, then undo it so the service is left as it was.
export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate((p, a) => window.__declare.find(p)[a], p, a);
  await drive.settleData();
  await drive.settleMotion();
  const total0 = await read("app.sessions", "value").then((v) => v.sessions.length);
  const count0 = await read("app.sessions", "weekCount");
  const mins0 = await read("app.sessions", "weekMinutes");
  const streak0 = await read("app.sessions", "streak");

  // two taps and a confirm: open, (today and the usual sport are already chosen), save
  await drive.click("app.logDock.logFab");
  await drive.settleMotion();
  await expect.visible("app.logSheet._body.0.saveButton");
  const minutes = await read("app.logSheet._body.0", "minutes");
  await drive.click("app.logSheet._body.0.time.2.\"+5\"");
  await drive.click("app.logSheet._body.0.saveButton");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { count: 1 });

  await expect.equal(await read("app", "formOpen"), false);
  await expect.equal(await read("app.sessions", "weekCount"), count0 + 1);
  await expect.equal(await read("app.sessions", "weekMinutes"), mins0 + minutes + 5);
  await expect.equal(await read("app.sessions", "streak"), streak0 + 1);
  // the figures on screen have travelled to the new values
  await expect.equal(Math.round(await read("app", "wkCount")), count0 + 1);
  await expect.equal(Math.round(await read("app", "streakShown")), streak0 + 1);
  await expect.text("app.main.thisWeek.line", String(count0 + 1));

  // undo from the toast: the service and the screen are as they were
  await page.getByRole("button", { name: "Undo" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("DELETE", "/api/sessions/", { count: 1 });
  await expect.equal(await read("app.sessions", "weekCount"), count0);
  await expect.equal(await read("app.sessions", "value").then((v) => v.sessions.length), total0);
};
