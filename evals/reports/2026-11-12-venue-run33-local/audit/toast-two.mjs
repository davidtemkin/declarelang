export default async ({ page, drive, expect }) => {
  await page.getByRole("button", { name: "Go" }).click();
  await drive.settleMotion();
  await expect(page.getByText("Seat A1 has just been taken by someone else.")).toBeVisible();
};
