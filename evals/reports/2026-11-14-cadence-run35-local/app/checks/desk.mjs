// The desk flow: read today, handle the year, open a session, log one from
// the keyboard, correct it, delete it, undo, and clean up after itself.
// Run: npx declare-verify my-apps/cadence/cadence.declare --assert my-apps/cadence/checks/desk.mjs
//
// It talks to the live service, and leaves it as it found it: every session
// it adds, it deletes again.

const now = "app.page.body.now";
const year = "app.page.body.year";

export default async ({ drive, expect, page }) => {
  // ── Today, at a glance
  const before = await drive.read("app.weekCount");
  const beforeMin = await drive.read("app.weekMinutes");
  const streak0 = await drive.read("app.streak");
  const weekText = await drive.read("app.weekText");
  await expect.text(`${now}.week.line`, weekText);
  await expect.text(`${now}.streak`, await drive.read("app.streakText"));
  console.log("today reads:", weekText, "/", await drive.read("app.streakText"));

  // ── The year: the hand moves it, without letting go first
  const s0 = await drive.read("app.start");
  await drive.press(`${year}.surface`, 600, 150);
  await drive.moveBy(150, 0);
  const sMid = await drive.read("app.start");
  if (!(sMid < s0)) throw new Error(`a drag in progress should move the window back: ${s0} → ${sMid}`);
  await drive.moveBy(150, 0);
  await drive.release();
  const s1 = await drive.read("app.start");
  if (!(s1 < sMid)) throw new Error(`the drag should keep moving it: ${sMid} → ${s1}`);

  const span0 = await drive.read("app.span");
  await drive.pinch(`${year}.surface`, 2);
  const span1 = await drive.read("app.span");
  if (!(span1 < span0 * 0.8)) throw new Error(`a pinch open should show fewer days: ${span0} → ${span1}`);

  // The period chips glide it; the period says what it is looking at.
  await drive.click(`${year}.periods.0."2 weeks"`);
  await drive.settleMotion();
  await expect.approx("app", "span", 14, 0.5);
  const name = await drive.read("app.periodName");
  await expect.text(`${year}.head`, name);

  // Back through the autumn: the year, then a fortnight in October.
  await drive.click(`${year}.periods.0.Year`);
  await drive.settleMotion();
  await expect.approx("app", "span", 365, 1);
  await drive.set("app", "startTo", 20374);   // 13 Oct 2025
  await drive.set("app", "spanTo", 14);
  await drive.settleMotion();
  await expect.text(`${year}.head`, "Oct 2025");

  // ── A session: picked from the period's list
  await drive.click(`${year}.list.0`);
  await drive.settleMotion();
  await expect.visible("app.detailSheet");
  await expect.text("app.detailSheet", "Against everything else");
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.equal(await drive.read("app.openId"), "");

  // ── Logging one, from the keyboard: n, b for ride, + twice, 8 for effort, ⌘S
  await drive.key("n");
  await drive.settleMotion();
  await expect.visible("app.entrySheet");
  await drive.key("b");
  await drive.key("=");
  await drive.key("=");
  await drive.key("8");
  await drive.key("Mod+S");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { count: 1, body: { sport: "ride", date: "2026-08-05", effort: 8 } });
  await expect.equal(await drive.read("app.entering"), false);
  await expect.equal(await drive.read("app.weekCount"), before + 1);
  await expect.equal(await drive.read("app.streak"), streak0 + 1);
  await expect.text(`${now}.week.line`, await drive.read("app.weekText"));
  console.log("after logging:", await drive.read("app.weekText"), "/", await drive.read("app.streakText"));

  // ── Correcting it: from today's bar in the week's shape
  await drive.click(`${now}.shape.days.2`);
  await drive.settleMotion();
  await expect.text("app.detailSheet", "Ride");
  await drive.click('app.detailSheet."Correct it"');
  await drive.settleMotion();
  await expect.text("app.entrySheet", "Correct a session");
  await drive.click('app.entrySheet."5 minutes more"');
  await drive.click('app.entrySheet."Save changes"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("PUT", /\/api\/sessions\/s\d+/, { count: 1 });

  // ── Deleting it, undoing, deleting again
  await drive.click(`${now}.shape.days.2`);
  await drive.settleMotion();
  await drive.click('app.detailSheet."Delete"');
  await drive.click('app.detailSheet."Tap again to delete"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("DELETE", /\/api\/sessions\/s\d+/, { count: 1 });
  await expect.equal(await drive.read("app.weekCount"), before);
  await drive.click("app.toast.Undo");
  await drive.settleData();
  await drive.settleMotion();
  await expect.equal(await drive.read("app.weekCount"), before + 1);

  await drive.click(`${now}.shape.days.2`);
  await drive.settleMotion();
  await drive.click('app.detailSheet."Delete"');
  await drive.click('app.detailSheet."Tap again to delete"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.equal(await drive.read("app.weekCount"), before);
  await expect.equal(await drive.read("app.weekMinutes"), beforeMin);
};
