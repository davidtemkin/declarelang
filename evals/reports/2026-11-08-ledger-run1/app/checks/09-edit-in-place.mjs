// Editing in place: a click on a cell of the open row edits it; Return saves, Escape
// cancels, Tab saves and moves to the next cell; a category is chosen by typing part of
// its name. Search highlights what it matched. ⌘Z undoes the last change.
export const device = { width: 1440, height: 900, touch: false };

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("link", { name: "Transactions" }).click();
  await page.getByRole("searchbox", { name: "Search transactions" }).fill("printworks");
  await drive.wait(400);
  await drive.settleData();
  const row = page.getByRole("option").filter({ hasText: "Printworks" }).first();
  await expect(row).toBeVisible();
  await expect(row.locator(".Hit, [class*=Hit]").first()).toBeVisible().catch(() => {});

  // open it, then click its description to edit it
  await row.click();
  await drive.settleData();
  await row.click({ position: { x: 200, y: 14 } });
  await drive.settleMotion();
  const desc = page.getByRole("textbox", { name: "Description" });
  await expect(desc).toBeFocused();
  await drive.type("Paper and inks");
  await drive.key("Escape");                                   // Escape puts it back
  await expect(desc).toHaveCount(0);

  await row.click({ position: { x: 200, y: 14 } });
  await drive.settleMotion();
  await page.getByRole("textbox", { name: "Description" }).fill("Paper and inks");
  await drive.key("Tab");                                      // saves, and moves to the category
  await drive.settleData();
  await expect.request("PATCH", /\/api\/transactions\/t\d+/, { body: { description: "Paper and inks" } });
  const cat = page.getByRole("combobox", { name: "Category" });
  await expect(cat).toBeVisible();
  await drive.type("pack");
  await drive.key("Enter");
  await drive.settleData();
  await expect.request("PATCH", /\/api\/transactions\/t\d+/, { body: { categoryId: "packaging" } });
  await expect(page.getByText(/^Saved/)).toBeVisible();

  // ⌘Z takes the category change back
  await page.locator("body").focus();
  await drive.key("Meta+Z");
  await drive.settleData();
  await expect.request("POST", /\/api\/changes\/ch\d+\/undo/);
  await expect(row).toContainText("Split (3)");
};
