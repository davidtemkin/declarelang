// Does a script need drive.waitReal(1200–1500) at its start for the history
// to be there? (Every one of the run's five scripts begins with one.)
export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate((p, a) => window.__declare.find(p)[a], p, a);
  console.log("at script start: loaded", await read("app.convos", "loaded"), "socket", await read("app.live", "status"));
  await drive.settleData();
  console.log("after settleData: loaded", await read("app.convos", "loaded"), "socket", await read("app.live", "status"));
  await drive.click('app."Trail crew"');
  await drive.settleMotion();
  await expect.equal(await read("app", "openId"), "t4");
};
