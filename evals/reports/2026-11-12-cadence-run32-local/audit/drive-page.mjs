// Two things called page: the script's (locators) and drive.page (the raw page).
export default async ({ drive, expect, page }) => {
  console.log("page.getByRole:", typeof page.getByRole, " page.evaluate:", typeof page.evaluate);
  console.log("drive.page.getByRole:", typeof drive.page.getByRole, " drive.page.evaluate:", typeof drive.page.evaluate);
};
