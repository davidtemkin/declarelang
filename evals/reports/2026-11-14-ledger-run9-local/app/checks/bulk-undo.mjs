// Brief §12.5: clear the filters; filter to Uncategorised; select all; categorise as
// Other; undo with ⌘Z.
export default async ({ drive, expect, page }) => {
  await drive.click('app.side.Transactions');
  await drive.click('app.main.bar.top.category');
  await drive.settleMotion();
  await page.getByRole('checkbox', { name: 'Uncategorised' }).click();
  await drive.key('Escape');
  await drive.settleData();
  await expect.text('app.main.bar.chips', 'Uncategorised');
  const n = (await drive.read('app.rows')).length;
  if (n == 0) throw new Error('nothing uncategorised this month to work with');
  await page.getByRole('button', { name: 'Select all ' + n }).click();
  await expect.text('app.main.body.transactions.bulkBar', `All ${n} transactions matching the filters are selected`);
  await expect.text('app.main.body.transactions.head.line.summary', `All ${n} transactions selected`);
  await page.getByRole('button', { name: 'Categorise', exact: true }).click();
  await drive.settleMotion();
  await page.getByRole('menuitem', { name: 'Other', exact: true }).click();
  await drive.settleData();
  await expect.text('app.toast', `Categorised ${n} transactions`);
  await expect.attr('app', 'matched', 0);
  await expect.visible('app.main.body.transactions.body.gridBox.empty');
  await drive.key('Mod+Z');
  await drive.settleData();
  await expect.attr('app', 'matched', n);
  await expect.text('app.toast', 'Undid');
};
