// The core flows, as a person does them, against the seeded service on :8330.
//   npx declare-verify my-apps/murmur/murmur.declare --assert my-apps/murmur/flow.mjs

export default async ({ drive, expect, page }) => {
  const read = (expr) => page.evaluate(expr);
  await drive.waitReal(1500);                               // the history has arrived

  // The list is most recent first, and says what is new.
  await expect.text("app.list.head", "5 new");

  // Opening a conversation reads it.
  await drive.click('app.list.list.rows."Kestrel Street, 3 unread"');
  await drive.settleMotion();
  await expect.attr("app", "openId", "t1");
  await expect.equal(await read(() => window.__declare.find("app").murmur.unreadIn("t1")), 0);

  // Sending shows at once, before the service answers.
  await drive.click("app.convo.panes.0.composer.field");
  await drive.type("bins are out");
  await drive.key("Enter");
  await expect.equal(await read(() => {
    const t = window.__declare.find("app").murmur.thread("t1");
    const m = t.messages[t.messages.length - 1];
    return m.text + "|" + m.from;
  }), "bins are out|p1");
  await expect.request("GET", "/threads.json");

  // The conversation answers, and the new message comes into view at the bottom.
  await drive.waitReal(3000);
  await expect.attr("app.convo.panes.0", "atBottom", true);

  // Scrolled back, your place holds when something arrives, and you are told.
  await drive.wheel("app.convo.panes.0.scroller", -2400);
  await drive.settleMotion();
  const before = await read(() => window.__declare.find("app.convo.panes.0.scroller").scrollY);
  await drive.waitReal(25000);                              // Kwame writes in at ~29s
  await expect.equal(await read(() => window.__declare.find("app.convo.panes.0.scroller").scrollY), before);
  await expect.visible("app.convo.panes.0.scroller.jump");

  // Another conversation, then back: where you were.
  await drive.click('app.list.list.rows."Trail crew"');
  await drive.settleMotion();
  await drive.click('app.list.list.rows."Kestrel Street, 1 unread"');
  await drive.settleMotion();
  await expect.equal(await read(() => window.__declare.find("app.convo.panes.0.scroller").scrollY), before);
};
