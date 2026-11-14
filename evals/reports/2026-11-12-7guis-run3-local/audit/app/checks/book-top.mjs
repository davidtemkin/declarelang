// A press on Book's top edge (where the hidden Text's stale box lies) and on its bottom edge.
export default async ({ drive, expect }) => {
  await drive.click(`app.header.1."Flight Booker"`); await drive.settleMotion();
  const probe = () => drive.page.evaluate(() => {
    const d = window.__declare, b = d.find("app.body.flight.form.4");
    const top = d.rootPoint(b, b.width / 2, 5), bot = d.rootPoint(b, b.width / 2, b.height - 5);
    const p = (q) => ((d.pressAt ?? d.at)(q.x, q.y) ?? {}).path;
    return { top: p(top), bottom: p(bot), at: d.at(top.x, top.y)?.path };
  });
  console.log("PROBE", JSON.stringify(await probe()));
  await drive.clickAt("app.body.flight.form.4", 30, 5);
  await expect.text("app.body.flight.confirm", "You have booked");
};
