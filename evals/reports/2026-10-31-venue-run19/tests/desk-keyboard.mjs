// At a desk, with no account and the keyboard alone: two seats, then the
// service's refusals — a postcode the bank doesn't hold, and a seat taken
// before the payment went through — then paid.
const API = "http://127.0.0.1:8350";

async function focusedName(page) {
  return page.evaluate(() => {
    const a = document.activeElement;
    return a ? (a.getAttribute("aria-label") || a.textContent || a.tagName).trim().slice(0, 60) : "";
  });
}

export default async ({ drive, expect, page }) => {
  await drive.settleData();

  // Tab to the first performance; Enter opens it.
  let name = "";
  for (let i = 0; i < 12 && !name.startsWith("Fri 13 Nov"); i++) { await drive.tab(); name = await focusedName(page); }
  await expect.equal(name.startsWith("Fri 13 Nov"), true);
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();

  // Tab into the Orchestra; the arrows move seat to seat; Space chooses.
  for (let i = 0; i < 6 && !/^Orchestra, row/.test(name); i++) { await drive.tab(); name = await focusedName(page); }
  await expect.equal(/^Orchestra, row/.test(name), true);
  await drive.key("Space");
  await drive.key("ArrowRight");
  await drive.key("Space");
  await drive.settleMotion();
  await expect(page.getByText(/^2 seats · \$160\.00$/)).toBeVisible();
  const chosen = await page.evaluate(() => window.__declare.find("app").chosen.slice());

  for (let i = 0; i < 40 && name != "Continue to checkout"; i++) { await drive.tab(); name = await focusedName(page); }
  await drive.key("Enter");
  await drive.settleMotion();

  // The form, field by field.
  const fill = async (label, text) => { await page.getByLabel(label, { exact: true }).focus(); await drive.type(text); };
  await fill("Email", "kb@example.com");
  await fill("Name on card", "Kay Board");
  await fill("Card number", "4242424242424242");
  await fill("Expiry", "1230");
  await fill("Security code", "123");
  await fill("Street address", "10 Downing St");
  await fill("City", "London");
  await page.getByLabel("Country").focus();
  console.log("focus on country:", await focusedName(page), await page.evaluate(() => document.activeElement.tagName + " " + document.activeElement.getAttribute("role")));
  await drive.key("Meta+A");
  await drive.type("United Kingdom");
  console.log("after type:", await page.evaluate(() => { const a = document.activeElement; return a.tagName + " " + a.value; }));
  await drive.key("Enter");
  console.log("after enter:", await page.evaluate(() => window.__declare.find("app").pay.country), await focusedName(page));
  await fill("Postal code", "SW1A 1AA");

  // The bank doesn't hold that postcode: the field says so, and has the focus.
  await page.getByRole("button", { name: "Pay $174.00" }).focus();
  await drive.key("Enter");
  await drive.key("Enter");           // a second Enter sends nothing more
  await drive.settleData();
  console.log("problems:", await page.evaluate(() => JSON.stringify(window.__declare.find("app").checkout.pane.main.form.problems.map((p) => [p.name, p.message]))),
    await page.evaluate(() => window.__declare.find("app").pay.country), await focusedName(page));
  await drive.wait(2000);
  await drive.settleData();
  await expect.request("POST", "/api/orders", { count: 1 });
  await expect(page.getByLabel("Postal code")).toBeFocused();
  const said = await page.evaluate(() => window.__declare.find("app").checkout.pane.main.form.problems.map((p) => p.message).join("|"));
  console.log("refused:", said);
  await page.screenshot({ path: "/tmp/venue-shots/desk-postcode-refused.png" });

  await page.getByLabel("Postal code").fill("SW1A 2AA");

  // A seat the service has already sold slips into the choice (as if the
  // news of it had not yet arrived): the service names it, nothing is charged.
  const sold = await page.evaluate(async (api) => {
    const map = await (await fetch(`${api}/api/performances/p01/seats`)).json();
    for (const r of map.sections[0].rows) for (const x of r.seats) if (x.status === "sold") return x.id;
  }, API);
  await drive.set("app", "chosen", [chosen[0], sold]);
  await page.getByRole("button", { name: "Pay $174.00" }).click();
  await drive.settleData();
  await drive.wait(2000);
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText(/^1 seat · \$80\.00$/)).toBeVisible();
  await page.screenshot({ path: "/tmp/venue-shots/desk-conflict.png" });

  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await expect(page.getByLabel("Card number")).toHaveValue("4242 4242 4242 4242");
  await page.getByRole("button", { name: "Pay $87.00" }).click();
  await drive.settleData();
  await drive.wait(2000);
  await drive.settleData();
  await expect(page.getByText("Sent to kb@example.com")).toBeVisible();
  await page.screenshot({ path: "/tmp/venue-shots/desk-tickets.png" });
};
