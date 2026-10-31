// A phone: three seats across two sections, each by a finger, each registering.
export const device = { width: 390, height: 844, touch: true };
const API = "http://127.0.0.1:8350";
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 13 Nov/ }).click();
  await drive.settleData();
  await drive.settleMotion();
  const names = await page.evaluate(async (api) => {
    const map = await (await fetch(`${api}/api/performances/p01/seats`)).json();
    const out = [];
    for (const s of map.sections.slice(0, 2)) {
      const r = s.rows[Math.floor(s.rows.length / 2)];
      const xs = r.seats.filter((x) => x.status === "available").slice(-2);
      for (const x of xs) out.push(`${s.name}, row ${r.name}, seat ${x.number}`);
    }
    return out.slice(0, 3);
  }, API);
  console.log(names);
  for (const n of names) {
    const seat = page.getByRole("button", { name: n, exact: true });
    await seat.click();
    await drive.settleMotion();
    console.log("first", await seat.getAttribute("aria-pressed"), await seat.boundingBox());
    console.log(n, await seat.getAttribute("aria-pressed"), await page.evaluate(() => window.__declare.find("app").chosen.join(",")));
  }
  await expect(page.getByText(/^3 seats · /)).toBeVisible();
};
