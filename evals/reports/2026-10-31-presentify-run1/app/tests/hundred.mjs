// A hundred slides open, scroll and move without stalling. Run with the id of a
// 100-slide presentation in the service: DECK=d146 npx declare-verify … --assert …/hundred.mjs
export default async ({ drive, expect }) => {
  await drive.settleData();
  const deck = process.env.DECK ?? "d146";
  const p = await drive.profile(async () => {
    await drive.set("app", "location", deck);
    await drive.settleData(); await drive.wait(200); await drive.settleData();
  }, { why: true });
  console.log("OPEN", p.text.split("\n").slice(0, 12).join("\n"));
  await expect.equal(await drive.page.evaluate(() => window.__declare.find("app.doc").pages().length), 100);
  const q = await drive.profile(async () => {
    for (let i = 0; i < 10; i++) await drive.key("ArrowDown");
  });
  console.log("STEP", q.text.split("\n").slice(0, 8).join("\n"));
  await expect.attr("app.doc", "currentIndex", 10);
  await drive.key("End");
};
