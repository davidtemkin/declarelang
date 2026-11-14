// What the locator's own scrollIntoView({ block: "nearest" }) moves, measured
// in the same frame (the driver aims and presses before the runtime answers).
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 13 Nov, 7:30pm/ }).click();
  await drive.settleData();
  await page.getByRole("checkbox", { name: "Orchestra, row A, seat 4", exact: true }).click();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await drive.settleMotion();
  const r = await page.evaluate(() => {
    const el = document.querySelector('input[autocomplete="postal-code"]') ?? [...document.querySelectorAll("input")].pop();
    const before = { top: Math.round(el.getBoundingClientRect().top), winY: scrollY, docTop: document.documentElement.scrollTop, bodyTop: document.body.scrollTop };
    el.scrollIntoView({ block: "nearest" });
    const moved = []; for (let p = el.parentElement; p; p = p.parentElement) if (p.scrollTop) moved.push(`${p.tagName}${p.id ? "#" + p.id : ""} scrollTop=${p.scrollTop} overflow=${getComputedStyle(p).overflowY}`);
    const after = { top: Math.round(el.getBoundingClientRect().top), winY: scrollY, docTop: document.documentElement.scrollTop, moved, htmlOverflow: getComputedStyle(document.documentElement).overflowY, bodyOverflow: getComputedStyle(document.body).overflowY };
    return new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok({ before, after, twoFramesLater: { top: Math.round(el.getBoundingClientRect().top), winY: scrollY } }))));
  });
  throw new Error("FINDINGS " + JSON.stringify(r, null, 1));
};
