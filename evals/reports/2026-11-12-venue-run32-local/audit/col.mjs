export default async ({ drive, page }) => {
  console.log(JSON.stringify(await page.evaluate(() => { const d = window.__declare; const t = d.find("app.tickets"), c = d.find("app.tickets.col"), l = d.find("app.tickets.col.1"); return { tickets: { w: t.width, cb: t.contentBox("width") }, col: { x: c.x, w: c.width }, line: { x: l.x, w: l.width } }; })));
};
