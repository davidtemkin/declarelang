// The phone flow, with a finger: just finished, log it in two taps — the
// button at the thumb, then Save, with today and the usual already filled in.
// Then the streak and the week both take it in. It deletes what it adds.
export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect }) => {
  const count0 = await drive.read("app.weekCount");
  const streak0 = await drive.read("app.streak");

  // the year moves under a finger
  const start0 = await drive.read("app.viewStart");
  await drive.drag("app.page.col.year.strip", 200, 0);
  if (!((await drive.read("app.viewStart")) < start0 - 5)) throw new Error("a finger drag did not move the year");
  await drive.pinch("app.page.col.year.strip", 2);

  // two taps
  await drive.click("app.fabDock.fab");
  await drive.settleMotion();
  await drive.click("app.entrySheet.form.save");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { count: 1, body: { date: "2026-08-05" } });
  await expect.equal(await drive.read("app.weekCount"), count0 + 1);
  await expect.equal(await drive.read("app.streak"), streak0 + 1);

  // tidy up: open it and delete it
  await drive.click("app.page.col.todayBand.side.lastCard");
  await drive.settleMotion();
  await drive.click("app.detailSheet.Delete");
  await drive.click('app.detailSheet."Delete — sure?"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.equal(await drive.read("app.weekCount"), count0);
  await expect.equal(await drive.read("app.streak"), streak0);
};
