// Conduit on a phone held upright, with a finger, against the running API.
// npx declare-verify my-apps/conduit/conduit.declare --assert my-apps/conduit/tests/phone.mjs

export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect, page }) => {
  const id = Date.now().toString(36);
  const title = `From a phone ${id}`;
  const menu = async () => {
    await page.getByRole("button", { name: "Menu" }).click();
    await drive.settleMotion();
    return page.getByRole("dialog", { name: "Menu" });
  };

  // a visitor: the feed, a page, a tag; the navbar's links are behind the menu
  await expect(page.getByText("A place to share your knowledge.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await page.getByRole("button", { name: "Page 3" }).click();
  await drive.settleData();
  await expect.request("GET", "/api/articles?limit=10&offset=20");
  await page.getByRole("button", { name: "Tag rust" }).click();
  await drive.settleData();
  await expect(page.getByRole("option", { name: "#rust" })).toBeVisible();

  // signing in through the menu sheet
  let sheet = await menu();
  await sheet.getByRole("link", { name: "Sign in" }).click();
  await drive.settleMotion();
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
  await page.getByPlaceholder("Email").fill("jake@jake.jake");
  await page.getByPlaceholder("Password").fill("jakejake");
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await page.getByRole("option", { name: "Your Feed" }).click();
  await drive.settleData();
  await expect.request("GET", "/api/articles/feed?limit=10&offset=0");

  // reading an article from the feed, and favoriting it from its foot
  await page.getByRole("link", { name: /Read more/ }).first().click();
  await drive.settleData();
  await expect(page.getByRole("button", { name: /Favorite Article|Unfavorite Article/ }).first()).toBeVisible();
  await expect(page.getByPlaceholder("Write a comment...")).toBeVisible();

  // writing an article
  sheet = await menu();
  await sheet.getByRole("link", { name: "New Article" }).click();
  await drive.settleData();
  await page.getByPlaceholder("Article Title").fill(title);
  await page.getByPlaceholder("What's this article about?").fill("Written with a thumb.");
  await page.getByPlaceholder("Write your article (in markdown)").fill("Short and *sweet*.");
  await page.getByPlaceholder("Enter tags").fill("mobile");
  await page.getByPlaceholder("Enter tags").press("Enter");
  await expect(page.getByRole("button", { name: "Remove tag mobile" })).toBeVisible();
  await page.getByRole("button", { name: "Publish Article" }).click();
  await drive.settleData();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // a comment, then the article goes
  await page.getByPlaceholder("Write a comment...").fill("Commenting from the phone.");
  await page.getByRole("button", { name: "Post Comment" }).click();
  await drive.settleData();
  await expect(page.getByText("Commenting from the phone.")).toBeVisible();
  await page.getByRole("button", { name: "Delete comment" }).click();
  await drive.settleData();
  await expect(page.getByText("Commenting from the phone.")).toBeHidden();
  await page.getByRole("button", { name: "Delete Article" }).first().click();
  await drive.settleData();
  await expect.request("DELETE", "/api/articles/");

  // my profile and its favorites, then settings and logging out, via the menu
  sheet = await menu();
  await sheet.getByRole("link", { name: "jake" }).click();
  await drive.settleData();
  await expect(page.getByRole("heading", { name: "jake" })).toBeVisible();
  await page.getByRole("option", { name: "Favorited Articles" }).click();
  await drive.settleData();
  await expect.request("GET", "/api/articles?favorited=jake");

  sheet = await menu();
  await sheet.getByRole("link", { name: "Settings" }).click();
  await drive.settleData();
  await expect(page.getByPlaceholder("Email")).toHaveValue("jake@jake.jake");
  await page.getByRole("button", { name: "Or click here to logout." }).click();
  await drive.settleData();
  sheet = await menu();
  await expect(sheet.getByRole("link", { name: "Sign up" })).toBeVisible();
  await sheet.getByRole("link", { name: "Sign up" }).click();
  await drive.settleData();
  await expect(page.getByRole("heading", { name: "Sign up" })).toBeVisible();
  await expect(page.getByPlaceholder("Username")).toBeVisible();
};
