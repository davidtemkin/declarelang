// What the service does on its own, watched: the list keeps its order as
// messages arrive, and a reader scrolled back keeps their place while being
// told something new is below. Follows the seed-1 schedule: Book club hears
// from Mei at 12 s; Kestrel Street from Kwame at 28.9 s.
// npx declare-verify my-apps/murmur/murmur.declare --assert my-apps/murmur/checks/live.mjs

const top = (page) => page.evaluate(() =>
  window.__declare.find("app.inbox").value.rows.map((r) => r.id + ":" + r.unread));

export default async ({ drive, expect, page }) => {
  await drive.waitReal(2500);
  await drive.set("app", "location", "t1");
  await drive.waitReal(800);
  const feed = "app.convo.chosen.panes.0.feed";
  await expect.attr("app.convo.chosen.panes.0", "tid", "t1");

  // read back a little way
  await drive.wheel(feed, -600);
  await drive.waitReal(500);
  const y0 = await page.evaluate((p) => window.__declare.find(p).scrollY, feed);

  // Mei, in another conversation: it rises to the top of the list, new
  await drive.waitReal(10000);
  const order = await top(page);
  expect.equal(order[0], "t6:3");

  // Kwame, here, below the reader: the words stay put, and a pill says so
  await drive.waitReal(17500);
  const y1 = await page.evaluate((p) => window.__declare.find(p).scrollY, feed);
  expect.equal(Math.abs(y1 - y0) < 2, true);
  await expect.text("app.convo.chosen.panes.0.feed.jump", "1 new message");
  expect.equal((await top(page))[0], "t1:1");

  // the pill takes the reader down, and that reads it
  await drive.click("app.convo.chosen.panes.0.feed.jump");
  await drive.waitReal(1200);
  expect.equal((await top(page))[0], "t1:0");
};
