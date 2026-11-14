// Phone: three seats across two sections, one bought by someone else meanwhile,
// sign in at checkout, a declined saved card, then a new card.
export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.screenshot({ path: "/tmp/vshots/p-list.png" });
  await page.getByRole("button", { name: /^Fri 13 Nov/ }).click();
  await drive.settleData();
  await drive.settleMotion();

  const pick = await page.evaluate(() => {
    const m = window.__declare.find("app").seatMap.value;
    const out = [];
    const want = { Orchestra: 2, "Grand Tier": 2 };
    for (const s of m.sections) for (const r of s.rows) for (const x of r.seats)
      if (x.status === "available" && (want[s.name] ?? 0) > 0) { want[s.name]--; out.push({ id: x.id, n: `${s.name}, row ${r.name}, seat ${x.number}` }); }
    return out;
  });
  for (const f of pick.slice(0, 3)) await page.getByRole("button", { name: f.n, exact: true }).click();
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/vshots/p-chosen.png" });
  await expect(page.getByText(/^3 seats · \$/)).toBeVisible();

  // someone else buys the first of them
  const status = await page.evaluate(async (id) => {
    const r = await fetch("http://127.0.0.1:8350/api/orders", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ performanceId: "p01", seatIds: [id], email: "other@example.com",
        payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2028, cvc: "123", name: "Other" },
          billing: { line1: "1 Road", line2: null, city: "Boston", postalCode: "02108", country: "US" } } }) });
    return r.status;
  }, pick[0].id);
  console.log("other buyer:", status);
  await drive.waitReal(2500);
  await drive.settleMotion();
  await expect(page.getByText(new RegExp(pick[0].n + " was just taken"))).toBeVisible();
  await expect(page.getByText(/^2 seats · \$/)).toBeVisible();
  await page.screenshot({ path: "/tmp/vshots/p-taken.png" });
  await page.getByRole("button", { name: pick[3].n, exact: true }).click();
  await expect(page.getByText(/^3 seats · \$/)).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/vshots/p-checkout.png" });
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleMotion();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Email").fill("a@a.co");
  await dlg.getByLabel("Password").fill("pass");
  await page.screenshot({ path: "/tmp/vshots/p-signin.png" });
  await dlg.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await page.getByLabel("Security code").fill("000");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await drive.settleData();
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/vshots/p-declined.png" });
  await page.getByRole("option", { name: "A new card" }).click();
  await expect(page.getByLabel("Email")).toHaveValue("someone@example.com");
  await page.getByLabel("Card number").pressSequentially("378282246310005");
  await expect(page.getByLabel("Card number")).toHaveValue("3782 822463 10005");
  await page.getByLabel("Expiry date (MM / YY)").pressSequentially("1229");
  await page.getByLabel("Security code").fill("1234");
  await page.screenshot({ path: "/tmp/vshots/p-newcard.png" });
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await drive.settleData();
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/vshots/p-tickets.png" });
  await expect(page.getByText("Sent to someone@example.com", { exact: true })).toBeVisible();
};
