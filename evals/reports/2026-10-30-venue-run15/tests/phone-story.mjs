// The brief's phone story: Friday's performance, three seats across two
// sections with a thumb, sign in halfway through paying, a decline on the
// saved Visa, then a new card, a mistyped postcode, and three tickets.
//
// Pictures go to $SHOTS (default /tmp/shots) so the phone layout can be looked at.

export const device = { width: 390, height: 844, touch: true };

const SHOTS = process.env.SHOTS || "/tmp/shots";

// free seats whose centre is on screen, inside the room
const free = (page, prefix, n) =>
  page.evaluate((prefix, n) => [...document.querySelectorAll('[role="button"][aria-pressed]')]
    .filter((e) => { const r = e.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2;
      return x > 30 && x < 360 && y > 170 && y < 640; })
    .filter((e) => e.getAttribute("aria-disabled") !== "true" && (e.getAttribute("aria-label") || "").startsWith(prefix))
    .slice(0, n).map((e) => e.getAttribute("aria-label")), prefix, n);

export default async ({ drive, expect, page }) => {
  const shot = async (name) => { await drive.settleMotion(); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

  await drive.settleData();
  await shot("p-list");
  await page.getByRole("button", { name: /^Fri 13 Nov, 7:30pm/ }).click();
  await drive.settleData();
  await shot("p-hall");

  // from far away a tap goes in close, about the bottom of the orchestra;
  // then the seats under the thumb are chosen
  await drive.clickAt("app.hallView", 190, 330);
  await shot("p-hall-zoomed");
  await expect.attr("app.hallView", "zoomed", true);

  // two seats here; then back out to the whole hall, in close somewhere
  // else, and one seat in another section
  const sections = ["Orchestra", "Grand Tier", "Dress Circle", "Balcony"];
  const near = async () => { const m = {}; for (const s of sections) m[s] = await free(page, s, 2); return m; };
  const here = await near();
  const two = sections.find((s) => here[s].length >= 2);
  if (!two) throw new Error("on screen: " + JSON.stringify(here));
  for (const n of here[two]) await page.getByRole("button", { name: n, exact: true }).click();
  await expect.text("app", "2 seats · $");
  await page.getByRole("button", { name: "Whole hall" }).click();
  await drive.settleMotion();
  await drive.clickAt("app.hallView", 190, 470);
  await drive.settleMotion();
  const there = await near();
  const one = sections.find((s) => s != two && there[s].length >= 1);
  if (!one) throw new Error("on screen: " + JSON.stringify(there));
  await page.getByRole("button", { name: there[one][0], exact: true }).click();
  await drive.settleMotion();
  await expect.text("app", "3 seats · $");
  await shot("p-hall-chosen");

  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await shot("p-checkout");

  // something typed before signing in stays typed
  await page.getByLabel("Card number").fill("4000000000000002");
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleMotion();
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await expect.text("app", "That email and password don't match.");
  await shot("p-signin-wrong");
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await shot("p-checkout-signed-in");
  await expect.text("app", "Visa ending 4242");
  await expect.text("app", "Mastercard ending 4444 · expired 08/26");

  // the saved Visa, declined
  await page.getByLabel("Security code").fill("000");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await drive.settleData();
  await drive.settleMotion();
  await shot("p-declined");

  // a new card: the number typed earlier is still there
  await page.getByRole("radio", { name: "A new card" }).click();
  await expect.equal(await page.getByLabel("Card number").inputValue(), "4000 0000 0000 0002");
  await page.getByLabel("Card number").fill("4242424242424242");
  await page.getByLabel("Expiry").fill("0428");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Postcode").fill("WC1N");
  await page.getByLabel("City").click();
  await shot("p-postcode-wrong");
  await page.getByLabel("Postcode").fill("WC1N 1AB");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await drive.settleData();
  await shot("p-tickets");
  await expect.text("app", "Sent to ada@example.com");
};
