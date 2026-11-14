// Conduit's flows, driven as a person drives them, against the running
// RealWorld service (port 8380). Every write it makes is undone or made on an
// article it creates and then deletes, so the script can run again.
//
//   npx declare-verify my-apps/conduit/conduit.declare --assert my-apps/conduit/tests/assert.mjs

export default async ({ drive, expect, page }) => {
  const stamp = Date.now().toString(36);
  const title = `Notes from a test run ${stamp}`;
  const go = async (to) => { await drive.set("app", "location", to); await drive.settleData(); };

  // ── Signed out: the global feed, the tags, the sign-in links.
  await expect(page.getByRole("option", { name: "Global Feed" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Your Feed" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();

  // A tag opens its own tab, and the feed is filtered by it.
  await page.getByRole("button", { name: "security" }).click();
  await drive.settleData();
  await expect(page.getByRole("option", { name: "#security" })).toBeVisible();
  await expect.request("GET", /\/api\/articles\?tag=security&limit=10&offset=0/);

  // Paging: the global feed has 60 articles, ten to a page.
  await page.getByRole("option", { name: "Global Feed" }).click();
  await drive.settleData();
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  await drive.settleData();
  await expect.request("GET", /\/api\/articles\?limit=10&offset=10/);

  // Settings need an account: signed out, the address shows the sign-in form.
  await go("/settings");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  // ── A refused sign-in says why, then a good one lands on settings.
  await page.getByPlaceholder("Email").fill("jake@jake.jake");
  await page.getByPlaceholder("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await expect(page.getByText("credentials invalid")).toBeVisible();

  await page.getByPlaceholder("Password").fill("jakejake");
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await expect(page.getByRole("heading", { name: "Your Settings" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New Article" })).toBeVisible();
  await expect(page.getByPlaceholder("Email")).toHaveValue("jake@jake.jake");
  const kept = await page.evaluate(() => localStorage.getItem("jwtToken"));
  expect(typeof kept).toBe("string");

  // ── Your Feed: the people Jake follows.
  await go("/");
  await page.getByRole("option", { name: "Your Feed" }).click();
  await drive.settleData();
  await expect.request("GET", /\/api\/articles\/feed\?limit=10&offset=0/);

  // ── Publish an article; a blank one is refused first.
  await page.getByRole("link", { name: "New Article" }).click();
  await drive.settleData();
  await page.getByRole("button", { name: "Publish Article" }).click();
  await drive.settleData();
  await expect(page.getByText("title can't be blank")).toBeVisible();

  await page.getByPlaceholder("Article Title").fill(title);
  await page.getByPlaceholder("What's this article about?").fill("A short description.");
  await page.getByPlaceholder("Write your article (in markdown)").fill("## Findings\n\nSome *Markdown*, and <b>raw html</b>.");
  await page.getByPlaceholder("Enter tags").fill("testing");
  await page.getByPlaceholder("Enter tags").press("Enter");
  await page.getByPlaceholder("Enter tags").fill("conduit");
  await page.getByPlaceholder("Enter tags").press("Enter");
  await expect(page.getByRole("button", { name: "Remove tag conduit" })).toBeVisible();
  await page.getByRole("button", { name: "Publish Article" }).click();
  await drive.settleData();
  await expect.request("POST", "/api/articles", { body: { article: { title, tagList: ["testing", "conduit"] } } });
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("Findings")).toBeVisible();
  await expect(page.getByText("<b>raw html</b>", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Article" }).first()).toBeVisible();

  // ── Comment on it, then delete the comment.
  const said = `A comment ${stamp}`;
  await page.getByPlaceholder("Write a comment...").fill(said);
  await page.getByRole("button", { name: "Post Comment" }).click();
  await drive.settleData();
  await expect(page.getByText(said)).toBeVisible();
  await expect(page.getByPlaceholder("Write a comment...")).toHaveValue("");
  await page.getByRole("button", { name: "Delete comment" }).click();
  await drive.settleData();
  await expect(page.getByText(said)).toBeHidden();

  // ── Edit it: the form starts from the article.
  await page.getByRole("button", { name: "Edit Article" }).first().click();
  await drive.settleData();
  await expect(page.getByPlaceholder("Article Title")).toHaveValue(title);
  await page.getByPlaceholder("Article Title").fill(title + " (edited)");
  await page.getByRole("button", { name: "Remove tag testing" }).click();
  await page.getByRole("button", { name: "Publish Article" }).click();
  await drive.settleData();
  await expect.request("PUT", "/api/articles/", { body: { article: { tagList: ["conduit"] } } });
  await expect(page.getByRole("heading", { name: title + " (edited)" })).toBeVisible();

  // ── Delete it: back home.
  await page.getByRole("button", { name: "Delete Article" }).first().click();
  await drive.settleData();
  await expect.request("DELETE", "/api/articles/");
  await expect(page.getByRole("option", { name: "Global Feed" })).toBeVisible();

  // ── Favorite an article from a feed, and take it back.
  await page.getByRole("option", { name: "Global Feed" }).click();
  await drive.settleData();
  const fav = page.getByRole("button", { name: /^Favorite / }).first();
  const name = await fav.getAttribute("aria-label");
  const n = Number(name.split(", ").pop());
  await fav.click();
  await drive.settleData();
  const unfav = page.getByRole("button", { name: "Unfavorite " + name.slice("Favorite ".length).replace(/, \d+$/, ", " + (n + 1)) });
  await expect(unfav).toBeVisible();
  await unfav.click();
  await drive.settleData();
  await expect(page.getByRole("button", { name })).toBeVisible();

  // ── Follow someone from their profile, and stop.
  await go("/profile/tomasz");
  await expect(page.getByRole("heading", { name: "tomasz" })).toBeVisible();
  const follow = page.getByRole("button", { name: "Follow tomasz" });
  const wasFollowing = !(await follow.isVisible());
  const first = wasFollowing ? "Unfollow tomasz" : "Follow tomasz";
  const second = wasFollowing ? "Follow tomasz" : "Unfollow tomasz";
  await page.getByRole("button", { name: first }).click();
  await drive.settleData();
  await expect(page.getByRole("button", { name: second })).toBeVisible();
  await page.getByRole("button", { name: second }).click();
  await drive.settleData();
  await expect(page.getByRole("button", { name: first })).toBeVisible();

  // Their favorites are an address of their own.
  await page.getByRole("link", { name: "Favorited Articles" }).click();
  await drive.settleData();
  await expect.request("GET", /\/api\/articles\?favorited=tomasz/);

  // ── Settings: change the bio, see it on the profile, put it back.
  await go("/settings");
  const bio = await page.getByPlaceholder("Short bio about you").inputValue();
  await page.getByPlaceholder("Short bio about you").fill(`Bio ${stamp}`);
  await page.getByRole("button", { name: "Update Settings" }).click();
  await drive.settleData();
  await expect(page.getByText(`Bio ${stamp}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Profile Settings" })).toBeVisible();
  await go("/settings");
  await page.getByPlaceholder("Short bio about you").fill(bio);
  await page.getByRole("button", { name: "Update Settings" }).click();
  await drive.settleData();

  // ── Sign out: the visitor's header again, and the token gone.
  await go("/settings");
  await page.getByRole("button", { name: "Or click here to logout." }).click();
  await drive.settleData();
  await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("jwtToken"))).toBe(null);

  // ── Sign up is refused for a taken name, with the service's words.
  await go("/register");
  await page.getByPlaceholder("Username").fill("jake");
  await page.getByPlaceholder("Email").fill("jake@jake.jake");
  await page.getByPlaceholder("Password").fill("jakejake");
  await page.getByRole("button", { name: "Sign up" }).click();
  await drive.settleData();
  await expect(page.getByText("has already been taken").first()).toBeVisible();
};
