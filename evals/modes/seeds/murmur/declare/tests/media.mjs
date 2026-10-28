const read = (page, p, a) => page.evaluate(([p, a]) => { const v = window.__declare.find(p)?.[a]; return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, [p, a]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export default async ({ drive, expect, page }) => {
  await drive.wait(1500);
  await drive.click("app.inbox.scroller.rows.4");        // Book club
  await drive.settleMotion();
  await drive.wheel("app.conversation.body.5", -1500);
  await drive.wait(300);
  await drive.click(`app.conversation.body.5."Play voice message, 0:09"`);
  await sleep(1500); await drive.wait(1500);
  console.log("voice", await read(page, "app", "voiceId"), await read(page, "app", "voicePlaying"), await read(page, "app", "voiceHead"), await read(page, "app.player", "position"), await read(page, "app.player", "duration"));
  await page.screenshot({ path: "/tmp/v1.png" });
  await drive.clickAt(`app.conversation.body.5."Position in voice message"`, 150, 15);
  await sleep(300); await drive.wait(300);
  console.log("seek", await read(page, "app", "voiceHead"), await read(page, "app.player", "position"));
  await page.screenshot({ path: "/tmp/v2.png" });
  await drive.click(`app.conversation.body.5."Photo: Acorns and Autumn Leaf"`);
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/v3.png" });
  await drive.key("Escape");
  await drive.settleMotion();
  console.log("viewing", await read(page, "app", "viewing"));
};
