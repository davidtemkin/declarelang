// Conduit's flows, end to end, against the running Conduit API (port 8380).
//
//   npx declare-verify my-apps/conduit/conduit.declare --assert my-apps/conduit/conduit.flows.mjs
//
// The service remembers what a run writes, so the script makes its own
// article (a fresh title every run) and deletes it at the end, and every
// favorite or follow it makes it takes back.

export default async ({ drive, expect, page }) => {
  const stamp = Date.now().toString(36);
  const title = `Flow check ${stamp}`;

  // ── signed out: the global feed, the tags, paging, a tag filter ──────────
  await drive.settleData();
  await expect.text("app.header", "Sign in");
  await expect.request("GET", /\/api\/articles\?limit=10&offset=0$/);
  await expect.count("app.main.0.body.row.feed.articles.list", "ArticlePreview", 10);

  await drive.click('app.main.0.body.row.feed.articles.pager."Page 2"');
  await drive.settleData();
  await expect.request("GET", /offset=10$/);

  await drive.click("app.main.0.body.row.side.cloud.security");
  await drive.settleData();
  await expect.request("GET", /tag=security&limit=10&offset=0$/);
  await expect.text("app.main.0.body.row.feed.tabs", "# security");
  await expect.count("app.main.0.body.row.feed.articles.list", "ArticlePreview", 1);

  // a favorite while signed out goes to sign in
  await drive.click("app.main.0.body.row.feed.articles.list.0.meta.heart");
  await drive.settleData();
  await expect.attr("app", "location", "/login");

  // ── sign in: a wrong password is refused in Conduit's words, then jake ───
  await page.getByLabel("Email").fill("jake@jake.jake");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await expect.text("app.main.0", "email or password is invalid");

  await page.getByLabel("Password").fill("jakejake");
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await expect.attr("app", "location", "/");
  await expect.text("app.header", "jake");
  await expect.text("app.header", "New Article");
  const stored = await page.evaluate(() => localStorage.getItem("jwtToken"));
  expect.equal(typeof stored === "string" && stored.length > 20, true);

  // Your Feed: the people jake follows
  await page.getByRole("option", { name: "Your Feed" }).click();
  await drive.settleData();
  await expect.request("GET", /\/api\/articles\/feed\?limit=10&offset=0$/);

  // ── the editor: blank fields are refused, then an article is published ───
  await page.getByRole("link", { name: "New Article" }).click();
  await drive.settleData();
  await expect.attr("app", "location", "/editor");
  await page.getByRole("button", { name: "Publish Article" }).click();
  await drive.settleData();
  await expect.text("app.main.0", "title can't be blank");

  await page.getByLabel("Article Title").fill(title);
  await page.getByLabel("What's this article about?").fill("Checking every flow");
  await page.getByLabel("Write your article (in markdown)").fill("## Steps\n\nIt *works*, <b>and</b> raw HTML stays text.");
  await page.getByLabel("Enter tags").fill("flows");
  await page.getByLabel("Enter tags").press("Enter");
  await page.getByLabel("Enter tags").fill("checks");
  await page.getByRole("button", { name: "Publish Article" }).click();
  await drive.settleData();
  await expect.request("POST", "/api/articles", { body: { article: { title, tagList: ["flows", "checks"] } } });
  const slug = (await page.evaluate(() => window.__declare.find("app").location)).replace("/article/", "");
  expect.equal(slug.startsWith("flow-check"), true);

  // ── the article: the body as Markdown, the author's buttons ──────────────
  await expect.text("app.main.0.banner", title);
  await expect.text("app.main.0.page", "Steps");
  await expect.text("app.main.0.page", "<b>and</b>");
  await expect.text("app.main.0.banner.col.meta.buttons", "Edit Article");

  // a comment, posted and deleted
  await page.getByLabel("Write a comment").fill("A first comment.");
  await page.getByRole("button", { name: "Post Comment" }).click();
  await drive.settleData();
  await expect.text("app.main.0.page.comments.list", "A first comment.");
  await page.getByRole("button", { name: "Delete comment" }).click();
  await drive.settleData();
  await expect.request("DELETE", `/api/articles/${slug}/comments/`);
  await expect.count("app.main.0.page.comments.list", "CommentCard", 0);

  // edit it: the fields start from the article
  await page.getByRole("button", { name: "Edit Article" }).first().click();
  await drive.settleData();
  await expect.attr("app", "location", `/editor/${slug}`);
  await expect(page.getByLabel("Article Title")).toHaveValue(title);
  await page.getByLabel("What's this article about?").fill("Checking every flow, edited");
  await page.getByRole("button", { name: "Publish Article" }).click();
  await drive.settleData();
  await expect.request("PUT", `/api/articles/${slug}`);
  await expect.text("app.main.0.banner", title);

  // a new article starts empty, whatever the last editor held
  await page.getByRole("link", { name: "New Article" }).click();
  await drive.settleData();
  await expect(page.getByLabel("Article Title")).toHaveValue("");
  await expect.count("app.main.0", "TagChip", 0);

  // ── someone else's article: favorite it and follow its author, and undo ──
  await page.getByRole("link", { name: "Home" }).click();
  await page.getByRole("option", { name: "Global Feed" }).click();
  await drive.settleData();
  const other = await page.evaluate(() =>
    window.__declare.find("app").articles.value.articles.findIndex((a) => a.author.username != "jake"));
  await drive.click(`app.main.0.body.row.feed.articles.list.${other}.body`);
  await drive.settleData();
  // whichever way it stands now, flip it and flip it back
  const was = await page.evaluate(() => {
    const a = window.__declare.find("app").current;
    return { on: a.favorited, n: a.favoritesCount };
  });
  const flipped = was.on ? `Favorite Article (${was.n - 1})` : `Unfavorite Article (${was.n + 1})`;
  const restored = was.on ? `Unfavorite Article (${was.n})` : `Favorite Article (${was.n})`;
  await page.getByRole("button", { name: was.on ? /^Unfavorite Article/ : /^Favorite Article/ }).first().click();
  await drive.settleData();
  await expect.text("app.main.0.banner.col.meta.buttons", flipped);
  await page.getByRole("button", { name: was.on ? /^Favorite Article/ : /^Unfavorite Article/ }).first().click();
  await drive.settleData();
  await expect.text("app.main.0.banner.col.meta.buttons", restored);

  const author = await page.evaluate(() => window.__declare.find("app").current.author.username);
  const followed = await page.evaluate(() => window.__declare.find("app").current.author.following);
  const verb = followed ? "Unfollow" : "Follow";
  const back = followed ? "Follow" : "Unfollow";
  await page.getByRole("button", { name: `${verb} ${author}` }).first().click();
  await drive.settleData();
  await expect.text("app.main.0.banner.col.meta.buttons", `${back} ${author}`);
  await page.getByRole("button", { name: `${back} ${author}` }).first().click();
  await drive.settleData();
  await expect.text("app.main.0.banner.col.meta.buttons", `${verb} ${author}`);

  // ── a profile, and its favorites tab ─────────────────────────────────────
  await page.getByRole("link", { name: author }).first().click();
  await drive.settleData();
  await expect.attr("app", "location", `/profile/${author}`);
  await expect.request("GET", new RegExp(`author=${author}&limit=10`));
  await page.getByRole("option", { name: "Favorited Articles" }).click();
  await drive.settleData();
  await expect.attr("app", "location", `/profile/${author}/favorites`);
  await expect.request("GET", new RegExp(`favorited=${author}&limit=10`));

  // ── settings: a change is saved and lands on the profile ─────────────────
  await page.getByRole("link", { name: "Settings" }).click();
  await drive.settleData();
  await expect(page.getByLabel("Email")).toHaveValue("jake@jake.jake");
  const bio = await page.getByLabel("Short bio about you").inputValue();
  await page.getByLabel("Short bio about you").fill(bio + " (checked)");
  await page.getByRole("button", { name: "Update Settings" }).click();
  await drive.settleData();
  await expect.attr("app", "location", "/profile/jake");
  await expect.text("app.main.0.info", "(checked)");
  await page.getByRole("button", { name: "Edit Profile Settings" }).click();
  await drive.settleData();
  await page.getByLabel("Short bio about you").fill(bio);
  await page.getByRole("button", { name: "Update Settings" }).click();
  await drive.settleData();

  // ── delete the article ───────────────────────────────────────────────────
  await page.evaluate((s) => { window.location.hash = `/article/${s}`; }, slug);
  await drive.settleData();
  await page.getByRole("button", { name: "Delete Article" }).first().click();
  await drive.settleData();
  await expect.request("DELETE", `/api/articles/${slug}`);
  await expect.attr("app", "location", "/");

  // ── sign out; settings then asks to sign in ──────────────────────────────
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Or click here to logout." }).click();
  await drive.settleData();
  await expect.text("app.header", "Sign up");
  expect.equal(await page.evaluate(() => localStorage.getItem("jwtToken")), null);
  await page.evaluate(() => { window.location.hash = "/settings"; });
  await drive.settleData();
  await expect.text("app.main.0", "Need an account?");

  // ── sign up: a taken name and email are refused, each in its own words ───
  await page.getByRole("link", { name: "Sign up" }).click();
  await page.getByLabel("Username").fill("jake");
  await page.getByLabel("Email").fill("jake@jake.jake");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await drive.settleData();
  await expect.text("app.main.0", "has already been taken");
};
