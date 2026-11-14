// After Tab has walked the form: what does the locator's scrollIntoView move, in the same frame?
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 13 Nov, 7:30pm/ }).click();
  await drive.settleData();
  await page.getByRole("checkbox", { name: "Orchestra, row A, seat 4", exact: true }).click();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await drive.settleMotion();
  await page.getByLabel("Email").click();
  for (let i = 0; i < 9; i++) await drive.tab();
  await drive.settleMotion();
  const r = await page.evaluate(() => {
    const el = [...document.querySelectorAll("input")].find((e) => e.getAttribute("aria-label") == "City");
    const chain = (tag) => { const o = []; for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.overflowY != "visible" || p.scrollTop) o.push(`${tag}:${p.tagName} ov=${s.overflowY} top=${p.scrollTop} sh=${p.scrollHeight} ch=${p.clientHeight}`); } return o; };
    const before = { top: Math.round(el.getBoundingClientRect().top), chain: chain("before"), winY: scrollY };
    el.scrollIntoView({ block: "nearest" });
    const after = { top: Math.round(el.getBoundingClientRect().top), chain: chain("after"), winY: scrollY };
    return new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok({ before, after, later: { top: Math.round(el.getBoundingClientRect().top), chain: chain("later") } }))));
  });
  throw new Error("FINDINGS " + JSON.stringify(r));
};
