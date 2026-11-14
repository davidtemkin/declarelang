// d11: what does 'adjuster.0.1' name once the Window is open, and does a drag on it say anything?
export default async ({ drive, expect }) => {
  await drive.click(`app.header.1."Circle Drawer"`); await drive.settleMotion();
  await drive.clickAt("app.body.circles.canvas", 200, 150);
  await drive.page.evaluate(() => { const c = window.__declare.find("app.body.circles"); c.beginAdjust(c.circles.all()[0]); });
  await drive.settleMotion();
  const tree = await drive.page.evaluate(() => {
    const d = window.__declare, w = d.find("app.body.circles.adjuster");
    const walk = (v, depth) => depth > 2 ? [] : (v.subviews ?? v.children ?? []).flatMap((c, i) => [`${"  ".repeat(depth)}${i}: ${c.constructor?.name} ${c.name ?? ""}`, ...walk(c, depth + 1)]);
    return walk(w, 0).join("\n");
  });
  console.log("TREE\n" + tree);
  await drive.drag("app.body.circles.adjuster.0.1", 80, 0);
  console.log("D", await drive.page.evaluate(() => JSON.stringify(window.__declare.find("app.body.circles").selected)));
};
