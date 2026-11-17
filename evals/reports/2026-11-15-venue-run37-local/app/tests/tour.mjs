// A picture of every screen a person reaches, at the size the TOUR_DEVICE
// environment names ("phone" or "desk"), written to TOUR_OUT. Not a test of
// behaviour — the flow scripts are — but the way to look at each screen.

import { freeSeats, seatName } from "./helpers.mjs";

const phone = (process.env.TOUR_DEVICE ?? "phone") == "phone";
const out = process.env.TOUR_OUT ?? "/tmp/venue-tour";
export const device = phone ? { width: 390, height: 844, touch: true } : { width: 1280, height: 800, touch: false };

export default async ({ drive, page }) => {
  const shot = async (name) => { await drive.settleMotion(); await page.screenshot({ path: `${out}/${phone ? "phone" : "desk"}-${name}.png` }); };
  await shot("1-list");
  await page.getByRole("button", { name: /^Sat 21 Nov/ }).click();
  await drive.settleData();
  await shot("2-hall");
  const seats = await freeSeats(page, "ORCH", 2);
  for (const id of seats) {
    const b = page.getByRole("button", { name: seatName(id), exact: true });
    await b.click();
    await drive.settleMotion();
    if (phone && (await b.getAttribute("aria-pressed")) == "false") await b.click();
  }
  await shot("3-chosen");
  await page.getByRole("button", { name: "Continue" }).click();
  await shot("4-checkout");
  await page.getByRole("button", { name: /^Pay/ }).click();
  await shot("5-checkout-errors");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await shot("6-signin");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill("a@a.co");
  await dialog.getByLabel("Password").fill("pass");
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await shot("7-signed-in");
  await page.getByLabel("Security code").fill("123");
  await page.getByRole("button", { name: /^Pay/ }).click();
  await drive.settleData();
  await shot("8-tickets");
  await page.getByRole("button", { name: "Sign out" }).click();
  await drive.settleData();
};
