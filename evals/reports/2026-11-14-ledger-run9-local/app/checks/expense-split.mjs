// Brief §12.2: record $120 from Printworks (a new vendor), split $90 Stock & materials
// and $20 Shipping & postage; saving waits, showing $10.00 remaining; add $10 Packaging;
// save. It appears in the list at once.
export default async ({ drive, expect, page }) => {
  await drive.click('app.side."New expense"');
  await drive.settleMotion();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('textbox', { name: 'Amount', exact: true }).fill('120');
  const vendor = sheet.getByRole('combobox', { name: 'Vendor' });
  await vendor.fill('Printworks');
  await vendor.press('Enter');          // picks (or, the first time, creates) the vendor; Return moves on, never saves
  await drive.settleData();
  await expect(page.getByRole('dialog')).toBeVisible();
  await sheet.getByRole('button', { name: 'Split across categories' }).click();
  const c1 = sheet.getByRole('combobox', { name: 'Category of part 1' });
  await c1.fill('Stock'); await c1.press('Enter');
  await sheet.getByRole('textbox', { name: 'Amount of part 1' }).fill('90');
  const c2 = sheet.getByRole('combobox', { name: 'Category of part 2' });
  await c2.fill('Shipping'); await c2.press('Enter');
  await sheet.getByRole('textbox', { name: 'Amount of part 2' }).fill('20');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await drive.settleData();
  await expect(sheet.getByText('Remaining to allocate: $10.00').first()).toBeVisible();
  await sheet.getByRole('button', { name: 'Add a part' }).click();
  await expect(sheet.getByRole('textbox', { name: 'Amount of part 3' })).toHaveValue('10.00');
  const c3 = sheet.getByRole('combobox', { name: 'Category of part 3' });
  await c3.fill('Packaging'); await c3.press('Enter');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await drive.click('app.side.Transactions');
  await drive.settleData();
  await expect.text('app.main.body.transactions', 'Printworks');
  await expect.text('app.main.body.transactions', 'Split (3)');
};
