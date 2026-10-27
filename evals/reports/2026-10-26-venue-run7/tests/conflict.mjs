export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.click("app.listScreen.list.rows.1");
  await drive.settleData();
  const ids = await page.evaluate(() => { const a = window.__declare.find("app");
    const ids = a.house.seatsAll().filter((s) => s.seat.status == "available").slice(0, 2).map((s) => s.id);
    ids.forEach((id) => a.toggleSeat(id)); return ids; });
  await drive.settleMotion();
  await drive.click("app.hallScreen.side.Continue");
  await drive.settleMotion();
  await expect.attr("app", "screen", "checkout");
  await page.evaluate((id) => { window.__declare.find("app.checkoutScreen.main.form").refusedWith({ error: "unavailable", conflicts: [id], message: "Sorry — that seat was just taken." }); return null; }, ids[1]);
  await drive.settleMotion();
  await expect.attr("app", "screen", "hall");
  await expect.attr("app", "chosen", [ids[0]]);
  await expect.attr("app", "notice", "Sorry — that seat was just taken.");
  console.log("focus:", await page.evaluate(() => document.activeElement?.textContent?.slice(0, 30)));
};
