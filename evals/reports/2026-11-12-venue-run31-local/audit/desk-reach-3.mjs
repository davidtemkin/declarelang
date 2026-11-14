// After the form has grown (problems shown under the fields Tab passed), is the
// pane scrollable by a person's wheel, and what did the locator's click scroll?
const st = (page) => page.evaluate(() => {
  const d = window.__declare, m = d.find("app.checkoutScreen.main");
  const city = [...document.querySelectorAll("input")].find((e) => e.getAttribute("aria-label") == "City" || /City/.test(e.labels?.[0]?.textContent ?? ""));
  const dom = []; for (let p = city?.parentElement; p; p = p.parentElement) if (p.scrollTop) dom.push(`${p.tagName}.scrollTop=${p.scrollTop} (sh ${p.scrollHeight}, ch ${p.clientHeight})`);
  return { mainH: m.height, mainContentH: m.contentHeight, mainScrollY: m.scrollY, screenH: d.find("app.checkoutScreen").height, cityTop: Math.round(city?.getBoundingClientRect().top), domScrolled: dom };
});
export default async ({ drive, expect, page }) => {
  const log = [];
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 13 Nov, 7:30pm/ }).click();
  await drive.settleData();
  await page.getByRole("checkbox", { name: "Orchestra, row A, seat 4", exact: true }).click();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await drive.settleMotion();
  log.push(["at checkout", await st(page)]);
  await page.getByLabel("Email").click();
  for (let i = 0; i < 9; i++) await drive.tab();
  await drive.settleMotion();
  log.push(["after 9 Tabs", await st(page)]);
  await page.mouse.move(500, 500);
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 300); await drive.wait(100); }
  await drive.settleMotion();
  log.push(["after real wheel x3", await st(page)]);
  await page.getByLabel("City").click({ timeout: 2000 });
  await drive.settleMotion();
  log.push(["after locator click on City", await st(page)]);
  throw new Error("FINDINGS " + JSON.stringify(log, null, 1));
};
