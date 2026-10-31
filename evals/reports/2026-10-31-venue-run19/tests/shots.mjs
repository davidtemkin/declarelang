// Pictures of each screen, for looking at: SHOTS=/tmp/dir PHONE=1 npx declare-verify … --assert shots.mjs
const API = "http://127.0.0.1:8350";
const DIR = process.env.SHOTS ?? "/tmp/venue-shots";
const PHONE = process.env.PHONE == "1";
export const device = PHONE ? { width: 390, height: 844, touch: true } : { width: 1280, height: 800 };

export default async ({ drive, expect, page }) => {
  const tag = PHONE ? "phone" : "desk";
  const shot = async (name) => { await drive.settleMotion(); await page.screenshot({ path: `${DIR}/${tag}-${name}.png` }); };
  await drive.settleData();
  await shot("1-list");
  await page.getByRole("button", { name: /^Sat 21 Nov/ }).click();
  await drive.settleData();
  await shot("2-hall");
  const names = await page.evaluate(async (api) => {
    const map = await (await fetch(`${api}/api/performances/p06/seats`)).json();
    const out = [];
    for (const s of map.sections.slice(0, 2)) {
      const r = s.rows.find((r) => r.seats.filter((x) => x.status === "available").length >= 2);
      const xs = r.seats.filter((x) => x.status === "available").slice(0, 2);
      for (const x of xs) out.push(`${s.name}, row ${r.name}, seat ${x.number}`);
    }
    return out.slice(0, 3);
  }, API);
  for (const n of names) await page.getByRole("button", { name: n, exact: true }).click();
  await shot("4-chosen");
  await page.getByRole("button", { name: PHONE ? "Continue" : "Continue to checkout", exact: true }).click();
  await shot("5-checkout");
  await page.getByLabel("Card number").fill("4242424242424242");
  await page.getByLabel("Postal code").fill("1234");
  await page.getByLabel("City").focus();
  await shot("6-checkout-typed");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Name on card").fill("Ada Lovelace");
  await page.getByLabel("Expiry").fill("0428");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Street address").fill("1 Main St");
  await page.getByLabel("City").fill("Springfield");
  await page.getByLabel("Postal code").fill("12345");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await drive.wait(300);
  await shot("7-paying");
  await drive.settleData();
  await drive.wait(2000);
  await drive.settleData();
  await shot("8-tickets");
  await expect(page.getByText("Sent to ada@example.com")).toBeVisible();
};
