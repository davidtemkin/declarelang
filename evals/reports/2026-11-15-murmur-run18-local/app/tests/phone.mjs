// Murmur on a phone (390 × 844, touch), against the running service.
//
//   npx declare-verify my-apps/murmur/murmur.declare --no-boot \
//       --url http://127.0.0.1:<port>/my-apps/murmur/murmur.declare --assert my-apps/murmur/tests/phone.mjs

export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect, page }) => {
  const app = (fn, ...args) => page.evaluate(fn, ...args);
  const t2 = "app.main.panes.1";
  const lastOf = (id) => app((id) => {
    const t = window.__declare.find("app").chat.value.threads.find((t) => t.id == id);
    return t.messages[t.messages.length - 1];
  }, id);

  // ── the list, then a conversation sliding over it
  await expect.attr("app", "slide", 0);
  await page.getByRole("button", { name: /^Priya Raman/ }).click();
  await drive.settleMotion();
  await expect.attr("app", "slide", 1);
  await expect.attr(t2, "visible", true);
  await expect.attr(t2, "atEnd", true);

  // ── a voice message: its length before it plays
  const play = page.getByRole("button", { name: /^Play voice message/ });
  for (let i = 0; i < 12 && (await play.count()) == 0; i++) {
    await drive.drag(`${t2}.body`, 0, 420);                 // a finger, swiping back through the history
    await drive.waitReal(300);
  }
  if ((await play.count()) == 0) throw new Error("no voice message found swiping back");
  const label = await play.last().getAttribute("aria-label");
  expect.equal(/Play voice message, \d+:\d\d/.test(label), true);
  await play.last().click();
  await drive.waitReal(1500);
  await expect.attr("app", "voicePlaying", true);
  const head = await drive.read("app.head");
  if (!(head > 0.4)) throw new Error("the playhead did not move: " + head);

  // ── and a point chosen within it, directly
  const total = await app(() => {
    const a = window.__declare.find("app");
    const t = a.chat.value.threads.find((t) => t.id == "t2");
    return (t.messages.find((m) => m.id == a.voiceId)?.durationMs ?? 0) / 1000;
  });
  // the one that is playing is the last one built: the one just pressed
  const b = await page.getByRole("slider", { name: "Position in voice message" }).last().boundingBox();
  await page.touchscreen.tap(b.x + b.width * 0.75, b.y + b.height / 2);
  await drive.waitReal(300);
  const at = await drive.read("app.head");
  if (Math.abs(at - total * 0.75) > total * 0.12) throw new Error(`seek landed at ${at}, wanted ~${total * 0.75}`);
  await page.getByRole("button", { name: "Pause" }).click();
  await drive.waitReal(200);
  await expect.attr("app", "voicePlaying", false);

  // ── back to the list and in again: the same place
  await drive.waitReal(400);
  const y = await drive.read(`${t2}.body.scrollY`);
  await page.getByRole("button", { name: "Conversations" }).click();
  await drive.settleMotion();
  await expect.attr("app", "slide", 0);
  await page.getByRole("button", { name: /^Priya Raman/ }).click();
  await drive.settleMotion();
  expect.equal(await drive.read(`${t2}.body.scrollY`), y);

  // ── a reaction by pressing and holding a message
  await drive.click(`${t2}.body.toEnd`);
  await drive.waitReal(800);
  await drive.settleMotion();
  await drive.hold(`${t2}.body.col.list."everything is warmer in person"`, 700);
  await drive.settleMotion();
  await expect.attr("app.reactPicker", "shown", true);
  await page.getByRole("button", { name: "React with 😂" }).click();
  await drive.settleMotion();
  const reacted = await app(() => window.__declare.find("app").chat.value.threads.find((t) => t.id == "t2")
    .messages.find((m) => m.text == "everything is warmer in person"));
  expect.equal(reacted.reactions.some((r) => r.person == "p1" && r.emoji == "😂"), true);

  // ── sending a photograph, from the picker
  await drive.click(`${t2}.composer.row.photo`);
  await drive.settleMotion();
  await page.getByRole("button", { name: /^Send photograph: Alpine/ }).click();
  await drive.settleMotion();
  const sent = await lastOf("t2");
  expect.equal(sent.kind, "photo");
  expect.equal(sent.src, "photos/send-4.jpg");
  await expect.attr(t2, "atEnd", true);

  // ── and looking at it full size, then putting it away
  await drive.waitReal(1500);
  await drive.settleMotion();
  await page.getByRole("button", { name: "Photograph: Alpine Forest in Fog" }).last().click();
  await drive.settleMotion();
  await expect.attr("app.viewer", "shown", true);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await drive.settleMotion();
  await expect.attr("app.viewer", "shown", false);

  // ── writing and sending with the button
  await drive.click(`${t2}.composer.row.box.field`);
  await drive.type("on my way");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await drive.settleMotion();
  expect.equal((await lastOf("t2")).text, "on my way");
};
