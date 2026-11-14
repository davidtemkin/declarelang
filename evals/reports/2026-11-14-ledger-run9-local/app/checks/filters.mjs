// Brief §12.4: filter to this year, search "adobe", and move the amount slider to
// $20–$100 with the keyboard alone. The chips read as set; the summary count and total
// match the rows; Insights → Breakdown shows only those, with the same total; Overview
// says it is filtered.
const cents = (s) => Math.round(Number(s.replace(/[^0-9.]/g, '')) * 100);
export default async ({ drive, expect, page }) => {
  await drive.click('app.side.Transactions');
  await drive.click('app.main.bar.top.range.pick');
  await drive.settleMotion();
  await page.getByRole('button', { name: 'This year' }).click();
  await drive.settleMotion();
  const search = page.getByRole('searchbox', { name: 'Search transactions' }).first();
  await search.fill('adobe');
  await drive.settleData();
  // the amount, by keyboard alone: Tab to the Amount button, Enter, then the thumbs
  await search.focus();
  await drive.tab(1);
  await drive.key('Enter');
  await drive.settleMotion();
  const lo = page.getByRole('slider', { name: /Minimum amount/ });
  await expect(lo).toBeFocused();
  for (let i = 0; i < 4; i++) await drive.key('ArrowRight');           // $0 → $20
  await expect(lo).toHaveAccessibleName(/Minimum amount/);
  await drive.tab(1);
  const hi = page.getByRole('slider', { name: /Maximum amount/ });
  await expect(hi).toBeFocused();
  for (let i = 0; i < 15; i++) await drive.key('ArrowLeft');           // no limit → $100
  await drive.key('Escape');
  await drive.settleData();
  await expect.attr('app', 'minC', 2000);
  await expect.attr('app', 'maxC', 10000);
  await expect.text('app.main.bar.chips', '“adobe”');
  await expect.text('app.main.bar.chips', 'Amount $20 – $100');
  await expect.text('app.main.bar.top.range.pick', '2026');
  // the summary matches the rows
  const rows = await drive.read('app.rows');
  const summary = await drive.read('app.main.body.transactions.head.line.summary.s');
  if (rows.length == 0) throw new Error('no rows matched');
  const out = rows.reduce((n, r) => n - Math.min(0, r.inFilter), 0);
  if (summary.count != rows.length || summary.out != out) throw new Error(`summary ${JSON.stringify(summary)} vs rows ${rows.length} / ${out}`);
  await expect.text('app.main.body.transactions.head.line.summary', rows.length + ' transactions');
  for (const r of rows) {
    if (r.amount < 2000 || r.amount > 10000) throw new Error('row out of range: ' + r.amount);
    if (!/adobe/i.test(r.description + ' ' + (r.contactName ?? ''))) throw new Error('row without adobe: ' + r.description);
  }
  // Insights → Breakdown: the same records, the same total
  await drive.click('app.side.Insights');
  await page.getByRole('tab', { name: 'Breakdown' }).click();
  await drive.settleData();
  const sentence = await drive.read('app.main.body.insights.catSentence');
  const total = sentence.match(/of (\$[\d,]+\.\d\d)\.$/)[1];
  if (cents(total) != summary.out) throw new Error(`breakdown total ${total} vs summary out ${summary.out}`);
  await expect.text('app.main.body.insights.page.filteredNote', 'filtered');
  // Overview says it is filtered
  await drive.click('app.side.Overview');
  await drive.settleData();
  await expect.visible('app.main.body.overview.page.filteredNote');
  await expect.text('app.main.bar.chips', 'Filtered');
};
