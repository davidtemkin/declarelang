// Desk: sign in halfway through checkout, a declined saved card, then a new card.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Sat 14 Nov/ }).click();
  await drive.settleData();

  // two free seats, taken from what the room says now
  const free = await page.evaluate(() => {
    const m = window.__declare.find("app").seatMap.value;
    const out = [];
    for (const s of m.sections) for (const r of s.rows) for (const x of r.seats)
      if (x.status === "available" && out.length < 2 && (out.length == 0 || s.name != out[0].s)) out.push({ s: s.name, n: `${s.name}, row ${r.name}, seat ${x.number}` });
    return out;
  });
  for (const f of free) await page.getByRole("button", { name: f.n, exact: true }).click();
  await expect(page.getByText(/^2 seats · \$\d+\.\d\d$/)).toBeVisible();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

  // type something, then sign in: it must survive
  await page.getByLabel("Street address").fill("1 Typed Lane");
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleMotion();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Email").fill("ada@example.com");
  await dlg.getByLabel("Password").fill("wrong");
  await dlg.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await expect(dlg.getByText("That email and password don't match.")).toBeVisible();
  await dlg.getByLabel("Password").fill("correct horse battery");
  await dlg.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("option", { name: /Mastercard ending 4444, expired/ })).toBeDisabled();

  await page.screenshot({ path: "/tmp/vshots/d-checkout-saved.png" });
  // saved Visa, code 000: declined
  await page.getByLabel("Security code").fill("000");
  const pay = page.getByRole("button", { name: /^Pay \$/ });
  const label = await pay.getAttribute("aria-label");
  console.log("pay label:", label);
  await pay.click();
  await drive.settleData();
  await drive.settleMotion();
  console.log("after decline:", JSON.stringify(await page.evaluate(() => { const f = window.__declare.find("app.checkout.pane.col.form"); const c = window.__declare.find("app.checkout.pane.col.form.saved.cvcField.entry"); return { error: f.error, judged: c.judged, err: c.error, focusedName: document.activeElement?.getAttribute("autocomplete") }; })));
  console.log(await page.getByRole("status").allInnerTexts());
  await expect(page.getByRole("status").filter({ hasText: /declined/i })).toBeVisible();
  await expect(page.getByLabel("Security code")).toHaveValue("");
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/vshots/d-declined.png" });

  // a new card
  await page.getByRole("option", { name: "A new card" }).click();
  await expect(page.getByLabel("Street address")).toHaveValue("1 Typed Lane");
  await page.getByLabel("Card number").pressSequentially("4242424242424242");
  await expect(page.getByLabel("Card number")).toHaveValue("4242 4242 4242 4242");
  await page.getByLabel("Expiry date (MM / YY)").pressSequentially("0428");
  await expect(page.getByLabel("Expiry date (MM / YY)")).toHaveValue("04 / 28");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Postal code").fill("WC1N");
  await page.getByLabel("City").click();
  await expect(page.getByText("Enter a postcode like SW1A 2AA.")).toBeVisible();
  await page.screenshot({ path: "/tmp/vshots/d-newcard.png" });
  await page.getByLabel("Postal code").fill("WC1N 1AB");
  await pay.click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText("Sent to ada@example.com", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/vshots/d-tickets.png" });
  await expect.request("POST", "/api/orders", { count: 2 }).catch(async () => { console.log(JSON.stringify((await drive.requests()).filter(r => r.path.includes("orders")).map(r => r.status))); throw new Error("order count"); });
};
