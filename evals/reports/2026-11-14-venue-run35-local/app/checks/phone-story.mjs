// The brief's phone story: Friday's performance, three seats across two
// sections by thumb, one taken by someone else meanwhile, sign in at checkout,
// a declined saved card, then a new card with a mistyped postcode, and three
// tickets.
export const device = { width: 390, height: 844, touch: true };

const API = "http://127.0.0.1:8350";

export default async ({ drive, expect, page }) => {
  const shot = (n) => page.screenshot({ path: `/tmp/venue-shots/p-${n}.png` });

  await page.getByRole("button", { name: /^Fri 13 Nov/ }).click();
  await drive.settleData();
  await drive.settleMotion();
  await shot("1-house");

  // The whole house is in view; a tap zooms in where it lands — here at the
  // back of the Orchestra, so the Grand Tier is in reach too.
  const surface = "app.body.hallScreen.stagePart.phoneHall";
  const box = await page.evaluate((p) => { const v = window.__declare.find(p); return { w: v.width, h: v.height }; }, surface);
  const hallBox = await page.evaluate((p) => { const v = window.__declare.find(p); return { x: v.panX, y: v.panY, z: v.zoom, h: v.hallH }; }, surface);
  // the Orchestra ends a little under 60% of the way down the hall
  await drive.clickAt(surface, box.w / 2, hallBox.y + hallBox.h * hallBox.z * 0.42);
  await drive.settleMotion();
  await shot("2-zoomed");

  // Free seats fully in view, in a section, by the program's own geometry.
  const onScreen = async (section) => {
    const paths = await page.evaluate(({ hall, section }) => {
      const out = [];
      const walk = (n) => {
        if (n.kind == "Seat") {
          const v = window.__declare.find(n.path);
          if (!v.sold && !v.mine && v.accessibilityLabel.startsWith(section + ",") && n.inView
              && n.rootX > 8 && n.rootX + n.width < 382 && n.rootY > 200 && n.rootY + n.height < 740) out.push(n.path);
        }
        (n.children ?? []).forEach(walk);
      };
      walk(window.__declare.inspect(hall));
      return out;
    }, { hall: surface + ".hall", section });
    return paths;
  };
  const nameOf = (p) => drive.read(p + ".accessibilityLabel");
  const orch = await onScreen("Orchestra");
  const gt = await onScreen("Grand Tier");
  console.log("on screen:", orch.length, "orchestra,", gt.length, "grand tier");
  const a = await nameOf(orch[0]), b = await nameOf(orch[2]), c = await nameOf(gt[0]);
  await drive.click(orch[0]); await drive.click(orch[2]); await drive.click(gt[0]);
  await drive.settleMotion();
  await expect(page.getByText(/^3 seats · \$\d+\.\d\d$/)).toBeVisible();
  await shot("3-three");
  console.log("chosen:", a, "|", b, "|", c);

  // Someone else buys the second one.
  const [sec, row, num] = b.match(/^(.*), row (.*), seat (\d+)$/).slice(1);
  const key = { "Orchestra": "ORCH", "Grand Tier": "GT", "Dress Circle": "DC", "Balcony": "BALC" }[sec];
  const theirs = `${key}-${row}-${num}`;
  const status = await page.evaluate(async ({ api, id }) => {
    const r = await fetch(api + "/api/orders", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ performanceId: "p01", seatIds: [id], email: "someone@example.com",
        payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "Someone" },
          billing: { line1: "1 Road", line2: null, city: "Town", postalCode: "94103", country: "US" } } }) });
    return r.status;
  }, { api: API, id: theirs });
  console.log("someone else bought", theirs, status);
  await drive.waitReal(1500);
  await drive.settleMotion();
  await expect(page.getByText(/^2 seats · \$\d+\.\d\d$/)).toBeVisible();
  await expect(page.getByText(b + " was just taken by someone else.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: b })).toBeDisabled();
  await shot("4-taken");

  // They choose another.
  const more = await onScreen("Orchestra");
  await drive.click(more[0]);
  await drive.settleMotion();
  await expect(page.getByText(/^3 seats · \$\d+\.\d\d$/)).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await page.getByLabel("Email").fill("ada.l@example.com");
  await shot("5-checkout");

  // Sign in, halfway through paying.
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await drive.settleMotion();
  const dlg = page.getByRole("dialog", { name: "Sign in" });
  await dlg.getByLabel("Email").fill("ada@example.com");
  await dlg.getByLabel("Password").fill("wrong one");
  await expect(dlg.getByLabel("Password")).toHaveAttribute("type", "password");
  await dlg.getByRole("checkbox", { name: "Show password" }).click();
  await expect(dlg.getByLabel("Password")).toHaveAttribute("type", "text");
  await dlg.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await expect(dlg.getByText("That email and password don't match.")).toBeVisible();
  await shot("6-wrong");
  await dlg.getByLabel("Password").fill("correct horse battery");
  await dlg.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/^3 seats with fees$/)).toBeVisible();
  const visa = page.getByRole("radio", { name: /Visa ending 4242/ });
  const mc = page.getByRole("radio", { name: /Mastercard ending 4444/ });
  await expect(visa).toBeChecked();
  await expect(mc).toBeDisabled();
  await shot("7-signed-in");

  // The saved card asks only for its code; the bank declines it.
  await page.getByLabel("Security code").fill("000");
  const pay = page.getByRole("button", { name: /^Pay \$\d+\.\d\d$/ });
  console.log("pay:", await pay.innerText());
  await pay.click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole("status").filter({ hasText: /declined/i })).toBeVisible();
  await expect(page.getByLabel("Security code")).toHaveValue("");
  await shot("8-declined");

  // A new card: the number groups itself; the account filled the rest.
  await page.getByRole("radio", { name: "A new card" }).click();
  await expect(page.getByLabel("Email")).toHaveValue("ada.l@example.com");
  await expect(page.getByLabel("Name on card")).toHaveValue("Ada Lovelace");
  await page.getByLabel("Card number").pressSequentially("5555555555554444");
  await expect(page.getByLabel("Card number")).toHaveValue("5555 5555 5555 4444");
  await expect(page.getByText("Mastercard", { exact: true })).toBeVisible();
  await page.getByLabel("Expiry").pressSequentially("0930");
  await page.getByLabel("Security code").pressSequentially("321");
  await expect(page.getByRole("radio", { name: "United Kingdom" })).toBeChecked();
  const postal = page.getByLabel("Postal code");
  await postal.fill("");
  await postal.pressSequentially("WC1N");
  await expect(page.getByText("Enter a postcode like EC1A 1BB.")).toHaveCount(0);   // not while typing
  await postal.blur();
  await drive.settleMotion();
  await expect(page.getByText("Enter a postcode like EC1A 1BB.")).toBeVisible();      // once they move on
  await shot("9-postcode");
  await postal.fill("WC1N 1AB");
  await expect(page.getByText("Enter a postcode like EC1A 1BB.")).toHaveCount(0);
  await pay.click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText("Sent to ada.l@example.com")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your 3 tickets" })).toBeVisible();
  await shot("10-tickets");
  await page.getByRole("button", { name: "Next" }).click();
  await drive.settleMotion();
  await expect(page.getByText("Ticket 2 of 3")).toBeVisible();
  await shot("11-ticket2");
};
