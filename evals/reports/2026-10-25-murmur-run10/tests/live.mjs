export default async ({ drive, expect, page }) => {
  await drive.wait(1500);
  await drive.set("app", "waypoint", "t3");
  await drive.wait(500);
  await drive.wheel("app.panes.2.scroller", -600);
  await drive.wait(400);
  const read = async (p) => page.evaluate((p) => { const [path, attr] = p; return __declare.find(path)[attr]; }, p);
  const before = await read(["app.panes.2.scroller", "scrollY"]);
  const n0 = await read(["app.panes.2", "msgs"]).then((m) => m.length);
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) { await drive.wait(250); if ((await read(["app.panes.2", "msgs"])).length > n0) break; }
  await drive.wait(300);
  const after = await read(["app.panes.2.scroller", "scrollY"]);
  const n1 = (await read(["app.panes.2", "msgs"])).length;
  (await import("node:fs")).writeFileSync("/tmp/mm/live.txt", JSON.stringify(["msgs", n0, "->", n1, "scrollY", before, "->", after, "unseen", await read(["app.panes.2", "unseen"]), "below", await read(["app.panes.2", "below"])]));
  await page.screenshot({ path: "/tmp/mm/live1.png" });
};
