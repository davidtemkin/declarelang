// The whole RealWorld flow against a live backend (http://localhost:3000/api, seeded by seed.mjs):
//   npx declare-verify my-apps/conduit/conduit.declare --assert my-apps/conduit/flow.mjs
// Registers a fresh user each run, so it can be run again and again.

const read = (drive, path, attr) =>
  drive.page.evaluate((p, a) => { const v = window.__declare.find(p)[a]; return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, path, attr);

// wait (in program time) until the program says so — the network is real
async function until(drive, what, test, ms = 5000) {
  for (let t = 0; t < ms; t += 100) {
    if (await drive.page.evaluate(test)) return;
    await drive.wait(100);
  }
  throw new Error("timed out waiting for " + what);
}
const settled = (drive, what) => until(drive, what, () => {
  const a = window.__declare.find("app");
  return ![a.articles, a.article, a.comments, a.profile, a.me, a.tags, a.favorite, a.followReq,
           a.postComment, a.removeComment, a.removeArticle, a.draftSource].some((s) => s.loading);
});

async function fill(drive, path, text) {
  await drive.click(path);
  await drive.type(text);
}

export default async ({ drive, expect }) => {
  const stamp = Date.now().toString(36);
  const me = "tester" + stamp;

  await drive.page.evaluate(() => { localStorage.clear(); return null; });
  await drive.page.reload();
  await settled(drive, "home to load");

  // ── signed out: the global feed, paging, a tag ──
  await expect.attr("app", "tab", "global");
  await expect.equal((await read(drive, "app.articles", "value")).articles.length, 10);
  await drive.click('app.homePage.cols.main.1.pager.1');
  await settled(drive, "page two");
  await expect.attr("app", "page", 1);
  await drive.click('app.homePage.cols.side.tagCloud."history"');
  await settled(drive, "the history tag");
  await expect.attr("app", "tab", "tag");
  await expect.attr("app", "page", 0);
  const tagged = (await read(drive, "app.articles", "value")).articles;
  await expect.equal(tagged.length > 0 && tagged.every((a) => a.tagList.includes("history")), true);

  // favoriting signed out sends you to sign up
  await drive.click("app.homePage.cols.main.1.list.0.top.fav");
  await expect.attr("app", "location", "register");

  // ── a refused sign-in shows the server's reason ──
  await drive.set("app", "location", "login");
  await fill(drive, "app.loginPage.form.mail", "demo@conduit.dev");
  await fill(drive, "app.loginPage.form.pass", "not-the-password");
  await drive.click("app.loginPage.form.go");
  await until(drive, "the refusal", () => window.__declare.find("app.loginPage.form.send").failed);
  await expect.text("app.loginPage.form.errs", "email or password is invalid");

  // ── sign up a new user ──
  await drive.set("app", "location", "register");
  await fill(drive, "app.registerPage.form.name", me);
  await fill(drive, "app.registerPage.form.mail", me + "@example.com");
  await fill(drive, "app.registerPage.form.pass", "password123");
  await drive.click("app.registerPage.form.go");
  await until(drive, "signing up", () => window.__declare.find("app").authed);
  await settled(drive, "the feed after sign-up");
  await expect.attr("app", "location", "");
  await expect.attr("app", "tab", "feed");
  await expect.attr("app", "username", me);
  await expect.text("app.homePage.cols.main.1.status", "No articles are here");

  // ── write an article ──
  await drive.set("app", "location", "editor");
  await fill(drive, "app.editorPage.form.titleF", "Declare test " + stamp);
  await fill(drive, "app.editorPage.form.aboutF", "Written by the flow");
  await fill(drive, "app.editorPage.form.bodyF", "Some **bold** words.");
  await fill(drive, "app.editorPage.form.tagsF", "declare, testing");
  await drive.key("Enter");
  await expect.equal(await read(drive, "app.editorPage.form", "tags"), ["declare", "testing"]);
  await drive.click("app.editorPage.form.publish");
  await until(drive, "publishing", () => window.__declare.find("app").dest == "article");
  await settled(drive, "the new article");
  await expect.attr("app", "mine", true);
  await expect.equal((await read(drive, "app", "shown")).title, "Declare test " + stamp);
  await expect.equal([...(await read(drive, "app", "shown")).tagList].sort(), ["declare", "testing"]);

  // ── comment, then delete it ──
  await fill(drive, "app.articlePage.body.talk.compose.box", "First!");
  await drive.click("app.articlePage.body.talk.compose.foot.post");
  await settled(drive, "posting a comment");
  await expect.equal((await read(drive, "app.comments", "value")).comments.length, 1);
  await expect.attr("app", "newComment", "");
  await drive.click("app.articlePage.body.talk.thread.0.foot.trash");
  await settled(drive, "deleting the comment");
  await expect.equal((await read(drive, "app.comments", "value")).comments.length, 0);

  // ── edit it ──
  await drive.click("app.articlePage.banner.inner.actions.editB");
  await settled(drive, "the editor");
  await until(drive, "the editor form", () => window.__declare.find("app.editorPage.form") != null);
  await expect.attr("app.editorPage.form", "title", "Declare test " + stamp);
  await drive.click("app.editorPage.form.titleF");
  await drive.type(" (edited)");
  await drive.click("app.editorPage.form.publish");
  await until(drive, "saving", () => window.__declare.find("app").dest == "article");
  await settled(drive, "the edited article");
  await expect.equal((await read(drive, "app", "shown")).title, "Declare test " + stamp + " (edited)");
  const mySlug = await read(drive, "app", "slug");

  // ── favorite and follow someone else ──
  const good = await drive.page.evaluate(async () => {
    const r = await fetch("http://localhost:3000/api/articles?author=linus");
    return (await r.json()).articles.find((a) => a.title.startsWith("Good")).slug;
  });
  await drive.set("app", "location", "article/" + good);
  await settled(drive, "linus's article");
  const before = (await read(drive, "app", "shown")).favoritesCount;
  await drive.click("app.articlePage.banner.inner.actions.favB");
  await settled(drive, "favoriting");
  await expect.equal((await read(drive, "app", "shown")).favorited, true);
  await expect.equal((await read(drive, "app", "shown")).favoritesCount, before + 1);
  await drive.click("app.articlePage.banner.inner.actions.favB");
  await settled(drive, "unfavoriting");
  await expect.equal((await read(drive, "app", "shown")).favoritesCount, before);
  await drive.click("app.articlePage.banner.inner.actions.followB");
  await settled(drive, "following");
  await expect.equal((await read(drive, "app", "shown")).author.following, true);

  // following shows up in your feed
  await drive.set("app", "location", "");
  await drive.set("app", "tab", "feed");
  await settled(drive, "your feed");
  const feed = (await read(drive, "app.articles", "value")).articles;
  await expect.equal(feed.length > 0 && feed.every((a) => a.author.username == "linus"), true);

  // ── profile: theirs, unfollow; then yours ──
  await drive.set("app", "location", "profile/linus");
  await settled(drive, "linus's profile");
  await expect.equal((await read(drive, "app", "shownProfile")).following, true);
  await drive.click("app.profilePage.banner.inner.act.followB");
  await settled(drive, "unfollowing");
  await expect.equal((await read(drive, "app", "shownProfile")).following, false);
  await drive.set("app", "location", "profile/" + me);
  await settled(drive, "your profile");
  await expect.equal((await read(drive, "app.articles", "value")).articles.map((a) => a.slug), [mySlug]);

  // ── settings ──
  await drive.set("app", "location", "settings");
  await until(drive, "the settings form", () => window.__declare.find("app.settingsPage.form") != null);
  await fill(drive, "app.settingsPage.form.bioF", "Testing Declare.");
  await drive.click("app.settingsPage.form.save");
  await settled(drive, "saving settings");
  await until(drive, "the new bio", () => window.__declare.find("app").user?.bio == "Testing Declare.");

  // ── still signed in after a reload ──
  await drive.page.reload();
  await settled(drive, "reloading");
  await until(drive, "the user", () => window.__declare.find("app").username != "");
  await expect.attr("app", "username", me);

  // ── delete the article ──
  await drive.set("app", "location", "article/" + mySlug);
  await settled(drive, "your article");
  await drive.click("app.articlePage.banner.inner.actions.deleteB");
  await until(drive, "deleting", () => window.__declare.find("app").location == "");
  const gone = await drive.page.evaluate(async (s) => (await fetch("http://localhost:3000/api/articles/" + s)).status, mySlug);
  await expect.equal(gone, 404);

  // ── sign out ──
  await drive.set("app", "location", "settings");
  await until(drive, "the settings form", () => window.__declare.find("app.settingsPage.form") != null);
  await drive.click("app.settingsPage.form.logout");
  await expect.attr("app", "authed", false);
  await expect.attr("app", "location", "");
};
