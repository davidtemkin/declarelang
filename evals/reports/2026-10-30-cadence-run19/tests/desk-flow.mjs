// npx declare-verify my-apps/cadence/cadence.declare --assert my-apps/cadence/checks/desk-flow.mjs
//
// At a desk: correct the last session from the keyboard (↑ for longer, a digit
// for effort, ⌘⏎ to save), see the correction everywhere, then put it back.
// And the year by trackpad: a pinch zooms, "All" glides out to everything.

const read = (page, expr) => page.evaluate((e) => {
  const v = new Function("app", "return " + e)(window.__declare.find("app"));
  return v ?? null;
}, expr);

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.settleMotion();

  const last = await read(page, "({ id: app.last.id, minutes: app.last.minutes, effort: app.last.effort })");
  const weekMinutes = await read(page, "app.weekMinutes");

  await drive.click("app.page.body.now.lastOne");
  await drive.settleMotion();
  await expect.attr("app", "detailId", last.id);
  await page.getByRole("button", { name: "Edit" }).click();
  await drive.settleMotion();
  await expect.attr("app", "entryOpen", true);
  await expect.attr("app", "editId", last.id);

  const harder = last.effort == 8 ? 9 : 8;
  await drive.key("ArrowUp");
  await drive.key("ArrowUp");
  await drive.key(String(harder % 10));
  await drive.key("Meta+Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("PUT", `/api/sessions/${last.id}`, { count: 1, body: { minutes: last.minutes + 10, effort: harder } });
  await expect.equal(await read(page, `app.log.byId("${last.id}").minutes`), last.minutes + 10);
  await expect.attr("app", "weekMinutes", weekMinutes + 10);
  await expect.attr("app", "entryOpen", false);

  // put it back as it was
  await drive.set("app", "editId", last.id);
  await drive.set("app", "entryOpen", true);
  await drive.settleMotion();
  await drive.key("ArrowDown");
  await drive.key("ArrowDown");
  await drive.key(String(last.effort % 10));
  await drive.key("Meta+Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect.equal(await read(page, `app.log.byId("${last.id}").effort`), last.effort);
  await expect.attr("app", "weekMinutes", weekMinutes);

  // the year by trackpad
  const span = await read(page, "app.span");
  await drive.pinch("app.page.body.year.chart", 2);
  await drive.settleMotion();
  const opened = await read(page, "app.span");
  if (!(opened < span)) throw new Error(`trackpad pinch did not zoom in: ${span} → ${opened}`);
  await drive.click("app.page.body.year.tools.All");
  await drive.settleMotion();
  await expect.approx("app", "span", await read(page, "app.hi - app.lo"), 0.5);
  await expect.text("app.page.body.year", "sessions");
};
