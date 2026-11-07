// The phone case the brief cares most about: finish, tap Log, confirm.
// Then the same session is opened, corrected and deleted, so the service
// ends as it began.
//
//   npx declare-verify my-apps/cadence/cadence.declare --assert my-apps/cadence/checks/log-on-phone.mjs

export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect }) => {
  const read = (path, attr) => drive.page.evaluate(([p, a]) => window.__declare.find(p)[a], [path, attr]);

  await drive.settleData();
  await drive.settleMotion();
  const count0 = await read("app", "weekCount");
  const minutes0 = await read("app", "weekMinutes");

  // two taps and a confirm: Log, Yesterday, Save
  await drive.click("app.dock.dockButton");
  await drive.settleMotion();
  await expect.visible("app.formSheet.entry.saveButton");
  await drive.click("app.formSheet.entry.when.days.1");
  const minutes = await read("app.formSheet.entry", "minutes");
  await drive.click("app.formSheet.entry.saveButton");
  await drive.settleData();
  await drive.settleMotion();

  await expect.request("POST", "/api/sessions", { count: 1 });
  await expect.attr("app", "formOpen", false);
  await expect.attr("app", "weekCount", count0 + 1);
  await expect.attr("app", "weekMinutes", minutes0 + minutes);
  // the figure on screen travelled to the new total
  await expect.attr("app", "shownCount", count0 + 1);

  // it is the newest session for yesterday: open it from the week's bar
  const id = (await read("app", "lastSession")).id;
  await drive.set("app", "openId", id);
  await drive.set("app", "pageId", id);
  await drive.settleMotion();
  await expect.text("app.detail", "Against everything else");

  // correct it: ten minutes longer
  await drive.click("app.detail.page.actions.0");
  await drive.settleMotion();
  await drive.click("app.formSheet.entry.duration.dial.more");
  await drive.click("app.formSheet.entry.duration.dial.more");
  await drive.click("app.formSheet.entry.saveButton");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("PUT", "/api/sessions/" + id, { count: 1, body: { minutes: minutes + 10 } });
  await expect.attr("app", "weekMinutes", minutes0 + minutes + 10);

  // and delete it
  await drive.set("app", "openId", id);
  await drive.set("app", "pageId", id);
  await drive.settleMotion();
  await drive.click("app.detail.page.actions.1");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("DELETE", "/api/sessions/" + id, { count: 1 });
  await expect.attr("app", "weekCount", count0);
  await expect.attr("app", "weekMinutes", minutes0);
};
