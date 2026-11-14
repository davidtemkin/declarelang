// Editing in place: a description saved with Return, a date typed as words,
// and Escape leaving a value as it was.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.set("app", "location", "transactions");
  await drive.set("app", "fQ", "printworks");
  await drive.settleData();
  const t = await drive.page.evaluate(() => window.__declare.find("app").rows[0]);
  await page.getByRole("button", { name: /^Description, / }).first().dblclick();
  await drive.settleMotion();
  const words = t.description == "Paper and inks" ? "Paper, inks" : "Paper and inks";
  await drive.type(words);
  await drive.key("Enter");
  await drive.settleData();
  await expect.request("PATCH", "/api/transactions/" + t.id, { body: { description: words } });
  await page.getByRole("button", { name: /^Date, / }).first().focus();
  await drive.key("Enter");
  await drive.settleMotion();
  const day = t.date == await drive.page.evaluate(() => window.__declare.find("app").today) ? "yesterday" : "today";
  await drive.type(day);
  await drive.key("Tab");
  await drive.settleData();
  await expect.request("PATCH", "/api/transactions/" + t.id, { body: { date: await drive.page.evaluate((w) => { const d = window.__declare.find("app").today; const x = new Date(d + "T00:00:00Z"); if (w == "yesterday") x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10) }, day) } });
  await page.getByRole("button", { name: /^Amount, / }).first().dblclick();
  await drive.settleMotion();
  await drive.type("999");
  await drive.key("Escape");
  await drive.settleData();
  await expect.request("PATCH", "/api/transactions/" + t.id, { count: 2 });
  const after = await drive.page.evaluate((id) => window.__declare.find("app").rows.find((r) => r.id == id), t.id);
  await expect.equal(after.description, words);
  await expect.equal(after.amount, t.amount);
};
