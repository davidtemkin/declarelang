// §3 editing in place: Enter saves, Escape cancels, Tab moves to the next cell; a
// category is chosen by typing part of its name. Then ⌘Z puts it back.
export default async ({ drive, expect, page }) => {
  await drive.click('app.side.Transactions');
  await drive.settleData();
  const rows = await drive.read('app.rows');
  const target = rows.find((r) => r.kind == 'expense' && r.categoryId == null && r.split == null && r.description);
  if (!target) throw new Error('no uncategorised expense to edit');
  const row = page.getByRole('row', { name: new RegExp(target.description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first();
  const cells = row.getByRole('gridcell');
  // the category: select the cell, Enter, type part of a name, Enter
  await cells.nth(2).click();
  await drive.key('Enter');
  await drive.settleMotion();
  await drive.type('softw');
  await drive.settleMotion();
  await drive.key('Enter');            // picks the match
  await drive.key('Enter');            // leaves the editor, saving
  await drive.settleData();
  let now = (await drive.read('app.rows')).find((r) => r.id == target.id);
  if (now.categoryId != 'software') throw new Error('category not saved: ' + JSON.stringify(now));
  await expect.text('app.toast', 'Category changed');
  // the description: Escape cancels
  await cells.nth(1).click();
  await drive.key('Enter');
  await drive.settleMotion();
  await expect(page.getByRole('textbox', { name: 'Description' })).toBeFocused();
  await drive.key('Mod+A');
  await drive.type('Something else');
  await drive.key('Escape');
  await drive.settleData();
  now = (await drive.read('app.rows')).find((r) => r.id == target.id);
  if (now.description != target.description) throw new Error('Escape did not cancel: ' + now.description);
  // the date: Tab goes on to the next cell
  await cells.nth(0).click();
  await drive.key('Enter');
  await drive.settleMotion();
  await expect(page.getByRole('textbox', { name: 'Date' })).toBeFocused();
  await drive.key('Tab');
  await drive.settleMotion();
  await expect.attr('app.main.body.transactions.body.gridBox.grid', 'activeCol', 1);
  await drive.key('Escape');
  // ⌘Z undoes the category change
  await drive.key('Mod+Z');
  await drive.settleData();
  now = (await drive.read('app.rows')).find((r) => r.id == target.id);
  if (now.categoryId != null) throw new Error('undo did not put it back: ' + now.categoryId);
};
