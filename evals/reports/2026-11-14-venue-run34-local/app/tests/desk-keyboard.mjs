// At a desk, with no account and the keyboard alone: pick a performance, two
// seats, fill the card and address, pay, and get two tickets.
//
//   npx declare-verify my-apps/venue/venue.declare --no-boot \
//       --url http://127.0.0.1:8606/my-apps/venue/venue.declare --assert my-apps/venue/tests/desk-keyboard.mjs

const focusedName = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a ? (a.getAttribute("aria-label") || a.getAttribute("name") || a.textContent || a.tagName).trim().slice(0, 60) : "";
});

async function tabTo(drive, page, test, max = 40) {
  for (let i = 0; i < max; i++) {
    await drive.tab();
    const n = await focusedName(page);
    if (test(n)) return n;
  }
  throw new Error("never reached the stop by Tab");
}

export default async ({ drive, expect, page }) => {
  // 1. a performance, by keyboard
  await tabTo(drive, page, (n) => n.startsWith("Fri 20 Nov, 7:30pm"));
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole("heading", { name: "Fri 20 Nov · 7:30pm" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fri 20 Nov · 7:30pm" })).toBeFocused();

  // 2. into the house: Tab lands on a seat; the arrows walk the row; Space chooses
  const first = await tabTo(drive, page, (n) => /, row [A-Z], seat \d+$/.test(n));
  console.log("first seat stop:", first);
  const chosen = [];
  for (let i = 0; i < 80 && chosen.length < 2; i++) {
    const n = await focusedName(page);
    const free = await page.evaluate(() => {
      const a = document.activeElement;
      return a && a.getAttribute("aria-disabled") != "true" && a.getAttribute("aria-pressed") == "false";
    });
    if (free) { await drive.key("Space"); chosen.push(n); }
    await drive.key("ArrowRight");
  }
  console.log("chose:", chosen.join(" | "));
  await drive.settleMotion();
  await expect(page.getByText(/^2 seats · \$\d+\.\d\d$/)).toBeVisible();
  for (const n of chosen) {
    await expect(page.getByRole("button", { name: n, exact: true })).toHaveAttribute("aria-pressed", "true");
  }

  // ArrowDown moves to the row behind
  const before = await focusedName(page);
  await drive.key("ArrowDown");
  const after = await focusedName(page);
  console.log("down:", before, "→", after);

  // 3. on to checkout
  await tabTo(drive, page, (n) => n == "Continue");
  await drive.key("Enter");
  await drive.settleMotion();
  await expect(page.getByRole("heading", { name: "Checkout", level: 1 })).toBeFocused();

  const order = [];
  const typeInto = async (label, text) => {
    const n = await tabTo(drive, page, (x) => { order.push(x); return x == label; });
    await drive.type(text);
    return n;
  };
  await typeInto("Email", "kb.person@example.com");
  await typeInto("Card number", "4242424242424242");
  await expect(page.getByLabel("Card number")).toHaveValue("4242 4242 4242 4242");
  await typeInto("Expiry", "0429");
  await expect(page.getByLabel("Expiry")).toHaveValue("04 / 29");
  await typeInto("Security code", "123");
  await typeInto("Name on card", "Kay Board");
  // Country: one stop, the arrows choose
  await tabTo(drive, page, (x) => { order.push(x); return /Country/.test(x) || /United States/.test(x); });
  await drive.key("ArrowRight");
  await drive.key("ArrowRight");
  await drive.key("Space");
  await typeInto("Street address", "1 Test Lane");
  await typeInto("City", "London");
  await typeInto("Postal code", "EC1A 1BB");
  console.log("tab stops:", order.join(" › "));

  // 4. pay, by keyboard
  const pay = await tabTo(drive, page, (x) => /^Pay \$\d+\.\d\d$/.test(x));
  console.log("pay button:", pay);
  await drive.key("Enter");
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText("Sent to kb.person@example.com", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your tickets" })).toBeFocused();
  await expect.request("POST", "/api/orders", { count: 1 });
};
