// §3: the whole history, smooth at that size: scrolling stays smooth through thousands
// of rows, and jumping to the end is immediate. Moving through rows with the keyboard
// moves the detail with them.
export default async ({ drive, expect, page }) => {
  await drive.click('app.side.Transactions');
  await drive.click('app.main.bar.top.range.pick');
  await drive.settleMotion();
  await page.getByRole('button', { name: 'All time' }).click();
  await drive.settleData();
  const n = (await drive.read('app.rows')).length;
  if (n < 4000) throw new Error('expected the whole history, got ' + n);
  await expect.text('app.main.body.transactions.head.line.summary', n.toLocaleString('en-US') + ' transactions');
  // scroll by wheel, profiled: frames must keep up
  const grid = 'app.main.body.transactions.body.gridBox.grid';
  const scroll = await drive.profile(async () => {
    for (let i = 0; i < 12; i++) await drive.wheel(grid, 900);
  });
  expect.budget(scroll, { frameMs: 50 });
  // jump to the end by keyboard
  await page.getByRole('grid', { name: 'Transactions' }).focus();
  const t0 = Date.now();
  await drive.key('End');
  await drive.settleMotion();
  const last = (await drive.read('app.rows'))[n - 1];
  await expect.attr('app', 'openId', last.id);
  if (Date.now() - t0 > 1500) throw new Error('End took ' + (Date.now() - t0) + ' ms');
  // the detail follows the keyboard
  await drive.key('ArrowUp');
  await drive.settleData();
  const prev = (await drive.read('app.rows'))[n - 2];
  await expect.attr('app', 'openId', prev.id);
  await expect.text('app.main.body.transactions.body.side', prev.description || '');
};
