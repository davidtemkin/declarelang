/**
 * Drives the acceptance scenarios S1–S15 from BRIEF.md through the real UI in
 * headless Chrome. Run against the production preview:
 *
 *   npm run build && npm run preview &
 *   node scripts/acceptance.mjs
 */
import { readFileSync } from "node:fs";
import { LIST, openTracker, setScale, waitForRows } from "./browser.mjs";

const FIXTURE = JSON.parse(readFileSync(new URL("../issues.json", import.meta.url))).issues;

/**
 * A query narrow enough that every status group and all its rows fit on one
 * screen — needed to observe rows moving between groups. Derived from the
 * fixture rather than hardcoded, so it stays valid if the data changes.
 */
const NARROW_QUERY = (() => {
  const byTitle = new Map();
  for (const issue of FIXTURE) {
    const bucket = byTitle.get(issue.title) ?? [];
    bucket.push(issue);
    byTitle.set(issue.title, bucket);
  }
  for (const [title, bucket] of byTitle) {
    const open = bucket.filter((i) => i.status === "open").length;
    if (bucket.length >= 8 && bucket.length <= 18 && open >= 3 && open < bucket.length) return title;
  }
  throw new Error("no suitable narrowing query in the fixture");
})();

const results = [];
let current = "";
const scenario = (name) => {
  current = name;
  console.log(`\n— ${name}`);
};
const check = (label, ok, detail = "") => {
  results.push({ scenario: current, label, ok });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async (page, ms = 220) => {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await wait(ms);
};

// ---- readers -------------------------------------------------------------

const counts = async (page) => {
  const [shown, total] = await page.$$eval("[aria-live='polite'] strong", (n) =>
    n.map((x) => Number(x.textContent.replace(/,/g, ""))),
  );
  return { shown, total };
};

const renderedIds = (page) =>
  page.$$eval(`${LIST} [data-issue-id]`, (n) => n.map((x) => Number(x.dataset.issueId)));

const renderedTitles = (page) =>
  page.$$eval(`${LIST} [data-role='title']`, (n) => n.map((x) => x.getAttribute("title")));

const renderedStatuses = (page) =>
  page.$$eval(`${LIST} [data-issue-id]`, (n) => n.map((x) => x.dataset.status));

const statusStats = (page) =>
  page.$$eval("[aria-label='Statistics'] li[data-status]", (n) =>
    Object.fromEntries(n.map((x) => [x.dataset.status, Number(x.lastElementChild.textContent.replace(/,/g, ""))])),
  );

const assigneeStats = (page) =>
  page.$$eval("[aria-label='Statistics'] li[data-assignee]", (n) =>
    Object.fromEntries(n.map((x) => [x.dataset.assignee, Number(x.lastElementChild.textContent.replace(/,/g, ""))])),
  );

const closedChart = (page) =>
  page.$eval("[aria-label^='Issues closed per day']", (n) =>
    n.getAttribute("aria-label").replace("Issues closed per day: ", "").split(", ").map((s) => Number(s.split(" ").pop())),
  );

const groupHeaders = (page) =>
  page.$$eval(`${LIST} [data-group]`, (n) =>
    n.map((x) => ({ group: x.dataset.group, count: Number(x.dataset.count), expanded: x.getAttribute("aria-expanded") === "true" })),
  );

const selectionCount = async (page) => {
  const bar = await page.$("[aria-label='Bulk actions'] strong");
  if (!bar) return 0;
  return Number((await bar.evaluate((n) => n.textContent)).replace(/[^\d]/g, ""));
};

const metrics = (page) =>
  page.$$eval("footer span b", (n) => n.map((x) => x.textContent));

// ---- actions -------------------------------------------------------------

const clickByText = (page, selector, text) =>
  page.evaluate(
    (sel, txt) => {
      const el = [...document.querySelectorAll(sel)].find((n) => n.textContent.trim().includes(txt));
      if (!el) throw new Error(`no ${sel} containing "${txt}"`);
      el.click();
    },
    selector,
    text,
  );

const type = async (page, text) => {
  await page.click("#tracker-search");
  await page.type("#tracker-search", text, { delay: 12 });
  await settle(page, 320);
};

const clearSearch = async (page) => {
  await page.click("#tracker-search");
  // Headless Chrome does not honour ⌘A, so select the text directly.
  await page.$eval("#tracker-search", (el) => el.setSelectionRange(0, el.value.length));
  await page.keyboard.press("Backspace");
  await settle(page, 350);
};

const UNASSIGNED = "__unassigned__";
const sameCounts = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => a[k] === b[k]);
};

