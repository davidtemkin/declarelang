// declare-profile --scenario whose script also calls drive.profile (the verify.md recipe)
export default async ({ drive }) => {
  const p = await drive.profile(async () => { await drive.click("app.pad"); });
  console.log(p.text.split("\n")[0]);
};
