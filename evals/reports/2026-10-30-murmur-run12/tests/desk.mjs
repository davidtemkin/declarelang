// A desk: react to a message, play and scrub a voice message, look at a
// photograph full size, send a photograph.
export const device = { width: 1440, height: 900 };

// Rows are virtualized, so a path names a built row by its place among the
// built ones; this finds the place of the row showing a message.
const rowOf = async (page, list, id) => list + "." + await page.evaluate((l, m) =>
  window.__declare.find(l).childViews.findIndex((v) => v.msgId == m), list, id);

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.set("app", "location", "t1");
  await drive.settleMotion();
  const row = await rowOf(page, "app.stage.threads.0.pane.col.list", "m0040");
  await drive.click(row + ".line.trail");
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/desk-1.png" });
  await drive.click('app.picker."React 🔥"');
  await drive.settleMotion();
  await expect.text(row + ".marksRow", "🔥");
  await page.screenshot({ path: "/tmp/desk-2.png" });

  // the photograph, full size, and away again
  await drive.click(await rowOf(page, "app.stage.threads.0.pane.col.list", "m0042") + ".line.slot.photo");
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/desk-3.png" });
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.attr("app", "viewing", null);

  // a voice message in the long conversation
  await drive.set("app", "location", "t4");
  await drive.settleMotion();
  const v = await rowOf(page, "app.stage.threads.3.pane.col.list", "m0353");
  await drive.reveal(v);
  await drive.click(v + ".line.slot.voice.play");
  await drive.wait(1500);
  await drive.clickAt(v + ".line.slot.voice.scrub", 120, 17);
  await drive.wait(200);
  await page.screenshot({ path: "/tmp/desk-4.png" });
  await expect.attr("app", "voiceOn", true);
  await drive.waitReal(1200);
  await page.screenshot({ path: "/tmp/desk-4b.png" });

  // send a photograph
  await drive.click("app.stage.threads.3.composer.photo");
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/desk-5.png" });
  await drive.click('app.photos."Send Aurora Borealis Over Mountains"');
  await drive.settleMotion();
  await drive.wait(500);
  await page.screenshot({ path: "/tmp/desk-6.png" });
};
