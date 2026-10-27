export const device = { width: 390, height: 844, touch: true };
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.click("app.listScreen.list.rows.1");
  await drive.settleData(); await drive.settleMotion();
  const at = await page.evaluate(() => {
    const m = window.__declare.find("app.hallScreen.main.map");
    const s = window.__declare.find("app.house").seatsAll().find((s) => s.seat.status == "available" && s.sectionKey == "GT");
    return { x: m.ox + s.ux * m.p, y: m.oy + s.uy * m.p, label: s.label };
  });
  await drive.clickAt("app.hallScreen.main.map.pane.room.zoomer", at.x, at.y);
  await drive.settleMotion(); await drive.wait(300);
  await drive.click(`app."${at.label}"`);
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/venue-shots/p-zoom2.png" });
  await drive.click('app.hallScreen.main.map."Whole house"');
  await drive.settleMotion();
  await expect.attr("app.hallScreen.main.map", "zoomed", false);
  await drive.click('app.hallScreen.main.dock.Continue');
  await drive.settleMotion();
  const fill = [["Email", "p@example.com"], ["Name on card", "Pat Phone"], ["Card number", "378282246310005"],
    ["Expiry", "1130"], ["Security code", "1234"], ["Street address", "1 Main St"], ["City", "New York"], ["Postal code", "10001"]];
  for (const [n, t] of fill) {
    await drive.click(n == "Security code" ? 'app.checkoutScreen.main.form.newCard.pair."Security code"' : `app.checkoutScreen.main.form."${n}"`);
    await drive.type(t);
  }
  await drive.click('app.checkoutScreen.main.form."United States"');
  await drive.click('app.payDock."Pay $71.00"');
  await drive.settleData(); await drive.settleMotion(); await drive.wait(400);
  await page.screenshot({ path: "/tmp/venue-shots/p-postal.png" });
  await expect.text("app.checkoutScreen.main.form", "postal");
  console.log("focus:", await page.evaluate(() => document.activeElement?.getAttribute("autocomplete")));
  await drive.click('app.checkoutScreen.main.form."Postal code"');
  for (let i = 0; i < 5; i++) await drive.key("Backspace");
  await drive.type("94110");
  await drive.click('app.payDock."Pay $71.00"');
  await drive.settleData(); await drive.settleMotion();
  await expect.attr("app", "screen", "tickets");
  await page.screenshot({ path: "/tmp/venue-shots/p-ticket.png" });
};
