export default async ({ drive, expect, page }) => {
  await page.evaluate(() => { const i = window.__declare.find("app").inbox; window.__b = { shape: i.$shape, arr: i.value.rows }; window.__declare.find("app").bump(2, 10); });
  await drive.settleData();
  console.log(JSON.stringify(await page.evaluate(() => { const i = window.__declare.find("app").inbox; return { shapeBefore: window.__b.shape, shapeAfter: i.$shape, newArray: i.value.rows !== window.__b.arr, order: i.value.rows.map((t) => t.id).join("") }; })));
};
