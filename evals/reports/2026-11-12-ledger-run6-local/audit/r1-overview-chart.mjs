// Failure 1: what the Overview "Income vs expenses" chart is in the accessibility tree,
// and what focusing it and pressing keys announces.
export default async function (page, h) {
  const all = await h.nodes();
  const chart = all.filter((n) => /income vs/i.test(n.name ?? ""));
  const focused = await page.evaluate(() => {
    const els = [...document.querySelectorAll("[aria-label]")].filter((e) => /income vs expenses, month/i.test(e.getAttribute("aria-label")));
    const e = els[0];
    if (!e) return "no element";
    e.focus();
    return { tag: e.tagName, role: e.getAttribute("role"), tabindex: e.getAttribute("tabindex"), active: document.activeElement === e };
  });
  await h.sleep(300);
  const said = [];
  for (const k of ["End", "ArrowDown", "ArrowRight"]) {
    await page.keyboard.press(k); await h.sleep(250);
    said.push(await page.evaluate(() => [...document.querySelectorAll('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"]')].map((r) => r.textContent).join(" | ")));
  }
  return { chartNodes: chart.map((n) => `${n.role}: ${n.name}`), focused, said };
}
