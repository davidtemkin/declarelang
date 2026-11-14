// The eight verbs, driven as a person drives them, on a desk.
// npx declare-verify my-apps/murmur/murmur.declare --assert my-apps/murmur/checks/flow.mjs

const PANES = "app.convo.chosen.panes";

// the path of the open transcript, and of its line showing a message
async function open(page) {
  return page.evaluate((p) => {
    const ps = window.__declare.find(p);
    const i = ps.childViews.findIndex((v) => v.visible);
    return `${p}.${i}`;
  }, PANES);
}
async function lineWhere(page, pane, test) {
  return page.evaluate(([pane, test]) => {
    const list = window.__declare.find(pane + ".feed.list");
    const f = new Function("v", "return " + test);
    const v = list.childViews.filter((c) => c.msgId != null && f(c)).sort((a, b) => b.rowIndex - a.rowIndex)[0];
    return v ? window.__declare.pathOf(v) : null;
  }, [pane, test]);
}
async function row(page, tid) {
  return page.evaluate((tid) => {
    const rows = window.__declare.find("app.inboxSide.list.rows");
    return "app.inboxSide.list.rows." + rows.childViews.findIndex((r) => r.tid == tid);
  }, tid);
}
const read = (page, path, attr) => page.evaluate(([p, a]) => window.__declare.find(p)[a], [path, attr]);

export default async ({ drive, expect, page }) => {
  await drive.waitReal(2500);

  // 1 · every conversation, newest first, the new ones marked
  await expect.count("app.inboxSide.list.rows", "ThreadRow", 6);
  await expect.text("app.inboxSide.list.rows.5", "Kestrel Street");

  // 2, 3 · open one; it opens at its latest message
  await drive.click(await row(page, "t2"));
  await drive.waitReal(600);
  const pane = await open(page);
  await expect.attr("app", "openId", "t2");

  // 4 · write and send: it shows at once, pending, before the service answers
  await drive.click("app.convo.chosen.composer.box.field");
  await drive.type("on my way");
  await drive.key("Enter");
  const mine = await lineWhere(page, pane, 'v.msgId.startsWith("local-")');
  expect.equal(mine != null, true);
  await expect.text(mine, "on my way");
  await drive.waitReal(3000);
  const confirmed = await lineWhere(page, pane, 'v.msgId.startsWith("local-")');
  expect.equal(await read(page, confirmed, "pending"), false);
  await expect.text("app.convo.chosen.composer.box.field", "");

  // 6 · react to someone else's message: a hold offers the marks
  const theirs = await lineWhere(page, pane, '!v.mine && v.constructor.name.includes("TextLine")');
  await drive.hold(theirs + ".bubble", 700);
  await drive.settleMotion();
  await expect.visible("app.picker");
  await drive.click('app.picker.row.1');
  await drive.settleMotion();
  await expect.exists(theirs + ".reacts");

  // 5 · send a photograph
  await drive.click("app.convo.chosen.composer.attach");
  await drive.settleMotion();
  await drive.click("app.photos.sheet.2");
  await drive.settleMotion();
  const pic = await lineWhere(page, pane, 'v.src == "photos/send-3.jpg"');
  expect.equal(pic != null, true);

  // 8 · look at it full size, and stop
  await drive.click(pic + ".bubble.pic");
  await drive.settleMotion();
  await expect.visible("app.viewer");
  await drive.key("Escape");
  await drive.settleMotion();
  expect.equal(await read(page, "app", "viewing"), null);

  // 7 · a voice message: play it, then choose a point within it
  await drive.wheel(pane + ".feed", -900);
  await drive.waitReal(500);
  const voice = await lineWhere(page, pane, 'v.ms > 0');
  expect.equal(voice != null, true);
  await drive.click(voice + ".bubble.row.play");
  await drive.waitReal(1500);
  expect.equal(await read(page, "app.deck", "want"), true);
  expect.equal((await read(page, "app.deck", "head")) > 0.3, true);
  await drive.clickAt(voice + ".bubble.row.wave", 150, 18);
  await drive.waitReal(600);
  const head = await read(page, "app.deck", "head");
  const ms = await read(page, voice, "ms");
  expect.equal(head * 1000 > ms * 0.6, true);
  await drive.click(voice + ".bubble.row.play");
  expect.equal(await read(page, "app.deck", "want"), false);

  // 3 · away to another conversation, and back to the same place
  const y0 = await read(page, pane + ".feed", "scrollY");
  await drive.click(await row(page, "t6"));
  await drive.waitReal(400);
  await drive.click(await row(page, "t2"));
  await drive.waitReal(400);
  expect.equal(Math.abs((await read(page, pane + ".feed", "scrollY")) - y0) < 2, true);
};
