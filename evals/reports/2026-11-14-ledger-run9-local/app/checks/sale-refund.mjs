// Brief §12.3: record a sale at the Market: two mugs and a print. Then refund one mug;
// the sale shows what was refunded.
export default async ({ drive, expect, page }) => {
  await drive.click('app.side.Transactions');
  await drive.click('app.side."New sale"');
  await drive.settleMotion();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('radio', { name: 'Market' }).click();
  const mug = sheet.getByRole('button', { name: /^Speckled mug, \$32\.00/ });
  await mug.click();
  await mug.click();                                   // tapping again adds one more
  await sheet.getByRole('button', { name: /^Art print A4/ }).click();
  await expect(sheet.getByRole('button', { name: /^Speckled mug, \$32\.00, 2 in this sale/ })).toBeVisible();
  await expect.text('app.editor.form.foot', '$88.00');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // it is in the list at once, open beside it
  const id = await drive.read('app.openId');
  if (!id) throw new Error('the new sale is not open');
  await expect.text('app.main.body.transactions.body.side', 'Market');
  await expect.text('app.main.body.transactions.body.side', '2 × Speckled mug');
  // refund one mug from the sale
  await page.getByRole('button', { name: 'Refund…' }).click();
  await drive.settleData();
  await drive.settleMotion();
  const rsheet = page.getByRole('dialog');
  const q = rsheet.getByRole('spinbutton', { name: 'Quantity of Speckled mug to refund' });
  await q.focus();
  await drive.key('ArrowUp');
  await expect.text('app.editor.form.foot', '$32.00');
  await rsheet.getByRole('button', { name: 'Save', exact: true }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // back to the sale: it shows what was refunded
  await drive.set('app', 'openId', id);
  await drive.settleData();
  await expect.text('app.main.body.transactions.body.side', '1 refunded');
  await expect.text('app.main.body.transactions.body.side', 'Refunded $32.00');
};
