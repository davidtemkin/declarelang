const API = "http://127.0.0.1:8350";
async function free(perf, key, n) {
  const d = await (await fetch(`${API}/api/performances/${perf}/seats`)).json();
  const out = [];
  for (const s of d.sections) if (s.key === key)
    for (const row of s.rows) for (const x of row.seats)
      if (x.status === "available" && out.length < n) out.push(`${s.name}, row ${row.name}, seat ${x.number}`);
  return out;
}
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 20 Nov/ }).click();
  await drive.settleData();
  for (const n of [...await free("p05", "DC", 2), ...await free("p05", "ORCH", 1)]) await page.getByRole("button", { name: n, exact: true }).click();
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/shots/d-hall.png" });
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/shots/d-checkout.png" });
  await page.getByRole("button", { name: "Pay $197.00" }).click();
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/shots/d-errors.png" });
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/shots/d-signin.png" });
  await expect.visible("app.signInSheet");
};
