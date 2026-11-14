// The longest conversation, read all the way back to its first message and
// returned to the latest, and the place kept across a visit elsewhere.
export default async ({ drive, expect, page }) => {
  await drive.waitReal(1500);
  await drive.click('app."Trail crew"');
  await drive.settleMotion();
  const pane = "app.stage.main.panes.3.scroller";
  const read = (p, a) => page.evaluate((p, a) => window.__declare.find(p)[a], p, a);
  const paneOf = async () => {
    for (let i = 0; i < 6; i++) {
      const id = await read(`app.stage.main.panes.${i}`, "threadId");
      if (id === "t4") return `app.stage.main.panes.${i}.scroller`;
    }
  };
  const p = await paneOf();
  console.log("at open", await read(p, "scrollY"), await read(p, "contentHeight"), await read(p + ".feed", "firstVisibleRow"));
  let t0 = Date.now();
  await page.evaluate((p) => window.__declare.find(p).scrollTo(0), p);
  await drive.waitReal(1500);
  console.log("top", Date.now() - t0, "ms", await read(p, "scrollY"), await read(p + ".feed", "firstVisibleRow"));
  await page.evaluate((p) => window.__declare.find(p).scrollTo(0), p);
  await drive.waitReal(800);
  console.log("top again", await read(p, "scrollY"), await read(p + ".feed", "firstVisibleRow"));
  await expect.equal(await read(p + ".feed", "firstVisibleRow"), 0);
  // middle
  await page.evaluate((p) => window.__declare.find(p).scrollTo(400000), p);
  await drive.waitReal(800);
  const mid = await read(p + ".feed", "firstVisibleRow");
  console.log("mid", mid);
  await drive.click('app."Dana Ruiz"');
  await drive.settleMotion();
  await drive.click('app."Trail crew"');
  await drive.settleMotion();
  console.log("back", await read(p + ".feed", "firstVisibleRow"));
  await expect.equal(await read(p + ".feed", "firstVisibleRow"), mid);
  t0 = Date.now();
  await page.evaluate((p) => window.__declare.find(p).scrollTo(Infinity), p);
  await drive.waitReal(1500);
  console.log("bottom", Date.now() - t0, await read(p + ".feed", "lastVisibleRow"), await read(p, "contentHeight"));
};
