// Every screen and overlay a person reaches on a desk, so each is checked for layout
// where it comes to rest: the pickers, the menus, the editor's three kinds, every
// Insights tab as a chart and as a table, a chart's tip, and both themes.
export default async ({ drive, expect, page }) => {
  for (const b of ['range.pick', 'amount', 'kind', 'category', 'contact']) {
    await drive.click('app.main.bar.top.' + b);
    await drive.settleMotion();
    await drive.settleData();
    await drive.key('Escape');
    await drive.settleMotion();
  }
  await drive.click('app.main.bar.top.compare');
  await drive.settleMotion();
  await page.getByRole('menuitemradio', { name: 'Same period last year' }).click();
  await drive.settleData();
  await expect.text('app.main.bar.top.compare', 'vs Nov 2025');
  // a chart's tip, by pointing
  await drive.hover('app.main.body.overview.page.ive.body.chart');
  await expect.visible('app.main.body.overview.page.ive.body.chart.tip');
  // insights: every tab, chart and table
  await drive.click('app.side.Insights');
  for (const tab of ['Trends', 'Income vs expenses', 'Breakdown', 'Products']) {
    await page.getByRole('tab', { name: tab }).click();
    await drive.settleData();
    await expect.text('app.main.body.insights.page.card.body.sentence', ' ');
    await page.getByRole('button', { name: /^Show as (table|chart)$/ }).click();
    await drive.settleData();
    await page.getByRole('button', { name: /^Show as (table|chart)$/ }).click();
  }
  // a breakdown cell opens its records; Back returns to the chart as it was
  await page.getByRole('tab', { name: 'Breakdown' }).click();
  await drive.settleData();
  await page.getByRole('listitem').first().click();
  await drive.settleData();
  await expect.attr('app', 'screen', 'transactions');
  await drive.click('app.main.body.transactions.head.backRow');
  await expect.attr('app', 'screen', 'insights');
  await expect.attr('app.main.body.insights', 'tab', 'breakdown');
  // the editor's three kinds
  await drive.click('app.side."New expense"');
  await drive.settleMotion();
  for (const k of ['Sale', 'Refund', 'Expense']) {
    await page.getByRole('dialog').getByRole('radio', { name: k }).click();
    await drive.settleData();
  }
  await page.getByRole('dialog').getByRole('button', { name: 'Split across categories' }).click();
  await drive.settleMotion();
  await drive.key('Escape');
  await drive.settleMotion();
  // transactions: columns menu, a narrow window with the detail in a sheet
  await drive.click('app.side.Transactions');
  await drive.click('app.main.body.transactions.head.line.cols');
  await drive.settleMotion();
  await drive.key('Escape');
  await drive.device({ width: 1024, height: 760, touch: false });
  await drive.click('app.side.Transactions');
  await drive.settleData();
  await page.getByRole('grid', { name: 'Transactions' }).focus();
  await drive.key('ArrowDown');
  await drive.key('o');                 // the selected one, opened in a sheet at this width
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole('dialog', { name: 'Transaction' })).toBeVisible();
  await drive.key('Escape');
  await drive.click('app.side.Budgets');
  await drive.settleData();
  await expect.text('app.main.body.budgets.page.card', 'Stock & materials');
};
