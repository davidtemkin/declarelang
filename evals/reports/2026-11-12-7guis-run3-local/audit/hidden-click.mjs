export default async ({ drive, expect }) => {
  await drive.click("app.form.1");            // the hidden Text, meant as "Book"
  await expect.attr("app", "n", 1);
};
