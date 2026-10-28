import { open, freeSeats, seat } from "./lib.mjs";
const { browser, page } = await open({ phone: true });
try {
  await page.screenshot({ path: "/tmp/vshots/ph-list.png" });
  await page.getByRole("button", { name: /^Fri 13 Nov/ }).first().tap();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/vshots/ph-hall.png" });
  const a = await freeSeats(page, 2, 9, "Orchestra");
  const b = await freeSeats(page, 1, 3, "Grand Tier");
  for (const n of [...a, ...b]) { await seat(page, n).tap(); console.log(n, await seat(page, n).getAttribute("aria-pressed")); }
  await page.waitForTimeout(500);
  await page.screenshot({ path: "/tmp/vshots/ph-hall2.png" });
  await page.getByRole("button", { name: "Continue" }).tap();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/vshots/ph-checkout.png" });
} finally { await browser.close(); }