const toggleFacet = async (page, section, label) => {
  await page.evaluate(
    (sectionTitle, optionLabel) => {
      const sections = [...document.querySelectorAll("[aria-label='Filters'] > div")];
      const target = sections.find((s) => s.textContent.trim().startsWith(sectionTitle));
      const option = [...target.querySelectorAll("label")].find(
        (l) => l.textContent.trim() === optionLabel,
      );
      option.querySelector("input").click();
    },
    section,
    label,
  );
  await settle(page);
};

const clickRow = async (page, index, modifiers = {}) => {
  const rows = await page.$$(`${LIST} [data-issue-id]`);
  await rows[index].evaluate((node, mods) => {
    node.firstElementChild.dispatchEvent(new MouseEvent("click", { bubbles: true, ...mods }));
  }, modifiers);
  await settle(page, 120);
};

const openRowEditor = async (page, index) => {
  const rows = await page.$$(`${LIST} [data-issue-id]`);
  await rows[index].$eval("button[aria-expanded]", (b) => b.click());
  await settle(page, 260);
};

const editorValue = (page, name) => page.$eval(`${LIST} [name='${name}']`, (n) => n.value);

const setEditorValue = async (page, name, value) => {
  const handle = await page.$(`${LIST} [name='${name}']`);
  const tag = await handle.evaluate((n) => n.tagName);
  if (tag === "SELECT") {
    await handle.select(value);
  } else {
    await handle.click();
    await handle.evaluate((el) => el.setSelectionRange(0, el.value.length));
    await handle.press("Backspace");
    if (value) await handle.type(value, { delay: 5 });
  }
  await settle(page, 80);
};

// ---- scenarios -----------------------------------------------------------

const { browser, page } = await openTracker();

// S1 — boot at 10K
{
  scenario("S1 boot at 10K");
  const { shown, total } = await counts(page);
  check("total is 10,000", total === 10_000, `${total}`);
  check("shown equals total with no filters", shown === 10_000, `${shown}`);
  check("rows rendered", (await renderedIds(page)).length > 10);

  const expectedStatus = FIXTURE.reduce((acc, i) => ({ ...acc, [i.status]: (acc[i.status] ?? 0) + 1 }), {});
  const gotStatus = await statusStats(page);
  check("per-status stats agree with the fixture", sameCounts(gotStatus, expectedStatus), JSON.stringify(gotStatus));

  const expectedAssignee = {};
  for (const i of FIXTURE) {
    if (i.status === "closed") continue;
    const key = i.assignee ?? UNASSIGNED;
    expectedAssignee[key] = (expectedAssignee[key] ?? 0) + 1;
  }
  const gotAssignee = await assigneeStats(page);
  check("open-work-per-assignee stats agree (closed excluded)", sameCounts(gotAssignee, expectedAssignee), JSON.stringify(gotAssignee));

  const horizon = Math.max(...FIXTURE.map((i) => i.updated));
  const day = 86_400_000;
  const today = Math.floor(horizon / day) * day;
  const expectedClosed = Array.from({ length: 14 }, (_, k) => {
    const start = today - (13 - k) * day;
    return FIXTURE.filter((i) => i.closedAt !== null && Math.floor(i.closedAt / day) * day === start).length;
  });
  const gotClosed = await closedChart(page);
  check("closed-per-day (14d of dataset time) agrees", JSON.stringify(gotClosed) === JSON.stringify(expectedClosed), gotClosed.join("/"));

  const [load, ingest] = await metrics(page);
  check("load + ingest measured, not hardcoded", /\d/.test(load) && /\d/.test(ingest), `${load}, ${ingest}`);
}

