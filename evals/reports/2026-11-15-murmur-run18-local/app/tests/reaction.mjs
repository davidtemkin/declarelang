// A reaction that makes a message larger does not disturb what is being read.
//
// The service's own scheduled reactions in this seed land on messages that
// already carry one (they widen a pill, never grow a message), so the growth
// is driven here through the same path a live frame takes, `app.receive`, with
// a reaction frame for a message just above what the reader is looking at.

export const device = { width: 1440, height: 900, touch: false };

export default async ({ drive, expect, page }) => {
  const pane = "app.main.panes.0";
  await page.getByRole("button", { name: /^Kestrel Street/ }).click();
  await drive.settleMotion();
  await drive.wheel(`${pane}.body`, -1600);
  await drive.waitReal(600);

  // the first text message fully in view, and an unreacted message above it
  const pick = await page.evaluate((p) => {
    const a = window.__declare.find("app");
    const list = window.__declare.find(p + ".body.col.list");
    const msgs = a.chat.value.threads.find((t) => t.id == "t1").messages;
    const first = list.firstVisibleRow;
    let read = first + 2;
    while (msgs[read].kind != "text") read++;
    let above = first - 1;
    while (above > 0 && (msgs[above].reactions ?? []).length > 0) above--;
    return { read: msgs[read].text, above: msgs[above].id, aboveText: msgs[above].text ?? "" };
  }, pane);
  const words = page.getByText(pick.read, { exact: true }).first();
  const box0 = await words.boundingBox();
  if (box0 == null) throw new Error("the words to watch are not on screen");
  const y0 = await drive.read(`${pane}.body.scrollY`);

  await page.evaluate((id) => window.__declare.find("app").receive(
    { t: "reaction", thread: "t1", message: id, person: "p2", emoji: "❤️" }), pick.above);
  await drive.settleMotion();
  await drive.waitReal(200);

  const grown = await page.evaluate((id) => window.__declare.find("app").chat.value.threads
    .find((t) => t.id == "t1").messages.find((m) => m.id == id).reactions.length, pick.above);
  expect.equal(grown, 1);
  const box1 = await words.boundingBox();
  expect.equal(Math.round(box1.y), Math.round(box0.y));            // the words did not move
  const y1 = await drive.read(`${pane}.body.scrollY`);
  if (!(y1 > y0)) throw new Error(`the pane should absorb the growth above (scrollY ${y0} → ${y1})`);

  // at the newest: a reaction on the newest message keeps the newest in view
  await drive.click(`${pane}.body.toEnd`);
  await drive.waitReal(800);
  await expect.attr(pane, "atEnd", true);
  const newest = await page.evaluate(() => {
    const t = window.__declare.find("app").chat.value.threads.find((t) => t.id == "t1");
    return t.messages[t.messages.length - 1].id;
  });
  await page.evaluate((id) => window.__declare.find("app").receive(
    { t: "reaction", thread: "t1", message: id, person: "p5", emoji: "👍" }), newest);
  await drive.settleMotion();
  await drive.waitReal(200);
  await expect.attr(pane, "atEnd", true);
};
