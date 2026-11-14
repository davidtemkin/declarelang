// Presenting from the current slide; a click goes on; leaving full screen
// (Esc in a real browser, which the page never hears) ends presenting on the
// slide it reached. Reads the sample presentation "Field notes from the coast".
//
//   npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/presenting.mjs

export default async ({ drive, expect }) => {
  const check = (cond, what) => { if (!cond) throw new Error(what); };
  const ix = await drive.page.evaluate(() => window.__declare.find("app.library").shown.findIndex((d) => d.title == "Field notes from the coast"));
  await drive.click("app.shell.library.body.grid." + ix + ".opener");
  await drive.settleData();
  await drive.settleMotion();
  await drive.click("app.shell.editor.body.rail.list.2");
  await drive.click("app.shell.editor.bar.play");
  await drive.settleMotion();
  check(await drive.read("app.presenting"), "presenting");
  check((await drive.read("app.at")) == 2, "from the current slide");
  await drive.click("app.presenter.room");
  await drive.settleMotion();
  check((await drive.read("app.at")) == 3, "a click goes on");
  await drive.set("app", "fullScreen", false);
  await drive.settleMotion();
  check(!(await drive.read("app.presenting")), "leaving full screen ends presenting");
  check((await drive.read("app.ed.index")) == 3, "on the slide it ended on");
  await expect.hidden("app.presenter.room");
};
