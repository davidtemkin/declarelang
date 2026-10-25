export default async ({ drive, page }) => {
  await drive.wait(1500);
  await drive.set("app", "waypoint", "t1");
  await drive.wait(800);
  const rows = async () => page.evaluate(() => __declare.inspect("app.panes.0.scroller.column").children.map((c) => [c.path.split(".").pop(), Math.round(c.rootY), Math.round(c.height)]).slice(-6));
  const before = await rows();
  const t0 = Date.now();
  while (Date.now() - t0 < 17500) await drive.wait(250);
  const after = await rows();
  (await import("node:fs")).writeFileSync("/tmp/mm/react.txt", JSON.stringify({ before, after }));
  await page.screenshot({ path: "/tmp/mm/react1.png" });
};
