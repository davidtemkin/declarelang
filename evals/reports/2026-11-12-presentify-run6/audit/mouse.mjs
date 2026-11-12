export default async ({ drive, expect, page }) => {
  console.log("page.mouse:", typeof page.mouse, page.mouse ? Object.keys(page.mouse).join(",") : "", typeof page.mouse?.dblclick, typeof page.mouse?.click);
};
