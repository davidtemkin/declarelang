// Desk checkout at 1280x800: can real input bring the lower fields into view,
// and how does the locator's fill() reach them? Reports by throwing its findings.
const probe = (page) => page.evaluate(() => {
  const el = document.querySelector('input[name="postalCode"]') ?? [...document.querySelectorAll("input")].find((e) => /postal/i.test(e.getAttribute("autocomplete") ?? ""));
  const r = el.getBoundingClientRect();
  const scrolled = [];
  for (let p = el.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (p.scrollTop !== 0 || s.overflowY !== "visible") scrolled.push(`${p.dataset?.declarePath ?? p.tagName}[ov=${s.overflowY},top=${p.scrollTop},sh=${p.scrollHeight},ch=${p.clientHeight}]`);
  }
  const d = window.__declare, main = d.find("app.checkoutScreen.main");
  return { fieldTop: Math.round(r.top), fieldBottom: Math.round(r.bottom), winH: innerHeight, winScrollY: scrollY,
    mainScrollY: main?.scrollY, mainH: main?.height, mainContentH: main?.contentHeight, focused: document.activeElement?.name ?? document.activeElement?.tagName, scrolled };
});
export default async ({ drive, expect, page }) => {
  const log = [];
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 13 Nov, 7:30pm/ }).click();
  await drive.settleData();
  await page.getByRole("checkbox", { name: "Orchestra, row A, seat 4", exact: true }).click();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await drive.settleMotion();
  log.push(["at checkout", await probe(page)]);
  // a person: the wheel over the form pane, three notches' worth
  await drive.wheel("app.checkoutScreen.main", 600);
  await drive.settleMotion();
  log.push(["after drive.wheel(main, 600) — a real wheel turn over the pane", await probe(page)]);
  // the agent's way: locator fill()
  await page.getByLabel("Postal code").fill("94110");
  await drive.settleMotion();
  log.push(["after getByLabel('Postal code').fill()", await probe(page)]);
  throw new Error("FINDINGS " + JSON.stringify(log, null, 1));
};
