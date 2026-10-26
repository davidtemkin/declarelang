// At a desk, no account, the keyboard alone: two seats, a new card, paid.
//
//   npx declare-verify my-apps/venue/venue.declare --assert my-apps/venue/checks/desk-keyboard.mjs

export const device = { width: 1280, height: 860, touch: false };

const focused = (page) => page.evaluate(() => {
  const e = document.activeElement;
  return e ? (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 80) : "";
});

export default async ({ drive, expect, page }) => {
  await drive.settleData();

  // the seventeenth performance, by Tab and Enter
  await drive.tab(18);
  const row = await focused(page);
  if (!/Fri 11 Dec/.test(row)) throw new Error("expected the 11 Dec row to have focus, found: " + row);
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "screen", "hall");

  // into the plan, which is one stop: choose a seat, move along, choose another
  await drive.tab();
  const first = await focused(page);
  if (!/, row [A-Z], seat \d+$/.test(first)) throw new Error("expected a seat to have focus, found: " + first);
  await drive.key("Space");
  await drive.key("ArrowRight");
  await drive.key("ArrowDown");
  const second = await focused(page);
  await drive.key("Space");
  await drive.settleMotion();
  await expect.equal((await page.evaluate(() => window.__declare.find("app").chosen.length)), 2);
  console.log("chose", first, "and", second);

  // on through the panel to checkout
  for (let i = 0; i < 6; i++) {
    await drive.tab();
    if ((await focused(page)) == "Continue to checkout") break;
  }
  await drive.key("Enter");
  await drive.settleMotion();
  await expect.attr("app", "screen", "checkout");

  // the form, field by field
  await drive.tab();
  if ((await focused(page)) != "Email") throw new Error("expected Email, found " + (await focused(page)));
  await drive.type("grace@example.com");
  await drive.tab(); await drive.type("Grace Hopper");
  await drive.tab(); await drive.type("5555555555554444");
  await drive.tab(); await drive.type("1229");
  await drive.tab(); await drive.type("321");
  await drive.tab(); await drive.type("1 Infinite Loop");
  await drive.tab();
  await drive.tab(); await drive.type("Cupertino");
  await drive.tab(); await drive.type("United States");
  await drive.key("Enter");
  await drive.tab(); await drive.type("95014");
  await expect.attr("app.pay", "number", "5555 5555 5555 4444");
  await expect.attr("app.pay", "country", "US");
  await drive.key("Enter");
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/orders", { count: 1, body: { email: "grace@example.com" } });
  await expect.attr("app", "screen", "tickets");
  await expect.text("app.ticketsScreen", "Sent to grace@example.com");
  console.log("focus after paying:", await focused(page));
};
