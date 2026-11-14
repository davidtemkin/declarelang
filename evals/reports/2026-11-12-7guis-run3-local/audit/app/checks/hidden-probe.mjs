// What a press at the hidden Text's centre reaches, and is Book enabled then?
export default async ({ drive, expect }) => {
  await drive.click(`app.header.1."Flight Booker"`); await drive.settleMotion();
  const r = await drive.page.evaluate(() => {
    const d = window.__declare, t = d.find("app.body.flight.form.3"), b = d.find("app.body.flight.form.4");
    const c = d.rootPoint(t, t.width / 2, t.height / 2);
    const at = (d.pressAt ?? d.at)(c.x, c.y);
    return { centre: c, hidden: t.visible, reaches: at && at.path, bookDisabled: b.disabled, bookY: b.y, tY: t.y, tH: t.height };
  });
  console.log("PROBE", JSON.stringify(r));
};
