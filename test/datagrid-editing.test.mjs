// datagrid-editing — a DataGrid cell's editing, in Chrome through declare-verify,
// where a field's selection is the native field's: a cell entered by Enter or F2
// starts with its text selected, so what is typed replaces it — the grid's own
// field, a text field in an editor of your own, and a combobox's entry. And ⌘A
// on a selected cell selects every row.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-grid-edit-");
const run = (file, script) => spawnSync("node", [join(ROOT, "tools", "verify.mjs"), file, "--assert", script], { cwd: ROOT, encoding: "utf8" });

writeFileSync(join(DIR, "grid.declare"), `class NoteEdit extends View [ width = 100%, height = 100%,
    f: TextInput [ width = 100%, accessibilityLabel = "Note edit", value = { "" + :n }, commit(v: string) { :n = v } ] ]
class CatEdit extends View [ width = 100%, height = 100%,
    c: Combobox [ width = 100%, accessibilityLabel = "Category", items = { ["Software", "Advertising"] },
        value = { :cat }, commit(v: object) { :cat = v } ] ]
App [ width = 700, height = 300,
    data: Dataset { { "rows": [ { "id": "a", "t": "One", "n": "xyz", "cat": "Software" }, { "id": "b", "t": "Two", "n": "w", "cat": "Advertising" } ] } },
    g: DataGrid [ width = 660, height = 200, accessibilityLabel = "Grid", selects = "multi",
        items = { app.data.value.rows },
        columns = { [ { id: "t", title: "Title", width: 160, edit: true },
                      { id: "n", title: "Note", width: 160, editor: "NoteEdit" },
                      { id: "cat", title: "Category", width: 200, editor: "CatEdit" } ] } ] ]`);

writeFileSync(join(DIR, "enter.mjs"), `export default async ({ drive, page, expect }) => {
  const sel = () => page.evaluate(() => { const el = document.activeElement; return [el.selectionStart, el.selectionEnd, el.value]; });
  await page.getByRole("gridcell", { name: "One" }).click();
  await drive.settleMotion();
  // ⌘A or Ctrl+A on a selected cell selects every row, not the cell's text
  await page.keyboard.press("Meta+a");
  await drive.settleMotion();
  expect(await page.evaluate(() => window.__declare.find("app.g").selection.length)).toBe(2);
  await drive.key("F2");
  await drive.settleMotion();
  expect(await sel()).toEqual([0, 3, "One"]);
  await drive.key("Tab");
  await drive.settleMotion();
  await drive.key("Enter");
  await drive.settleMotion();
  expect(await sel()).toEqual([0, 3, "xyz"]);
  await drive.key("Tab");
  await drive.settleMotion();
  await drive.key("Enter");
  await drive.settleMotion();
  expect(await sel()).toEqual([0, 8, "Software"]);
};`);

await test("a cell entered by Enter or F2 starts with its text selected: the grid's own field, your editor's field, a combobox's entry; ⌘A selects the rows", () => {
  const r = run(join(DIR, "grid.declare"), join(DIR, "enter.mjs"));
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

writeFileSync(join(DIR, "read.declare"), `App [ width = 600, height = 300,
    d: Dataset { { "rows": [ { "id": 1, "a": "x", "b": "y" }, { "id": 2, "a": "z", "b": "w" } ] } },
    g: DataGrid [ width = 500, height = 200, accessibilityLabel = "G", items = { app.d.value.rows },
        columns = { [ { id: "a", title: "A", width: 100 }, { id: "b", title: "B", width: 100 } ] } ] ]`);
writeFileSync(join(DIR, "outline.mjs"), `export default async ({ drive, page, expect }) => {
  const at = () => page.evaluate(() => { const v = window.__declare.find("app.g")._activeView; return { active: v != null, outlined: v != null && v._outlined === true }; });
  await page.getByRole("gridcell", { name: "z" }).click(); await drive.settleMotion();
  expect(await at()).toEqual({ active: true, outlined: false });
  await drive.key("ArrowRight"); await drive.settleMotion();
  expect(await at()).toEqual({ active: true, outlined: true });
};`);

await test("a grid only read and selected: a press makes a cell active, for a screen reader, with no outline; the keyboard outlines it", () => {
  const r = run(join(DIR, "read.declare"), join(DIR, "outline.mjs"));
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

summarize("datagrid-editing");
