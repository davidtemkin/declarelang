// dfm-assert.mjs — rung 5: drive the app with real input and assert by view path.
//   node tools/verify.mjs my-apps/dfm.declare --assert task/dfm-assert.mjs
export default async ({ drive, expect }) => {
  const go = async (frag) => {
    await drive.page.evaluate((f) => { window.location.hash = f; }, frag);
    await drive.wait(400);
  };

  // ---- home is the default location
  await expect.visible("app.home");
  await expect.attr("app", "route", "home");

  // ---- the carousel dial advances the sprung track
  await drive.click("app.home.hero.dial.dots.2");
  await drive.settleMotion();
  await expect.attr("app", "slide", 2);
  await expect.approx("app.home.hero.track", "x", -896, 2);

  // ---- the menu opens, navigates, and closes behind itself
  await drive.click("app.chrome.menuBtn");
  await expect.visible("app.menu");
  await drive.click("app.menu.card.rows.1");
  await drive.wait(300);
  await expect.attr("app", "route", "browse");
  await expect.attr("app", "menuOpen", false);
  await expect.visible("app.browse");

  // ---- the browse tabs swap the sort, which re-points the DataSource
  await drive.click("app.browse.tabs.1");
  await expect.attr("app", "sort", "top");
  await drive.click("app.browse.tabs.2");
  await expect.attr("app", "sort", "new");
  await drive.click("app.browse.tabs.0");
  await expect.attr("app", "sort", "featured");
  await drive.settleData();
  await expect.text("app.browse.heading", "BROWSE CURATORS");

  // ---- a curator deep link
  await go("curator/kayvanmd");
  await expect.attr("app", "route", "curator");
  await expect.attr("app", "slug", "kayvanmd");
  await expect.visible("app.curator");

  // ---- the site's own short form addresses the same page
  await go("allison");
  await expect.attr("app", "route", "curator");
  await expect.attr("app", "slug", "allison");
  await drive.settleData();
  await drive.wait(1200);
  await expect.text("app.curator.heroWrap.plate.nameInk", "ALLISON");
  await expect.text("app.curator.deck.title", "COMMUNITY PICKS");

  // ---- SEE MORE expands the clamped description
  await expect.approx("app.curator.deck.about", "height", 52, 1);
  await drive.click("app.curator.deck.seeMore");
  await drive.wait(300);
  await expect.attr("app", "seeMore", true);
  await expect.hidden("app.curator.deck.seeMore");

  // ---- the legal placeholder
  await go("terms");
  await expect.attr("app", "route", "legal");
  await expect.visible("app.legal");
  await expect.text("app.legal.heading", "TERMS OF SERVICE");

  // ---- back to home
  await go("");
  await expect.visible("app.home");
};
