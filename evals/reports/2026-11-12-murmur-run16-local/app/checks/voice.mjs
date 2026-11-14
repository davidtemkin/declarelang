// A voice message: its length before it plays, its progress while it plays,
// and a point chosen directly on the waveform.
export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate((p, a) => window.__declare.find(p)[a], p, a);
  await drive.waitReal(1200);
  await page.evaluate(() => window.__declare.find("app").open("t2"));
  await drive.settleMotion();
  let p;
  for (let i = 0; i < 6; i++) if ((await read(`app.stage.main.panes.${i}`, "threadId")) === "t2") p = `app.stage.main.panes.${i}`;
  await page.evaluate((s) => window.__declare.find(s).scrollTo(0), p + ".scroller");
  await drive.waitReal(800);
  await drive.wheel(p + ".scroller", 500);
  await drive.waitReal(600);
  await page.screenshot({ path: "/tmp/v1.png" });
  await drive.click(p + '.scroller.feed."Play voice message"');
  await drive.waitReal(2500);
  console.log("playing", await read("app", "voicePlaying"), "head", await read("app", "head"), "pos", await read("app.player", "position"), "dur", await read("app.player", "duration"));
  await page.screenshot({ path: "/tmp/v2.png" });
  await drive.clickAt(p + '.scroller.feed."Position in voice message"', 70, 17);
  await drive.waitReal(400);
  console.log("after seek head", await read("app", "head"), "pos", await read("app.player", "position"));
  await page.screenshot({ path: "/tmp/v3.png" });
  await expect.equal(await read("app", "voicePlaying"), true);
  const pos = await read("app.player", "position");
  if (pos < 2.5 || pos > 4.5) throw new Error("seek landed at " + pos);
};
