// Read back in Book club; the seeded message for t6 lands ~12 s after connect.
const read = (page, p, a) => page.evaluate(([p, a]) => { const v = window.__declare.find(p)?.[a]; return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, [p, a]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export default async ({ drive, expect, page }) => {
  const t0 = Date.now();
  await drive.wait(1000);
  await drive.click("app.inbox.scroller.rows.4");
  await drive.settleMotion();
  await drive.wheel("app.conversation.body.5", -900);
  await drive.wait(400);
  const before = [await read(page, "app.conversation.body.5", "scrollY"), await read(page, "app.conversation.body.5.list", "firstVisibleRow")];
  await page.screenshot({ path: "/tmp/a1.png" });
  await sleep(Math.max(0, 13500 - (Date.now() - t0))); await drive.wait(50); await drive.settleMotion();
  const after = [await read(page, "app.conversation.body.5", "scrollY"), await read(page, "app.conversation.body.5.list", "firstVisibleRow")];
  console.log("before", before, "after", after, "unread", await read(page, "app.conversation.body.5", "unread"));
  await page.screenshot({ path: "/tmp/a2.png" });
  await drive.click("app.conversation.body.5.jump");
  await drive.settleMotion(); await drive.wait(600);
  console.log("atEnd", await read(page, "app.conversation.body.5", "atEnd"), "unread", await read(page, "app.conversation.body.5", "unread"));
  await page.screenshot({ path: "/tmp/a3.png" });
};
