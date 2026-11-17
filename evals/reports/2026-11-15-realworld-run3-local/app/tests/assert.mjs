// Conduit, end to end at a laptop's size, against the running API service.
// npx declare-verify my-apps/conduit/conduit.declare --assert my-apps/conduit/tests/assert.mjs
//
// The service keeps what this writes, so everything it creates is named
// uniquely per run.

export default async ({ drive, expect, page }) => {
  const id = Date.now().toString(36);
  const user = `tester_${id}`;
  const email = `${user}@example.com`;
  const title = `Testing Conduit ${id}`;

  // ── a visitor: the global feed, its pages, a tag ─────────────────────────
  await expect(page.getByText("A place to share your knowledge.")).toBeVisible();
  await expect(page.getByRole("option", { name: "Global Feed" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Page 6" })).toBeVisible();
  await page.getByRole("button", { name: "Page 2" }).click();
  await drive.settleData();
  await expect.request("GET", /\/api\/articles\?limit=10&offset=10$/);

  await page.getByRole("button", { name: "Tag security" }).click();
  await drive.settleData();
  await expect(page.getByRole("option", { name: "#security" })).toBeVisible();
  await expect.request("GET", /\/api\/articles\?tag=security&limit=10&offset=0$/);
  await expect(page.getByRole("button", { name: "Page 1" })).toBeHidden(); // one article, no pages

  // favoriting while signed out asks for an account
  await page.getByRole("button", { name: /^Favorite article/ }).first().click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  // ── signing in wrongly, then signing up ─────────────────────────────────
  await page.getByPlaceholder("Email").fill("jake@jake.jake");
  await page.getByPlaceholder("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await expect(page.getByText("email or password is invalid")).toBeVisible();

  await page.getByRole("link", { name: "Need an account?" }).click();
  await expect(page.getByRole("heading", { name: "Sign up" })).toBeVisible();
  await page.getByRole("button", { name: "Sign up" }).click();          // empty: every field says so
  await expect(page.getByText("username can't be blank")).toBeVisible();
  await expect(page.getByText("email can't be blank")).toBeVisible();
  await page.getByPlaceholder("Username").fill("jake");                    // taken
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill("password123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await drive.settleData();
  await expect(page.getByText("username has already been taken")).toBeVisible();
  await page.getByPlaceholder("Username").fill(user);
  await page.getByRole("button", { name: "Sign up" }).click();
  await drive.settleData();
  await expect.request("POST", "/api/users", { body: { user: { username: user, email } } });

  // home, signed in: the member's navbar, Your Feed (empty for a new account)
  await expect(page.getByRole("link", { name: user })).toBeVisible();
  await expect(page.getByRole("link", { name: "New Article" })).toBeVisible();
  await expect(page.getByText("A place to share your knowledge.")).toBeHidden();
  await page.getByRole("option", { name: "Your Feed" }).click();
  await drive.settleData();
  await expect(page.getByText("No articles are here... yet.")).toBeVisible();

  // ── writing an article ──────────────────────────────────────────────────
  await page.getByRole("link", { name: "New Article" }).click();
  await drive.settleData();
  await page.getByRole("button", { name: "Publish Article" }).click();     // empty: refused
  await expect(page.getByText("title can't be blank")).toBeVisible();
  await page.getByPlaceholder("Article Title").fill(title);
  await page.getByPlaceholder("What's this article about?").fill("An article the checks wrote.");
  await page.getByPlaceholder("Write your article (in markdown)").fill("## A heading\n\nSome **bold** words and <b>raw html</b>.");
  const tags = page.getByPlaceholder("Enter tags");
  await tags.fill("checks");
  await tags.press("Enter");
  await tags.fill("dragons");
  await tags.press("Enter");
  await expect(page.getByRole("button", { name: "Remove tag dragons" })).toBeVisible();
  await page.getByRole("button", { name: "Remove tag dragons" }).click();
  await expect(page.getByRole("button", { name: "Remove tag dragons" })).toBeHidden();
  await page.getByRole("button", { name: "Publish Article" }).click();
  await drive.settleData();
  await expect.request("POST", "/api/articles", { body: { article: { title, tagList: ["checks"] } } });

  // the article: rendered Markdown, the author's own buttons
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("bold", { exact: true })).toBeVisible();
  await expect(page.getByText("<b>raw html</b>", { exact: false })).toBeVisible();   // HTML stays text
  await expect(page.getByRole("button", { name: "Edit Article" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Follow / })).toHaveCount(0);

  // ── comments ────────────────────────────────────────────────────────────
  await page.getByPlaceholder("Write a comment...").fill("First comment from the checks.");
  await page.getByRole("button", { name: "Post Comment" }).click();
  await drive.settleData();
  await expect(page.getByText("First comment from the checks.")).toBeVisible();
  await expect(page.getByPlaceholder("Write a comment...")).toHaveValue("");
  await page.getByRole("button", { name: "Delete comment" }).click();
  await drive.settleData();
  await expect(page.getByText("First comment from the checks.")).toBeHidden();

  // ── editing it ──────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Edit Article" }).first().click();
  await drive.settleData();
  await expect(page.getByPlaceholder("Article Title")).toHaveValue(title);
  await expect(page.getByRole("button", { name: "Remove tag checks" })).toBeVisible();
  await page.getByPlaceholder("Article Title").fill(title + " (edited)");
  await page.getByRole("button", { name: "Publish Article" }).click();
  await drive.settleData();
  await expect.request("PUT", "/api/articles/");
  await expect(page.getByRole("heading", { name: title + " (edited)" })).toBeVisible();

  // ── someone else's article: follow and favorite ─────────────────────────
  await page.goto(page.url().replace(/#.*$/, "") + "#/profile/eli_w");
  await expect(page.getByRole("heading", { name: "eli_w" })).toBeVisible();
  await page.getByRole("button", { name: "Follow eli_w" }).click();
  await drive.settleData();
  await expect(page.getByRole("button", { name: "Unfollow eli_w" })).toBeVisible();
  await page.getByRole("link", { name: /My Terminal Setup/ }).first().click();
  await expect(page.getByRole("heading", { name: "My Terminal Setup, Explained" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Unfollow eli_w/ }).first()).toBeVisible();
  const fav = page.getByRole("button", { name: /^Favorite Article/ }).first();
  await fav.click();
  await drive.settleData();
  await expect(page.getByRole("button", { name: /^Unfavorite Article/ })).toHaveCount(2);   // banner and foot agree
  await page.getByRole("button", { name: /^Unfavorite Article/ }).first().click();
  await drive.settleData();
  await page.getByRole("button", { name: /^Unfollow eli_w/ }).first().click();
  await drive.settleData();
  await expect(page.getByRole("button", { name: /^Follow eli_w/ })).toHaveCount(2);

  // ── a profile: mine, my articles, my favorites ─────────────────────────
  await page.getByRole("link", { name: user }).first().click();
  await expect(page.getByRole("heading", { name: user })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await page.getByRole("option", { name: "Favorited Articles" }).click();
  await drive.settleData();
  await expect(page.getByText("No articles are here... yet.")).toBeVisible();
  await expect.request("GET", `/api/articles?favorited=${user}`);

  // ── settings ────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Edit Profile Settings" }).click();
  await drive.settleData();
  await expect(page.getByPlaceholder("Your Name")).toHaveValue(user);
  await expect(page.getByPlaceholder("Email")).toHaveValue(email);
  await page.getByPlaceholder("Short bio about you").fill("I write the checks.");
  await page.getByRole("button", { name: "Update Settings" }).click();
  await drive.settleData();
  await expect.request("PUT", "/api/user", { body: { user: { bio: "I write the checks." } } });
  await expect(page.getByText("I write the checks.")).toBeVisible();          // back on the profile

  // ── delete the article, then log out ────────────────────────────────────
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "Delete Article" }).first().click();
  await drive.settleData();
  await expect.request("DELETE", "/api/articles/");
  await expect(page.getByRole("option", { name: "Global Feed" })).toBeVisible();

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Or click here to logout." }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: user })).toHaveCount(0);

  // ── the demo account: its feed has the people it follows ────────────────
  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByPlaceholder("Email").fill("jake@jake.jake");
  await page.getByPlaceholder("Password").fill("jakejake");
  await page.getByPlaceholder("Password").press("Enter");                  // Return submits
  await drive.settleData();
  await expect(page.getByRole("navigation").getByRole("link", { name: "jake" })).toBeVisible();
  await page.getByRole("option", { name: "Your Feed" }).click();
  await drive.settleData();
  await expect.request("GET", "/api/articles/feed?limit=10&offset=0");
  await expect(page.getByText("No articles are here... yet.")).toBeHidden();
  await expect(page.getByText("Read more...").first()).toBeVisible();

  // the session outlives a reload (the token is in localStorage)
  await page.reload();
  await drive.settleData();
  await expect(page.getByRole("navigation").getByRole("link", { name: "jake" })).toBeVisible();

  // a page that needs an account shows sign-in in its place when signed out
  await page.evaluate(() => localStorage.removeItem("jwtToken"));
  await page.goto(page.url().replace(/#.*$/, "") + "#/editor");
  await page.reload();
  await drive.settleData();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
};