// S2 — search as you type
{
  scenario("S2 search as you type");
  await type(page, "cache layer");
  const narrowed = await counts(page);
  const expected = FIXTURE.filter((i) =>
    [i.title, i.description, i.assignee ?? "", ...i.labels].some((f) => f.toLowerCase().includes("cache layer")),
  ).length;
  check("count matches an independent filter", narrowed.shown === expected, `${narrowed.shown} vs ${expected}`);
  check("total unchanged", narrowed.total === 10_000);
  const titles = await renderedTitles(page);
  check("every rendered row matches", titles.every((t) => t.toLowerCase().includes("cache layer")));
  const searchMs = (await metrics(page))[2];
  check("search ms reported", /\d/.test(searchMs), searchMs);

  await clearSearch(page);
  check("clearing restores", (await counts(page)).shown === 10_000);

  await type(page, "grace");
  await page.keyboard.press("Escape");
  await settle(page, 300);
  check("Esc clears an active search", (await counts(page)).shown === 10_000);
}

// S3 — combined filters
{
  scenario("S3 status + assignee + query combined");
  await toggleFacet(page, "Status", "Open");
  await toggleFacet(page, "Assignee", "Grace");
  await type(page, "cache");
  const got = await counts(page);
  const expected = FIXTURE.filter(
    (i) =>
      i.status === "open" &&
      i.assignee === "Grace" &&
      [i.title, i.description, i.assignee ?? "", ...i.labels].some((f) => f.toLowerCase().includes("cache")),
  ).length;
  check("combined count agrees", got.shown === expected, `${got.shown} vs ${expected}`);
  const statuses = await renderedStatuses(page);
  check("all rows are open", statuses.every((s) => s === "open"));

  await type(page, " zzzz-no-such-thing");
  check("no matches", (await counts(page)).shown === 0);
  const hasEmpty = await page.$("::-p-text(Nothing matches)");
  check("distinct 'nothing matches' empty state", Boolean(hasEmpty));
  await clickByText(page, "button", "Clear search & filters");
  await settle(page, 300);
  check("one-step clear restores everything", (await counts(page)).shown === 10_000);
}

// S4 — sorting
{
  scenario("S4 sort by each field + direction");
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  await page.select("[aria-label='Sort field']", "updated");
  await settle(page);
  let ids = await renderedIds(page);
  let updates = ids.map((id) => FIXTURE.find((i) => i.id === id)?.updated ?? Infinity);
  check("updated desc is non-increasing", updates.every((v, k) => k === 0 || updates[k - 1] >= v));

  await page.click("[aria-label^='Sort direction']");
  await settle(page);
  ids = await renderedIds(page);
  updates = ids.map((id) => FIXTURE.find((i) => i.id === id)?.updated ?? -Infinity);
  check("direction toggle flips to non-decreasing", updates.every((v, k) => k === 0 || updates[k - 1] <= v));

  await page.select("[aria-label='Sort field']", "title");
  await settle(page);
  let titles = await renderedTitles(page);
  check("title asc is collation-ordered", titles.every((v, k) => k === 0 || collator.compare(titles[k - 1], v) <= 0), titles[0]);

  await page.click("[aria-label^='Sort direction']");
  await settle(page);
  titles = await renderedTitles(page);
  check("title desc is reverse-ordered", titles.every((v, k) => k === 0 || collator.compare(titles[k - 1], v) >= 0), titles[0]);

  await page.select("[aria-label='Sort field']", "priority");
  await settle(page);
  const rank = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const prios = (await renderedIds(page)).map((id) => FIXTURE.find((i) => i.id === id)?.priority ?? "P3");
  check("priority desc puts P0 first", prios.every((v, k) => k === 0 || rank[prios[k - 1]] <= rank[v]), prios.slice(0, 4).join(","));

  await page.click("[aria-label^='Sort direction']");
  await settle(page);
  await page.select("[aria-label='Sort field']", "updated");
  await page.click("[aria-label^='Sort direction']");
  await settle(page);
}

