// Send into Kestrel Street, then let the seeded schedule run in real time.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (page, p, a) => page.evaluate(([p, a]) => { const v = window.__declare.find(p)?.[a]; return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, [p, a]);
export default async ({ drive, expect, page }) => {
  await drive.wait(1500);
  await drive.click("app.inbox.scroller.rows.5");
  await drive.wait(300);
  await drive.click("app.conversation.composer.field");
  await drive.type("is the clanking back again");
  await drive.key("Enter");
  await drive.wait(100);
  await page.screenshot({ path: "/tmp/l1.png" });
  await sleep(1200); await drive.wait(50);
  console.log("typing", JSON.stringify(await read(page, "app", "typing")));
  await page.screenshot({ path: "/tmp/l2.png" });
  await sleep(2500); await drive.wait(50); await drive.settleMotion();
  console.log("last", await read(page, "app.live", "last"));
  await page.screenshot({ path: "/tmp/l3.png" });
};
