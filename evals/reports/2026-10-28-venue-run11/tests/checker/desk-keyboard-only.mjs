// Desk, keyboard alone, no account: Tab to a performance, Enter; Tab into the
// plan, arrows and Space choose two seats; Tab to Continue; fill the form by
// Tab alone; Enter pays. Two tickets.
import { read } from "./lib.mjs";

const focused = (page) => page.evaluate(() => {
  const e = document.activeElement;
  return e ? (e.getAttribute("aria-label") || e.getAttribute("name") || e.textContent?.trim().slice(0, 40) || e.tagName) : null;
});

async function tabTo(drive, page, test, max = 60) {
  const seen = [];
  for (let i = 0; i < max; i++) {
    await drive.key("Tab");
    const f = await focused(page);
    seen.push(f);
    if (test(f)) return f;
  }
  throw new Error("Tab never reached it; focus went through: " + seen.join(" | "));
}

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  if (await read(drive, "app", "signedIn")) throw new Error("starts signed in (shared browser cookie) — sign out first");

  await tabTo(drive, page, (f) => /Dec, 7:30pm/.test(f || ""));
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "screen", "hall");

  const first = await tabTo(drive, page, (f) => /, row [A-Z], seat \d+/.test(f || ""));
  console.log("PLAN ENTERED AT", first);
  await drive.key("Space");
  await drive.settleMotion();
  await drive.key("ArrowLeft");
  await drive.settleMotion();
  await drive.key("Space");
  await drive.settleMotion();
  const chosen = await read(drive, "app", "chosen");
  console.log("CHOSEN", JSON.stringify(chosen));
  expect.equal(chosen.length, 2);

  await tabTo(drive, page, (f) => /Continue to checkout/.test(f || ""));
  await drive.key("Enter");
  await drive.settleMotion();
  await expect.attr("app", "screen", "checkout");
  console.log("FOCUS AT CHECKOUT", await focused(page));

  const fill = [["Email", "keys@example.com"], ["Name on card", "Key Board"], ["Card number", "5555555555554444"],
    ["Expiry", "0429"], ["Security code", "321"], ["Street address", "10 Downing St"], ["City", "Toronto"], ["Postal code", "K1A 0B1"]];
  for (const [label, value] of fill) {
    await tabTo(drive, page, (f) => (f || "").startsWith(label) || (label == "Expiry" && /expiry/i.test(f || "")) || (label == "Security code" && f == "cvc"), 12);
    await drive.type(value);
  }
  await drive.settleMotion();
  expect.equal(await read(drive, "app", "country"), "CA");
  // Enter in the last field moves on (the form's enterMoves); Tab to Pay and press it
  const pay = await tabTo(drive, page, (f) => /^Pay \$/.test(f || ""), 12);
  console.log("PAY BUTTON", pay);
  await drive.key("Enter");
  await drive.key("Enter");
  await drive.waitReal(2500);
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/orders", { count: 1, body: { email: "keys@example.com" } });
  await expect.attr("app", "screen", "tickets");
  await expect.text("app.ticketsScreen", "Ticket 1 of 2");
  console.log("FOCUS AT TICKETS", await focused(page));
};
