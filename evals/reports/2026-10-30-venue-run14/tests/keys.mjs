// Keyboard only, at a desk: pick a performance, two seats, check out.
export default async ({ drive, expect, page }) => {
  const focused = () => page.evaluate(() => { const e = document.activeElement; return e ? (e.getAttribute("aria-label") || e.textContent || e.tagName).slice(0, 60) : "none"; });
  await drive.settleData();
  await drive.tab(1); console.log("1:", await focused());
  await drive.tab(1); console.log("2:", await focused());
  await drive.key("Enter"); await drive.settleData(); await drive.settleMotion();
  console.log("after enter:", await focused());
  await drive.tab(1); console.log("t1:", await focused());
  await drive.tab(1); console.log("t2:", await focused());
  await drive.key("ArrowDown"); console.log("down:", await focused());
  await drive.key("ArrowLeft"); console.log("left:", await focused());
  await drive.key(" "); await drive.settleMotion();
  await drive.key("ArrowLeft"); await drive.key(" "); await drive.settleMotion();
  console.log("summary:", await page.evaluate(() => window.__declare.find("app.side").childViews.length));
  await expect.text("app.side", "2 seats");
  for (let i = 0; i < 8; i++) { await drive.tab(1); const f = await focused(); console.log("tab:", f); if (f.startsWith("Continue")) break; }
  await drive.key("Enter"); await drive.settleMotion();
  console.log("checkout focus:", await focused());
  await drive.tab(1); console.log("c1:", await focused());
  await drive.tab(1); console.log("c2:", await focused());
};
