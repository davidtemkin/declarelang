// The longest conversation (30,500 messages), by its scroll thumb: dragged to
// the top it reaches the very first message; dragged back down, the latest.
// npx declare-verify my-apps/murmur/murmur.declare --assert my-apps/murmur/checks/thumb.mjs

export default async ({ drive, expect, page }) => {
  await drive.waitReal(2500);
  await drive.set("app", "location", "t4");
  await drive.waitReal(1000);
  const feed = "app.convo.chosen.panes.3.feed";
  const box = await page.evaluate((p) => {
    const v = window.__declare.find(p);
    const o = v.rootOrigin();
    return { x: o.x, y: o.y, w: v.width, h: v.height };
  }, feed);
  const x = box.x + box.w - 6;

  // the thumb sits at the foot of the track: take it to the top
  await page.mouse.move(x, box.y + box.h - 8);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x, box.y + box.h - 8 - (box.h * i) / 12);
  await page.mouse.up();
  await drive.waitReal(1200);
  await expect.attr(feed + ".list", "firstVisibleRow", 0);

  // and back down to the end
  await page.mouse.move(x, box.y + 8);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x, box.y + 8 + (box.h * i) / 12);
  await page.mouse.up();
  await drive.waitReal(1200);
  await expect.attr(feed + ".list", "lastVisibleRow", 30499);
};
