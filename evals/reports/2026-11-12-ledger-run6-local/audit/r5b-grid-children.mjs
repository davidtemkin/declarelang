// The grid's children as the path tools see them (window.__declare.inspect), two levels down.
export default async function (page, h) {
  await page.evaluate(() => { window.__declare.find("app").location = "transactions"; });
  await h.sleep(2000);
  return page.evaluate(() => {
    const G = "app.main.pages.transactions.body.listArea.grid";
    const kids = (p) => (window.__declare.inspect(p)?.children ?? []).map((c) => `${c.path} (${c.kind}${c.name ? " " + c.name : ""})`);
    const top = kids(G);
    const firstRow = (window.__declare.inspect(G)?.children ?? []).find((c) => /Row/.test(c.kind));
    const rowKids = firstRow ? kids(firstRow.path) : [];
    const cellsPath = rowKids.find((s) => /_cells|View/.test(s))?.split(" ")[0];
    const cells = cellsPath ? kids(cellsPath) : [];
    const cell1 = cells[1]?.split(" ")[0];
    const deep = cell1 ? kids(cell1) : [];
    const deeper = deep[0] ? kids(deep[0].split(" ")[0]) : [];
    return { top: top.slice(0, 6), rowKids, cells: cells.slice(0, 3), deep, deeper };
  });
}
