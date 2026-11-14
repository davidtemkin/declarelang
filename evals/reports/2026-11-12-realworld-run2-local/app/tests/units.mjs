// Unit checks of Conduit's own logic, read straight from the running
// program: how an address becomes a page, which endpoint the home feed asks,
// and how the service's errors become the messages a form shows. Nothing here
// writes to the service.
//
//   npx declare-verify my-apps/conduit/conduit.declare --assert my-apps/conduit/tests/units.mjs

export default async ({ drive, expect, page }) => {
  const read = (path, attr) => page.evaluate(([p, a]) => window.__declare.find(p)[a], [path, attr]);

  // ── An address names a page, and what the page shows.
  const routes = [
    ["/", "", ""],
    ["", "", ""],
    ["/login", "login", ""],
    ["/register", "register", ""],
    ["/article/how-to-train-your-dragon", "article", "how-to-train-your-dragon"],
    ["/article/two%20words", "article", "two words"],
    ["/article/%E0%A4%A", "article", "%E0%A4%A"],          // malformed: kept as typed
    ["/profile/jake", "profile", "jake"],
    ["/profile/jake/favorites", "profile", "jake"],
    ["/editor/some-slug", "login", "some-slug"],           // signed out: sign in first
    ["/settings", "login", ""],
    ["/nowhere", "nowhere", ""],
  ];
  for (const [location, pageName, arg] of routes) {
    await drive.set("app", "location", location);
    expect(await read("app", "page")).toBe(pageName);
    expect(await read("app", "arg")).toBe(arg);
  }
  await drive.set("app", "location", "/profile/jake/favorites");
  await expect.attr("app.profile", "favorites", true);
  await drive.set("app", "location", "/nowhere");
  await expect.visible("app.notFound");

  // ── The home feed's endpoint follows its tab; a tag is encoded; "Your
  //    Feed" needs an account, and falls back to the global feed without one.
  await drive.set("app", "location", "/");
  await drive.set("app", "homeTab", "global");
  expect(await read("app", "homeEndpoint")).toBe("/articles");
  await drive.set("app", "homeTag", "c&c++");
  await drive.set("app", "homeTab", "tag");
  expect(await read("app", "homeEndpoint")).toBe("/articles?tag=c%26c%2B%2B");
  await drive.set("app", "homeTab", "feed");
  expect(await read("app", "feedTab")).toBe("global");
  expect(await read("app", "homeEndpoint")).toBe("/articles");

  // ── A feed's paging: ten to a page, and a new endpoint starts at page 1.
  await drive.set("app", "homeTab", "global");
  await drive.settleData();
  const pages = await read("app.home.body.row.main.feed", "pages");
  expect(pages.length).toBe(Math.ceil((await read("app.home.body.row.main.feed", "count")) / 10));
  await drive.set("app.home.body.row.main.feed", "page", 3);
  await drive.settleData();
  await expect.request("GET", /\/api\/articles\?limit=10&offset=20/);
  await drive.set("app", "homeTag", "javascript");
  await drive.set("app", "homeTab", "tag");
  await drive.settleData();
  await expect.attr("app.home.body.row.main.feed", "page", 1);

  // ── The service's `{ errors: { field: [ … ] } }` becomes one message per
  //    problem, named for its field, as the RealWorld apps word them.
  await drive.set("app", "location", "/login");
  const problems = await page.evaluate(() => window.__declare.find("app.login.form").refusal({
    errors: { email: ["can't be blank", "is invalid"], password: ["is too short (minimum is 8 characters)"] },
  }));
  expect(problems).toEqual([
    { name: "email", message: "email can't be blank" },
    { name: "email", message: "email is invalid" },
    { name: "password", message: "password is too short (minimum is 8 characters)" },
  ]);
  expect(await page.evaluate(() => window.__declare.find("app.login.form").refusal({ message: "nope" }))).toEqual([]);
};
