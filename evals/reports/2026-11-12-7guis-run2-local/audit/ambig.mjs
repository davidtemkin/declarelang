export default async ({ drive, expect }) => {
  await drive.click("app.row.Count");
  await expect.attr("app", "count", 1);
};
