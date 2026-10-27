// Desk, keyboard alone: pick a performance, two seats, fill the card, pay.
export default async ({ drive, expect, page }) => {
  const active = () => page.evaluate(() => {
    const a = document.activeElement;
    return a ? (a.getAttribute("aria-label") || a.getAttribute("autocomplete") || a.textContent || a.tagName).slice(0, 60) : null;
  });
  const log = async (what) => console.log(what.padEnd(16), "→", await active());
  await drive.settleData();
  for (let i = 0; i < 12; i++) {
    await drive.key("Tab");
    if ((await active() ?? "").startsWith("Wed 18 Nov")) break;
  }
  await log("card");
  await drive.key("Enter");
  await drive.settleData(); await drive.settleMotion();
  await log("after Enter");
  await drive.key("Tab"); await log("Tab");
  for (const k of ["ArrowDown", "ArrowDown", "ArrowRight", "ArrowRight"]) await drive.key(k);
  await log("arrows");
  await drive.key("Space");
  await drive.key("ArrowUp"); await log("up");
  await drive.key("Space");
  await drive.settleMotion();
  const n = await page.evaluate(() => window.__declare.find("app").chosen.length);
  if (n != 2) throw new Error("expected 2 seats chosen, got " + n);
  console.log("chosen", JSON.stringify(await page.evaluate(() => window.__declare.find("app").chosen)));
  await drive.key("Tab"); await log("Tab");
  await drive.key("Enter");
  await drive.settleMotion();
  await log("checkout");
  const typing = [["", null], ["ada@example.com"], ["Ada Lovelace"], ["4242424242424242"], ["0430"], ["123"], ["Canada"], ["1 Front St W"], [""], ["Toronto"], ["M5J 1E6"]];
  await drive.key("Tab"); await log("Tab 1");      // Sign in
  for (const [text] of typing.slice(1)) {
    await drive.key("Tab");
    await log("field");
    if (text) await drive.type(text);
    if (text == "Canada") { await drive.key("Enter"); }
  }
  await drive.key("Enter");                          // Return in the last field pays
  await drive.settleData(); await drive.settleMotion();
  await log("after pay");
  await expect.visible("app.ticketsScreen");
  await expect.request("POST", "/api/orders", { count: 1, body: { email: "ada@example.com" } });
};
