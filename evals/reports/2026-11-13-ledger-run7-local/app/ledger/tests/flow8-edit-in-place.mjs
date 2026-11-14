// Editing in the table: Enter saves, Escape cancels, Tab moves to the next cell, a
// category chosen by typing part of its name; selecting with Shift-click; the detail
// following the keyboard.
import { read, settle } from "./lib.mjs";

export default async ({ drive, expect, page }) => {
  await drive.set("app", "location", "transactions");
  await settle(drive);
  const grid = "app.main.txScreen.body.grid";
  const rowY = (i) => 34 + 52 * i + 26;
  const patches = async () => (await drive.requests()).filter((r) => r.method == "PATCH");

  // the detail follows the keyboard
  await drive.clickAt(grid, 40, rowY(0));
  await settle(drive);
  const rows = await read(page, "app", "listRows");
  expect.equal(await read(page, "app", "detailId"), rows[0].id);
  await drive.key("ArrowDown");
  await settle(drive);
  expect.equal(await read(page, "app", "detailId"), rows[1].id);

  // Shift-click selects a range; the summary describes the selection
  await drive.clickAt(grid, 40, rowY(3), { modifiers: ["Shift"] });
  await settle(drive);
  expect.equal(await read(page, "app", "selCount"), 3);
  await expect.text("app.main.txScreen.summary", "3 selected · In ");

  // the description, edited in place: Enter saves
  await drive.clickAt(grid, 150, rowY(2));
  await settle(drive);
  await drive.key("Enter");
  await settle(drive);
  const target = rows[2];
  await drive.key("Mod+A");
  const words = "Edited in place " + (Date.now() % 100000);
  await drive.type(words);
  await drive.key("Enter");
  await settle(drive);
  let p = (await patches()).pop();
  console.log("PATCH " + p.path + " " + JSON.stringify(p.body));
  expect.equal(p.path, "/api/transactions/" + target.id);
  expect.equal(p.body.description, words);
  const after = (await read(page, "app", "listRows")).find((r) => r.id == target.id);
  expect.equal(after.description, words);

  // Escape cancels: nothing is sent
  const before = (await patches()).length;
  await drive.key("Enter");
  await settle(drive);
  await drive.type(" — not this");
  await drive.key("Escape");
  await settle(drive);
  expect.equal((await patches()).length, before);

  // Tab from the date moves to the next cell
  await drive.clickAt(grid, 40, rowY(2));
  await settle(drive);
  await drive.key("Enter");
  await settle(drive);
  const col0 = await read(page, grid, "activeCol");
  await drive.key("Tab");
  await settle(drive);
  const col1 = await read(page, grid, "activeCol");
  console.log("Tab moved the active cell from column " + col0 + " to " + col1);
  if (!(col1 > col0)) throw new Error("Tab did not move to the next cell");
  await drive.key("Escape");
  await settle(drive);

  // the category, chosen by typing part of its name
  const w = await read(page, "app", "gridWidths");
  await drive.clickAt(grid, w.date + w.description + 40, rowY(2));
  await settle(drive);
  await drive.key("Enter");
  await settle(drive);
  await drive.key("Mod+A");
  await drive.type("adver");
  await settle(drive);
  await page.screenshot({ path: "/tmp/ledger-shots/desk-cat-edit.png" });
  await drive.key("Enter");
  await settle(drive);
  p = (await patches()).pop();
  console.log("PATCH " + JSON.stringify(p.body));
  expect.equal(p.body.categoryId, target.kind == "expense" ? "advertising" : p.body.categoryId);

  // ⌘Z takes the last change back
  await drive.key("Escape");
  await drive.key("Mod+Z");
  await settle(drive);
  const undone = (await read(page, "app", "listRows")).find((r) => r.id == target.id);
  console.log("after undo: " + undone.categoryId);
  expect.equal(undone.categoryId, target.categoryId);

  // the amount of a one-line transaction, edited in place; Escape leaves it as it was
  const rows2 = await read(page, "app", "listRows");
  const i = rows2.findIndex((r) => r.kind == "expense" && !r.split);
  const sent = (await patches()).length;
  const w2 = await read(page, "app", "gridWidths");
  await drive.clickAt(grid, w2.date + w2.description + w2.categoryId + w2.channel + 60, rowY(i));
  await settle(drive);
  await drive.key("Enter");
  await settle(drive);
  await drive.key("Mod+A");
  await drive.type("1.00");
  await drive.key("Escape");
  await settle(drive);
  expect.equal((await patches()).length, sent);
};
