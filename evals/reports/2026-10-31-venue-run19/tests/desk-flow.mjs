// A guest at a desk: picks a performance, chooses three seats across two
// sections, is declined, pays with another card, and gets three tickets.
// npx declare-verify my-apps/venue/venue.declare --assert my-apps/venue/checks/desk-flow.mjs

const API = "http://127.0.0.1:8350";

async function freeSeats(page, perf) {
  return page.evaluate(async ([api, perf]) => {
    const map = await (await fetch(`${api}/api/performances/${perf}/seats`)).json();
    const out = {};
    for (const s of map.sections) {
      out[s.key] = [];
      for (const r of s.rows) for (const x of r.seats)
        if (x.status === "available") out[s.key].push(`${s.name}, row ${r.name}, seat ${x.number}`);
    }
    return out;
  }, [API, perf]);
}

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 13 Nov/ }).click();
  await drive.settleData();
  await drive.settleMotion();

  const free = await freeSeats(page, "p01");
  const pick = [free.ORCH[3], free.ORCH[4], free.GT[2]];
  for (const name of pick) await page.getByRole("button", { name, exact: true }).click();
  await drive.settleMotion();
  await expect(page.getByRole("button", { name: pick[0], exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("3 seats · $225.00")).toBeVisible();

  // unchoose one, choose it again
  await page.getByRole("button", { name: pick[2], exact: true }).click();
  await expect(page.getByText("2 seats · $160.00")).toBeVisible();
  await page.getByRole("button", { name: pick[2], exact: true }).click();

  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await drive.settleMotion();

  await page.getByLabel("Email").fill("guest@example.com");
  await page.getByLabel("Name on card").fill("Grace Hopper");
  await page.getByLabel("Card number").fill("4000000000000002");
  await expect(page.getByLabel("Card number")).toHaveValue("4000 0000 0000 0002");
  await page.getByLabel("Expiry").fill("0429");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Street address").fill("1 Main St");
  await page.getByLabel("City").fill("Springfield");
  await page.getByLabel("Postal code").fill("12345");

  // $225.00 + 7 + 7 + 6 = $245.00
  await page.getByRole("button", { name: "Pay $245.00" }).click();
  await drive.settleData();
  await drive.wait(2000);
  await drive.settleData();
  await expect(page.getByText(/declined/i)).toBeVisible();
  await expect(page.getByLabel("Security code")).toHaveValue("");
  await expect(page.getByLabel("City")).toHaveValue("Springfield");

  await page.getByLabel("Card number").fill("4242424242424242");
  await page.getByLabel("Security code").fill("123");
  await page.getByRole("button", { name: "Pay $245.00" }).click();
  await drive.settleData();
  await drive.wait(2000);
  await drive.settleData();
  await expect(page.getByText("Sent to guest@example.com")).toBeVisible();
  await expect.request("POST", "/api/orders", { count: 2 });
};
