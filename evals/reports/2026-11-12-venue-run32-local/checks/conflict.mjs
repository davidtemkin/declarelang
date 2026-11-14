// A seat taken before the payment went through: back in the hall, the rest kept.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Sun 15 Nov/ }).click();
  await drive.settleData();
  const pick = await page.evaluate(() => {
    const m = window.__declare.find("app").seatMap.value; const out = [];
    for (const s of m.sections) for (const r of s.rows) for (const x of r.seats)
      if (x.status === "available" && out.length < 2) out.push({ id: x.id, n: `${s.name}, row ${r.name}, seat ${x.number}` });
    return out;
  });
  for (const f of pick) await page.getByRole("button", { name: f.n, exact: true }).click();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await drive.settleMotion();
  await page.getByLabel("Email").fill("c@example.com");
  await page.evaluate((id) => window.__declare.find("app").refused({ error: "unavailable", conflicts: [id], message: "Seat " + id + " was taken before your payment went through. You have not been charged." }), pick[0].id);
  await drive.settleMotion();
  await expect(page.getByText(/was taken before your payment went through/)).toBeVisible();
  await expect(page.getByText(/^1 seat · \$/)).toBeVisible();
  await expect(page.getByRole("button", { name: pick[0].n, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: pick[1].n, exact: true })).toHaveAttribute("aria-pressed", "true");
  console.log("focus:", await page.evaluate(() => document.activeElement?.textContent));
  await page.screenshot({ path: "/tmp/vshots/c-conflict.png" });
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await expect(page.getByLabel("Email")).toHaveValue("c@example.com");
};
