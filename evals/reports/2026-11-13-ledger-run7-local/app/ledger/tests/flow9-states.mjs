// The states: nothing matching, with the one change that brings results back; a
// refusal said at the field it concerns, nothing typed lost; an in-place save the
// service refuses, kept marked with Retry; a slow service; a failed load with Retry;
// a chart read out by keyboard.
import { read, settle } from "./lib.mjs";

export default async ({ drive, expect, page }) => {
  // ── nothing matches
  await drive.set("app", "location", "transactions");
  await settle(drive);
  await page.getByRole("searchbox", { name: "Search transactions" }).fill("adobe zzqx");
  await drive.wait(400);
  await settle(drive);
  await drive.wait(100); await settle(drive);
  await expect.visible("app.main.txScreen.empty");
  await expect.text("app.main.txScreen.empty", "No transactions match");
  await expect.text("app.main.txScreen.empty", "“adobe zzqx”");
  const offer = await read(page, "app", "relax");
  console.log("offer: " + offer.label);
  if (!/^(Remove .+|Search all dates) to see \d+ transactions?$/.test(offer.label)) throw new Error("no offer: " + offer.label);
  await page.getByRole("button", { name: offer.label }).click();
  await settle(drive);
  if ((await read(page, "app", "listTotal")) == 0) throw new Error("the offer brought nothing back");
  await drive.call?.("app.clearAll()");
  await drive.set("app", "f", await page.evaluate(() => window.__declare.find("app").startFilter()));
  await settle(drive);

  // ── a refusal, said at its field; nothing typed is lost
  const sale = (await read(page, "app", "listRows")).find((r) => r.kind == "sale" && (r.refunded ?? 0) < r.amount);
  await page.evaluate((id) => window.__declare.find("app").startRefund(id), sale.id);
  await settle(drive);
  const sheet = page.getByRole("dialog", { name: "Record a transaction" });
  const first = sheet.getByLabel(/^Refund how many/).first();
  await first.fill("1");
  const date = sheet.getByLabel("Date", { exact: true }).last();
  await date.fill("2024-01-02");
  await date.press("Tab");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await settle(drive);
  await expect.attr("app", "recording", true);
  await expect(sheet.getByText("A refund can't be dated before its sale").first()).toBeVisible();
  expect.equal(await first.inputValue(), "1");
  console.log("refusal shown at the date; the quantity typed is still 1");
  await drive.set("app", "recording", false);
  await settle(drive);

  // ── an in-place save the service refuses: marked, with Retry
  // (a refund can't be dated before its sale: move one to the first of last year)
  const refunded = (await read(page, "app", "listRows")).find((r) => r.kind == "refund" && r.refundOf != null);
  if (refunded) {
    await page.evaluate((id) => window.__declare.find("app").patchCell(id, { date: "2025-01-01" }, "date", "Jan 1, 2025"), refunded.id);
    await settle(drive);
    await expect.visible("app.main.txScreen.unsaved");
    await expect.text("app.main.txScreen.unsaved", "Not saved");
    await expect.text("app.main.txScreen.unsaved", "Retry");
    console.log("unsaved bar: " + await read(page, "app", "failedWords"));
    await drive.click("app.main.txScreen.unsaved.2");
    await settle(drive);
    await expect.hidden("app.main.txScreen.unsaved");
  } else console.log("(no one-line refunded sale this month to refuse an edit on)");

  // ── a slow service says it is still working; the old figures stay, dimmed
  await drive.set("app", "location", "overview");
  await settle(drive);
  const before = await read(page, "app", "cur");
  const held = await drive.hold({ path: "/api/aggregates/periods" });
  await drive.click("app.main.bar.tools.1.prev");
  await drive.wait(1800);
  await expect.text("app.main.page.col.state", "Still working");
  expect.equal((await read(page, "app", "cur")).revenue.amount, before.revenue.amount);
  await expect.attr("app.main.page.col.overview", "opacity", 0.6);
  await held.release();
  await settle(drive);
  await expect.hidden("app.main.page.col.state");

  // ── a failed load says so, in place, with Retry; the rest still works
  await drive.set("app", "api", "http://127.0.0.1:9");
  await settle(drive); await drive.waitReal(300); await settle(drive);
  await expect.text("app.main.page.col.state", "couldn't be loaded");
  await expect.text("app.main.page.col.state", "Retry");
  await drive.set("app", "api", "http://127.0.0.1:8370");
  await settle(drive);
  await expect.hidden("app.main.page.col.state");

  // ── a chart read by keyboard: one stop, the arrows move, each point said in a sentence
  await page.getByRole("img", { name: /^Income vs expenses/ }).focus();
  await settle(drive);
  await drive.key("ArrowLeft");
  await drive.key("ArrowDown");
  await settle(drive);
  await expect.announced("Expenses, $");
  await expect.announced("transactions");
  await expect.announced("from ");
  const said = await page.evaluate(() => window.__declare.find("app.main.page.col.overview.ive.chart").sentence(window.__declare.find("app.main.page.col.overview.ive.chart").cursorIx, 1));
  console.log("said: " + said);
};
