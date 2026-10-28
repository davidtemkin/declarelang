import { open } from "./lib.mjs";
const { browser, page } = await open();
try {
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("textbox", { name: "Email" }).last().fill("ada@example.com");
  await page.getByRole("textbox", { name: "Password" }).fill("nope");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  console.log(await page.getByText("That email and password don't match.").evaluateAll(es => es.map(e => e.outerHTML.slice(0, 200) + " visible=" + !!(e.offsetWidth))));
  await page.getByRole("textbox", { name: "Password" }).fill("correct horse battery");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  console.log("focused:", await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)));
  await page.goto("http://127.0.0.1:8200/my-apps/venue/venue.declare#p02");
  await page.waitForTimeout(2500);
  console.log("still signed in after reload:", await page.getByRole("button", { name: "Sign out" }).count());
} finally { await browser.close(); }
