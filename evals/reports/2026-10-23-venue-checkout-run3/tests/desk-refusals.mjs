// The service's refusals at a desk: a security code and a postcode the bank
// doesn't hold, each marked on its field with the service's sentence; and a
// seat sold before the payment went through, which takes the person back to
// the hall with the rest of their choice.
const API = "http://127.0.0.1:8351";
const F = "app.payScreen.col.form";
const val = (page, path, attr) => page.evaluate(([p, a]) => { const v = window.__declare.find(p)[a]; return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, [path, attr]);

export default async ({ drive, expect, page }) => {
  const perf = "p19";
  const map = await (await fetch(`${API}/api/performances/${perf}/seats`)).json();
  const free = map.sections[3].rows.flatMap((r) => r.seats.filter((s) => s.status == "available").map((s) => ({ ...s, row: r.name })));
  const sold = map.sections[3].rows.flatMap((r) => r.seats.filter((s) => s.status == "sold"))[0];

  await drive.set("app", "location", perf);
  await drive.settleData();
  await drive.settleMotion();
  await drive.click(`app.hallScreen."Balcony, row ${free[0].row}, seat ${free[0].number}"`);
  await drive.click(`app.hallScreen."Balcony, row ${free[1].row}, seat ${free[1].number}"`);
  await drive.click('app.hallScreen.side."Continue to payment"');
  await drive.wait(50);
  await drive.settleMotion();

  const fill = async (path, text) => { await drive.click(path); await drive.key("End"); await drive.type(text); };
  await fill(`${F}.who.emailF.field`, "desk@example.com");
  await fill(`${F}.card.nameF.field`, "D Esk");
  await fill(`${F}.card.numberF.field`, "4000000000000127");
  await fill(`${F}.card.pair.a.expiryF.field`, "0629");
  await fill(`${F}.card.pair.b.cvcF.field`, "321");
  await fill(`${F}.address.line1F.field`, "5 Fifth Avenue");
  await fill(`${F}.address.cityF.field`, "New York");
  await fill(`${F}.address.pair.a.postalF.field`, "10001");
  await drive.click("app.paySide.payP.pay");
  await drive.settleData();
  await drive.settleMotion();
  console.log("cvc refusal:", await val(page, `${F}.card.pair.b.cvcF`, "message"), "| focus", await page.evaluate(() => document.activeElement?.getAttribute("aria-label")));
  await expect.attr(`${F}.card.pair.b.cvcF.field`, "focused", true);

  // a good card; the postcode the bank doesn't hold
  await drive.click(`${F}.card.numberF.field`);
  await drive.key("End");
  for (let i = 0; i < 20; i++) await drive.key("Backspace");
  await drive.type("5555555555554444");
  await expect.attr(`${F}.card.numberF`, "aside", "Mastercard");
  await fill(`${F}.card.pair.b.cvcF.field`, "");
  await drive.click("app.paySide.payP.pay");
  await drive.settleData();
  await drive.settleMotion();
  console.log("postal refusal:", await val(page, `${F}.address.pair.a.postalF`, "message"), "| focus", await page.evaluate(() => document.activeElement?.getAttribute("aria-label")));
  await expect.attr(`${F}.address.pair.a.postalF.field`, "focused", true);
  await drive.key("End");
  for (let i = 0; i < 5; i++) await drive.key("Backspace");
  await drive.type("94103");
  await expect.attr(`${F}.address.pair.a.postalF`, "message", "");

  // a seat that went before the payment did: back to the hall, the rest kept
  await drive.set("app", "chosen", [free[0].id, free[1].id, sold.id]);
  await drive.click("app.paySide.payP.pay");
  await drive.settleData();
  await drive.wait(50);
  await drive.settleMotion();
  console.log("conflict:", await val(page, "app", "stage"), "|", await val(page, "app", "hallNotice"), "|", await val(page, "app", "chosen"));
  await expect.attr("app", "stage", "hall");
  await expect.equal((await val(page, "app", "chosen")).length, 2);
  const statuses = (await drive.requests()).filter((r) => r.path.startsWith("/api/orders")).map((r) => r.status);
  console.log("orders:", statuses);
  await expect.equal(statuses.join(","), "422,422,409");
};
