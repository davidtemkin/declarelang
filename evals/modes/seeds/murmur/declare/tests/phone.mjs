export const device = { width: 390, height: 844, touch: true };
const read = (page, p, a) => page.evaluate(([p, a]) => { const v = window.__declare.find(p)?.[a]; return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, [p, a]);
export default async ({ drive, expect, page }) => {
  await drive.wait(1500);
  await drive.click("app.inbox.scroller.rows.4");        // Book club
  await drive.settleMotion();
  await drive.hold(`app.conversation.body.5."mine's nicer"`);
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/r1.png" });
  await drive.click("app.reactor.marks.0");
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/r2.png" });
  await drive.click("app.conversation.composer.photos");
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/r3.png" });
  await drive.click("app.tray.grid.2");
  await drive.settleMotion();
  await drive.wait(500);
  await page.screenshot({ path: "/tmp/r4.png" });
};
