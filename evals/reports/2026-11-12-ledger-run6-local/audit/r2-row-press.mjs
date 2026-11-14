// Failure 2: does a pointer press on a Transactions row open its detail (and Refund)?
// Clicks the centre of the first data row, then the Description cell, then checks the
// detail panel and what is selected.
export default async function (page, h) {
  const click = async (re) => {
    const n = (await h.nodes()).find((x) => re.test(x.role) && /Studio supplies|VENMO|Order #/.test(x.name ?? ""));
    const el = n && (await (await n.elementHandle()).evaluateHandle((e) => (e.nodeType === 1 ? e : e.parentElement))).asElement();
    const b = el && (await el.boundingBox());
    if (!b) return `no ${re}`;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await h.sleep(1200);
    const after = await h.nodes();
    return {
      clicked: `${n.role}: ${n.name} at ${Math.round(b.x + b.width / 2)},${Math.round(b.y + b.height / 2)} (w ${Math.round(b.width)})`,
      selectedRows: after.filter((x) => x.role === "row" && x.selected).map((x) => x.name),
      detail: after.filter((x) => /transaction detail|^refund\b|close detail/i.test(x.name ?? "")).map((x) => `${x.role}: ${x.name}`),
      focused: await page.evaluate(() => `${document.activeElement?.tagName} ${document.activeElement?.getAttribute("role")} ${document.activeElement?.getAttribute("aria-label")}`),
    };
  };
  const tx = (await h.nodes()).find((x) => x.role === "link" || x.role === "button" ? /^Transactions$/.test(x.name) : false);
  const el = (await (await tx.elementHandle()).evaluateHandle((e) => (e.nodeType === 1 ? e : e.parentElement))).asElement();
  await el.click(); await h.sleep(1500);
  const rowClick = await click(/^row$/);
  await page.keyboard.press("Escape"); await h.sleep(500);
  const cellClick = await click(/^gridcell$/);
  return { rowClick, cellClick };
}
