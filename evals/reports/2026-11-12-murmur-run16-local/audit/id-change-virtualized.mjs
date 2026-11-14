// After the id of the last record changes in place, count the views showing it.
export default async ({ drive, expect, page }) => {
  const kids = () => page.evaluate(() => {
    const f = window.__declare.find("app.scroller.feed");
    return f.children.filter((c) => c.visible !== false && c.y >= 7900)
      .map((c) => ({ y: c.y, text: c.children[0]?.text }));
  });
  await drive.settleMotion();
  await page.evaluate(() => window.__declare.find("app").add());
  await drive.settleMotion();
  console.log("after add      ", JSON.stringify(await kids()));
  await page.evaluate(() => window.__declare.find("app").confirm());
  await drive.settleMotion();
  console.log("after id change", JSON.stringify(await kids()));
  await expect.count("app.scroller.feed", "Row", 0); // prints the count it found
};
