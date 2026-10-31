// At a desk with the keyboard alone: into the room, along the seats with the
// arrows, two seats taken with Space, on to pay, every field typed, Enter.
const shot = (page, name) => page.screenshot({ path: `/tmp/dk-${name}.png` });
const focused = (page) => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? "");

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  // the first performance in the list, by keyboard
  for (let i = 0; i < 4; i++) {
    await drive.key("Tab");
    if (/Fri 11 Dec/.test(await focused(page))) break;
  }
  // tab until the list reaches Friday 11 Dec
  for (let i = 0; i < 30 && !/Fri 11 Dec/.test(await focused(page)); i++) await drive.key("Tab");
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  // into the Orchestra
  for (let i = 0; i < 10 && !/^Orchestra, row/.test(await focused(page)); i++) await drive.key("Tab");
  const start = await focused(page);
  await drive.key("ArrowDown"); await drive.key("ArrowDown"); await drive.key("ArrowDown");
  await drive.key("ArrowLeft");
  const first = await focused(page);
  await drive.key("Space");
  await drive.key("ArrowLeft");
  const second = await focused(page);
  await drive.key("Space");
  await drive.settleMotion();
  await shot(page, "1-hall");
  const chosen = await page.evaluate(() => window.__declare.find("app").chosen.length);
  if (chosen !== 2) throw new Error(`chose ${chosen}: ${start} → ${first}, ${second}`);
  // Continue is after the room in Tab order
  for (let i = 0; i < 15 && (await focused(page)).trim() !== "Continue"; i++) await drive.key("Tab");
  await drive.key("Enter");
  await drive.settleMotion();
  for (let i = 0; i < 10 && !/Email/.test(await page.evaluate(() => document.activeElement?.labels?.[0]?.textContent ?? document.activeElement?.getAttribute("aria-label") ?? "")); i++) await drive.key("Tab");
  const type = async (t) => { await drive.type(t); await drive.key("Tab"); };
  await type("lin@example.com");
  await type("Lin Shu");
  await type("378282246310005");
  await type("1130");
  await type("1234");
  await type("9 Queen Street");
  await type("");
  await type("Toronto");
  await type("M5H 2N2");
  await drive.key("Meta+A");
  await drive.type("Canada");
  await drive.key("Enter");
  await drive.settleMotion();
  await shot(page, "2-filled");
  const amex = await page.getByLabel("Card number").inputValue();
  if (amex !== "3782 822463 10005") throw new Error("amex grouped as " + amex);
  // Enter in the last field submits; Enter again sends nothing more
  await page.getByLabel("Postal code").focus();
  await drive.key("Enter");
  await drive.key("Enter");
  await drive.waitReal(2500);
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/orders", { count: 1, body: { email: "lin@example.com" } });
  await expect.attr("app", "step", "tickets");
  await shot(page, "3-tickets");
};