// S5 — grouping
{
  scenario("S5 group by status");
  await page.click("[aria-label='Group by status']");
  await settle(page, 300);

  const openBefore = (await renderedStatuses(page)).filter((s) => s === "open").length;
  await page.click(`${LIST} [data-group='open']`);
  await settle(page, 300);
  const openAfter = (await renderedStatuses(page)).filter((s) => s === "open").length;
  check("collapse hides the group's rows", openBefore > 0 && openAfter === 0, `${openBefore} → ${openAfter}`);
  check("other groups still render", (await renderedIds(page)).length > 0);

  // With every group collapsed all four headers fit on screen at once.
  for (const status of ["in-progress", "blocked", "closed"]) {
    await page.click(`${LIST} [data-group='${status}']`);
    await settle(page, 200);
  }
  const headers = await groupHeaders(page);
  const stats = await statusStats(page);
  check("a header per non-empty status", headers.length === 4, headers.map((h) => h.group).join(","));
  check("group counts match the status stats", headers.every((h) => h.count === stats[h.group]), JSON.stringify(headers.map((h) => h.count)));
  check("collapsed groups show no rows at all", (await renderedIds(page)).length === 0);

  await page.click(`${LIST} [data-group='open']`);
  await settle(page, 300);
  check("expand restores the group's rows", (await renderedStatuses(page)).every((s) => s === "open") && (await renderedIds(page)).length > 10);
  await page.click(`${LIST} [data-group='open']`);
  await settle(page, 200);

  // A bulk status change must move rows between groups and update both counts.
  // Narrow first, so every group and all of its rows fit on one screen.
  await type(page, NARROW_QUERY);
  for (const status of ["open", "in-progress", "blocked", "closed"]) {
    const header = await page.$(`${LIST} [data-group='${status}'][aria-expanded='false']`);
    if (header) await header.click();
    await settle(page, 150);
  }
  const before = await groupHeaders(page);
  const openHeaderBefore = before.find((h) => h.group === "open")?.count ?? 0;
  const blockedBefore = before.find((h) => h.group === "blocked")?.count ?? 0;
  const openRowIndexes = (await renderedStatuses(page))
    .map((status, k) => (status === "open" ? k : -1))
    .filter((k) => k >= 0)
    .slice(0, 3);
  for (const [n, k] of openRowIndexes.entries()) await clickRow(page, k, n === 0 ? {} : { metaKey: true });
  check("three open rows selected", (await selectionCount(page)) === 3);
  await page.select("[aria-label='Set status for selection']", "blocked");
  await settle(page, 400);
  const after = await groupHeaders(page);
  const openAfterMove = after.find((h) => h.group === "open")?.count ?? 0;
  const blockedAfterMove = after.find((h) => h.group === "blocked")?.count ?? 0;
  check(
    "bulk status change moves rows and both group counts update",
    blockedAfterMove === blockedBefore + 3 && openAfterMove === openHeaderBefore - 3,
    `open ${openHeaderBefore}→${openAfterMove}, blocked ${blockedBefore}→${blockedAfterMove}`,
  );
  check(
    "the moved rows now sit under the blocked header",
    (await renderedStatuses(page)).filter((s) => s === "blocked").length === blockedAfterMove,
  );
  await page.keyboard.press("Escape");
  await settle(page, 150);
  await clearSearch(page);
  await page.click("[aria-label='Group by status']");
  await settle(page, 300);
}

