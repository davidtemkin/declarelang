// The to-do app's behaviour, driven as a person would:
//   npx declare-verify apps/todo/todo.declare --assert apps/todo/tests/assert.mjs
//
// Lines (every task, in every list, by group): 0 Overdue · 1 Renew (flagged) · 2 Reply ·
// 3 Today · 4 Q4 memo (flagged) · 5 Call Mum · 6 Next 7 days · 7–11 · 12 Later · 13–14 ·
// 15 Someday · 16–17 · 18 Done · 19–21. A row folded out of the view is 0 high.

const L = (i) => "app.main.col.list." + i;
const count = "app.main.col.top.titleRow";
const tasks = (drive) => drive.page.evaluate(() => window.__declare.find("app").tasks.all().map((t) => ({ id: t.id, done: t.done, important: t.important })));

export default async ({ drive, expect }) => {
  await drive.settleData();
  await drive.settleMotion();

  // Today: overdue and today only
  await expect.approx(L(2), "height", 56, 1);
  await expect.approx(L(7), "height", 0, 1);           // due next week: folded
  await expect.approx(L(12), "height", 0, 1);          // the Later heading: folded

  // Important: only flagged tasks
  await drive.set("app", "location", "important");
  await drive.settleMotion();
  await expect.approx(L(1), "height", 56, 1);
  await expect.approx(L(2), "height", 0, 1);

  // All
  await drive.set("app", "location", "all");
  await drive.settleMotion();
  await expect.approx(L(7), "height", 56, 1);
  await expect.text(count, "13");

  // Open a task in place, then close it
  await drive.click(L(4) + ".face.opener");
  await drive.settleMotion();
  await expect.exists(L(4) + ".card");
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.approx(L(4), "height", 56, 1);

  // Tick "Reply to the venue": it leaves Overdue and travels to the (closed) Done group
  await drive.click(L(2) + ".face.check");
  await drive.settleMotion();
  await expect.text(L(2), "Today");
  await expect.text(count, "12");

  // Add from the New task panel: Return adds the task and closes the panel
  await drive.click("app.toolbar.plus");
  await drive.settleMotion();
  await drive.type("Buy milk");
  await drive.key("Enter");
  await drive.settleMotion();
  await expect.text(count, "13");
  await expect.attr("app", "adding", false);

  // Delete it from its open card, and undo. (Its line: ask the list's own records.)
  const milk = await drive.page.evaluate(() => window.__declare.find("app").lines.value.lines.findIndex((l) => l.title == "Buy milk"));
  await drive.click(L(milk) + ".face.opener");
  await drive.settleMotion();
  await expect.text(L(milk), "Buy milk");
  await drive.click(L(milk) + ".card.foot.0");
  await drive.settleMotion();
  await expect.text(count, "12");
  await drive.key("Meta+z");
  await drive.settleMotion();
  await expect.text(count, "13");

  // A list is a place
  await drive.set("app", "location", "work");
  await drive.settleMotion();
  await expect.text(count, "Work");
  await expect.approx(L(1), "height", 0, 1);           // Renew is an errand

  // On a phone (the app loads again, fresh): a finger swipes "Call Mum" done,
  // swipes "Reply" important, and the round button opens the add sheet
  await drive.device({ width: 390, height: 844, touch: true });
  await drive.settleData();
  await drive.set("app", "location", "all");           // the reload kept the URL's #work
  await drive.settleMotion();
  // On a phone an unflagged row has no flag control at all, so a tap at the
  // end of the row can't flag it (it used to be there, invisible). Read before
  // the swipe below: a done task leaves the list, and the rows after it move up
  await expect.hidden(L(5) + ".face.flag");
  await drive.drag(L(5) + ".face", 160, 0);
  await drive.settleMotion();
  await expect.equal((await tasks(drive)).find((t) => t.id == 2).done, true);
  await drive.drag(L(2) + ".face", -160, 0);
  await drive.settleMotion();
  await expect.equal((await tasks(drive)).find((t) => t.id == 4).important, true);

  // The round button opens the add sheet. With no name, Add can't be
  // pressed and Return adds nothing; with one, Add adds and the sheet goes.
  await drive.click("app.fabDock.fab");
  await drive.settleMotion();
  await expect.attr("app", "adding", true);
  await expect.attr("app.addSheet.entry.top.add", "disabled", true);
  await drive.click("app.addSheet.entry.top.field");    // on a phone you tap the field first
  await drive.key("Enter");
  await drive.settleMotion();
  await expect.attr("app", "adding", true);
  await drive.type("Call the bank");
  await expect.attr("app.addSheet.entry.top.add", "disabled", false);
  await drive.click("app.addSheet.entry.top.add");
  await drive.settleMotion();
  await expect.attr("app", "adding", false);
  await expect.equal((await tasks(drive)).some((t) => t.id == 17), true);
};
