// Done 3: record a sale at the Market — two mugs and a print. Then refund one mug;
// the sale shows what was refunded.
import { read, settle } from "./lib.mjs";

export default async ({ drive, expect, page }) => {
  await drive.set("app", "location", "transactions");
  await settle(drive);
  await drive.click("app.side.newBtn");
  await settle(drive);
  const sheet = page.getByRole("dialog", { name: "Record a transaction" });
  await sheet.getByRole("radio", { name: "Sale" }).click();
  await sheet.getByRole("radio", { name: "Market" }).click();
  await sheet.getByRole("button", { name: /^Add Speckled mug/ }).click();
  await sheet.getByRole("button", { name: /^Add Speckled mug/ }).click();
  await sheet.getByRole("button", { name: /^Add Art print A4/ }).click();
  await settle(drive);
  await expect(sheet.getByText("Total $88.00")).toBeVisible();
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await settle(drive);
  await expect.attr("app", "recording", false);
  const d = await read(page, "app.detail", "value");
  expect.equal(d.kind, "sale");
  expect.equal(d.channel, "market");
  expect.equal(d.amount, 8800);
  console.log("sale " + d.id + " lines " + d.lines.map((l) => l.description + "×" + l.quantity).join(", "));
  await expect.text("app.main.txScreen.body.detailPane", "Margin");

  // refund one mug, from the sale itself
  await page.getByRole("button", { name: "Refund…" }).click();
  await settle(drive);
  await expect(sheet.getByText("2 of 2 left to refund").first()).toBeVisible();
  await sheet.getByLabel("Refund how many Speckled mug").fill("1");
  await settle(drive);
  await expect(sheet.getByText("Total $32.00")).toBeVisible();
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await settle(drive);
  await expect.attr("app", "recording", false);
  const r = await read(page, "app.detail", "value");
  expect.equal(r.kind, "refund");
  expect.equal(r.amount, 3200);
  // the refund links to its sale; open it, and the sale says what was refunded
  await page.getByRole("button", { name: /^Open Market/ }).first().click().catch(async () => {
    await page.getByRole("button", { name: new RegExp("^Open ") }).first().click();
  });
  await settle(drive);
  const s2 = await read(page, "app.detail", "value");
  expect.equal(s2.id, d.id);
  expect.equal(s2.refunded, 3200);
  await expect.text("app.main.txScreen.body.detailPane", "Refunded $32.00");
  await expect.text("app.main.txScreen.body.detailPane", "1 refunded");
};
