// Lead: drive.selectAll at ~28 min said "no view at '…grid.0.1.0.f'". Is that path wrong,
// or does selectAll resolve paths differently from drive.click? Lists what the grid's first
// row holds, by the path segments drive accepts.
export default async function (page, h) {
  await page.evaluate(() => { window.__declare.find("app").location = "transactions"; });
  await h.sleep(2000);
  return page.evaluate(() => {
    const G = "app.main.pages.transactions.body.listArea.grid";
    const out = {};
    for (const p of [G + ".0", G + ".0.1", G + ".0.1.0", G + ".0.1.0.f", G + ".0._cells", G + ".0._cells.1", G + ".0._cells.1.0", G + ".0._cells.1.0.f", G + ".1.0.f"]) {
      const n = window.__declare.find(p);
      out[p.replace(G, "G")] = n == null ? null : `${n.constructor?.name ?? "?"} ${n.className ?? n.declareName ?? ""} children=${(n.childViews ?? n.children ?? []).length}`;
    }
    return out;
  });
}
