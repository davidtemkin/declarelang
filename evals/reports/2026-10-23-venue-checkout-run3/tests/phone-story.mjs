// §10 of the brief, on a phone: Friday's performance, three seats across two
// sections with a thumb; one is taken by someone else while they decide; they
// sign in at checkout without losing a thing, are declined on the saved Visa,
// switch to a new card, mistype the postcode, fix it, and pay.
export const device = { width: 390, height: 844, touch: true };

const API = "http://127.0.0.1:8351";
const F = "app.payScreen.col.form";
const val = (page, path, attr) => page.evaluate(([p, a]) => { const v = window.__declare.find(p)[a]; return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, [path, attr]);

export default async ({ drive, expect, page }) => {
  // a field below the fold: bring it into view, as a thumb scrolling would, then tap it
  const tapField = async (path) => {
    await page.evaluate((p) => {
      const d = window.__declare, v = d.find(p), y = v.transformTo(d.find("app")).y;
      const a = d.find("app"), most = a.contentHeight - a.height;
      if (y < 70 || y > 600) a.scrollTo(Math.min(most, Math.max(0, v.rootOrigin().y - 80)));
      return null;
    }, path);
    await drive.wait(400);
    await drive.settleMotion();
    await drive.click(path);
  };
  const prod = await (await fetch(API + "/api/production")).json();
  const friday = prod.performances.find((p) => new Date(p.startsAt + "Z").getUTCDay() == 5 && p.seatsLeft > 60);
  const map = await (await fetch(`${API}/api/performances/${friday.id}/seats`)).json();
  const free = (si) => map.sections[si].rows.flatMap((r) => r.seats.filter((s) => s.status == "available").map((s) => ({ ...s, row: r.name, section: map.sections[si].name })));
  const orch = free(0), circle = free(2);
  const name = (s) => `${s.section}, row ${s.row}, seat ${s.number}`;

  await drive.set("app", "location", friday.id);
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "stage", "hall");
  console.log("hall pans:", await val(page, "app.hallScreen.pane", "pans"), "seat size", await val(page, "app", "seatU"));

  for (const s of [orch[0], orch[1], circle[0]]) await drive.click(`app.hallScreen."${name(s)}"`);
  await drive.settleMotion();
  console.log("chosen", await val(page, "app", "chosen"), await val(page, "app", "summary"));

  // someone else buys one of them
  const res = await fetch(API + "/api/orders", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ performanceId: friday.id, seatIds: [orch[1].id], email: "other@example.com",
      payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "O Ther" },
                 billing: { line1: "1 A St", line2: null, city: "Town", postalCode: "94103", country: "US" } } }) });
  console.log("other buyer:", res.status);
  await drive.wait(800);
  await drive.settleMotion();
  const chosen = await val(page, "app", "chosen");
  console.log("after the stream:", chosen, "|", await val(page, "app", "hallNotice"));
  await expect.equal(chosen.includes(orch[1].id), false);
  await expect.attr(`app.hallScreen."${name(orch[1])}"`, "disabled", true);

  await drive.click(`app.hallScreen."${name(orch[2])}"`);
  await drive.settleMotion();
  console.log("summary:", await val(page, "app", "summary"));
  await drive.click("app.hallScreen.bar.line.go");
  await drive.wait(50);
  await drive.settleMotion();
  await expect.attr("app", "stage", "pay");

  // type a little, then sign in: nothing typed is lost
  await tapField(`${F}.card.nameF.field`);
  await drive.type("A. Lovelace");
  await drive.click("app.top.signIn");
  await drive.settleMotion();
  await drive.click("app.signInSheet.signInForm.emailF.field");
  await drive.type("ada@example.com");
  await drive.click("app.signInSheet.signInForm.passwordF.row.box.field");
  await drive.type("wrong password");
  await drive.key("Enter");
  await drive.settleData();
  await expect.text("app.signInSheet.signInForm.refusal", "That email and password don't match.");
  await drive.click("app.signInSheet.signInForm.passwordF.row.box.field");
  for (let i = 0; i < 14; i++) await drive.key("Backspace");
  await drive.type("correct horse battery");
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app.account", "signedIn", true);
  await expect.attr("app", "signingIn", false);
  console.log("after sign-in: method", await val(page, "app.pay", "method"), "name", await val(page, "app.pay", "name"), "chosen", (await val(page, "app", "chosen")).length);
  await expect.attr("app.pay", "name", "A. Lovelace");
  await expect.attr("app.pay", "method", "card_1");

  // the expired Mastercard is shown and cannot be chosen
  await expect.attr(`${F}.choose.group.1`, "disabled", true);

  await page.screenshot({ path: "/tmp/s-signedin.png" });
  console.log("scrollY", await val(page, "app", "scrollY"), "content", await val(page, "app", "contentHeight"));
  await tapField(`${F}.saved.savedCvcF.field`);
  await drive.type("000");
  await drive.click("app.payBar.payP.pay");
  await drive.settleData();
  await drive.settleMotion();
  console.log("declined:", await val(page, "app", "payNotice"), "| cvc now:", JSON.stringify(await val(page, "app.pay", "savedCvc")));
  await expect.attr("app.pay", "savedCvc", "");

  // a new card instead
  await drive.click(`${F}.choose.group.2`);
  await drive.settleMotion();
  await expect.attr("app.pay", "method", "new");
  console.log("prefilled:", await val(page, "app.pay", "email"), await val(page, "app.pay", "line1"), await val(page, "app.pay", "postal"), await val(page, "app.pay", "country"));
  await tapField(`${F}.card.numberF.field`);
  await drive.type("4242424242424242");
  await expect.attr(`${F}.card.numberF.field`, "text", "4242 4242 4242 4242");
  await tapField(`${F}.card.pair.a.expiryF.field`);
  console.log("after tapping expiry, focus:", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName), "scrollY", await val(page, "app", "scrollY"));
  await page.screenshot({ path: "/tmp/s-expiry.png" });
  await drive.type("0430");
  await tapField(`${F}.card.pair.b.cvcF.field`);
  await drive.type("123");
  await tapField(`${F}.address.pair.a.postalF.field`);
  console.log("after tapping postal, focus:", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName), "scrollY", await val(page, "app", "scrollY"));
  await page.screenshot({ path: "/tmp/s-postal.png" });
  await drive.key("End");
  for (let i = 0; i < 10; i++) await drive.key("Backspace");
  await drive.type("WC1N");
  await expect.attr(`${F}.address.pair.a.postalF`, "message", "");        // not while typing
  await drive.tab();
  console.log("postcode after leaving:", JSON.stringify(await val(page, "app.pay", "postal")), await val(page, "app.pay", "left"), await val(page, `${F}.address.pair.a.postalF`, "message"));
  await tapField(`${F}.address.pair.a.postalF.field`);
  await drive.key("End");
  await drive.type(" 1AB");
  await expect.attr(`${F}.address.pair.a.postalF`, "message", "");
  await drive.click("app.payBar.payP.pay");
  await drive.click("app.payBar.payP.pay");
  await drive.settleData();
  await drive.settleMotion();
  console.log("stage", await val(page, "app", "stage"), "|", await val(page, "app.doneScreen.col.sent", "text"), "| notice", await val(page, "app", "payNotice"), "| first problem", await val(page, "app.pay", "firstProblem"), await val(page, "app.pay", "problems"));
  await expect.attr("app", "stage", "done");
  const orders = (await drive.requests()).filter((r) => r.path.startsWith("/api/orders"));
  console.log("orders sent:", orders.map((o) => o.status + " " + JSON.stringify(o.body.payment).slice(0, 60)));
  await expect.equal(orders.length, 2);
  await expect.attr("app", "ticketCount", 3);
  await page.screenshot({ path: "/tmp/s-done.png" });
  await drive.click("app.doneScreen.col.pager.nav.Next");
  await drive.settleMotion();
  await expect.attr("app.doneScreen.col.pager", "at", 1);
  await page.evaluate(() => { window.__declare.find("app").scrollTo(300); return null; });
  await drive.wait(100);
  await page.screenshot({ path: "/tmp/s-done2.png" });
  await drive.click("app.top.signOut");
  await drive.settleData();
};
