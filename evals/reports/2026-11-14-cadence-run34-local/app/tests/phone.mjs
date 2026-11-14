// Cadence on a phone (390×844, touch): standing in the gym, one thumb. The
// case the brief cares most about is recording a session that just ended in
// a couple of taps; then the year under a finger. Everything added is deleted
// again, so it can be run repeatedly against the live service on :8320.
//
//   npx declare-verify my-apps/cadence/cadence.declare --assert my-apps/cadence/tests/phone.mjs

export const device = { width: 390, height: 844, touch: true };

const app = (page, expr) => page.evaluate((e) => {
  const a = window.__declare.find("app");
  return new Function("app", "return app." + e)(a);
}, expr);

// The type scale on the screen as it stands: the largest text shown against the
// smallest, over every element whose own text is on screen (the brief asks 6×).
export const typeRatio = (page) => page.evaluate(() => {
  const sizes = [];
  for (const el of document.querySelectorAll("body *")) {
    const own = [...el.childNodes].some((n) => n.nodeType == 3 && n.textContent.trim() != "")
      || (/^(INPUT|TEXTAREA)$/.test(el.tagName) && el.value.trim() != "");
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.width == 0 || r.height == 0 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility == "hidden" || cs.opacity == "0" || el.closest("[inert]")) continue;
    sizes.push(parseFloat(cs.fontSize));
  }
  return { max: Math.max(...sizes), min: Math.min(...sizes) };
});
export const sixTimes = async (page, where) => {
  const { max, min } = await typeRatio(page);
  if (max / min < 6) throw new Error(`${where}: largest text ${max}px is only ${(max / min).toFixed(1)}× the smallest ${min}px`);
};

export default async ({ drive, expect, page }) => {
  const before = new Set(await app(page, "all.map((s) => s.id)"));
  try {
    await walk({ drive, expect, page });
  } finally {
    const now = await app(page, "all.map((s) => s.id)");
    for (const id of now.filter((i) => !before.has(i)))
      await page.evaluate((i) => fetch("http://127.0.0.1:8320/api/sessions/" + i, { method: "DELETE" }), id);
  }
};

async function walk({ drive, expect, page }) {
  const c0 = await app(page, "weekCount");
  const st0 = await app(page, "streak");
  const today = await app(page, "today");

  // ── Two taps: the add button under the thumb, then Save ─────────────────
  const fab = await page.getByRole("button", { name: "Log a session" }).boundingBox();
  if (fab.y < 844 * 0.75 || fab.x < 390 * 0.6) throw new Error(`the add button should sit under a right thumb: ${JSON.stringify(fab)}`);
  if (fab.width < 56) throw new Error("the add button should be big enough to hit without looking");
  await sixTimes(page, "today, on a phone");
  await drive.click("app.fabDock.fab");
  await drive.settleMotion();
  await sixTimes(page, "the add sheet, on a phone");

  // What they most likely did is already there: today, a sport, a length, an effort.
  await expect(page.getByRole("option", { name: "Today" })).toHaveAttribute("aria-selected", "true");
  const likely = await app(page, "likelySport");
  const name = likely[0].toUpperCase() + likely.slice(1);
  await expect(page.getByRole("option", { name, exact: true })).toHaveAttribute("aria-selected", "true");
  const save = page.getByRole("button", { name: new RegExp("^Save " + likely) });
  const box = await save.boundingBox();
  if (box.y + box.height > 844 || box.y < 844 * 0.5) throw new Error(`Save should be on screen, low, under the thumb: ${JSON.stringify(box)}`);
  if (box.height < 48 || box.width < 300) throw new Error("Save should be a wide, tall target");
  if (await page.evaluate(() => document.activeElement && /input|textarea/i.test(document.activeElement.tagName)))
    throw new Error("the keyboard should not come up on its own");
  await save.click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { body: { sport: likely, date: today } });
  await expect.equal(await app(page, "weekCount"), c0 + 1);
  await expect.equal(await app(page, "streak"), st0 + 1);
  await expect.attr("app", "entryOpen", false);

  // A nudge, not typing: open again, pick a sport, +5 minutes, effort 8, save.
  await drive.click("app.fabDock.fab");
  await drive.settleMotion();
  await page.getByRole("option", { name: "Lift" }).click();
  await expect.hidden("app.entrySheet.entry.far");                 // lifting has no distance
  const m = await drive.read("app.entrySheet.entry.minutes");
  await page.getByRole("button", { name: "Five minutes more" }).click();
  await expect.equal(await drive.read("app.entrySheet.entry.minutes"), m + 5);
  await page.getByRole("option", { name: "Effort 8" }).click();
  await page.getByRole("button", { name: /^Save lift/ }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { body: { sport: "lift", minutes: m + 5, effort: 8, distanceKm: null } });
  await expect.equal(await app(page, "weekCount"), c0 + 2);

  // ── The year under a finger ─────────────────────────────────────────────
  const surface = "app.page.year.surface";
  await drive.reveal(surface);
  const ws0 = await app(page, "ws");
  const y0 = await page.evaluate(() => window.scrollY);
  await drive.drag(surface, 0, -250);                               // up and down still scroll the page
  if ((await app(page, "ws")) != ws0) throw new Error("a vertical swipe moved the year");
  if ((await page.evaluate(() => window.scrollY)) == y0) throw new Error("a vertical swipe on the year should scroll the page");
  await drive.reveal(surface);
  await drive.drag(surface, 200, 0);                                // sideways is the year's
  const ws1 = await app(page, "ws");
  if (!(ws1 < ws0 - 10)) throw new Error(`a sideways drag should move the year: ${ws0} → ${ws1}`);
  const span0 = await app(page, "span");
  await drive.pinch(surface, 2.2);                                  // two fingers pull it open
  const span1 = await app(page, "span");
  if (!(span1 < span0 * 0.7)) throw new Error(`a pinch should zoom in: ${span0} → ${span1}`);
  await drive.pinch(surface, 0.25);                                 // and squeeze it shut
  if (!((await app(page, "span")) > span1 * 2)) throw new Error("a pinch inward should zoom out");

  // ── Tap a session in the period, see it, delete the two added ───────────
  await drive.click('app.page.year.head.periods."2 wk"');
  await drive.settleMotion();
  await page.evaluate(() => { const a = window.__declare.find("app"); a.wsTo = -14; });
  await drive.settleMotion();
  for (let k = 0; k < 2; k++) {
    const id = await app(page, "all[0].id");                        // the newest: one this script added
    await page.getByRole("list", { name: /^Sessions/ }).getByRole("button").first().click();
    await drive.settleMotion();
    await expect.attr("app", "openId", id);
    await expect.visible("app.detail");
    await sixTimes(page, "a session, on a phone");
    await page.getByRole("dialog", { name: "Session" }).getByRole("button", { name: "Delete" }).click();
    await drive.settleMotion();
    await page.getByRole("dialog", { name: "Session" }).getByRole("group", { name: "Delete this session?" })
      .getByRole("button", { name: "Delete" }).click();
    await drive.settleData();
    await drive.settleMotion();
    await expect.request("DELETE", `/api/sessions/${id}`);
  }
  await expect.equal(await app(page, "weekCount"), c0);
  await expect.equal(await app(page, "streak"), st0);
}
