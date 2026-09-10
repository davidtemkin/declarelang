export default async function ({ drive, expect, page }) {
  await page.waitForFunction(() => __app.db.disk.loadStatus === 'loaded');
  await expect.attr('app.db.disk', 'saved', false);
  await drive.click('app.body.save');
  await page.waitForFunction(() => __app.db.disk.saved);
  await expect.attr('app.db.disk', 'exists', true);
  await expect.attr('app', 'receipt', 'commit acknowledged');
}
