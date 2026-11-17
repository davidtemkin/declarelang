// Murmur on a laptop, against the running service (seed 1).
//
//   npx declare-verify my-apps/murmur/murmur.declare --no-boot \
//       --url http://127.0.0.1:<port>/my-apps/murmur/murmur.declare --assert my-apps/murmur/tests/desktop.mjs
//
// The service's schedule starts when the app's socket connects, which is just
// after the history arrives — about when this script starts. Times below are
// offsets from then (see the API's schedule): t3 hears from Dana at 6.1 s,
// t6 from Mei at 12 s, a reaction lands in t1 at 16.5 s.

export const device = { width: 1440, height: 900, touch: false };

const pane = (id) => `app.main.panes.${Number(id.slice(1)) - 1}`;

export default async ({ drive, expect, page }) => {
  const app = (fn, ...args) => page.evaluate(fn, ...args);
  const order = () => app(() => window.__declare.find("app").inbox.value.rows.map((r) => r.id));
  const thread = (id) => app((id) => {
    const t = window.__declare.find("app").chat.value.threads.find((t) => t.id == id);
    return { n: t.messages.length, last: t.messages[t.messages.length - 1], lastSeen: t.lastSeen };
  }, id);
  const started = Date.now();
  const until = async (ms) => { const left = ms - (Date.now() - started); if (left > 0) await drive.waitReal(left); };

  // ── the list: most recent activity first
  const first = await order();
  expect.equal(first[0], "t3");

  // ── a message arrives while the reader is further back (t3, 6.1 s)
  await page.getByRole("button", { name: /^Dana Ruiz/ }).click();
  await drive.settleMotion();
  await expect.attr(`${pane("t3")}`, "visible", true);
  await expect.attr(`${pane("t3")}`, "atEnd", true);
  await drive.wheel(`${pane("t3")}.body`, -900);
  await drive.waitReal(400);
  await expect.attr(`${pane("t3")}`, "atEnd", false);
  const yBefore = await drive.read(`${pane("t3")}.body.scrollY`);
  const rowBefore = await drive.read(`${pane("t3")}.body.col.list.firstVisibleRow`);
  const nBefore = (await thread("t3")).n;
  await until(7500);
  const after = await thread("t3");
  expect.equal(after.n, nBefore + 1);                                        // it arrived
  expect.equal(await drive.read(`${pane("t3")}.body.scrollY`), yBefore);     // the words stayed put
  expect.equal(await drive.read(`${pane("t3")}.body.col.list.firstVisibleRow`), rowBefore);
  await expect.visible(`${pane("t3")}.body.toEnd`);
  await expect.text(`${pane("t3")}.body.toEnd`, "1 new message");
  expect.equal(after.lastSeen == after.last.id, false);                      // not read yet
  await drive.click(`${pane("t3")}.body.toEnd`);
  await drive.waitReal(800);
  await expect.attr(`${pane("t3")}`, "atEnd", true);
  expect.equal((await thread("t3")).lastSeen, (await thread("t3")).last.id); // read once seen

  // ── the list reorders as messages land (t6 at 12 s, while the list is on screen)
  await until(12800);
  expect.equal((await order())[0], "t6");

  // ── sending shows at once, then is confirmed
  // Typed and sent as a person does; the service answers within the step, so
  // the shown-at-once check is a second send made and read in one turn, where
  // no answer can have arrived yet.
  await drive.click(`${pane("t3")}.composer.row.box.field`);
  await drive.type("sounds good, see you then");
  await drive.key("Enter");
  let t3 = await thread("t3");
  expect.equal(t3.last.text, "sounds good, see you then");
  expect.equal((await order())[0], "t3");
  const shownAtOnce = await app((p) => {
    const a = window.__declare.find("app"), c = window.__declare.find(p);
    c.draft = "and bring the ladder"
    c.send()
    const t = a.chat.value.threads.find((t) => t.id == "t3")
    const m = t.messages[t.messages.length - 1]
    return { text: m.text, pending: m.pending ?? false }
  }, `${pane("t3")}.composer`);
  expect.equal(shownAtOnce.text, "and bring the ladder");
  expect.equal(shownAtOnce.pending, true);
  await expect.attr(`${pane("t3")}.composer`, "draft", "");
  await drive.waitReal(2600);
  t3 = await thread("t3");
  expect.equal(t3.last.from, "p4");                                          // Dana answered
  const mine = await app(() => window.__declare.find("app").chat.value.threads.find((t) => t.id == "t3")
    .messages.filter((m) => m.text == "sounds good, see you then"));
  expect.equal(mine.length, 1);
  expect.equal(mine[0].pending ?? false, false);
  expect.equal(mine[0].id.includes("local"), false);

  // ── returning to a conversation returns to where you were
  await page.getByRole("button", { name: /^Book club/ }).click();
  await drive.settleMotion();
  await drive.wheel(`${pane("t6")}.body`, -2400);
  await drive.waitReal(400);
  const y6 = await drive.read(`${pane("t6")}.body.scrollY`);
  await page.getByRole("button", { name: /^Priya Raman/ }).click();
  await drive.settleMotion();
  await page.getByRole("button", { name: /^Book club/ }).click();
  await drive.settleMotion();
  expect.equal(await drive.read(`${pane("t6")}.body.scrollY`), y6);

  // ── a reaction: from the button beside a message, onto the message
  const words = page.getByText("chapter eleven is my favourite chapter", { exact: true });
  if (await words.count() == 0) throw new Error("expected the t6 message to be in view");
  await words.hover();
  await page.getByRole("button", { name: "React", exact: true }).click();
  await drive.settleMotion();
  await page.getByRole("button", { name: "React with 🔥" }).click();
  await drive.settleMotion();
  const reacted = await app(() => window.__declare.find("app").chat.value.threads.find((t) => t.id == "t6")
    .messages.find((m) => m.text == "chapter eleven is my favourite chapter"));
  expect.equal(reacted.reactions.some((r) => r.person == "p1" && r.emoji == "🔥"), true);
  await expect(page.getByRole("button", { name: /^Reactions: 🔥/ })).toBeVisible();

  // ── the 30,500-message conversation, by its scroll thumb: to the first message and back
  await page.getByRole("button", { name: /^Trail crew/ }).click();
  await drive.settleMotion();
  await drive.waitReal(500);
  const box = await page.evaluate((p) => {
    const v = window.__declare.find(p);
    const r = v.globalRect ? v.globalRect() : null;
    return r;
  }, `${pane("t4")}.body`);
  const bx = 380 + (1440 - 380) - 6, top = 61, bottom = 900 - 64;
  await page.mouse.move(bx, bottom - 6);
  await page.mouse.down();
  await page.mouse.move(bx, (top + bottom) / 2, { steps: 8 });
  await page.mouse.move(bx, top - 40, { steps: 8 });
  await page.mouse.up();
  await drive.waitReal(1200);
  expect.equal(await drive.read(`${pane("t4")}.body.scrollY`), 0);
  expect.equal(await drive.read(`${pane("t4")}.body.col.list.firstVisibleRow`), 0);
  await expect.visible(`${pane("t4")}.body.col.intro`);
  await page.mouse.move(bx, top + 4);
  await page.mouse.down();
  await page.mouse.move(bx, (top + bottom) / 2, { steps: 8 });
  await page.mouse.move(bx, bottom + 60, { steps: 8 });
  await page.mouse.up();
  await drive.waitReal(1200);
  await expect.attr(`${pane("t4")}`, "atEnd", true);

  // ── a photograph at full size, and put away (Priya's, near her newest)
  await page.getByRole("button", { name: /^Priya Raman/ }).click();
  await drive.settleMotion();
  const photo = page.getByRole("button", { name: /^Photograph: / }).last();
  await photo.click();
  await drive.settleMotion();
  await expect.attr("app.viewer", "shown", true);
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.attr("app.viewer", "shown", false);
  await page.getByRole("button", { name: /^Trail crew/ }).click();
  await drive.settleMotion();

  // ── sending a photograph
  const n4 = (await thread("t4")).n;
  await drive.click(`${pane("t4")}.composer.row.photo`);
  await drive.settleMotion();
  await page.getByRole("button", { name: /^Send photograph: Aurora/ }).click();
  await drive.settleMotion();
  const t4 = await thread("t4");
  expect.equal(t4.n, n4 + 1);
  expect.equal(t4.last.kind, "photo");
  expect.equal(t4.last.src, "photos/send-3.jpg");
};
