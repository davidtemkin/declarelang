export default async ({ page, drive }) => {
  await page.getByRole("button", { name: "Go" }).click();
  await drive.settleMotion();
  await drive.waitReal?.(800);
  console.log("TEXT", await page.evaluate(() => [...document.querySelectorAll("*")].filter(e => /Seat A1/.test(e.textContent) && e.children.length === 0).map(e => e.tagName + "|" + e.getAttribute("aria-live") + "|" + e.getAttribute("role") + "|" + JSON.stringify(e.textContent.slice(0, 50))).join(" ; ")));
};
