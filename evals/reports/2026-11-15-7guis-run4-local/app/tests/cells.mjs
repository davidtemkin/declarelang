// Cells, driven as a person uses it:
// npx declare-verify 7guis.declare --assert tests/cells.mjs

const S = "app.main.stage.cells";
const body = `${S}.grid.body`;
// A cell, found by its name as a screen reader hears it ("B1" or "B1, 3").
const name = (col, row) => String.fromCharCode(65 + col) + row;
const cellAt = (page, col, row) => page.getByRole("gridcell", { name: new RegExp("^" + name(col, row) + "(,|$)") });
const shown = async (drive, id) => {
  const v = await drive.read(`${S}.sheet.value`);
  const col = id.charCodeAt(0) - 65, row = Number(id.slice(1));
  return v.rows[row].cells[col].shown;
};
const eq = (a, b, what) => { if (JSON.stringify(a) != JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

async function enter(drive, page, col, row, text) {
  await cellAt(page, col, row).dblclick();
  await drive.settleMotion();
  const field = page.getByRole("textbox", { name: "Formula of " + name(col, row) });
  await field.fill(text);
  await drive.key("Enter");
  await drive.settleMotion();
}

export default async ({ drive, expect, page }) => {
  await drive.click(`app.side.list."Cells"`);
  await drive.settleMotion();

  // The worked example evaluated on arrival.
  eq(await shown(drive, "D1"), "1.5", "D1");
  eq(await shown(drive, "D4"), "5", "D4");
  await expect(cellAt(page, 3, 4)).toHaveAccessibleName("D4, 5");

  // Double-click edits the formula in place; the edit ends with Return.
  await cellAt(page, 1, 1).dblclick();
  await drive.settleMotion();
  const field = page.getByRole("textbox", { name: "Formula of B1" });
  await expect(field).toHaveValue("3");
  await field.fill("5");
  await drive.key("Enter");
  await drive.settleMotion();
  await expect(field).toHaveCount(0);
  eq(await shown(drive, "B1"), "5", "B1");
  eq(await shown(drive, "D1"), "2.5", "D1 follows B1");
  eq(await shown(drive, "D4"), "6", "D4 follows D1");
  eq(await shown(drive, "B4"), "17", "B4 follows B1");
  // Only B1 and what reads it, each after what it reads.
  const order = await drive.read(`${S}.sheet.lastRecomputed`);
  eq([...order].sort(), ["B1", "B4", "D1", "D4"], "recomputed only the dependents");
  if (order.indexOf("D1") > order.indexOf("D4") || order[0] != "B1") throw new Error("order: " + order);
  // Return moved the selection down, as a spreadsheet does.
  await expect.attr(S, "selected", "B2");

  // Escape abandons an edit.
  await cellAt(page, 2, 1).dblclick();
  await drive.settleMotion();
  await page.getByRole("textbox", { name: "Formula of C1" }).fill("999");
  await drive.key("Escape");
  await drive.settleMotion();
  eq(await shown(drive, "C1"), "0.5", "Escape keeps C1");

  // The language: arithmetic, parentheses, ranges and lists in SUM / PROD, text.
  await enter(drive, page, 5, 0, "=(B1+B2)*2-1");
  eq(await shown(drive, "F0"), "13", "arithmetic");
  await enter(drive, page, 5, 1, "=PROD(B1:B2, 2)");
  eq(await shown(drive, "F1"), "20", "PROD of a range and a number");
  await enter(drive, page, 5, 2, "=sum(F0, F1) / 4");
  eq(await shown(drive, "F2"), "8.25", "lower-case function, a list");
  await enter(drive, page, 5, 3, "hello world");
  eq(await shown(drive, "F3"), "hello world", "text");

  // Errors show in the cell.
  await enter(drive, page, 6, 0, "=1/0");
  eq(await shown(drive, "G0"), "#DIV/0!", "division by zero");
  await enter(drive, page, 6, 1, "=F3+1");
  eq(await shown(drive, "G1"), "#VALUE!", "text in arithmetic");
  await enter(drive, page, 6, 2, "=FOO(A1)");
  eq(await shown(drive, "G2"), "#NAME?", "unknown function");
  await enter(drive, page, 6, 3, "=1+");
  eq(await shown(drive, "G3"), "#SYNTAX", "syntax");
  await enter(drive, page, 6, 4, "=G0*2");
  eq(await shown(drive, "G4"), "#DIV/0!", "an error propagates");
  await enter(drive, page, 6, 5, "=A1:A2");
  eq(await shown(drive, "G5"), "#SYNTAX", "a range outside a function");
  await expect(cellAt(page, 6, 0)).toHaveAccessibleName("G0, #DIV/0!");

  // A cycle, and breaking it.
  await enter(drive, page, 7, 0, "=H1+1");
  await enter(drive, page, 7, 1, "=H0");
  eq(await shown(drive, "H0"), "#CYCLE!", "cycle H0");
  eq(await shown(drive, "H1"), "#CYCLE!", "cycle H1");
  await enter(drive, page, 7, 1, "41");
  eq(await shown(drive, "H0"), "42", "cycle broken");

  // Fixing a cell fixes what reads it.
  await enter(drive, page, 6, 0, "=10/4");
  eq(await shown(drive, "G4"), "5", "G4 recomputed after G0 fixed");

  // The keyboard: arrows move, Enter edits, Delete clears.
  await cellAt(page, 1, 1).click();
  await drive.key("ArrowRight");
  await drive.key("ArrowDown");
  await expect.attr(S, "selected", "C2");
  await drive.key("Delete");
  eq(await shown(drive, "C2"), "", "Delete clears C2");
  eq(await shown(drive, "D2"), "0", "D2 reads the cleared C2 as 0");
  await drive.key("F2");
  await drive.settleMotion();
  await page.getByRole("textbox", { name: "Formula of C2" }).fill("1");
  await drive.key("Enter");
  await drive.settleMotion();
  eq(await shown(drive, "D2"), "2", "D2 after C2 = 1");

  // Scrolling both ways; the headers follow the body.
  await drive.wheel(body, 900);
  await drive.wheel(body, 0, 700);
  await drive.settleMotion();
  const sx = await drive.read(`${body}.scrollX`), sy = await drive.read(`${body}.scrollY`);
  if (!(sx > 0 && sy > 0)) throw new Error(`body should scroll both ways: ${sx}, ${sy}`);
  await expect.approx(`${S}.grid.colHeads.strip`, "x", -sx, 1);
  await expect.approx(`${S}.grid.rowHeads.strip`, "y", -sy, 1);
  // Far corner reachable by the keyboard.
  await drive.click(`${S}.formulaBar`);
  await drive.set(S, "selected", "Y98");
  await page.getByRole("grid", { name: "Spreadsheet" }).focus();
  await drive.key("ArrowRight");
  await drive.key("ArrowDown");
  await drive.key("ArrowDown");               // clamps at Z99
  await drive.settleMotion();
  await expect.attr(S, "selected", "Z99");
  const sy2 = await drive.read(`${body}.scrollY`);
  const h = await drive.read(`${body}.height`);
  if (!(sy2 + h >= 100 * 24 - 1)) throw new Error("Z99 should be scrolled into view: " + sy2);
  await expect.visible(`${body}`);
};
