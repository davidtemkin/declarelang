export default async ({ drive, expect }) => {
  await expect.text("app.hero", "2 sessions · 1h 24m");
};
