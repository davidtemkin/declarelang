// The phone's way around the docs: the rail is a drawer, opened from the bar.
//
//   npx declare-verify apps/docs/docs.declare --assert apps/docs/tests/phone-drawer.mjs
//
// On a phone the rail leaves the layout and the page takes the window. The
// bar's menu button opens the same nav as a drawer over the page; picking a
// chapter in it goes there and puts the drawer away; so do a swipe back on its
// trailing edge, a press on the page beside it, and Esc — each leaving the
// page where it was.
export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect }) => {
  await drive.settleData();
  await expect.attr("app", "docked", false);
  await expect.attr("app", "chapter", "01-what-declare-is");
  await expect.approx("app.detail", "width", 390, 0.5);

  // the menu button opens the drawer, with the nav in it
  await drive.click("app.bar.menu");
  await drive.settleMotion();
  await expect.attr("app", "navOpen", true);
  await expect.approx("app.drawer", "x", 0, 0.5);
  await expect.visible("app.drawer.body.0.guideNav");

  // a pick: the Building part, then its first chapter
  await drive.click("app.drawer.body.0.guideNav.1.head");
  await drive.settleMotion();
  await drive.click('app.drawer.body.0.guideNav.1.body."6. Size, position, layout"');
  await drive.settleMotion();
  await drive.settleData();
  await expect.attr("app", "navOpen", false);
  await expect.attr("app.drawer", "shown", false);
  await expect.attr("app", "location", "guide/06-layout");
  await expect.attr("app", "chapter", "06-layout");
  await expect.visible("app.detail.col.guideCol.5");
  await expect.hidden("app.detail.col.guideCol.0");

  // open again, and swipe it back by its trailing edge
  await drive.click("app.bar.menu");
  await drive.settleMotion();
  await expect.attr("app", "navOpen", true);
  const w = await drive.page.evaluate(() => window.__declare.find("app.drawer").width);
  const finger = await drive.page.touchscreen.touchStart(w - 12, 600);
  for (let i = 1; i <= 10; i++) {
    await finger.move(w - 12 - 16 * i, 600);
    await new Promise((r) => setTimeout(r, 16));
  }
  await finger.end();
  await drive.settleMotion();
  await expect.attr("app", "navOpen", false);
  await expect.attr("app", "location", "guide/06-layout");

  // a press on the page beside it
  await drive.click("app.bar.menu");
  await drive.settleMotion();
  await drive.clickAt("app", 360, 500);
  await drive.settleMotion();
  await expect.attr("app", "navOpen", false);

  // and Esc
  await drive.click("app.bar.menu");
  await drive.settleMotion();
  await expect.attr("app", "navOpen", true);
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.attr("app", "navOpen", false);
  await expect.attr("app", "location", "guide/06-layout");
};