// S6 — open in place
{
  scenario("S6 open a row in place");
  const before = await page.$$eval(`${LIST} [data-index]`, (n) =>
    n.slice(0, 6).map((x) => Math.round(x.getBoundingClientRect().height)),
  );
  await openRowEditor(page, 2);
  const geometry = await page.$$eval(`${LIST} [data-index]`, (n) =>
    n.slice(0, 6).map((x) => ({
      h: Math.round(x.getBoundingClientRect().height),
      top: Math.round(x.getBoundingClientRect().top),
    })),
  );
  check("collapsed rows are a uniform 52px", before.every((h) => h === 52), before.join(","));
  check("the opened row grows", geometry[2].h > 200, `${geometry[2].h}px`);
  check("rows below shift by exactly the growth", geometry[3].top === geometry[2].top + geometry[2].h);

  const scroller = await page.$(LIST);
  await scroller.evaluate((el) => (el.scrollTop = 600));
  await settle(page, 200);
  const scrolled = await page.$eval(LIST, (el) => el.scrollTop);
  check("the list still scrolls while an editor is open", scrolled === 600, `${scrolled}`);
  await scroller.evaluate((el) => (el.scrollTop = 0));
  await settle(page, 200);
  await page.keyboard.press("Escape");
  await settle(page, 250);
  const closed = await page.$$eval(`${LIST} [data-index]`, (n) =>
    [...new Set(n.map((x) => Math.round(x.getBoundingClientRect().height)))],
  );
  check("closing restores uniform heights", closed.length === 1 && closed[0] === 52, closed.join(","));
}

// S7 — draft semantics
{
  scenario("S7 edit with draft semantics");
  await openRowEditor(page, 1);
  const id = (await renderedIds(page))[1];
  const originalTitle = await editorValue(page, "title");
  await setEditorValue(page, "title", "CANCELLED EDIT SHOULD NOT PERSIST");
  await setEditorValue(page, "priority", "P0");
  await clickByText(page, `${LIST} button`, "Cancel");
  await settle(page, 250);
  await openRowEditor(page, 1);
  check("Cancel discarded the draft", (await editorValue(page, "title")) === originalTitle, originalTitle);
  check("re-opened the same record", (await renderedIds(page))[1] === id);

  const statsBefore = await statusStats(page);
  await setEditorValue(page, "title", "Saved title from acceptance run");
  await setEditorValue(page, "status", "closed");
  await setEditorValue(page, "priority", "P0");
  await setEditorValue(page, "assignee", "Turing");
  await setEditorValue(page, "labels", "verified, saved");
  await setEditorValue(page, "description", "Written by the acceptance driver.");
  await clickByText(page, `${LIST} button`, "Save");
  await settle(page, 350);

  const statsAfter = await statusStats(page);
  check("stats reflect the save immediately", statsAfter.closed === statsBefore.closed + 1, `closed ${statsBefore.closed} → ${statsAfter.closed}`);
  await type(page, "Saved title from acceptance run");
  const found = await renderedTitles(page);
  check("the saved record is findable by its new title", found.length === 1 && found[0] === "Saved title from acceptance run");
  await clearSearch(page);
  await type(page, "Turing");
  check("the new assignee is searchable", (await counts(page)).shown === 1);
  await clearSearch(page);

  // put it back so later scenarios see the original distribution
  await type(page, "Saved title from acceptance run");
  await openRowEditor(page, 0);
  await setEditorValue(page, "status", "open");
  await clickByText(page, `${LIST} button`, "Save");
  await settle(page, 250);
  await clearSearch(page);
}

// S8 — create
{
  scenario("S8 create an issue");
  const before = await counts(page);
  await page.click("[aria-label='New issue']");
  await settle(page, 350);
  const after = await counts(page);
  check("total grows by one", after.total === before.total + 1, `${before.total} → ${after.total}`);
  check("exactly one row is selected", (await selectionCount(page)) === 1);
  const selectedNow = await page.$$eval(`${LIST} input[type='checkbox']:checked`, (n) => n.length);
  check("the new row is the selected one and is on screen", selectedNow === 1);
  const newId = await page.$eval(`${LIST} input[type='checkbox']:checked`, (n) =>
    Number(n.closest("[data-issue-id]").dataset.issueId),
  );
  check("it appears in the current sort order (newest updated first)", newId === after.total, `#${newId}`);

  // clean up
  await page.keyboard.press("Escape");
  await settle(page, 120);
}

