// The one player: play a clip, choose a point in it, then choose a point in
// a clip not yet loaded — playback goes there once it has loaded.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  const app = () => page.evaluate(() => { const a = window.__declare.find("app"); return { on: a.voiceOn, id: a.voiceId, at: a.player.position }; });
  await page.evaluate(() => window.__declare.find("app").toggleVoice("a", "voice/1.m4a"));
  await drive.waitReal(800);
  await page.evaluate(() => window.__declare.find("app").seekVoice("a", "voice/1.m4a", 5));
  await drive.waitReal(400);
  let s = await app();
  await expect.equal(s.on && s.at >= 5, true);
  await page.evaluate(() => window.__declare.find("app").seekVoice("b", "voice/2.m4a", 3));
  await drive.waitReal(800);
  s = await app();
  await expect.equal(s.id == "b" && s.at >= 3, true);
};
