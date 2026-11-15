// On a phone, the year is handled: a sideways finger moves it, a vertical one
// still scrolls the page, two fingers open it, a tap on a day opens that
// session — and nothing in it is too small for a finger.
export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate((p, a) => window.__declare.find(p)[a], p, a);
  await drive.settleData();
  await drive.settleMotion();
  await drive.reveal("app.main.year.surface");
  const s0 = await read("app", "viewStart");
  const span0 = await read("app", "viewSpan");
  const w = await read("app.main.year.surface", "width");

  // sideways: the surface follows the finger exactly
  await drive.drag("app.main.year.surface", 120, 0);
  await expect.approx("app", "viewStart", s0 - 120 * span0 / w, 0.8);

  // up and down: the page scrolls, the surface stays where it was
  const y0 = await read("app", "scrollY");
  const s1 = await read("app", "viewStart");
  await drive.drag("app.main.year.surface", 0, -250);
  await drive.settleMotion();
  const y1 = await read("app", "scrollY");
  if (!(y1 > y0 + 50)) throw new Error("a vertical drag on the year did not scroll the page: " + y0 + " → " + y1);
  await expect.approx("app", "viewStart", s1, 0.01);

  // two fingers open it to a fortnight or so
  await drive.reveal("app.main.year.surface");
  await drive.pinch("app.main.year.surface", 4);
  const span1 = await read("app", "viewSpan");
  if (!(span1 < span0 / 3)) throw new Error("pinch did not open the year: " + span0 + " → " + span1);

  // the presets and "to today" bring it back
  await drive.click("app.main.year.controls.Fortnight");
  await drive.click("app.main.year.controls.\"To today\"");
  await drive.settleMotion();
  await expect.approx("app", "viewSpan", 14, 0.05);

  // tap the day of the last session: it opens
  const last = await read("app.sessions", "latest");
  const rel = (await read("app.sessions", "loads")).find((l) => l.id == last.id).day - (await read("app", "todayN"));
  const x = (rel + 0.5 - (await read("app", "viewStart"))) / (await read("app", "viewSpan")) * w;
  const h = await read("app.main.year.surface", "height");
  await drive.clickAt("app.main.year.surface", x, h - 60);
  await drive.settleMotion();
  await expect.equal(await read("app", "openId"), last.id);
  await expect.visible("app.detail._body.0.band");
};
