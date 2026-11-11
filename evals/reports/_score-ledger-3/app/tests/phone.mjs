// On a phone: open Overview, then record an expense with the thumb.
export const device = { width: 390, height: 844, touch: true };
export default async ({ drive, expect, page }) => {
  await drive.set("app.books", "api", "http://127.0.0.1:8371");
  await drive.waitReal(1500);
  await expect.visible("app.main.overview.kpis");
  await drive.click("app.fab.fab");
  await drive.settleMotion();
  await expect.attr("app", "recording", "expense");
  await drive.type("18.75");
  await drive.click("app.recordSheet.body.expense.catBlock.pick.category.entry");
  await drive.type("Postage");
  await drive.waitReal(300);
  await drive.key("Enter");
  await drive.click("app.recordSheet.body.expense.foot.row.save");
  await drive.waitReal(1500);
  await expect.request("POST", "/api/transactions", { body: { kind: "expense", amount: 1875 } });
  await expect.attr("app", "recording", "");
  await expect.text("app.toast", "Recorded");
};
