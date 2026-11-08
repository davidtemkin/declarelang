// Flow 6: export this month's expenses as a CSV; its total matches the summary line.
export const device = { width: 1440, height: 900, touch: false };

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  // keep what the program hands the browser to save
  await page.evaluate(() => {
    window.__csv = null;
    const make = URL.createObjectURL;
    URL.createObjectURL = (b) => { b.text().then((t) => { window.__csv = t; }); return make(b); };
  });
  await page.getByRole("link", { name: "Transactions" }).click();
  await page.getByRole("button", { name: "Kind", exact: true }).click();
  await drive.settleMotion();
  await page.getByRole("checkbox", { name: "Expenses" }).click();
  await drive.key("Escape");
  await drive.settleMotion();
  await drive.settleData();

  const line = await page.getByText(/ transactions · In\s/).innerText();
  const out = line.match(/Out\s\$([\d,]+\.\d\d)/)[1].replace(/,/g, "");
  const count = Number(line.match(/^([\d,]+) transaction/)[1].replace(/,/g, ""));
  await page.getByRole("button", { name: "Export CSV" }).click();
  await drive.waitReal(300);
  const csv = await page.evaluate(() => window.__csv);
  const rows = csv.trim().split("\n");
  if (rows[0] != "id,date,kind,description,contact,category,channel,amount") throw new Error("header: " + rows[0]);
  if (rows.length - 1 != count) throw new Error(`rows ${rows.length - 1} != ${count}`);
  // the amount is the last column, a plain number; dates are ISO
  let cents = 0;
  for (const r of rows.slice(1)) {
    const cells = r.split(",");
    if (!/^\d{4}-\d\d-\d\d$/.test(cells[1])) throw new Error("date: " + r);
    cents += Math.round(Number(cells[cells.length - 1]) * 100);
  }
  if (-cents != Math.round(Number(out) * 100)) throw new Error(`CSV total ${-cents} != summary Out ${out}`);
  await expect(page.getByText(/^Exported \d+ transactions/)).toBeVisible();
};
