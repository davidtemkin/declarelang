// Real Tab presses through a bottom-anchored virtualized list: does focus
// follow the data order, as a person reading would expect?
export default async ({ drive, expect, page }) => {
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName);
  const order = await page.evaluate(() => window.__declare.find("app.scroller.feed").children
    .filter((c) => c.visible !== false).map((c) => c.accessibilityLabel.replace("message ", "")).join(","));
  console.log("child order:", order);
  const seq = [];
  await drive.tab();
  seq.push(await focused());
  for (let i = 0; i < 21; i++) { await drive.tab(); seq.push(await focused()); }
  console.log("Tab visits:", seq.join(" → "));
};
