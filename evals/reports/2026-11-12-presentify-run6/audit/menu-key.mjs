export default async ({ drive, expect, page }) => {
  console.log("platform:", await page.evaluate(() => navigator.platform));
  console.log("in force:", JSON.stringify(await page.evaluate(() => Keyboard.shortcutsInForce?.() ?? null).catch(() => "n/a")));
  await page.getByText("Arrange", { exact: true }).click();
  await drive.settleMotion();
  const keys = await page.evaluate(() => [...document.querySelectorAll("*")].filter((e) => e.childElementCount == 0 && /G$/.test(e.textContent ?? "")).map((e) => e.textContent));
  console.log("menu shows:", JSON.stringify(keys));
  await drive.key("Escape");
  await drive.key("Mod+G");
  console.log("Mod+G ran picked:", await page.evaluate(() => window.__declare.find("app").grouped));
};
