export default async ({ drive, expect, page }) => {
  const state = () => page.evaluate(() => {
    const a = window.__declare.find("app"), l = window.__declare.find("app.feed.list");
    const rows = l.childViews.filter((c) => c.img);
    const loaded = rows.filter((r) => r.img.loaded).map((r) => r.rid);
    return { heard: a.heard, loaded: loaded.length, loadedNeverHeard: loaded.filter((id) => !a.seen[id]), scrollY: window.__declare.find("app.feed").scrollY, first: l.firstVisibleRow, ids: rows.map((r) => r.rid + (r.img.loaded ? "+" : "-")).join(" ") };
  });
  console.log("at rest", JSON.stringify(await state()));
  for (let i = 0; i < 4; i++) { await drive.wheel("app.feed", -3000); await drive.waitReal(800); }
  const s = await state();
  console.log("after wheel", JSON.stringify(s));
  expect.equal(s.loadedNeverHeard.length, 0);
};
