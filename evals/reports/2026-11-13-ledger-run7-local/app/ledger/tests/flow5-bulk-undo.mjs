// Done 5: clear the filters; filter to Uncategorised; select all; categorise as
// Other; undo with ⌘Z.
import { read, settle } from "./lib.mjs";

export default async ({ drive, expect, page }) => {
  await drive.set("app", "location", "transactions");
  await settle(drive);
  await drive.call?.("app.clearAll()");
  await page.getByRole("button", { name: "Category" }).click();
  await settle(drive);
  await page.getByRole("checkbox", { name: "Uncategorised" }).click();
  await settle(drive);
  await drive.key("Escape");
  await settle(drive);
  const f = await read(page, "app", "f");
  expect.equal(f.cats.join(","), "none");
  expect.equal(f.preset, "this-month");
  await expect.text("app.main.bar", "Uncategorised");
  const before = await read(page, "app", "listTotal");
  console.log("uncategorised this month: " + before);
  if (before == 0) throw new Error("nothing uncategorised to work on");

  await page.getByRole("button", { name: "Select all" }).click();
  await settle(drive);
  await expect.text("app.main.txScreen.summary", "All " + before + " matching transaction");
  await page.getByRole("button", { name: "Categorise", exact: true }).click();
  await settle(drive);
  await page.getByRole("menuitem", { name: "Other", exact: true }).click();
  await settle(drive);
  const req = (await drive.requests()).filter((r) => r.path.includes("/bulk")).pop();
  console.log("sent " + JSON.stringify(req.body));
  expect.equal(req.body.expectedCount, before);
  expect.equal(await read(page, "app", "listTotal"), 0);
  await expect(page.getByText(/Categorised \d+ transactions? as Other/).first()).toBeVisible();

  // ⌘Z takes it back
  await page.getByRole("grid", { name: "Transactions" }).focus().catch(() => {});
  await drive.key("Mod+Z");
  await settle(drive);
  expect.equal(await read(page, "app", "listTotal"), before);
  await expect(page.getByText(/^Undone/).first()).toBeVisible();
};
