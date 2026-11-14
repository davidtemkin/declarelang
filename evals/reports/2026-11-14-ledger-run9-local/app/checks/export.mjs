// Brief §12.6: export this month's expenses as a CSV; its total matches the summary line.
export default async ({ drive, expect, page }) => {
  await drive.click('app.side.Transactions');
  await drive.click('app.main.bar.top.kind');
  await drive.settleMotion();
  await page.getByRole('checkbox', { name: 'Expenses' }).click();
  await drive.key('Escape');
  await drive.settleData();
  const summary = await drive.read('app.main.body.transactions.head.line.summary.s');
  const file = await drive.download(() => drive.click('app.main.body.transactions.head.line.export'));
  const lines = file.text.trim().split('\n');
  const head = lines[0].split(',');
  if (head.join(',') != 'id,date,kind,description,contact,category,channel,amount,signed') throw new Error('header: ' + lines[0]);
  // a CSV row: split on commas outside quotes
  const cells = (l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, ''));
  const rows = lines.slice(1).map(cells);
  if (rows.length != summary.count) throw new Error(`csv rows ${rows.length} vs summary ${summary.count}`);
  let total = 0;
  for (const r of rows) {
    if (!/^\d{4}-\d\d-\d\d$/.test(r[1])) throw new Error('not an ISO date: ' + r[1]);
    if (!/^-?\d+\.\d\d$/.test(r[8])) throw new Error('not a plain number: ' + r[8]);
    if (r[2] != 'expense') throw new Error('not an expense: ' + r.join(','));
    total += Math.round(Number(r[8]) * 100);
  }
  if (-total != summary.out) throw new Error(`csv total ${total} vs summary out ${summary.out}`);
  await expect.text('app.toast', 'Exported ' + rows.length + ' transactions');
  console.log(`exported ${rows.length} rows, total ${total} = −${summary.out}; file ${file.name}`);
};
