// The habit tracker, driven as a person would:
//   npx declare-verify my-apps/habits/habits.declare --assert my-apps/habits/tests/flow.mjs

const R = (i) => "app.page.list." + i;
const habits = (drive) => drive.page.evaluate(() =>
  window.__declare.find("app").habits.all().map((h) => ({ id: h.id, name: h.name, hue: h.hue, n: h.days.length })));
const today = (drive) => drive.page.evaluate(() => window.__declare.find("app").today);
const doneToday = (drive) => drive.page.evaluate(() => window.__declare.find("app").doneToday);

export default async ({ drive, expect }) => {
  await drive.page.evaluate(() => { localStorage.clear(); return null; });
  await drive.settleMotion();

  // The sample: four habits, three done today
  expect.equal((await habits(drive)).length, 4);
  expect.equal(await doneToday(drive), 3);
  await expect.text("app.page.head", "3/4");

  // Nothing celebrates on its own at load
  await expect.attr(R(0) + ".main.opener.streakBadge.popRun", "started", false);
  await expect.attr("app.page.head.ring.glowRun", "started", false);


  // Each row's streak badge: water's 6-day run, kept today; no streak on the fourth
  await expect.text(R(0) + ".main.opener.streakBadge", "6");
  await expect.attr(R(0) + ".main.opener.streakBadge", "kept", true);
  await expect.text(R(2) + ".main.opener.streakBadge", "12");
  await expect.text(R(3) + ".main.opener.streakBadge", "0");

  // Untick today on water: the run up to yesterday (5) is still alive, but not kept today
  await drive.click(R(0) + ".main.week.6");
  await drive.settleMotion();
  await expect.text(R(0) + ".main.opener.streakBadge", "5");
  await expect.attr(R(0) + ".main.opener.streakBadge", "kept", false);
  await expect.text(R(0), "Tick today to keep your streak");
  await drive.click(R(0) + ".main.week.6");
  await drive.settleMotion();

  // Tick today on the fourth habit: the dot bursts, the flame swells, and as
  // the last one left, the ring blooms. A 1-day streak, and everything done.
  await drive.click(R(3) + ".main.week.6");
  await drive.settleMotion();
  expect.equal(await doneToday(drive), 4);
  await expect.attr(R(3) + ".main.week.6.burstRun", "started", true);
  await expect.attr(R(3) + ".main.opener.streakBadge.popRun", "started", true);
  await expect.attr("app.page.head.ring.glowRun", "started", true);
  await expect.attr("app.page.head.ring", "complete", true);
  await expect.text(R(3) + ".main.opener.streakBadge", "1");
  await expect.text("app.page.head", "Everything done today");
  // and untick it
  await drive.click(R(3) + ".main.week.6");
  await drive.settleMotion();
  expect.equal(await doneToday(drive), 3);

  // Open a habit: its stats appear; Escape closes it
  await drive.click(R(2) + ".main.opener");
  await drive.settleMotion();
  await expect.exists(R(2) + ".detail");
  await expect.text(R(2) + ".detail.stats", "Current streak");
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.attr("app", "openId", 0);

  // Add a habit
  const wide = await drive.page.evaluate(() => window.__declare.find("app").wide);
  await drive.click(wide ? "app.page.head.plus" : "app.addDock.add");
  await drive.settleMotion();
  await drive.type("Meditate");
  await drive.key("Enter");
  await drive.settleMotion();
  const after = await habits(drive);
  expect.equal(after.length, 5);
  expect.equal(after[4].name, "Meditate");
  expect.equal(after[4].n, 0);
  await expect.text(R(4), "No streak yet");

  // It was saved
  const saved = await drive.page.evaluate(() => JSON.parse(localStorage.getItem("declare-habits-v1")).length);
  expect.equal(saved, 5);

  // Delete it from its open card, then undo
  await drive.click(R(4) + ".main.opener");
  await drive.settleMotion();
  await drive.click(R(4) + ".detail.edit.del");
  await drive.settleMotion();
  expect.equal((await habits(drive)).length, 4);
  await drive.key("Meta+Z");
  await drive.settleMotion();
  expect.equal((await habits(drive)).length, 5);
  expect.equal((await today(drive)).length, 10);

  // Reorder by dragging the grip: Morning stretch (third) to the top, two rows up
  const names = async () => (await habits(drive)).map((h) => h.name);
  await drive.drag(R(2) + ".main.opener.grip", 0, -150);
  await drive.settleMotion();
  expect.equal((await names(drive))[0], "Morning stretch");
  await expect.text(R(0), "Morning stretch");
  await expect.attr("app", "dragId", 0);
  expect.equal(await drive.page.evaluate(() => JSON.parse(localStorage.getItem("declare-habits-v1"))[0].name), "Morning stretch");
  // and down one with the drag going the other way
  await drive.drag(R(0) + ".main.opener.grip", 0, 75);
  await drive.settleMotion();
  expect.equal((await names(drive))[1], "Morning stretch");
  await drive.drag(R(1) + ".main.opener.grip", 0, -75);
  await drive.settleMotion();
  expect.equal((await names(drive))[0], "Morning stretch");

  // Appearance: Night holds and is remembered; Day overrides the evening
  await drive.click('app.page.appearance."Night"');
  await drive.settleMotion();
  await expect.attr("app", "isNight", true);
  expect.equal(await drive.page.evaluate(() => localStorage.getItem("declare-habits-v1-mode")), "night");
  await drive.click('app.page.appearance."Day"');
  await drive.settleMotion();
  await expect.attr("app", "isNight", false);
};
