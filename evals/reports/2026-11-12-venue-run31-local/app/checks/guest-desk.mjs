// A guest at a desk books two seats and pays with a new card.
// The service remembers: seats are taken from what is free now.
const API = "http://127.0.0.1:8350";

async function freeSeats(perf, n) {
  const map = await (await fetch(`${API}/api/performances/${perf}/seats`)).json();
  const out = [];
  for (const s of map.sections) for (const r of s.rows) for (const x of r.seats)
    if (x.status == "available" && out.length < n)
      out.push({ name: `${s.name}, row ${r.name}, seat ${x.number}`, price: s.priceCents, fee: s.feeCents });
  return out;
}

const dollars = (c) => `$${(c / 100).toFixed(2)}`;

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 11 Dec, 7:30pm/ }).click();
  await drive.settleData();
  const seats = await freeSeats("p17", 2);
  for (const s of seats) await page.getByRole("checkbox", { name: s.name, exact: true }).click();
  const total = seats.reduce((m, s) => m + s.price, 0);
  await expect(page.getByText(`2 seats · ${dollars(total)}`)).toBeVisible();
  await page.getByRole("button", { name: "Continue to checkout" }).click();

  await page.getByLabel("Email").fill("guest@example.com");
  await page.getByLabel("Name on card").fill("Grace Hopper");
  await page.getByLabel("Card number").pressSequentially("4242424242424242");
  await expect(page.getByLabel("Card number")).toHaveValue("4242 4242 4242 4242");
  await page.getByLabel("Expiry").pressSequentially("0428");
  await expect(page.getByLabel("Expiry")).toHaveValue("04 / 28");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Street address").fill("1 Main Street");
  await page.getByLabel("City").fill("Springfield");
  await page.getByLabel("Postal code").fill("94110");

  const grand = seats.reduce((m, s) => m + s.price + s.fee, 0);
  const pay = page.getByRole("button", { name: `Pay ${dollars(grand)}` });
  await pay.dblclick();
  await drive.settleData();
  await expect.request("POST", "/api/orders", { count: 1, body: { performanceId: "p17", email: "guest@example.com" } });
  await expect(page.getByText("Sent to guest@example.com")).toBeVisible();
  await expect(page.getByText("Ticket 1 of 2", { exact: true })).toBeVisible();
};
