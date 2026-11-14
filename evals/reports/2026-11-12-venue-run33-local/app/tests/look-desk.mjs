// A look at the desk flow against the live service: a performance, two seats, checkout.
async function freeSeats(page, section, n) {
  const out = [];
  const all = await page.getByRole("button", { name: new RegExp("^" + section + ", row ") }).all();
  for (const b of all) {
    if (out.length >= n) break;
    if (await b.isEnabled() && (await b.getAttribute("aria-pressed")) !== "true") out.push(b);
  }
  return out;
}
export default async ({ drive, expect, page }) => {
  await page.getByRole("button", { name: /^Fri 13 Nov/ }).click();
  await drive.settleData();
  await drive.settleMotion();
  const [a, b] = await freeSeats(page, "Orchestra", 2);
  await a.click();
  await b.click();
  await drive.settleMotion();
  await expect(page.getByText("2 seats · $160.00")).toBeVisible();
  await page.screenshot({ path: "/tmp/venue-shots/desk-chosen.png" });
  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/venue-shots/desk-checkout.png" });
};
