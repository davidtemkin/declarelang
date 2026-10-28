import { open, freeSeats } from "./lib.mjs";
const { browser, page, requests } = await open();
const focused = () => page.evaluate(() => (document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent || "").slice(0, 60));
try {
  // Tab to the first performance and open it
  for (let i = 0; i < 10; i++) { await page.keyboard.press("Tab"); if ((await focused()).startsWith("Sat 14 Nov")) break; }
  console.log("on:", await focused());
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  for (let i = 0; i < 6; i++) { await page.keyboard.press("Tab"); const f = await focused(); if (/row/.test(f)) break; }
  console.log("seat focus:", await focused());
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowLeft");
  console.log("after left:", await focused());
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  console.log("after down:", await focused());
  console.log("summary:", await page.getByText(/^2 seats · /).first().textContent());
  for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); if ((await focused()).includes("Continue")) break; }
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  console.log("checkout focus:", await focused());
  // 409: someone buys our first seat before we pay
  const ids = JSON.parse((requests.at(-1)?.[2]) ?? "null");
  const chosenNames = await page.locator("text=/, row .*, seat/").allTextContents();
  console.log("chosen lines", chosenNames.slice(0, 4));
  const [sec, rest] = chosenNames[0].split(", row ");
  const [row, num] = rest.split(", seat ");
  const key = { Orchestra: "ORCH", "Grand Tier": "GT", "Dress Circle": "DC", Balcony: "BALC" }[sec];
  await fetch("http://127.0.0.1:8350/api/orders", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ performanceId: "p02", seatIds: [`${key}-${row}-${num}`], email: "x@y.co", payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "X" }, billing: { line1: "1", city: "c", postalCode: "94103", country: "US" } } }) });
  // type everything with the keyboard; Enter moves to the next field
  await page.keyboard.press("Tab"); // past heading into first field (sign in button maybe)
  for (let i = 0; i < 4; i++) { const f = await focused(); if (f == "Email") break; await page.keyboard.press("Tab"); }
  console.log("field:", await focused());
  for (const t of ["k@example.com", "K Board", "4000000000000127", "0130", "123", "2 Elm", "", "Toronto", "M4B 1B3"]) {
    await page.keyboard.type(t); await page.keyboard.press("Enter");
  }
  await page.waitForTimeout(400);
  console.log("focused after enters:", await focused());
  for (let i = 0; i < 6; i++) { await page.keyboard.press("Tab"); if ((await focused()).startsWith("Pay")) break; }
  console.log("on:", await focused());
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);
  console.log("orders:", requests.filter(r => r[1].includes("orders")).length);
  console.log("back in hall? continue btn:", await page.getByRole("button", { name: "Continue to checkout" }).count(), "notice:", await page.getByText(/just taken/).first().textContent().catch(() => "none"));
  console.log("summary now:", await page.getByText(/^1 seat · /).first().textContent().catch(() => "none"), "focus:", await focused());
  await page.screenshot({ path: "/tmp/vshots/kb-409.png" });
  await page.getByRole("button", { name: "Continue to checkout" }).press("Enter");
  await page.waitForTimeout(600);
  console.log("fields kept:", await page.getByRole("textbox", { name: "Card number" }).inputValue(), "| err shown:", await page.getByText(/just taken/).count());
  await page.getByRole("button", { name: /^Pay/ }).press("Enter");
  await page.waitForTimeout(2500);
  console.log("422 focus:", await focused(), "| msgs:", await page.locator("text=/code/i").allTextContents());
  await page.screenshot({ path: "/tmp/vshots/kb-422.png" });
} finally { await browser.close(); }
