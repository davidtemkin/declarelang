// The locator press the agent's phone story made at #61.
export const device = { width: 390, height: 844, touch: true };
export default async ({ page }) => {
  await page.getByLabel("Quebec", { exact: true }).click();
};
