// A long drag back through the year, then a pinch: the surface follows the
// hand frame by frame, and nothing is rebuilt for nothing.
export default async ({ drive, expect }) => {
  await drive.settleData();
  await drive.settleMotion();
  const p = await drive.profile(async () => {
    await drive.press("app.page.body.year.strip", 300, 120);
    for (let i = 0; i < 30; i++) await drive.moveBy(20, 0);
    await drive.release();
    await drive.pinch("app.page.body.year.strip", 2.5);
  });
  await expect.budget(p, { turnMs: 16 });
  await expect.approx("app", "span", 36.4, 0.1);
};
