// Read-only: handle the year on a phone, open a session from it, start a
// correction and cancel it. Sends no writes.
export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect }) => {
  await drive.settleData();
  await drive.settleMotion();

  // a finger pushes the window back through the months; two pull it open
  await drive.drag("app.page.body.year.chart", 200, 0);
  await drive.settleMotion();
  await expect.equal((await drive.page.evaluate(() => window.__declare.find("app").back)) > 20, true);
  await drive.pinch("app.page.body.year.chart", 0.25);
  await drive.settleMotion();
  await expect.equal((await drive.page.evaluate(() => window.__declare.find("app").span)) > 150, true);

  // far out, a tap pulls a stretch open; close up, a tap opens a session
  await drive.click("app.page.body.year.ranges.0");
  await drive.settleMotion();
  await expect.attr("app", "span", 14);
  await drive.click("app.page.body.today.now.2");
  await drive.settleMotion();
  await expect.text("app.detail", "52m");
  await drive.click('app.detail."Edit"');
  await drive.settleMotion();
  await expect.text("app.entry", "Correct it");
  await expect.text("app.entry", "52");
  await drive.click('app.entry."Cancel"');
  await drive.settleMotion();
  await expect.attr("app", "entryOpen", false);
  await expect.equal((await drive.requests()).filter((r) => r.method != "GET").length, 0);
};