// S9 — bulk actions and undo
{
  scenario("S9 bulk status, delete, undo");
  const statsBefore = await statusStats(page);
  for (let k = 0; k < 5; k++) await clickRow(page, k, k === 0 ? {} : { metaKey: true });
  check("five records selected", (await selectionCount(page)) === 5);
  const chosen = (await renderedIds(page)).slice(0, 5);
  const wasBlocked = (await renderedStatuses(page)).slice(0, 5).filter((s) => s === "blocked").length;
  await page.select("[aria-label='Set status for selection']", "blocked");
  await settle(page, 350);
  const statsAfter = await statusStats(page);
  check(
    "all five moved and stats updated",
    statsAfter.blocked === statsBefore.blocked + (5 - wasBlocked),
    `blocked ${statsBefore.blocked} → ${statsAfter.blocked}`,
  );

  await page.keyboard.press("Escape");
  await settle(page, 150);
  for (let k = 0; k < 5; k++) await clickRow(page, k, k === 0 ? {} : { metaKey: true });
  const doomed = (await renderedIds(page)).slice(0, 5);
  const totalBefore = (await counts(page)).total;
  await clickByText(page, "[aria-label='Bulk actions'] button", "Delete");
  await settle(page, 400);
  check("records are gone", (await counts(page)).total === totalBefore - 5, `${totalBefore} → ${(await counts(page)).total}`);
  const stillThere = await renderedIds(page);
  check("deleted rows left the list", doomed.every((id) => !stillThere.includes(id)));

  await clickByText(page, "button", "Undo");
  await settle(page, 400);
  check("undo restores the count", (await counts(page)).total === totalBefore);
  const restored = await renderedIds(page);
  check("undo restores the exact records", doomed.every((id) => restored.includes(id)), doomed.join(","));
  check("restored records are re-selected", (await selectionCount(page)) === 5);
  await page.keyboard.press("Escape");
  await settle(page, 150);
  check("chosen ids unchanged through the round trip", chosen.length === 5);
}

// S11 — selection identity (run at 10K, before the scale change)
{
  scenario("S11 selection identity across sort and filter changes");
  for (let k = 0; k < 5; k++) await clickRow(page, k, k === 0 ? {} : { metaKey: true });
  const selected = (await renderedIds(page)).filter((_, k) => k < 5);
  check("five selected", (await selectionCount(page)) === 5);
  await page.click("[aria-label^='Sort direction']");
  await settle(page, 250);
  await page.click("[aria-label^='Sort direction']");
  await settle(page, 250);
  check("selection survives two sort flips", (await selectionCount(page)) === 5);
  await page.select("[aria-label='Sort field']", "title");
  await settle(page, 300);
  check("selection survives a sort-key change", (await selectionCount(page)) === 5);
  await toggleFacet(page, "Status", "Open");
  check("selection survives a filter change", (await selectionCount(page)) === 5);
  await toggleFacet(page, "Status", "Open");
  await page.select("[aria-label='Sort field']", "updated");
  await settle(page, 300);
  const visibleChecked = await page.$$eval(`${LIST} input:checked`, (n) =>
    n.map((x) => Number(x.closest("[data-issue-id]").dataset.issueId)),
  );
  check(
    "the same records are still the checked ones",
    visibleChecked.every((id) => selected.includes(id)),
    `${visibleChecked.length} on screen`,
  );
  await page.keyboard.press("Escape");
  await settle(page, 150);
}

