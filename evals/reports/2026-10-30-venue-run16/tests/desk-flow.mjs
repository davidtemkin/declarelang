// At a desk, signed out: two free seats, a declined card, a mistyped
// postcode, then a card that pays. Seats are taken from what is free now,
// since the service remembers earlier runs.
export default async ({ drive, expect, page }) => {
  await drive.set("app", "location", "p08");
  await drive.settleData();
  const free = await page.evaluate(() => {
    const secs = window.__declare.find("app.hall").value.sections;
    const out = [];
    for (const s of secs) for (const r of s.rows) for (const x of r.seats)
      if (x.status === "available") out.push(`${s.name}, row ${r.name}, seat ${x.number}`);
    return out.slice(40, 42);
  });
  for (const name of free) await page.getByRole("button", { name, exact: true }).click();
  await expect.attr("app", "chosen", (await page.evaluate(() => window.__declare.find("app").chosen)));
  const summary = await page.evaluate(() => window.__declare.find("app").summary);
  if (!/^2 seats · \$\d+\.\d\d$/.test(summary)) throw new Error("summary reads " + summary);

  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();
  await page.getByLabel("Email").fill("grace@example.com");
  await page.getByLabel("Name on card").fill("Grace Hopper");
  await page.getByLabel("Card number").fill("4000000000000002");
  const grouped = await page.getByLabel("Card number").inputValue();
  if (grouped !== "4000 0000 0000 0002") throw new Error("card grouped as " + grouped);
  await page.getByLabel("Expiry").fill("0429");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Street address").fill("1 Main Street");
  await page.getByLabel("City").fill("Boston");
  await page.getByLabel("Postal code").fill("0211");
  await drive.key("Tab");
  await drive.settleMotion();
  const total = await page.evaluate(() => window.__declare.find("app").totalCents);
  const payName = "Pay $" + (total / 100).toFixed(2);
  await page.getByRole("button", { name: payName }).click();
  await drive.waitReal(300);
  await expect.request("POST", "/api/orders", { count: 0 });     // postcode caught here
  await page.getByLabel("Postal code").fill("02110");
  await page.getByRole("button", { name: payName }).click();
  await page.getByRole("button", { name: payName }).click();     // a second press sends nothing more
  await drive.waitReal(2500);
  await drive.settleData();
  await expect.request("POST", "/api/orders", { count: 1 });
  await expect.text("app.payScreen", "Your bank declined the payment.");
  const code = await page.getByLabel("Security code").inputValue();
  if (code !== "") throw new Error("code kept after decline: " + code);

  await page.getByLabel("Card number").fill("4242424242424242");
  await page.getByLabel("Security code").fill("123");
  await page.getByRole("button", { name: payName }).click();
  await drive.waitReal(2500);
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "step", "tickets");
  await expect.text("app.ticketScreen", "Sent to grace@example.com");
};
