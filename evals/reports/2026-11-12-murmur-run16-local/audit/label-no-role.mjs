export default async ({ page }) => {
  const snap = await page.evaluate(async () => {
    const out = [];
    for (const el of document.querySelectorAll("[aria-label]")) out.push([el.getAttribute("role"), el.getAttribute("aria-label")]);
    return out;
  });
  console.log("DOM", JSON.stringify(snap));
  const s = await page.target().createCDPSession();
  const { nodes } = await s.send("Accessibility.getFullAXTree");
  console.log("AX", JSON.stringify(nodes.filter((n) => !n.ignored && n.name?.value).map((n) => [n.role?.value, n.name?.value])));
};
