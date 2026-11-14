// Brief §12, on a phone: open Overview, then record an expense with the thumb.
export const device = { width: 390, height: 844, touch: true };
export default async ({ drive, expect, page }) => {
  await expect.attr('app', 'screen', 'overview');
  await expect.text('app.main.body.overview.page.kpis', 'Revenue');
  await drive.click('app.main.tabs.Expense');                 // a finger, on the tab bar
  await drive.settleMotion();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('textbox', { name: 'Amount', exact: true })).toBeFocused();
  await drive.type('18.50');
  const vendor = sheet.getByRole('combobox', { name: 'Vendor' });
  await vendor.tap();
  await drive.type('Pirate');
  await drive.settleMotion();
  await page.getByRole('option', { name: 'Pirate Ship' }).tap();
  await drive.settleMotion();
  // the vendor's usual category came with it
  await expect(sheet.getByRole('combobox', { name: 'Category' })).toHaveValue('Shipping & postage');
  await sheet.getByRole('button', { name: 'Save', exact: true }).tap();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.text('app.toast', 'Saved expense of $18.50');
  await expect.text('app.main.body.overview.page.recentPanel', 'Pirate Ship');
};
