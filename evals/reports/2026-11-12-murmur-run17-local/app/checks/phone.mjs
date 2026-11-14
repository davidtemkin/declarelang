// The same app in a hand: a finger taps, holds, swipes and scrubs.
// npx declare-verify my-apps/murmur/murmur.declare --assert my-apps/murmur/checks/phone.mjs

export const device = { width: 390, height: 844, touch: true };

const PANES = "app.convo.chosen.panes";
const read = (page, path, attr) => page.evaluate(([p, a]) => window.__declare.find(p)[a], [path, attr]);
async function row(page, tid) {
  return page.evaluate((tid) => {
    const rows = window.__declare.find("app.inboxSide.list.rows");
    return "app.inboxSide.list.rows." + rows.childViews.findIndex((r) => r.tid == tid);
  }, tid);
}
async function lineWhere(page, pane, test) {
  return page.evaluate(([pane, test]) => {
    const list = window.__declare.find(pane + ".feed.list");
    const f = new Function("v", "return " + test);
    const v = list.childViews.filter((c) => c.msgId != null && f(c)).sort((a, b) => b.rowIndex - a.rowIndex)[0];
    return v ? window.__declare.pathOf(v) : null;
  }, [pane, test]);
}

export default async ({ drive, expect, page }) => {
  await drive.waitReal(2500);

  // a tap opens the conversation over the list
  await drive.click(await row(page, "t2"));
  await drive.settleMotion();
  await expect.attr("app", "openId", "t2");
  await expect.hidden("app.inboxSide");
  const pane = `${PANES}.1`;

  // a finger swipes back through the history; the page itself stays put
  const y0 = await read(page, pane + ".feed", "scrollY");
  await drive.drag(pane + ".feed", 0, 500);
  await drive.waitReal(600);
  expect.equal((await read(page, pane + ".feed", "scrollY")) < y0 - 200, true);

  // holding a message offers the marks
  const theirs = await lineWhere(page, pane, '!v.mine && v.constructor.name.includes("TextLine")');
  await drive.hold(theirs + ".bubble", 700);
  await drive.settleMotion();
  await expect.visible("app.picker");
  await drive.click("app.picker.row.0");
  await drive.settleMotion();

  // a sideways drag along a voice message scrubs it
  const voice = await lineWhere(page, pane, "v.ms > 0");
  if (voice != null) {
    await drive.reveal(voice);
    const v2 = await lineWhere(page, pane, "v.ms > 0");
    await drive.press(v2 + ".bubble.row.wave", 10, 18);
    await drive.moveBy(90, 0);
    await drive.release();
    await drive.waitReal(400);
    expect.equal(await read(page, "app.deck", "want"), true);
    expect.equal((await read(page, "app.deck", "head")) > 0, true);
  }

  // back to the list
  await drive.click("app.convo.chosen.head.0");
  await drive.settleMotion();
  await expect.attr("app", "openId", "");
  await expect.visible("app.inboxSide");
};
