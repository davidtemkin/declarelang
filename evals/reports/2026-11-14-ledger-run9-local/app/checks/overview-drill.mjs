// Brief §12.1: Overview shows this month's four figures with their changes against last
// month, and the income vs expenses chart. Choosing this month's expense bar opens
// Transactions filtered to exactly those expenses; the summary equals the bar to the cent.
export default async ({ drive, expect, page }) => {
  for (const k of ['Revenue', 'Expenses', 'Net profit', 'Gross margin']) {
    await expect(page.getByRole('button', { name: new RegExp('^' + k + ', ') })).toBeVisible();
  }
  await expect.text('app.main.body.overview.page.kpis', 'vs Oct');
  // the chart, by keyboard: last period, then the Expenses series
  const chart = page.getByRole('img', { name: /Income vs expenses, month by month/ });
  await chart.focus();
  await drive.key('End');
  await drive.key('ArrowDown');
  const sentence = await drive.read('app.main.body.overview.page.ive.body.chart.sentence');
  if (!/^November 2026.*Expenses, \$[\d,]+\.\d\d/.test(sentence)) throw new Error('unexpected point: ' + sentence);
  const value = sentence.match(/Expenses, (\$[\d,]+\.\d\d)/)[1];
  // a screen reader hears the point as a sentence
  await expect.announced('November 2026 (so far), Expenses, ' + value);
  if (!/(up|down) \d+% from October 2026, \d+ transactions$/.test(sentence)) throw new Error('sentence lacks change or count: ' + sentence);
  await drive.key('Enter');
  await drive.settleData();
  await expect.attr('app', 'screen', 'transactions');
  await expect.text('app.main.body.transactions.head.line.summary', 'Out ' + value);
  await expect.text('app.main.body.transactions.head.line.summary', 'In $0.00');
  await expect.text('app.main.bar.chips', 'Expenses');
  // and the pointer path: back, then a click on the same bar
  await drive.click('app.main.body.transactions.head.backRow');
  await drive.settleData();
  await expect.attr('app', 'screen', 'overview');
  await expect.attr('app', 'kinds', []);
};
