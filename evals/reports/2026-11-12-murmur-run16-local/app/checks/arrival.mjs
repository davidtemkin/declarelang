// A message arriving while the reader is further back: what they read stays
// put, and the pill says something is below. At the bottom, it comes into view.
export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate((p, a) => window.__declare.find(p)[a], p, a);
  const paneOf = async (tid) => {
    for (let i = 0; i < 6; i++) if ((await read(`app.stage.main.panes.${i}`, "threadId")) === tid) return `app.stage.main.panes.${i}`;
  };
  await drive.waitReal(1500);
  await page.evaluate(() => window.__declare.find("app").open("t6"));     // Book club; p8 writes at 12s
  await drive.settleMotion();
  const p = await paneOf("t6");
  const s = p + ".scroller";
  await drive.wheel(s, -900);
  await drive.waitReal(600);
  const row0 = await read(s + ".feed", "firstVisibleRow");
  const unread0 = await read(p, "unread");
  console.log("before", row0, await read(s, "scrollY"), "unread", unread0);
  await drive.waitReal(11000);
  const row1 = await read(s + ".feed", "firstVisibleRow");
  console.log("after", row1, await read(s, "scrollY"), "unread", await read(p, "unread"), "count", await read(p, "count"));
  await expect.equal(row1, row0);
  await expect.visible(s + ".newer");
  await page.screenshot({ path: "/tmp/a1.png" });
  await drive.click(s + ".newer");
  await drive.waitReal(1200);
  console.log("at end", await read(p, "atEnd"), "unread", await read(p, "unread"));
  await expect.hidden(s + ".newer");
  // now at the bottom: the next one (p6 at ~54.8s) comes into view
  await drive.waitReal(22000); await drive.waitReal(22000);
  console.log("count", await read(p, "count"), "last", await read(s + ".feed", "lastVisibleRow"), "unread", await read(p, "unread"));
  await expect.equal(await read(s + ".feed", "lastVisibleRow"), (await read(p, "count")) - 1);
  await page.screenshot({ path: "/tmp/a2.png" });
};