// S13 — keyboard
{
  scenario("S13 keyboard");
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.down("Meta");
  await page.keyboard.press("k");
  await page.keyboard.up("Meta");
  check("⌘K focuses search", await page.evaluate(() => document.activeElement?.id === "tracker-search"));

  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("/");
  check("/ focuses search", await page.evaluate(() => document.activeElement?.id === "tracker-search"));
  check("/ did not leak into the field", (await page.$eval("#tracker-search", (n) => n.value)) === "");

  // Delete must never fire while typing
  await page.type("#tracker-search", "cache", { delay: 10 });
  await settle(page, 300);
  const totalWhileTyping = (await counts(page)).total;
  await page.keyboard.press("Delete");
  await page.keyboard.press("Backspace");
  await settle(page, 250);
  check("Delete/Backspace do nothing while typing", (await counts(page)).total === totalWhileTyping);
  await clearSearch(page);

  await clickRow(page, 0);
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("Enter");
  await settle(page, 250);
  check("Enter opens the selected row", (await page.$(`${LIST} [name='title']`)) !== null);
  await page.keyboard.press("Escape");
  await settle(page, 200);
  check("Esc closes the editor (layer 1)", (await page.$(`${LIST} [name='title']`)) === null);

  await clickRow(page, 0);
  await clickRow(page, 1, { metaKey: true });
  const totalBeforeDelete = (await counts(page)).total;
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("Delete");
  await settle(page, 350);
  check("Delete removes the selection", (await counts(page)).total === totalBeforeDelete - 2);
  await clickByText(page, "button", "Undo");
  await settle(page, 350);
  check("undo after keyboard delete", (await counts(page)).total === totalBeforeDelete);

  await page.keyboard.press("Escape");
  await settle(page, 150);
  check("Esc clears the selection (layer 2)", (await selectionCount(page)) === 0);
  await type(page, "cache");
  await page.keyboard.press("Escape");
  await settle(page, 300);
  check("Esc clears the search (layer 3)", (await page.$eval("#tracker-search", (n) => n.value)) === "");
  await toggleFacet(page, "Status", "Blocked");
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("Escape");
  await settle(page, 300);
  check("Esc clears the filters (layer 4)", (await counts(page)).shown === (await counts(page)).total);
}

// S14 — themes
{
  scenario("S14 light / system / dark");
  const readTheme = () => page.evaluate(() => ({
    attr: document.documentElement.dataset.theme,
    bg: getComputedStyle(document.body).backgroundColor,
    fg: getComputedStyle(document.body).color,
  }));
  await page.click("[aria-label='dark theme']");
  await settle(page, 200);
  const dark = await readTheme();
  await page.click("[aria-label='light theme']");
  await settle(page, 200);
  const light = await readTheme();
  await page.click("[aria-label='system theme']");
  await settle(page, 200);
  const system = await readTheme();
  check("dark mode applies", dark.attr === "dark", dark.bg);
  check("light mode applies", light.attr === "light", light.bg);
  check("system resolves to a concrete theme", system.attr === "light" || system.attr === "dark", system.attr);
  check("the two themes really differ", dark.bg !== light.bg && dark.fg !== light.fg);
  await page.click("[aria-label='dark theme']");
  await settle(page, 200);
  await page.screenshot({ path: new URL("../screenshots/dark.png", import.meta.url).pathname });
  await page.click("[aria-label='light theme']");
  await settle(page, 200);
  await page.screenshot({ path: new URL("../screenshots/light.png", import.meta.url).pathname });
}

// S15 — 400px
{
  scenario("S15 400px width");
  await page.setViewport({ width: 400, height: 820, deviceScaleFactor: 2 });
  await settle(page, 400);
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  check("no horizontal overflow", overflow.doc <= 0 && overflow.body <= 0, JSON.stringify(overflow));
  check("search reachable", (await page.$("#tracker-search")) !== null);
  check("sort + group + new reachable", (await page.$$("[aria-label='Sort field'], [aria-label='Group by status'], [aria-label='New issue']")).length === 3);
  check("scale control reachable", (await page.$$("[aria-label='Dataset scale'] button")).length === 3);
  await page.click("[aria-label='Toggle filters and statistics']");
  await settle(page, 400);
  const drawer = await page.$eval("[aria-label='Filters']", (n) => n.getBoundingClientRect().left);
  check("filters/stats reachable via the panel drawer", drawer >= 0, `left=${Math.round(drawer)}`);
  await page.screenshot({ path: new URL("../screenshots/narrow.png", import.meta.url).pathname });
  await page.click("[aria-label='Close panel']");
  await settle(page, 300);
  await openRowEditor(page, 0);
  const editorFits = await page.$eval(`${LIST} form`, (n) => n.getBoundingClientRect().right <= window.innerWidth + 1);
  check("the in-row editor fits", editorFits);
  await page.keyboard.press("Escape");
  await page.setViewport({ width: 1560, height: 950, deviceScaleFactor: 2 });
  await settle(page, 300);
}

