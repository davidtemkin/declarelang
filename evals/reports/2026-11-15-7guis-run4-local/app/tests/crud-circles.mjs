// CRUD and Circle Drawer, driven as a person uses them:
// npx declare-verify 7guis.declare --assert tests/crud-circles.mjs

const go = (drive, name) => drive.click(`app.side.list."${name}"`);

export default async ({ drive, expect, page }) => {
  // ── 5. CRUD
  await go(drive, "CRUD");
  const C = "app.main.stage.crud";
  const list = page.getByRole("listbox", { name: "People" });
  const rows = list.getByRole("option");
  const update = page.getByRole("button", { name: "Update" });
  const del = page.getByRole("button", { name: "Delete" });
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveText("Emil, Hans");
  await expect(rows.nth(1)).toHaveText("Mustermann, Max");
  await expect(rows.nth(2)).toHaveText("Tisch, Roman");
  await expect(update).toBeDisabled();
  await expect(del).toBeDisabled();

  // The filter, as it is typed.
  const filter = page.getByLabel("Filter prefix");
  await filter.pressSequentially("M");
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toHaveText("Mustermann, Max");
  await filter.fill("");
  await expect(rows).toHaveCount(3);

  // Select, and the fields take the person; Update replaces them.
  await rows.nth(2).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Roman");
  await expect(page.getByLabel("Surname")).toHaveValue("Tisch");
  await expect(update).toBeEnabled();
  await page.getByLabel("Name", { exact: true }).fill("Rosa");
  await update.click();
  await expect(rows.nth(2)).toHaveText("Tisch, Rosa");
  await expect(rows).toHaveCount(3);

  // Create adds, and the new person is the selected one.
  await page.getByLabel("Name", { exact: true }).fill("Erika");
  await page.getByLabel("Surname").fill("Musterfrau");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(3)).toHaveText("Musterfrau, Erika");

  // A filter that hides the selected person leaves nothing selected.
  await filter.fill("E");
  await expect(rows).toHaveCount(1);
  await expect(update).toBeDisabled();
  await filter.fill("");

  // Delete removes the selected person.
  await rows.nth(1).click();
  await expect(page.getByLabel("Surname")).toHaveValue("Mustermann");
  await del.click();
  await expect(rows).toHaveCount(3);
  await expect(list).not.toContainText("Mustermann, Max");
  await expect(del).toBeDisabled();

  // ── 6. Circle Drawer
  await go(drive, "Circle Drawer");
  const K = "app.main.stage.circles";
  const canvas = `${K}.canvas`;
  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });
  await expect(undo).toBeDisabled();

  await drive.clickAt(canvas, 100, 100);
  await drive.clickAt(canvas, 300, 150);
  await drive.clickAt(canvas, 120, 110);    // overlaps the first, but its centre is outside it: a new circle
  let circles = await drive.read(`${K}.drawing.value`);
  if (circles.circles.length != 3) throw new Error("expected 3 circles, got " + circles.circles.length);
  // A click inside a circle draws nothing.
  await drive.clickAt(canvas, 301, 151);
  circles = await drive.read(`${K}.drawing.value`);
  if (circles.circles.length != 3) throw new Error("a click inside a circle drew one");

  // Selection: the nearest circle containing the pointer, filled grey.
  await drive.hover(canvas);
  await drive.press(canvas, 104, 104);      // move the pointer there…
  await drive.release();                    // …a press-release in place is a click inside circle 1: nothing drawn
  await expect.attr(`${K}`, "selectedId", 1);
  await drive.press(canvas, 117, 108);      // inside both 1 and 3, nearer 3's centre
  await drive.release();
  await expect.attr(`${K}`, "selectedId", 3);
  await drive.press(canvas, 600, 400);      // nowhere near one
  await drive.release();
  circles = await drive.read(`${K}.drawing.value`);
  if (circles.circles.length != 4) throw new Error("an empty-spot click should draw: " + circles.circles.length);
  await undo.click();                        // take that one back
  circles = await drive.read(`${K}.drawing.value`);
  if (circles.circles.length != 3) throw new Error("undo of a draw");

  // Right-click the selected circle → Adjust diameter… → the window, a slider.
  await drive.press(canvas, 302, 150);
  await drive.release();
  await expect.attr(`${K}`, "selectedId", 2);
  await drive.clickAt(canvas, 302, 150, { button: "right" });
  await drive.settleMotion();
  await page.getByText("Adjust diameter…").click();
  await drive.settleMotion();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Adjust diameter");
  const slider = page.getByRole("slider", { name: "Diameter" });
  await slider.focus();
  for (let i = 0; i < 20; i++) await drive.key("ArrowRight");
  const live = (await drive.read(`${K}.drawing.value`)).circles.find((c) => c.id == 2).d;
  if (!(live > 40)) throw new Error("diameter should follow the slider while it moves: " + live);
  const doneBefore = (await drive.read(`${K}.drawing.done`)).length;
  await page.getByRole("button", { name: "Done" }).click();
  await drive.settleMotion();
  const doneAfter = (await drive.read(`${K}.drawing.done`)).length;
  if (doneAfter != doneBefore + 1) throw new Error(`closing should make exactly one step: ${doneBefore} → ${doneAfter}`);

  // Undo takes the diameter back in one step; then the circles; Redo puts them back.
  await undo.click();
  const d2 = (await drive.read(`${K}.drawing.value`)).circles.find((c) => c.id == 2).d;
  if (d2 != 40) throw new Error("undo should restore diameter 40, got " + d2);
  await redo.click();
  const d3 = (await drive.read(`${K}.drawing.value`)).circles.find((c) => c.id == 2).d;
  if (d3 != live) throw new Error(`redo should put back ${live}, got ${d3}`);
  await undo.click();
  await undo.click();
  circles = await drive.read(`${K}.drawing.value`);
  if (circles.circles.length != 2) throw new Error("undo of the third circle");
  await expect(redo).toBeEnabled();
  // A new step ends Redo.
  await drive.clickAt(canvas, 500, 300);
  await expect(redo).toBeDisabled();
  // ⌘Z / Ctrl+Z on the canvas.
  await drive.key("Mod+Z");
  circles = await drive.read(`${K}.drawing.value`);
  if (circles.circles.length != 2) throw new Error("Mod+Z should undo: " + circles.circles.length);
  await drive.key("Mod+Shift+Z");
  circles = await drive.read(`${K}.drawing.value`);
  if (circles.circles.length != 3) throw new Error("Mod+Shift+Z should redo: " + circles.circles.length);
};
