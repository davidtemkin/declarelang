// Venue 30, d19: Return in the Country combobox (the form's last field, a value already chosen).
// At a desk, the keyboard alone: a performance, two seats, the form, Pay.
export default async ({ page, expect }) => {
  await page.evaluate(() => fetch("http://127.0.0.1:8461/api/session", { method: "DELETE", credentials: "include" }));
  await page.reload();
  await expect(page.getByRole("button", { name: "Fri 13 Nov, 7:30pm" })).toBeVisible();
  const press = (k) => page.keyboard.press(k);
  // Tab to the first performance
  for (let i = 0; i < 6; i++) {
    await press("Tab");
    const name = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    if (name.includes("Nov")) break;
  }
  await press("Enter");
  await expect(page.getByRole("button", { name: "Orchestra, row A, seat 1" })).toBeVisible();
  // Tab into the hall
  let name = "";
  for (let i = 0; i < 8; i++) {
    await press("Tab");
    name = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    if (/seat \d+$/.test(name)) break;
  }
  if (!/seat \d+$/.test(name)) throw new Error("Tab never reached a seat: " + name);
  await press("Space");
  await press("ArrowDown");
  const second = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  if (second == name) throw new Error("ArrowDown did not move");
  await press("Space");
  await expect(page.getByText(/^2 seats · \$/)).toBeVisible();
  // on to Continue
  for (let i = 0; i < 6; i++) {
    await press("Tab");
    const t = await page.evaluate(() => document.activeElement?.textContent ?? "");
    if (t.includes("Continue")) break;
  }
  await press("Enter");
  await expect(page.getByLabel("Email")).toBeVisible();
  const focusedLabel = await page.evaluate(() => document.activeElement?.tagName);
  // fill by keyboard: Tab through the fields in order
  await page.getByLabel("Email").focus();
  await page.keyboard.type("kb@example.com");
  for (const v of ["K Board", "4242424242424242", "1230", "123", "1 Key Road", "", "Boston", "02110"]) {
    await press("Tab");
    if (v) await page.keyboard.type(v);
  }
  await press("Tab");   // Country, already United States
  const on = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  if (on != "Country") throw new Error("not on Country: " + on);
  await press("Enter");
  await expect(page.getByText("Sent to kb@example.com")).toBeVisible();
};
