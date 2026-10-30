// Desk flow: no account, keyboard-ish, new card, pay.
async function freeSeats(perf, n, sectionKey) {
  const r = await fetch(`http://127.0.0.1:8350/api/performances/${perf}/seats`);
  const d = await r.json();
  const out = [];
  for (const s of d.sections) if (!sectionKey || s.key === sectionKey)
    for (const row of s.rows) for (const x of row.seats)
      if (x.status === "available" && out.length < n) out.push(`${s.name}, row ${row.name}, seat ${x.number}`);
  return out;
}
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 13 Nov, 7:30pm/ }).click();
  await drive.settleData();
  const names = await freeSeats("p01", 2, "ORCH");
  for (const n of names) await page.getByRole("button", { name: n, exact: true }).click();
  await expect.text("app.side", "2 seats · $160.00");
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await drive.settleMotion();
  await page.getByLabel("Email").fill("grace@example.com");
  await page.getByLabel("Name on card").fill("Grace Hopper");
  await page.getByLabel("Card number").fill("4242424242424242");
  await page.getByLabel("Expiry (MM/YY)").fill("04/28");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Street address").fill("1 Navy Way");
  await page.getByLabel("City").fill("Arlington");
  await page.getByLabel("Postal code").fill("22201");
  await page.getByRole("radio", { name: "United States" }).click();
  console.log("card value:", await page.getByLabel("Card number").inputValue());
  const pay = page.getByRole("button", { name: "Pay $174.00" });
  await pay.click();
  await pay.click();

  await drive.waitReal(2500);
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/orders", { count: 1 });
  console.log(JSON.stringify((await drive.requests()).filter(r => r.path.includes("orders")).map(r => [r.status, r.body])));
  await expect.text("app.ticketsScreen", "Sent to grace@example.com");
  await page.screenshot({ path: "/tmp/shots/d-tickets.png" });
};
