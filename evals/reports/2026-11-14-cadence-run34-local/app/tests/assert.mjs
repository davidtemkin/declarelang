// Cadence at a desk (1280×800, mouse): the brief's §9 walk, against the live
// service on :8320. Everything this script adds it deletes again, and the one
// correction it makes it puts back, so it can be run repeatedly.

// A value off the App, read in the page (drive.read takes a path of views).
const app = (page, expr) => page.evaluate((e) => {
  const a = window.__declare.find("app");
  return new Function("app", "return app." + e)(a);
}, expr);
const call = (page, fn, arg) => page.evaluate(fn, arg);

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
    // whatever a failed run left behind, so the next run starts from the same history
    const now = await app(page, "all.map((s) => s.id)");
    for (const id of now.filter((i) => !before.has(i)))
      await page.evaluate((i) => fetch("http://127.0.0.1:8320/api/sessions/" + i, { method: "DELETE" }), id);
    await page.evaluate(() => fetch("http://127.0.0.1:8320/api/sessions/s0107", { method: "PUT",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ effort: 9 }) }));
  }
};

async function walk({ drive, expect, page }) {
  // ── Today, at a glance ──────────────────────────────────────────────────
  const c0 = await app(page, "weekCount");
  const m0 = await app(page, "weekMinutes");
  const st0 = await app(page, "streak");
  const fmt = (m) => (m < 60 ? `${m}m` : m % 60 == 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`);
  const weekLine = (c, m) => `${c} ${c == 1 ? "session" : "sessions"} · ${fmt(m)}`;
  await expect(page.getByText(weekLine(c0, m0), { exact: true })).toBeVisible();
  await expect(page.getByText(st0 == 0 ? "no streak" : `${st0} ${st0 == 1 ? "day" : "days"}`, { exact: true })).toBeVisible();
  await expect.visible("app.page.liveBand");                       // the run in progress
  await expect.text("app.page.liveBand", "In progress");
  await sixTimes(page, "today");

  // ── Add yesterday's forgotten ride, with the keyboard where it helps ────
  await drive.click('app.page.masthead."Log a session"');
  await drive.settleMotion();
  await page.getByRole("option", { name: "Ride" }).click();
  await page.getByRole("option", { name: "Yesterday" }).click();
  await drive.key("7");                                              // a digit sets the effort
  await expect.equal(await drive.read("app.entrySheet.entry.effort"), 7);
  await sixTimes(page, "the add panel");
  await page.getByRole("button", { name: /^Save ride/ }).click();
  // The reply lands; a frame or two on, the week's time is on its way, not there.
  for (let i = 0; i < 200 && (await app(page, "weekCount")) == c0; i++) await drive.wait(16);
  await drive.wait(48);
  const mid = await app(page, "weekMinutesShown"), goal = await app(page, "weekMinutes");
  await drive.settleData();
  if (!(mid > m0 && mid < goal)) throw new Error(`the week's time should travel to its new value: ${m0} → ${mid} → ${goal}`);
  await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { body: { sport: "ride", date: "2026-08-04", effort: 7 } });
  const ride = await app(page, `all.find((s) => s.sport == "ride" && s.date == "2026-08-04" && s.effort == 7)`);
  const rideId = ride.id;
  await expect.equal(await app(page, "weekCount"), c0 + 1);
  await expect(page.getByText(weekLine(c0 + 1, m0 + ride.minutes), { exact: true })).toBeVisible();

  // ── And today's swim: the streak moves to take it in ────────────────────
  await drive.key("n");
  await drive.settleMotion();
  await page.getByRole("option", { name: "Swim" }).click();
  await page.getByRole("button", { name: /^Save swim/ }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { body: { sport: "swim", date: "2026-08-05" } });
  const swimId = (await app(page, `all.find((s) => s.sport == "swim" && s.date == "2026-08-05")`)).id;
  await expect.equal(await app(page, "weekCount"), c0 + 2);
  await expect.equal(await app(page, "streak"), st0 + 1);
  await expect(page.getByText(`${st0 + 1} days`, { exact: true })).toBeVisible();
  await expect.equal(await app(page, "last.id"), swimId);           // the last session is the new one

  // ── The year: push it, pull it open, squeeze it shut ────────────────────
  const surface = "app.page.year.surface";
  const label0 = await app(page, "periodLabel");
  const ws0 = await app(page, "ws");
  await drive.drag(surface, 400, 0);                                 // push it back into the past
  const ws1 = await app(page, "ws");
  if (!(ws1 < ws0 - 20)) throw new Error(`a drag right should move into the past: ws ${ws0} → ${ws1}`);
  if ((await app(page, "periodLabel")) == label0) throw new Error("the period label did not follow the drag");
  const span0 = await app(page, "span");
  await drive.pinch(surface, 2);                                     // trackpad pinch: pull it open
  const span1 = await app(page, "span");
  if (!(span1 < span0 * 0.8)) throw new Error(`pinching open should show fewer days: ${span0} → ${span1}`);
  await drive.click('app.page.year.head.periods."All"');              // the whole history
  await drive.settleMotion();
  await expect.equal(await app(page, "span"), await app(page, "totalDays"));

  // A hard run from the heavy block in December, found on the surface and opened.
  const target = await app(page, `all.find((s) => s.id == "s0107")`);
  await drive.click('app.page.year.head.periods."2 wk"');
  await drive.settleMotion();
  const day = await app(page, "todayN");
  const tN = Math.round(Date.UTC(2025, 11, 16) / 86400000);
  await drive.set("app", "wsTo", tN - (day + 1) - 6);                   // glide the window onto that fortnight
  await drive.settleMotion();
  await expect.text("app.page.year.head.title", "Dec 2025");
  const ws = await app(page, "ws"), span = await app(page, "span");
  const w = await drive.read(`${surface}.width`);
  const x = ((tN - (day + 1) - ws) + 0.5) / span * w;
  await drive.clickAt(surface, x, 150);
  await drive.settleMotion();
  await expect.equal(await app(page, "openId"), "s0107");
  await expect.text("app.detail", "Run");
  await expect.text("app.detail", "9");                                // the effort, large
  await expect.text("app.detail", "10.2 km");
  await expect.text("app.detail", `${target.heartAvg} bpm`);
  await expect.text("app.detail", "Harder than");
  await sixTimes(page, "a session");

  // ── Correct it, then put it back ────────────────────────────────────────
  await page.getByRole("button", { name: "Correct it" }).click();
  await drive.settleMotion();
  await page.getByRole("option", { name: "Effort 6" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("PUT", "/api/sessions/s0107", { body: { effort: 6 } });
  await expect.equal(await app(page, "opened.effort"), 6);
  await page.getByRole("button", { name: "Correct it" }).click();
  await drive.settleMotion();
  await page.getByRole("option", { name: "Effort 9" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.equal(await app(page, "opened.effort"), 9);
  await drive.key("Escape");
  await drive.settleMotion();

  // ── Delete what this script added; the figures move back ────────────────
  for (const id of [swimId, rideId]) {
    await call(page, (i) => window.__declare.find("app").open(i), id);
    await drive.settleMotion();
    await page.getByRole("dialog", { name: "Session" }).getByRole("button", { name: "Delete" }).click();
    await drive.settleMotion();
    await expect.text("app.detail", "Delete it for good?");           // it asks first, in place
    await page.getByRole("dialog", { name: "Session" }).getByRole("group", { name: "Delete this session?" })
      .getByRole("button", { name: "Delete" }).click();
    await drive.settleData();
    await drive.settleMotion();
    await expect.request("DELETE", `/api/sessions/${id}`);
  }
  await expect.equal(await app(page, "weekCount"), c0);
  await expect.equal(await app(page, "streak"), st0);
  await expect(page.getByText(weekLine(c0, m0), { exact: true })).toBeVisible();
}
