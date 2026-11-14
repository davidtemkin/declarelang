// On a phone, with a finger: open, react by holding, pick a photo, go back.
export const device = { width: 390, height: 844, touch: true };
export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate((p, a) => window.__declare.find(p)[a], p, a);
  await drive.waitReal(1200);
  await drive.click('app.stage.side.list.rows."Kestrel Street"');
  await drive.settleMotion();
  let p;
  for (let i = 0; i < 6; i++) if ((await read(`app.stage.main.panes.${i}`, "threadId")) === "t1") p = `app.stage.main.panes.${i}`;
  await page.screenshot({ path: "/tmp/ph1.png" });
  await drive.hold(p + '.scroller.feed."the bins, for the record"', 700);
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/ph2.png" });
  await drive.click('app.marks.Laughing');
  await drive.settleMotion();
  await expect.text(p + ".scroller.feed", "😂");
  await drive.click(p + ".composer.bar.photo");
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/ph3.png" });
  await drive.key("Escape");
  await drive.settleMotion();
  await drive.click(p + ".head.back");
  await drive.wait(120);
  await page.screenshot({ path: "/tmp/ph4.png" });
  await drive.settleMotion();
  await expect.equal(await read("app", "openId"), "");
  await page.screenshot({ path: "/tmp/ph5.png" });
};
