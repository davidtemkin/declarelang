export default async ({ drive, expect }) => {
  await drive.click("app.grid");
  await drive.type("5");
  await expect.attr("app.grid.editor", "text", "5");   // the key opened the edit; it should not also type
};
