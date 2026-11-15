// Brief §3: editing in place. Date, description, category, contact and amount are
// changed in the table itself. Enter saves, Escape cancels, Tab moves to the next
// cell; a category or contact is chosen by typing part of its name. Each change
// says what it did and offers Undo.

export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate(([p, a]) => window.__declare.find(p)[a], [p, a]);
  const patches = async () => (await drive.requests()).filter((r) => r.method == "PATCH").length;
  await drive.click("app.side.Transactions");
  await drive.settleData();

  // one plain expense, found by its amount (search takes amounts as numbers)
  const rows = await read("app", "rows");
  const t = rows.find((r) => r.kind == "expense" && r.split == null && rows.filter((x) => x.amount == r.amount).length == 1);
  const amt = (t.amount / 100).toFixed(2);
  await drive.click("app.main.bar.search");
  await drive.type(amt);
  await drive.wait(400);
  await drive.settleData();
  expect(await read("app", "total")).toBe(1);
  const cells = page.getByRole("gridcell");
  const cell = (i) => cells.nth(i);              // date, description, category, channel, amount

  // category: a press selects the cell, a second enters it; typing part of a name, Enter saves
  await cell(2).click();
  await cell(2).click();
  await drive.settleMotion();
  const [typed, id, name] = t.categoryId == "advertising" ? ["Softw", "software", "Software"] : ["Advert", "advertising", "Advertising"];
  await drive.type(typed);
  await drive.key("Enter");
  await drive.settleData();
  await expect.request("PATCH", "/api/transactions/" + t.id, { body: { categoryId: id } });
  await expect(page.getByText("Categorised as " + name)).toBeVisible();
  await drive.key("Escape");
  await drive.settleData();
  expect((await read("app", "rows"))[0].categoryId).toBe(id);

  // description: Escape cancels — nothing is sent, nothing changes
  const n0 = await patches();
  await cell(1).click();
  await drive.key("Enter");
  await drive.settleMotion();
  await drive.type(" zzz");
  await drive.key("Escape");
  await drive.settleData();
  expect(await patches()).toBe(n0);
  expect((await read("app", "rows"))[0].description).toBe(t.description);

  // description, then Tab to its contact, chosen by typing part of a name
  await cell(1).click();
  await drive.key("Enter");
  await drive.settleMotion();
    const words = t.description == "Gift wrap and ribbon" ? "Ribbon and gift wrap" : "Gift wrap and ribbon";
  await drive.type(words);
  await drive.key("Tab");                         // saves the description, and moves to the contact
  await drive.settleData();
  await expect.request("PATCH", "/api/transactions/" + t.id, { body: { description: words } });
    const [who, whoId, whoName] = t.contactId == "c022" ? ["Adob", "c014", "Adobe"] : ["Ace Hard", "c022", "Ace Hardware"];
  await drive.type(who);
  await drive.key("Enter");
  await drive.settleData();
  await expect.request("PATCH", "/api/transactions/" + t.id, { body: { contactId: whoId } });
  await drive.key("Escape");
  await drive.settleData();
  const now = (await read("app", "rows"))[0];
  expect(now.description).toBe(words);
  expect(now.contactName).toBe(whoName);

  // date: typed as a person says it
  await cell(0).click();
  await drive.key("Enter");
  await drive.settleMotion();
    const day = t.date == "2026-11-03" ? "4 nov" : "3 nov";
  const iso = t.date == "2026-11-03" ? "2026-11-04" : "2026-11-03";
  await drive.type(day);
  await drive.key("Enter");
  await drive.settleData();
  await expect.request("PATCH", "/api/transactions/" + t.id, { body: { date: iso } });
  expect((await read("app", "rows"))[0].date).toBe(iso);

  // amount, for a one-line transaction (last: the search is by amount)
  await cells.last().click();
  await drive.key("Enter");
  await drive.settleMotion();
    await drive.type(amt.replace(/\.\d\d$/, ".99"));
  await drive.key("Enter");
  await drive.settleData();
  const cents = Number(amt.replace(/\.\d\d$/, ".99").replace(".", ""));
  await expect.request("PATCH", "/api/transactions/" + t.id, { body: { amount: cents } });
  await expect(page.getByText("Amount set to $" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 }))).toBeVisible();

  // ⌘Z puts the last change back
  await drive.key("Mod+Z");
  await drive.settleData();
  const back = await page.evaluate(async (id) => (await (await fetch("http://127.0.0.1:8370/api/transactions/" + id)).json()).amount, t.id);
  expect(back).toBe(t.amount);
};
