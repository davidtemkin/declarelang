// drive.waitReal longer than 30 s: the stuck-evaluate watchdog (stuckMs =
// budgetMs * 2 in tools/internal/verify-behave.mjs) fires on waitReal's own
// in-page loop and blames the program ("a promise nothing resolves").
export default async ({ drive, expect }) => {
  await drive.waitReal(35000);
  await expect.text("app", "hello");
};
