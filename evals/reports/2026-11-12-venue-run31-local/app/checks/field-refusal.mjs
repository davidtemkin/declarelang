// The service says one field is wrong: that field carries its sentence, and
// the focus goes to it.
const API = "http://127.0.0.1:8350";

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Sun 13 Dec, 2:00pm/ }).click();
  await drive.settleData();
  const map = await (await fetch(`${API}/api/performances/p19/seats`)).json();
  const s = map.sections[3];
  const row = s.rows.find((r) => r.seats.some((x) => x.status == "available"));
  const seat = row.seats.find((x) => x.status == "available");
  await page.getByRole("checkbox", { name: `${s.name}, row ${row.name}, seat ${seat.number}`, exact: true }).click();
  await page.getByRole("button", { name: "Continue to checkout" }).click();

  await page.getByLabel("Email").fill("guest@example.com");
  await page.getByLabel("Name on card").fill("Grace Hopper");
  await page.getByLabel("Card number").pressSequentially("4000000000000127");
  await page.getByLabel("Expiry").pressSequentially("0430");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Street address").fill("1 Main Street");
  await page.getByLabel("City").fill("Springfield");
  await page.getByLabel("Postal code").fill("94110");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await drive.settleData();
  await drive.wait(100);
  const sent = (await drive.requests()).filter((r) => r.path.startsWith("/api/orders"));
  await expect(page.getByLabel("Security code")).toBeFocused();
  await page.screenshot({ path: "/tmp/venue-field-refusal.png" });
  expect(sent.length).toBe(1);
  expect(sent[0].status).toBe(422);
};
