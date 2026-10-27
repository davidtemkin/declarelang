// At a desk with no account: the keyboard alone, and a seat taken by someone else meanwhile.
const buy = (perf, seatId) => fetch("http://127.0.0.1:8350/api/orders", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ performanceId: perf, seatIds: [seatId], email: "other@example.com",
    payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2028, cvc: "123", name: "Someone Else" },
      billing: { line1: "1 Main St", line2: null, city: "Springfield", postalCode: "94110", country: "US" } } }) });

export default async ({ drive, expect, page }) => {
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.slice(0, 40) || document.activeElement?.tagName);
  await drive.settleData();
  await drive.tab(); // header? first stop
  let f = await focused();
  for (let i = 0; i < 6 && !/Fri 13 Nov/.test(f); i++) { await drive.tab(); f = await focused(); }
  console.log("on", f);
  await drive.key("Enter");
  await drive.settleData(); await drive.settleMotion();
  console.log("after open, focus:", await focused());
  for (let i = 0; i < 8 && !/^(Orchestra|Grand|Dress|Balcony), row/.test(f = await focused()); i++) await drive.tab();
  console.log("in hall at", f);
  await drive.key("ArrowDown"); await drive.key("ArrowDown"); await drive.key("ArrowLeft");
  const first = await focused();
  await drive.key(" ");
  await drive.key("ArrowRight"); await drive.key("ArrowRight");
  const second = await focused();
  await drive.key(" ");
  await drive.settleMotion();
  console.log("chose", first, "and", second, await page.evaluate(() => window.__declare.find("app").chosen));
  await expect.attr("app", "screen", "hall");
  const ids = await page.evaluate(() => window.__declare.find("app").chosen);
  await expect.equal(ids.length, 2);

  // someone else buys the second
  const r = await buy("p01", ids[1]);
  console.log("other buyer:", r.status);
  await drive.wait(1500); await drive.settleData();
  await expect.equal((await page.evaluate(() => window.__declare.find("app").chosen)).length, 1);
  console.log("notice:", await page.evaluate(() => window.__declare.find("app").notice));
  await page.screenshot({ path: "/tmp/venue-shots/taken.png" });

  // onward with the keys
  for (let i = 0; i < 12 && (f = await focused()) != "Continue"; i++) await drive.tab();
  await drive.key("Enter");
  await drive.settleMotion();
  await expect.attr("app", "screen", "checkout");
  console.log("checkout focus:", await focused());
  await drive.tab(); console.log("next:", await focused());
  const fill = [["Email", "kb@example.com"], ["Name on card", "Kay Board"], ["Card number", "5555555555554444"],
    ["Expiry", "1229"], ["Security code", "321"], ["Street address", "1 Main Street"], ["Address line 2 (optional)", ""],
    ["City", "Toronto"], ["Postal code", "M4B 1B3"]];
  for (const [name, text] of fill) {
    for (let i = 0; i < 6 && (f = await focused()) != name; i++) await drive.tab();
    if (f != name) throw new Error("never reached " + name + ", at " + f);
    if (text) await drive.type(text);
  }
  await drive.tab();
  console.log("country focus:", await focused(), await page.evaluate(() => window.__declare.find("app.checkout").country));
  await page.screenshot({ path: "/tmp/venue-shots/kb-checkout.png", fullPage: true });
  for (let i = 0; i < 6 && !/^Pay /.test(f = await focused()); i++) await drive.tab();
  console.log("on", f);
  await drive.key("Enter"); await drive.key("Enter");
  await drive.settleData();
  await expect.request("POST", "/api/orders", { count: 1 });
  await expect.attr("app", "screen", "tickets");
  console.log("tickets focus:", await focused());
};