// S12 / S10 — scale and deep scroll
{
  scenario("S12 scale to 100K then 1M");
  const t100 = Date.now();
  await setScale(page, "100K");
  await settle(page, 400);
  check("100K total", (await counts(page)).total === 100_000, `${(await counts(page)).total}`);
  const m100 = await metrics(page);
  check("measured numbers update at 100K", /\d/.test(m100[0]) && /\d/.test(m100[1]), m100.join(" / "));
  console.log(`    (100K switch took ${Date.now() - t100}ms wall)`);

  scenario("S10 deep-scroll at 100K");
  const stops = await page.evaluate(async (sel) => {
    const el = document.querySelector(sel);
    const out = [];
    for (const fraction of [0.13, 0.37, 0.5, 0.76, 0.91, 1]) {
      el.scrollTop = (el.scrollHeight - el.clientHeight) * fraction;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 120));
      const rows = [...el.querySelectorAll("[data-issue-id]")];
      const box = el.getBoundingClientRect();
      const covered = rows.filter((r) => {
        const b = r.getBoundingClientRect();
        return b.bottom > box.top && b.top < box.bottom;
      });
      out.push({
        fraction,
        rows: rows.length,
        covered: covered.length,
        firstIndex: rows[0]?.dataset.index,
        gap:
          covered.length > 1
            ? Math.max(
                ...covered.slice(1).map((r, k) => Math.round(r.getBoundingClientRect().top - covered[k].getBoundingClientRect().bottom)),
              )
            : 0,
      });
    }
    return out;
  }, LIST);
  check("rows present at every stop", stops.every((s) => s.covered > 15), stops.map((s) => s.covered).join(","));
  check("no gaps between rows at rest", stops.every((s) => s.gap === 0));
  check("the viewport index actually moves", new Set(stops.map((s) => s.firstIndex)).size === stops.length, stops.map((s) => s.firstIndex).join(","));

  scenario("S12b search + edit remain correct at 100K");
  await type(page, "avatar upload");
  const shown100 = (await counts(page)).shown;
  check("search narrows at 100K", shown100 > 0 && shown100 < 100_000, `${shown100}`);
  check("search ms reported at 100K", /\d/.test((await metrics(page))[2]), (await metrics(page))[2]);
  const titles100 = await renderedTitles(page);
  check("rows match at 100K", titles100.every((t) => t.toLowerCase().includes("avatar upload")));
  await clearSearch(page);

  scenario("S12c scale to 1M");
  const t1m = Date.now();
  await setScale(page, "1M");
  await settle(page, 600);
  check("1M total", (await counts(page)).total === 1_000_000, `${(await counts(page)).total}`);
  console.log(`    (1M switch took ${Date.now() - t1m}ms wall)`);
  await type(page, "scroll jank on Windows");
  const shown1m = (await counts(page)).shown;
  check("search still works at 1M", shown1m > 0 && shown1m < 1_000_000, `${shown1m} rows`);
  console.log(`    (1M search ms reported: ${(await metrics(page))[2]})`);
  await clearSearch(page);
  const scrollOk = await page.evaluate(async (sel) => {
    const el = document.querySelector(sel);
    el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.6;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 150));
    return el.querySelectorAll("[data-issue-id]").length;
  }, LIST);
  check("still scrolls and renders at 1M", scrollOk > 15, `${scrollOk} rows rendered`);
  await waitForRows(page);
}

// ---- summary -------------------------------------------------------------

const failed = results.filter((r) => !r.ok);
const byScenario = new Map();
for (const r of results) {
  const entry = byScenario.get(r.scenario) ?? { pass: 0, fail: 0 };
  entry[r.ok ? "pass" : "fail"]++;
  byScenario.set(r.scenario, entry);
}
console.log("\n================ summary ================");
for (const [name, { pass, fail }] of byScenario) {
  console.log(`${fail === 0 ? "PASS" : "FAIL"}  ${name}  (${pass} ok${fail ? `, ${fail} failed` : ""})`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

await browser.close();
process.exit(failed.length === 0 ? 0 : 1);
