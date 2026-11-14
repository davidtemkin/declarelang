// The keyboard does everything (§10); selecting (§3); the empty view offers the one
// change that brings results back (§5); Save & new keeps the channel and date (§4).
export default async ({ drive, expect, page }) => {
  await drive.click('app.side.Transactions');
  // keys: [ steps the range back, ] forward; / searches; e records an expense; Escape closes
  await page.getByRole('grid', { name: 'Transactions' }).focus();
  await drive.key('[');
  await drive.settleData();
  await expect.text('app.main.bar.top.range.pick', 'October 2026');
  await drive.key(']');
  await drive.settleData();
  await expect.text('app.main.bar.top.range.pick', 'November 2026');
  await drive.key('/');
  await expect(page.getByRole('searchbox', { name: 'Search transactions' }).first()).toBeFocused();
  await drive.type('zzqq');
  await drive.settleData();
  await drive.wait(300);
  await drive.settleData();
  // nothing matches: the empty view names the filters and offers the change
  await expect.visible('app.main.body.transactions.body.gridBox.empty');
  await expect.text('app.main.body.transactions.body.gridBox.empty', '“zzqq”');
  await expect.text('app.main.body.transactions.body.gridBox.empty', 'Remove ‘“zzqq”’ to see');
  await page.getByRole('button', { name: /^Remove ‘“zzqq”’ to see/ }).click();
  await drive.settleData();
  await expect.attr('app', 'query', '');
  // sorting by a header: amount, largest first
  await page.getByRole('columnheader', { name: 'Amount' }).click();
  await drive.settleData();
  await expect.attr('app', 'sortOn', 'amount');
  let rows = await drive.read('app.rows');
  if (rows[0].signed < rows[1].signed) throw new Error('not sorted by amount');
  await page.getByRole('columnheader', { name: 'Date' }).click();
  await drive.settleData();
  // click, then Shift-click for a range
  rows = await drive.read('app.rows');
  const grid = page.getByRole('grid', { name: 'Transactions' });
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const named = rows.map((r, i) => [r, i]).filter(([r]) => r.description && rows.filter((x) => x.description == r.description).length == 1);
  const [a, i] = named[0], [b, j] = named.find(([r, k]) => k >= i + 3);
  await grid.getByRole('row', { name: new RegExp(esc(a.description)) }).first().getByRole('gridcell').nth(3).click();
  await grid.getByRole('row', { name: new RegExp(esc(b.description)) }).first().getByRole('gridcell').nth(3).click({ modifiers: ['Shift'] });
  const n = j - i + 1;
  await expect.attr('app', 'selCount', n);
  await expect.text('app.main.body.transactions.head.line.summary', n + ' transactions selected');
  // Space on the focused row, after a ⌘-walk, adds it
  await drive.key('Meta+ArrowDown');
  await drive.key(' ');
  await expect.attr('app', 'selCount', n + 1);
  await drive.key('Escape');
  await expect.attr('app', 'selCount', 0);
  // e: a new expense; Escape closes it
  await drive.key('e');
  await drive.settleMotion();
  await expect(page.getByRole('dialog')).toBeVisible();
  await drive.key('Escape');
  await drive.settleMotion();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Save & new keeps the channel and date
  await drive.key('s');
  await drive.settleMotion();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('radio', { name: 'Wholesale' }).click();
  await sheet.getByRole('textbox', { name: 'Date' }).fill('yesterday');
  await sheet.getByRole('button', { name: /^Greeting card/ }).click();
  await sheet.getByRole('button', { name: 'Save and start another' }).click();
  await drive.settleData();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('radio', { name: 'Wholesale' })).toBeChecked();
  await expect(sheet.getByRole('textbox', { name: 'Date' })).toHaveValue('13 Nov 2026');
  await expect.text('app.editor.form.foot', '$0.00');
  await drive.key('Escape');
};
