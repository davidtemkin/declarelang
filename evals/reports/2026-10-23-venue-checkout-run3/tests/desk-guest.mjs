// At a desk, someone with no account books two seats with the keyboard alone
// and pays with a new card.
const F = "app.payScreen.col.form";

export default async ({ drive, expect, page }) => {
  await drive.set("app", "location", "p17");
  await drive.settleData();
  await drive.settleMotion();

  // keyboard: Tab into the hall's first section, choose a seat, move, choose another
  await drive.page.evaluate(() => { window.__declare.find("app.hallScreen.pane.hall.secs.0"); return null; });
  let tabs = 0;
  while (tabs < 12) {
    await drive.tab();
    tabs++;
    const role = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    if (/^Orchestra, row/.test(role)) break;
  }
  const first = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  console.log("first focused seat:", first, "after", tabs, "tabs");
  await drive.key(" ");
  await drive.key("ArrowRight");
  await drive.key(" ");
  await drive.settleMotion();
  const chosen = await drive.page.evaluate(() => window.__declare.find("app")["chosen"].join(","));
  console.log("chosen:", chosen);
  await expect.text("app.hallScreen.side.sideSel.line.total", "2 seats · $160.00");

  await drive.click('app.hallScreen.side."Continue to payment"');
  await drive.wait(50);
  await drive.settleMotion();
  await expect.attr("app", "stage", "pay");

  const fill = async (path, text) => { await drive.click(path); await drive.type(text); };
  await fill(`${F}.who.emailF.field`, "guest@example.com");
  await fill(`${F}.card.nameF.field`, "G Uest");
  await fill(`${F}.card.numberF.field`, "4242424242424242");
  await expect.attr(`${F}.card.numberF.field`, "text", "4242 4242 4242 4242");
  await expect.attr(`${F}.card.numberF`, "aside", "Visa");
  await fill(`${F}.card.pair.a.expiryF.field`, "428");
  await expect.attr(`${F}.card.pair.a.expiryF.field`, "text", "04 / 28");
  await fill(`${F}.card.pair.b.cvcF.field`, "123");
  await fill(`${F}.address.line1F.field`, "1 Main Street");
  await fill(`${F}.address.cityF.field`, "Springfield");
  await fill(`${F}.address.pair.a.postalF.field`, "94103");
  await drive.key("Enter");
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/orders", { count: 1 });
  await expect.attr("app", "stage", "done");
  await expect.text("app.doneScreen.col.sent", "Sent to guest@example.com");
  const reqs = await drive.requests();
  console.log(JSON.stringify(reqs.filter((r) => r.path.startsWith("/api/orders")).map((r) => [r.status, r.body]), null, 0));
};
