// Every screen a person reaches on a phone: Overview, a chart tapped (the tip first,
// then its records), Transactions grouped by day, a transaction opened, the filters
// sheet, and the editor's kinds — each checked for layout and finger-sized targets.
export const device = { width: 390, height: 844, touch: true };
export default async ({ drive, expect, page }) => {
  await expect.text('app.main.body.overview.page.kpis', 'Gross margin');
  await drive.reveal('app.main.body.overview.page.ive.body.chart');
  await drive.click('app.main.body.overview.page.ive.body.chart');
  await expect.visible('app.main.body.overview.page.ive.body.chart.tip');
  await expect.text('app.main.body.overview.page.ive.body.chart.tip', 'Tap again');
  await expect.attr('app', 'screen', 'overview');
  await drive.click('app.main.body.overview.page.ive.body.chart');
  await drive.settleData();
  await expect.attr('app', 'screen', 'transactions');
  await drive.click('app.main.body.transactions.head.backRow');
  await drive.click('app.main.tabs.Transactions');
  await drive.settleData();
  await expect.text('app.main.body.transactions.body.phoneList', 'Today');
  await drive.click('app.main.body.transactions.body.phoneList.1');
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole('dialog', { name: 'Transaction' })).toBeVisible();
  await drive.key('Escape');
  await drive.settleMotion();
  await drive.click('app.main.bar.top.more');
  await drive.settleMotion();
  await drive.settleData();
  await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Filters' }).getByRole('checkbox', { name: 'Expenses' }).tap();
  await drive.settleData();
  await page.getByRole('dialog', { name: 'Filters' }).getByRole('button', { name: 'Done' }).tap();
  await drive.settleMotion();
  await expect.text('app.main.bar.chips', 'Expenses');
  await drive.click('app.main.tabs.Sale');
  await drive.settleMotion();
  for (const k of ['Refund', 'Expense', 'Sale']) {
    await page.getByRole('dialog').getByRole('radio', { name: k }).tap();
    await drive.settleData();
  }
};
