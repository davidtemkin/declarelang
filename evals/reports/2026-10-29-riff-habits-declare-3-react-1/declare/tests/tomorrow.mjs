// Everything is still there when the app is opened again — and the next day:
//   npx declare-verify my-apps/habits/habits.declare --assert my-apps/habits/tests/tomorrow.mjs

const R = (i) => "app.page.list." + i;
const state = (drive) => drive.page.evaluate(() => {
  const app = window.__declare.find("app");
  return {
    today: app.today,
    mode: app.themeMode,
    habits: app.habits.all().map((h) => ({ id: h.id, name: h.name, hue: h.hue, days: [...h.days].sort() })),
  };
});
const reopen = async (drive) => {
  await drive.page.reload({ waitUntil: "load" });
  await drive.page.waitForFunction(() => window.__declare && window.__declare.find("app") && window.__declare.find("app").count > 0);
  await drive.settleMotion();
};
const addDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(y, m - 1, d + n);
  return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
};

export default async ({ drive, expect }) => {
  await drive.page.evaluate(() => { localStorage.clear(); return null; });
  await reopen(drive);

  // A first visit's sample is saved at once, so it is the same next time
  const sample = await state(drive);
  await reopen(drive);
  expect.equal(JSON.stringify((await state(drive)).habits), JSON.stringify(sample.habits));

  // Make it mine: Morning stretch to the top, tick today on No phone,
  // untick a day in the past, add a habit, rename one, recolor one, Night.
  await drive.drag(R(2) + ".main.opener.grip", 0, -150);
  await drive.settleMotion();
  await drive.click(R(3) + ".main.week.6");                  // No phone, today
  await drive.click(R(0) + ".main.week.2");                  // Morning stretch, four days ago: off
  await drive.click("app.page.head.plus");
  await drive.settleMotion();
  await drive.type("Meditate");
  await drive.key("Enter");
  await drive.settleMotion();
  await drive.page.evaluate(() => { const h = window.__declare.find("app").habits; h.rename(2, "Read 30 pages"); h.recolor(2, 5); return null; });
  await drive.click('app.page.appearance."Night"');
  await drive.settleMotion();
  const mine = await state(drive);
  expect.equal(mine.habits.map((h) => h.name).join(" | "),
    "Morning stretch | Drink 8 glasses of water | Read 30 pages | No phone after 10pm | Meditate");
  expect.equal(mine.habits[3].days.includes(mine.today), true);
  expect.equal(mine.habits[0].days.includes(addDays(mine.today, -4)), false);

  // Opened again: all of it is there
  await reopen(drive);
  const again = await state(drive);
  expect.equal(JSON.stringify(again.habits), JSON.stringify(mine.habits));
  expect.equal(again.mode, "night");
  await expect.attr("app", "isNight", true);
  await expect.text(R(0), "Morning stretch");
  await expect.attr(R(3) + ".main.week.6", "on", true);
  await expect.attr(R(0) + ".main.week.2", "on", false);
  await expect.attr("app.habits", "unsaved", false);

  // Opened tomorrow: the clock moves on a day; the habits, the order and
  // every tick are the same, and today's ticks now sit in yesterday's column.
  await drive.page.evaluateOnNewDocument(() => {
    const shift = 24 * 3600 * 1000;
    const RealDate = Date;
    class ShiftedDate extends RealDate {
      constructor(...a) { if (a.length == 0) super(RealDate.now() + shift); else super(...a); }
      static now() { return RealDate.now() + shift; }
    }
    globalThis.Date = ShiftedDate;
  });
  await reopen(drive);
  const tomorrow = await state(drive);
  expect.equal(tomorrow.today, addDays(mine.today, 1));
  expect.equal(JSON.stringify(tomorrow.habits), JSON.stringify(mine.habits));
  expect.equal(tomorrow.mode, "night");
  await expect.text(R(0), "Morning stretch");
  await expect.attr(R(3) + ".main.week.5", "on", true);      // yesterday's tick
  await expect.attr(R(3) + ".main.week.6", "on", false);     // today, not yet
  await expect.text(R(3) + ".main.opener.streakBadge", "1"); // the streak is still alive
  await expect.text(R(3), "Tick today to keep your streak");

  // A browser that refuses to save (a private window, a full disk) says so,
  // rather than losing the changes quietly
  await drive.page.evaluateOnNewDocument(() => {
    Storage.prototype.setItem = function () { throw new Error("QuotaExceededError"); };
  });
  await reopen(drive);
  await expect.attr("app.habits", "unsaved", false);
  await drive.click(R(1) + ".main.week.6");
  await drive.settleMotion();
  await expect.attr("app.habits", "unsaved", true);
  await expect.text("app.page.head", "isn't saving your habits");
};
