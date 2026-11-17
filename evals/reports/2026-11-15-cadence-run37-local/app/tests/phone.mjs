// The phone, by finger: the five-second log, the year by hand, a session
// opened, deleted and put back.
const reset = (page) => page.evaluate(() => fetch("http://127.0.0.1:8320/api/_reset", { method: "POST" }).then((r) => r.json()));
export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect, page }) => {
  await reset(page);
  await drive.device({ width: 390, height: 844, touch: true });
  await drive.settleData(); await drive.settleMotion();

  await expect.attr("app", "weekLine", "2 sessions · 1h 24m");
  await expect.visible("app.thumb.log");
  await expect.hidden("app.body.year");

  // The five-second log: one tap to open, one to save — everything else is already there
  await drive.click("app.thumb.log");
  await drive.settleMotion();
  const f = "app.form.entry";
  const sport = await drive.read(f + ".sport"), minutes = await drive.read(f + ".minutes");
  await expect.equal(await drive.read(f + ".date"), "2026-08-05");
  if (!(minutes > 0)) throw new Error("no default duration");
  await expect.visible(f + ".foot.1");
  await drive.click(f + ".foot.1");
  await drive.settleData(); await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { body: { sport, minutes, date: "2026-08-05" } });
  await expect.equal(await drive.read("app.formOpen"), false);
  await expect.attr("app", "streakLine", "3 days");
  await expect.attr("app", "weekLine", `3 sessions · ${fmt(84 + minutes)}`);

  // Log yesterday's forgotten ride with the thumb: Ride, Yesterday, +15, effort 6
  await drive.click("app.thumb.log");
  await drive.settleMotion();
  await drive.click(f + ".sports.1");
  await drive.click(f + ".when.0.1");
  await drive.click(f + ".long.2.3");
  await drive.click(f + ".felt.1.5");
  await drive.click(f + ".far.1.2");               // a bit further
  await drive.click(f + ".foot.1");
  await drive.settleData(); await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { count: 2 });
  if (!(await drive.read("app.weekLine")).startsWith("4 sessions")) throw new Error("week did not take the ride");

  // The year, by hand
  await drive.click("app.thumb.0.1");             // Year
  await drive.settleMotion();
  await expect.visible("app.body.year.chart");
  await expect.hidden("app.body.today");
  const before = await drive.read("app.start");
  await drive.drag("app.body.year.chart", 250, 0);
  await drive.settleMotion();
  if ((await drive.read("app.start")) >= before) throw new Error("a finger's drag did not move the year back");
  const span = await drive.read("app.span");
  await drive.pinch("app.body.year.chart", 2);
  await drive.settleMotion();
  if ((await drive.read("app.span")) >= span) throw new Error("spreading two fingers did not open the year up");

  // Pick a session from the list, delete it, put it back
  await drive.click("app.body.year.tools.1.2");    // All
  await drive.settleMotion();
  await drive.click("app.body.year.hardest");
  await drive.settleMotion();
  await expect.visible("app.detail.card");
  const id = await drive.read("app.openId");
  await drive.click("app.detail.card.actions.1");  // Delete
  await drive.settleData(); await drive.settleMotion();
  await expect.request("DELETE", "/api/sessions/" + id);
  await drive.click("app.toast.\"Undo\"");
  await drive.settleData(); await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { count: 3 });

  await drive.click("app.thumb.0.0");              // back to Today
  await drive.settleMotion();
  await expect.visible("app.body.today.week");
  await reset(page);
};
function fmt(m) { const h = Math.floor(m / 60); return h == 0 ? m + "m" : h + "h " + (m % 60) + "m"; }
