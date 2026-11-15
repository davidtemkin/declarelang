// The phone flow, with a finger: read today, handle the year with one and two
// fingers, open a session, then the case that matters most — log a session
// in a couple of taps — and delete it again (the service is left as found).
// Run: npx declare-verify my-apps/cadence/cadence.declare --assert my-apps/cadence/checks/phone.mjs

export const device = { width: 390, height: 844, touch: true };

const now = "app.page.body.now";
const year = "app.page.body.year";

export default async ({ drive, expect, page }) => {
  const before = await drive.read("app.weekCount");
  const streak0 = await drive.read("app.streak");
  await expect.text(`${now}.week.line`, await drive.read("app.weekText"));
  await expect.text(`${now}.streak`, await drive.read("app.streakText"));

  // The year under a finger: a sideways drag moves it (the page keeps up and down).
  await drive.reveal(`${year}.surface`);
  const s0 = await drive.read("app.start");
  await drive.drag(`${year}.surface`, 160, 0);
  const s1 = await drive.read("app.start");
  if (!(s1 < s0 - 5)) throw new Error(`a finger's drag should move the window back: ${s0} → ${s1}`);
  // Two fingers spread: fewer days.
  const span0 = await drive.read("app.span");
  await drive.pinch(`${year}.surface`, 2);
  const span1 = await drive.read("app.span");
  if (!(span1 < span0 * 0.8)) throw new Error(`a pinch open should show fewer days: ${span0} → ${span1}`);
  // A vertical drag on it still scrolls the page.
  const y0 = await drive.read("app.scrollY");
  await drive.drag(`${year}.surface`, 0, -200);
  const y1 = await drive.read("app.scrollY");
  if (!(y1 > y0)) throw new Error(`a vertical drag on the year should scroll the page: ${y0} → ${y1}`);

  // A session, from the period's list.
  await drive.click(`${year}.periods.0."2 weeks"`);
  await drive.settleMotion();
  await drive.click(`${year}.list.0`);
  await drive.settleMotion();
  await expect.visible("app.detailSheet");
  await expect.text("app.detailSheet", "Against everything else");
  await drive.set("app", "openId", "");
  await drive.settleMotion();

  // ── Logging, one-handed: the bar at the thumb, then Save. Two taps.
  await drive.click("app.logBar.0");
  await drive.settleMotion();
  await expect.visible("app.entrySheet");
  await expect.text("app.entrySheet", "Save ");
  const save = page.getByRole("button", { name: /^Save / });
  const label = await save.innerText();
  console.log("the sheet opens ready to save:", label);
  await save.tap();
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { count: 1, body: { date: "2026-08-05" } });
  await expect.equal(await drive.read("app.entering"), false);
  await expect.equal(await drive.read("app.weekCount"), before + 1);
  await expect.equal(await drive.read("app.streak"), streak0 + 1);
  await expect.text(`${now}.week.line`, await drive.read("app.weekText"));
  await expect.text(`${now}.streak`, await drive.read("app.streakText"));
  console.log("after logging:", await drive.read("app.weekText"), "/", await drive.read("app.streakText"));

  // Clean up: open it from today's bar, delete it.
  await drive.click(`${now}.shape.days.2`);
  await drive.settleMotion();
  await drive.click('app.detailSheet."Delete"');
  await drive.click('app.detailSheet."Tap again to delete"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.equal(await drive.read("app.weekCount"), before);
  await expect.equal(await drive.read("app.streak"), streak0);
};
