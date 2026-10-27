// Phone: sign in halfway through checkout, the saved Visa declined, then a new
// card whose postcode the bank refuses, corrected, and paid.
export const device = { width: 390, height: 844, touch: true };
const API = "http://127.0.0.1:8350";
const F = "app.checkoutScreen.col.main.pay.form";
const N = F + ".newPart";
const S = "app.signInSheet.box.signIn";

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.click("app.listScreen.grid.4");
  await drive.settleData();
  const map = await (await fetch(`${API}/api/performances/p05/seats`)).json();
  const free = map.sections.flatMap((s) => s.rows.flatMap((r) => r.seats.filter((x) => x.status == "available").map((x) => x.id)));
  await drive.set("app", "chosen", [free[0], free[free.length - 1]]);
  await drive.settleMotion();
  await drive.click("app.hallScreen.side.tally.1");
  await drive.settleMotion();

  // something typed before signing in
  await drive.click(N + ".nameRow.field"); await drive.type("A. Lovelace");

  await drive.click(F.replace(".form", "") + ".account.1");     // Sign in
  await drive.settleMotion();
  await drive.click(S + ".emailRow.emailInput"); await drive.type("ada@example.com");
  await drive.click(S + ".passRow.passInput"); await drive.type("wrong");
  await drive.key("Enter");
  await drive.settleData(); await drive.settleMotion();
  await expect.text(S, "That email and password don't match.");
  await drive.click(S + ".reveal");
  await expect.attr(S + ".passRow.passInput", "concealed", false);
  await drive.selectAll(S + ".passRow.passInput");
  await drive.type("correct horse battery");
  await drive.key("Enter");
  await drive.settleData(); await drive.settleMotion();
  await expect.attr("app", "signedIn", true);
  await expect.attr("app.pay", "method", "card_1");
  await expect.attr("app.pay", "cardName", "A. Lovelace");        // nothing typed is lost

  // the saved card: only its code
  await expect.visible(F + ".savedPart.savedCode");
  await drive.click(F + ".savedPart.savedCode.code"); await drive.type("000");
  await drive.click("app.payDock.payButton.go");
  await drive.settleData(); await drive.settleMotion();
  await expect.text("app.payDock.payButton.problem", "declined");
  await expect.attr(F + ".savedPart.savedCode.code", "text", "");

  // a new card, the account's address filled in
  await drive.click(F + ".savedPart.methods.\"A new card\"");                 // A new card
  await drive.settleMotion();
  await expect.attr(N + ".emailRow.field", "text", "ada@example.com");
  await expect.attr(N + ".pair2.postalRow.field", "text", "WC1N 1AB");
  await drive.click(N + ".numberRow.wrap.number"); await drive.type("5555555555554444");
  await drive.click(N + ".pair.expiryRow.field"); await drive.type("0428");
  await drive.click(N + ".pair.codeRow.field"); await drive.type("123");
  await drive.selectAll(N + ".pair2.postalRow.field"); await drive.type("SW1A 1AA");
  await drive.click("app.payDock.payButton.go");
  await drive.settleData(); await drive.settleMotion();
  const err = await page.evaluate(() => window.__declare.find("app.checkoutScreen.col.main.pay.form.newPart.pair2.postalRow.field").error);
  console.log("postal error:", err);
  const focused = await page.evaluate(() => window.__declare.find("app.checkoutScreen.col.main.pay.form.newPart.pair2.postalRow.field").focused);
  console.log("postal focused:", focused);
  await drive.selectAll(N + ".pair2.postalRow.field"); await drive.type("WC1N 1AB");
  await drive.click("app.payDock.payButton.go");
  await drive.settleData(); await drive.settleMotion();
  await expect.visible("app.ticketsScreen");
  await expect.text("app.ticketsScreen", "Sent to ada@example.com");
  // sign out again so the next run starts signed out
  await drive.click("app.topBar.3");
  await drive.settleData();
  await expect.attr("app", "signedIn", false);
};
