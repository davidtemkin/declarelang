export default async ({ drive, expect }) => {
  await drive.click("app.0");
  await drive.settleMotion();
  await expect.visible("app.sheet.form.send");     // reached: the form is the program's own child
  await drive.click("app.sheet.form.send");
  await drive.settleMotion();
  await expect.hidden("app.sheet.form");           // gone now — what does the failure say?
};
