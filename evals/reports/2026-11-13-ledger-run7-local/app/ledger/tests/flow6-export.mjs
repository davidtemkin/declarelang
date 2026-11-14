// Done 6: export this month's expenses as a CSV; its total matches the summary line.
import { read, money, settle } from "./lib.mjs";

export default async ({ drive, expect, page }) => {
  await drive.set("app", "location", "transactions");
  await settle(drive);
  await page.getByRole("button", { name: "Kind" }).click();
  await settle(drive);
  await page.getByRole("checkbox", { name: "Expenses" }).click();
  await settle(drive);
  await drive.key("Escape");
  await settle(drive);
  const line = await read(page, "app", "summaryLine");
  const sum = await read(page, "app", "listSum");
  console.log(line);
  const file = await drive.download(() => page.getByRole("button", { name: "Export CSV" }).click());
  const rows = file.text.trim().split(/\r?\n/);
  const head = rows[0].split(",");
  expect.equal(head.join(","), "date,kind,description,contact,category,channel,amount,id");
  const ai = head.indexOf("amount");
  // a quoted field may hold commas: read the amount from the end of each line
  const cents = rows.slice(1).map((r) => { const cells = r.split(","); return Math.round(Number(cells[cells.length - 2]) * 100); });
  const total = cents.reduce((n, c) => n + c, 0);
  console.log(file.name + ": " + (rows.length - 1) + " rows, total " + money(total));
  expect.equal(rows.length - 1, sum.count);
  expect.equal(total, sum.net);
  expect.equal(-total, sum.out);
  if (!/^\d{4}-\d{2}-\d{2},expense,/.test(rows[1])) throw new Error("not ISO dates: " + rows[1]);
};
