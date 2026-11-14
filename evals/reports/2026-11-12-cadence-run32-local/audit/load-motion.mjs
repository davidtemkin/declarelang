// Read the figures at the first moment a script gets, then as program time passes.
export default async ({ drive, page }) => {
  const r = () => page.evaluate(() => { const a = window.__declare.find("app"); return [a.shownCount, a.shownTime, a.shownStreak, Math.round(a.shownPCount), Math.round(a.shownPTime), a.period.length, a.ready]; });
  console.log("t0", JSON.stringify(await r()));
  await drive.wait(50); console.log("t50", JSON.stringify(await r()));
  await drive.settleData(); console.log("data", JSON.stringify(await r()));
  await drive.wait(100); console.log("+100", JSON.stringify(await r()));
  await drive.wait(400); console.log("+500", JSON.stringify(await r()));
};
