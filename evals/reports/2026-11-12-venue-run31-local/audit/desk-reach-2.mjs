// Which checkout fields are below the 800 px window at a desk; does Tab (a
// person's keyboard) bring them into view; does a locator click() reach one.
const fields = (page) => page.evaluate(() => [...document.querySelectorAll("input")].map((e) => {
  const r = e.getBoundingClientRect();
  return `${e.getAttribute("aria-label") ?? e.name ?? e.autocomplete}@${Math.round(r.top)}${r.top > innerHeight ? " (below the window)" : ""}${document.activeElement === e ? " FOCUSED" : ""}`;
}));
export default async ({ drive, expect, page }) => {
  const log = [];
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 13 Nov, 7:30pm/ }).click();
  await drive.settleData();
  await page.getByRole("checkbox", { name: "Orchestra, row A, seat 4", exact: true }).click();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await drive.settleMotion();
  log.push(["at checkout", await fields(page)]);
  await page.getByLabel("Email").click();
  for (let i = 0; i < 9; i++) { await drive.tab(); }
  await drive.settleMotion();
  log.push(["after clicking Email and 9 Tabs", await fields(page)]);
  let clickErr = null;
  try { await page.getByLabel("City").click({ timeout: 2000 }); } catch (e) { clickErr = String(e.message ?? e).slice(0, 300); }
  log.push(["locator click on City", clickErr ?? "clicked"]);
  throw new Error("FINDINGS " + JSON.stringify(log, null, 1));
};
