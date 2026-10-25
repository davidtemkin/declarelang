// At a desk, with no account: two seats, a new card that is declined, a postcode the
// bank doesn't hold, then a card that works — and only ever one order per press.

const read = (page, path, attr) =>
  page.evaluate((p, a) => { const v = window.__declare.find(p)[a]; return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, path, attr);

const F = "app.payScreen.formPane.col.form";

// a person's way of replacing a field's text: press into it, select what is there, type
async function fill(drive, page, path, text) {
  await drive.click(path);
  await page.evaluate(() => { document.activeElement?.select?.(); return null; });
  await drive.type(text);
}

export default async ({ drive, expect, page }) => {
  page.on("pageerror", (e) => console.log("PAGEERROR", e.stack?.slice(0, 2500)));
  await drive.settleData();
  await drive.click("app.listScreen.col.rows.16");          // p17, the emptiest night
  await drive.settleData();
  await drive.settleMotion();

  const hall = await read(page, "app.seatMap.hall", "value");
  const free = hall.seats.filter((s) => s.seat.status == "available");
  const a = free.find((s) => s.section == "DC");
  const b = free.find((s) => s.section == "BALC");
  await drive.click(`app."${a.label}"`);
  await drive.click(`app."${b.label}"`);
  await drive.settleMotion();
  await expect.text("app.hallScreen.side", "2 seats · $85.00");

  await drive.click("app.hallScreen.side.Continue");
  await drive.settleMotion();
  await expect.attr("app", "stage", "checkout");
  await expect.text("app.payAside", "Pay $94.00");

  // pressing Pay with nothing filled in marks the fields and sends nothing
  await drive.click('app.payAside."Pay $94.00"');
  await drive.settleMotion();
  await expect.text(`${F}.card.email`, "Enter your email address.");
  const before = (await drive.requests()).filter((r) => r.path.startsWith("/api/orders")).length;
  await expect.equal(before, 0);

  await fill(drive, page, `${F}.card.email.entry`, "grace@example.com");
  await fill(drive, page, `${F}.card.cardName.entry`, "Grace Hopper");
  await fill(drive, page, `${F}.card.number.entry`, "4000000000000002");
  await expect.attr(`${F}.card.number.entry`, "text", "4000 0000 0000 0002");
  await fill(drive, page, `${F}.card.pair.expiry.entry`, "1229");
  await expect.attr(`${F}.card.pair.expiry.entry`, "text", "12 / 29");
  await fill(drive, page, `${F}.card.pair.cvc.entry`, "123");
  await fill(drive, page, `${F}.address.line1.entry`, "1 Main Street");
  await fill(drive, page, `${F}.address.city.entry`, "Springfield");
  await fill(drive, page, `${F}.address.pair.postal.entry`, "62701");

  // declined: the sentence is shown, only the code is cleared
  await drive.click('app.payAside."Pay $94.00"');
  await drive.click('app.payAside."Paying…"');      // a second press while it is under way
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/orders", { count: 1 });
  await expect.text(`${F}.refusal`, "declined");
  await expect.attr(`${F}.card.pair.cvc.entry`, "text", "");
  await expect.attr(`${F}.card.number.entry`, "text", "4000 0000 0000 0002");

  // a postcode the bank doesn't hold: marked on its field, with the service's sentence
  await fill(drive, page, `${F}.card.number.entry`, "4242424242424242");
  await fill(drive, page, `${F}.card.pair.cvc.entry`, "321");
  await fill(drive, page, `${F}.address.pair.postal.entry`, "10001");
  await drive.click('app.payAside."Pay $94.00"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/orders", { count: 2 });
  const postalErr = await read(page, `${F}.address.pair.postal.entry`, "error");
  console.log("postal error:", postalErr);
  if (!postalErr) throw new Error("the postal code was not marked");

  await fill(drive, page, `${F}.address.pair.postal.entry`, "62701");
  await drive.click('app.payAside."Pay $94.00"');
  await drive.settleData();
  await drive.settleMotion();
  console.log("step: paid");
  await expect.request("POST", "/api/orders", { count: 3, body: { email: "grace@example.com" } });
  console.log("step: requested");
  await expect.attr("app", "stage", "tickets");
  await expect.text("app.ticketScreen", "Sent to grace@example.com");
};
