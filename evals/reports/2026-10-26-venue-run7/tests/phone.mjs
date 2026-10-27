export const device = { width: 390, height: 844, touch: true };
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.screenshot({ path: "/tmp/venue-shots/p-list.png" });
  await drive.click("app.listScreen.list.rows.1");
  await drive.settleData();
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/venue-shots/p-hall.png" });
  await expect.attr("app.hallScreen.main.map", "canZoom", true);
  // tap the middle of the orchestra
  const at = await page.evaluate(() => {
    const m = window.__declare.find("app.hallScreen.main.map");
    const h = window.__declare.find("app.house");
    const s = h.seatsAll().find((s) => s.seat.status == "available" && s.sectionKey == "ORCH" && s.row == "F");
    return { x: m.ox + s.ux * m.p, y: m.oy + s.uy * m.p, label: s.label };
  });
  await drive.clickAt("app.hallScreen.main.map.pane.room.zoomer", at.x, at.y);
  await drive.settleMotion();
  await drive.wait(300);
  await expect.attr("app.hallScreen.main.map", "zoomed", true);
  await page.screenshot({ path: "/tmp/venue-shots/p-zoom.png" });
  await drive.click(`app."${at.label}"`);
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/venue-shots/p-chosen.png" });
  await expect.attr("app", "chosen", [at.label.replace("Orchestra, row ", "ORCH-").replace(", seat ", "-")]);
  await drive.click('app.hallScreen.main.dock.Continue');
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/venue-shots/p-checkout.png" });
};
