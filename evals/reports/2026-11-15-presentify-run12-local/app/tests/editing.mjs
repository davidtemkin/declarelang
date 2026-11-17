// Editing rules from the brief, §3–§6, driven by real input against the service:
//   npx declare-verify my-apps/presentify/presentify.declare \
//     --url http://127.0.0.1:8200/my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/editing.mjs

const S = "app.editor.body.stage";
const P = S + ".paper";
const val = (page, expr) => page.evaluate((e) => JSON.parse(JSON.stringify(new Function("app", "return " + e)(window.__declare.find("app")))), expr);
const near = (a, b, tol, what) => { if (Math.abs(a - b) > tol) throw new Error(`${what}: ${a} is not ${b}`); };

export default async ({ drive, expect, page }) => {
  await drive.click("app.home.bar.2");
  await drive.settleData(); await drive.settleMotion();
  const z = await val(page, "app.zoom");
  const at = (x, y) => [Math.round(x * z), Math.round(y * z)];
  await drive.type("Editing rules"); await drive.key("Enter");

  // A rectangle drawn, then rounded by its corner handle.
  await drive.click("app.editor.bar.tools.Rectangle");
  await drive.press(P, ...at(100, 100)); await drive.moveBy(Math.round(400 * z), Math.round(200 * z)); await drive.release();
  let r = await val(page, "app.ed.els[0]");
  near(r.width, 400, 2, "drawn width"); near(r.height, 200, 2, "drawn height");
  await drive.drag(S + ".frame.radius", 30, 30);
  r = await val(page, "app.ed.els[0]");
  if (r.cornerRadius < 40) throw new Error("radius handle did not round the corners: " + r.cornerRadius);
  const radius = r.cornerRadius;

  // Made wider by its east handle: the corners keep their radius.
  await drive.drag(S + ".frame.5", Math.round(200 * z), 0);
  r = await val(page, "app.ed.els[0]");
  near(r.width, 600, 3, "widened"); near(r.height, 200, 1, "height kept"); await expect.equal(r.cornerRadius, radius);
  await expect.equal(await val(page, "app.history.undoLabel"), "Resize");

  // Shift while resizing keeps proportions; "Keep proportions" keeps them without it; shift then frees them once.
  const ratio = r.width / r.height;
  await page.keyboard.down("Shift");
  await drive.drag(S + ".frame.6", Math.round(150 * z), Math.round(10 * z));
  await page.keyboard.up("Shift");
  r = await val(page, "app.ed.els[0]");
  near(r.width / r.height, ratio, 0.02, "shift-resize ratio");
  await page.getByRole("checkbox", { name: "Keep proportions" }).click();
  await expect.equal(await val(page, "app.ed.els[0].keepProportions"), true);
  await drive.drag(S + ".frame.6", Math.round(-200 * z), 0);
  r = await val(page, "app.ed.els[0]");
  near(r.width / r.height, ratio, 0.02, "kept ratio");
  await page.keyboard.down("Shift");
  await drive.drag(S + ".frame.5", Math.round(100 * z), 0);
  await page.keyboard.up("Shift");
  r = await val(page, "app.ed.els[0]");
  if (Math.abs(r.width / r.height - ratio) < 0.05) throw new Error("shift did not free the proportions");

  // Nudges: one point, ten with shift.
  const x0 = r.x;
  await drive.key("ArrowRight"); await drive.key("Shift+ArrowRight");
  near(await val(page, "app.ed.els[0].x"), x0 + 11, 0.01, "nudged");

  // Undo puts the selection back as it was.
  await drive.key("Escape");
  await expect.equal(await val(page, "app.ed.sel.length"), 0);
  await drive.key("Mod+Z");
  await expect.equal((await val(page, "app.ed.sel")).length, 1);
  near(await val(page, "app.ed.els[0].x"), x0 + 1, 0.01, "one nudge undone");
  await drive.key("Mod+Shift+Z");
  near(await val(page, "app.ed.els[0].x"), x0 + 11, 0.01, "redone");

  // A text box left empty disappears; no step is left behind.
  const steps = await val(page, "app.history.past.length");
  await drive.click("app.editor.bar.tools.Text");
  await drive.clickAt(P, ...at(900, 600));
  await drive.settleMotion();
  await drive.key("Escape");
  await expect.equal(await val(page, "app.ed.els.length"), 1);
  await expect.equal(await val(page, "app.history.past.length"), steps);

  // Duplicate, marquee, order, copy and paste.
  await drive.click(P + ".art.0");
  await drive.key("Mod+D");
  await expect.equal(await val(page, "app.ed.els.length"), 2);
  const [a, b] = await val(page, "app.ed.els");
  near(b.x - a.x, 20, 0.01, "duplicate offset");
  await expect.equal(await val(page, "app.ed.sel[0]"), b.id);
  await page.getByRole("button", { name: "Send to back" }).click();
  await expect.equal(await val(page, "app.ed.els[0].id"), b.id);
  await drive.key("Escape");
  await drive.press(P, ...at(20, 20)); await drive.moveBy(Math.round(1000 * z), Math.round(500 * z)); await drive.release();
  await expect.equal((await val(page, "app.ed.sel")).length, 2);
  await drive.key("Mod+C");
  await drive.key("Mod+V");
  await expect.equal(await val(page, "app.ed.els.length"), 4);

  // Slides: new, keyboard through the list, delete — and the last can't go.
  await page.getByRole("button", { name: "New slide" }).click();
  await drive.settleMotion();
  await expect.equal(await val(page, "app.ed.count"), 2);
  await drive.key("Mod+V");            // paste works on another slide
  await expect.equal(await val(page, "app.ed.els.length"), 2);
  await page.getByRole("button", { name: "Slide 2", exact: true }).click();
  await drive.key("ArrowUp");
  await expect.equal(await val(page, "app.ed.index"), 0);
  await drive.key("ArrowDown");
  await expect.equal(await val(page, "app.ed.index"), 1);
  await drive.key("Delete");
  await expect.equal(await val(page, "app.ed.count"), 1);
  await expect.equal(await val(page, "app.history.undoLabel"), "Delete slide");
  await drive.key("Mod+Z");
  await expect.equal(await val(page, "app.ed.count"), 2);
  await drive.key("Delete"); await drive.key("Delete");
  await expect.equal(await val(page, "app.ed.count"), 1);
  await expect.equal(await page.getByRole("button", { name: "Delete slide" }).isDisabled(), true);

  // Paste across presentations: into the first presentation in the list.
  await drive.wait(1500); await drive.settleData();
  await expect.equal(await val(page, "app.saver.status"), "saved");
  const mine = await val(page, "app.loadedId");
  await drive.click("app.editor.bar.left.back");
  await drive.settleData(); await drive.settleMotion();
  await expect.equal(await val(page, "app.location"), "");
  await drive.click("app.home.page.grid.1.face");
  await drive.settleData(); await drive.settleMotion();
  const other = await val(page, "app.loadedId");
  if (other == mine) throw new Error("opened the same presentation");
  await page.getByRole("button", { name: "Slide 1", exact: true }).click();
  const n = await val(page, "app.ed.els.length");
  await drive.key("Mod+V");
  await expect.equal(await val(page, "app.ed.els.length"), n + 2);
  await drive.key("Mod+Z");
  await expect.equal(await val(page, "app.ed.els.length"), n);
  await drive.wait(1500); await drive.settleData();
  await expect.equal(await val(page, "app.saver.status"), "saved");
};
