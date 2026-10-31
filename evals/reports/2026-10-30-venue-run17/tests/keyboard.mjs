// Keyboard alone: into the hall, choose two seats with arrows and Space, on to checkout.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  const active = () => page.evaluate(() => { const e = document.activeElement; return (e?.getAttribute("aria-label") || e?.textContent || e?.tagName || "").slice(0, 60) + " [" + (e?.getAttribute("role") || e?.tagName) + "]"; });
  const trail = [];
  for (let i = 0; i < 4; i++) { await drive.tab(); trail.push(await active()); }
  console.log("tabs on list:", trail);
  // tab to the first performance card and open it
  await drive.key("Enter");
  await drive.settleData(); await drive.wait(400);
  console.log("after open:", await active());
  const t2 = [];
  for (let i = 0; i < 6; i++) { await drive.tab(); t2.push(await active()); if (/seat \d+/.test(t2[t2.length - 1])) break; }
  console.log("tabs in hall:", t2);
  await drive.key(" ");
  await drive.key("ArrowRight"); await drive.wait(100);
  console.log("after arrow:", await active());
  await drive.key("ArrowRight"); await drive.key(" ");
  await drive.key("ArrowDown"); await drive.wait(100);
  console.log("after down:", await active());
  console.log("picked:", await page.evaluate(() => window.__declare.find("app").picked));
  const t3 = [];
  for (let i = 0; i < 8; i++) { await drive.tab(); t3.push(await active()); if (/Continue/.test(t3[t3.length - 1])) break; }
  console.log("tabs to continue:", t3);
  await drive.key("Enter"); await drive.wait(500);
  console.log("screen:", await page.evaluate(() => window.__declare.find("app").screen), "focus:", await active());
};
