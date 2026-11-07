// At a desk: n opens the form, the duration is typed, Return saves. The
// session is then deleted, so the service ends as it began.
//
//   npx declare-verify my-apps/cadence/cadence.declare --assert my-apps/cadence/checks/log-at-desk.mjs

export default async ({ drive, expect }) => {
  const read = (path, attr) => drive.page.evaluate(([p, a]) => window.__declare.find(p)[a], [path, attr]);

  await drive.settleData();
  await drive.settleMotion();
  const count0 = await read("app", "weekCount");

  await drive.key("n");
  await drive.settleMotion();
  await expect.attr("app", "formOpen", true);
  await drive.selectAll("app.formSheet.entry.duration.dial.typed.0");
  await drive.type("40");
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();

  await expect.request("POST", "/api/sessions", { count: 1, body: { minutes: 40 } });
  await expect.attr("app", "formOpen", false);
  await expect.attr("app", "weekCount", count0 + 1);

  const id = (await read("app", "lastSession")).id;
  await drive.set("app", "openId", id);
  await drive.set("app", "pageId", id);
  await drive.settleMotion();
  await drive.click("app.detail.page.actions.1");
  await drive.settleData();
  await expect.request("DELETE", "/api/sessions/" + id, { count: 1 });
  await expect.attr("app", "weekCount", count0);
};
