// §9 states: a change of filters keeps the old results, dimmed, until the new arrive; a
// slow service says it is still working; a failed load says so in place, with Retry, and
// the rest of the screen still works; a refused save keeps the editor open with everything
// typed, the message at the field it concerns.
export default async ({ drive, expect, page }) => {
  await drive.click('app.side.Transactions');
  const before = (await drive.read('app.rows')).length;
  // slow: hold the list's next answer
  const held = await drive.hold({ method: 'GET', path: /\/api\/transactions\?/ });
  await drive.click('app.main.bar.top.range.prev');
  await drive.wait(2000);
  await expect.visible('app.main.bar.top.working');
  await expect.text('app.main.bar.top.working', 'Still working');
  await expect.attr('app.main.body.transactions.body.gridBox', 'opacity', 0.6);
  if ((await drive.read('app.rows')).length != before) throw new Error('old rows were not kept while loading');
  await held.release();
  await drive.settleData();
  await expect.hidden('app.main.bar.top.working');
  await expect.attr('app.main.body.transactions.body.gridBox', 'opacity', 1);

  // failed: the service refuses the list's next request
  await page.setRequestInterception(true);
  const fail = (req) => {
    if (req.url().includes('/api/transactions?')) req.respond({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' });
    else req.continue();
  };
  page.on('request', fail);
  await drive.click('app.main.bar.top.range.next');
  await drive.settleData();
  await expect.visible('app.main.body.transactions.body.gridBox.failed');
  await expect.text('app.main.body.transactions.body.gridBox.failed', "Couldn't load this.");
  // the rest of the screen still works
  await drive.click('app.side.Overview');
  await drive.settleData();
  await expect.text('app.main.body.overview.page.kpis', 'Revenue');
  await drive.click('app.side.Transactions');
  page.off('request', fail);
  await page.setRequestInterception(false);
  await page.getByRole('button', { name: 'Retry' }).first().click();
  await drive.settleData();
  await expect.hidden('app.main.body.transactions.body.gridBox.failed');

  // refused: refund more than is left on a sale; the editor keeps what was typed
  const sale = (await drive.read('app.rows')).find((r) => r.kind == 'sale' && r.amount > 1000 && r.refunded == 0);
  await drive.set('app', 'openId', sale.id);
  await drive.settleData();
  await page.getByRole('button', { name: 'Refund…' }).click();
  await drive.settleData();
  await drive.settleMotion();
  const sheet = page.getByRole('dialog');
  const lump = sheet.getByRole('textbox', { name: 'Refund an amount' });
  await lump.fill(String(sale.amount / 100 + 50));
  await sheet.getByRole('textbox', { name: 'Description' }).fill('Damaged in post');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await drive.settleData();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(/Refund exceeds the original sale/).first()).toBeVisible();
  await expect(lump).toBeFocused();
  await expect(lump).toHaveValue(String(sale.amount / 100 + 50));
  await expect(sheet.getByRole('textbox', { name: 'Description' })).toHaveValue('Damaged in post');
};
