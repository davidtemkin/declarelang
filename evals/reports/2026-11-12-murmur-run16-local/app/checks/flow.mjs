// Send, react, photograph, and a message arriving while reading further back.
export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate((p, a) => window.__declare.find(p)[a], p, a);
  const paneOf = async (tid) => {
    for (let i = 0; i < 6; i++) if ((await read(`app.stage.main.panes.${i}`, "threadId")) === tid) return `app.stage.main.panes.${i}`;
  };
  await drive.waitReal(1200);
  await drive.click('app."Priya Raman"');
  await drive.settleMotion();
  const p = await paneOf("t2");
  await drive.click(p + ".composer.bar.field");
  await drive.type("see you at seven");
  await drive.key("Enter");
  await expect.text(p + ".scroller.feed", "see you at seven");
  await drive.waitReal(700);
  await expect.text(p + ".scroller.feed", "Delivered");
  await drive.waitReal(2500);   // Priya answers
  console.log("rows after answer", await read(p, "count"));
  // react to the latest message by holding it
  await drive.hold(p + '.scroller.feed."see you at seven"', 700);
  await drive.settleMotion();
  await drive.click('app.marks.Heart');
  await drive.settleMotion();
  await expect.text(p + ".scroller.feed", "❤️");
  // a photograph
  await drive.click(p + ".composer.bar.photo");
  await drive.settleMotion();
  await drive.click('app.photos."Send Aurora Borealis Over Mountains"');
  await drive.settleMotion();
  await drive.waitReal(1500);
  // open it at full size, then close
  console.log("feed rows", await read(p, "count"));
  await page.screenshot({ path: "/tmp/f2.png" });
  await drive.click(p + '.scroller.feed."Photo: Aurora Borealis Over Mountains"');
  await drive.settleMotion();
  await drive.waitReal(800);
  await page.screenshot({ path: "/tmp/f3.png" });
  await drive.key("Escape");
  await drive.settleMotion();
};
