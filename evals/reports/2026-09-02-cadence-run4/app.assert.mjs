// cadence-checks.mjs — the brief's named behaviours, asserted in a real browser.
//   node tools/verify.mjs my-apps/cadence.declare --assert my-apps/cadence-checks.mjs

export default async ({ drive, expect }) => {
  const read = async src => {
    const r = await drive.page.evaluate(s => window.__declare.evaluate("", s), src);
    if (!r || r.ok !== true) await expect.fail(`evaluate(${src}) failed: ${JSON.stringify(r)}`);
    const t = r.text;
    return typeof t === "string" && t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"' ? t.slice(1, -1) : t;
    };
  const num = async src => Number(await read(src));
  const call = async src => drive.page.evaluate(s => window.__declare.evaluate("", s), src);

  // the service's frozen clock and the whole history have to be here first
  for (let i = 0; i < 60 && (await read("app.todayKey")) === ""; i++) await drive.wait(150);
  await expect.attr("app", "todayKey", "2026-08-05");
  const total = await num("app.store.value.sessions.length");
  if (total < 200) await expect.fail(`expected the full history, got ${total} sessions`);

  await drive.settleMotion();

  // ── 1. THIS WEEK reads exactly "N sessions · Xh Ym" ──────────────────────
  const wc = await num("app.weekCount"), wm = await num("app.weekMinutes");
  const dur = wm >= 60 ? (wm % 60 === 0 ? `${wm / 60}h` : `${Math.floor(wm / 60)}h ${wm % 60}m`) : `${wm}m`;
  await expect.text("app.page.h1.t", String(wc));
  await expect.text("app.page.h2.t", "sessions");
  await expect.text("app.page.h3.t", "·");
  await expect.text("app.page.h4.t", dur);

  // the numbers are the hero: the largest number is at least 6x the smallest text
  const sizes = await drive.page.evaluate(() => {
    const walk = n => [n, ...(n.children || []).flatMap(walk)];
    const all = walk(window.__declare.inspect());
    const t = all.filter(n => n.kind === "Text" && n.shown && (n.text || "").trim() !== "");
    return { big: Math.max(...t.map(n => n.attrs.fontSize || 0)),
             small: Math.min(...t.map(n => n.attrs.fontSize || 999)) };
    });
  if (sizes.big < sizes.small * 6) await expect.fail(`hero ratio only ${(sizes.big / sizes.small).toFixed(1)}x (${sizes.big}/${sizes.small})`);

  // ── 2. the streak reads "N days", or "no streak" ─────────────────────────
  const streak = await num("app.streak");
  await expect.text("app.page.streakFig.v", streak > 0 ? String(streak) : "no streak");
  await expect.text("app.page.streakFig.u", streak > 0 ? "days" : "");

  // ── 3. the week's shape is seven days ────────────────────────────────────
  await expect.count("app.page.weekBox", "WeekCol", 7);

  // ── 4. a session in progress, and it is running ──────────────────────────
  await expect.attr("app", "liveOn", true);
  await expect.visible("app.page.liveFig");
  const t1 = (await drive.page.evaluate(() => window.__declare.inspect("app.page.liveFig.v"))).text;
  await drive.wait(2500);
  const t2 = (await drive.page.evaluate(() => window.__declare.inspect("app.page.liveFig.v"))).text;
  if (t1 === t2) await expect.fail(`the live clock did not move: ${t1} → ${t2}`);

  // ── 5. the year is handled: it moves with the hand, and opens ────────────
  const label0 = (await drive.page.evaluate(() => window.__declare.inspect("app.page.periodLab"))).text;
  const right0 = await num("app.camRightTo");
  await drive.drag("app.page.strip", 260, 0, 14);
  await drive.settleMotion();
  const right1 = await num("app.camRightTo");
  const label1 = (await drive.page.evaluate(() => window.__declare.inspect("app.page.periodLab"))).text;
  if (!(right1 > right0 + 10)) await expect.fail(`a drag right did not push back through the months (${right0} → ${right1})`);
  if (label1 === label0) await expect.fail("the period label did not follow the surface");

  const span0 = await num("app.camSpanTo");
  await call("app.setSpan(16, 0.5)");
  await drive.settleMotion();
  const span1 = await num("app.camSpanTo");
  const open1 = await num("app.openness");
  if (!(span1 < span0)) await expect.fail(`pulling it open did not narrow the period (${span0} → ${span1})`);
  if (!(open1 > 0.9)) await expect.fail(`a fortnight did not resolve into blocks (openness ${open1})`);

  // ── 6. picking a session ─────────────────────────────────────────────────
  const someId = await read("app.store.value.sessions[3].id");
  await call(`app.pick("${someId}")`);
  await drive.settleMotion();
  await expect.attr("app", "selectedId", someId);
  await expect.visible("app.detail");
  await expect.approx("app", "detailT", 1, 0.02);
  await call("app.closeDetail()");
  await drive.settleMotion();

  // ── 7. adding one, and everything derived being true of it at once ───────
  await call("app.homeView()");
  await call("app.openCompose()");
  await drive.settleMotion();
  const before = { n: await num("app.weekCount"), m: await num("app.weekMinutes"),
                   s: await num("app.streak"), all: await num("app.store.value.sessions.length") };

  // the common case is confirming: sport, date, duration, distance and effort
  // are all already filled in
  const filled = { sport: await read("app.formSportPick"), date: await read("app.formDate"),
                   minutes: await num("app.formMinutes"), effort: await num("app.formEffort") };
  if (!filled.sport || filled.date !== "2026-08-05" || !(filled.minutes > 0) || !(filled.effort >= 1))
    await expect.fail(`the form did not arrive pre-filled: ${JSON.stringify(filled)}`);

  // yesterday's ride they forgot to log: two taps and a confirm
  await call('app.setSport("ride")');
  await call("app.stepDate(-1)");
  await drive.wait(120);
  const willBe = { minutes: await num("app.formMinutes"), date: await read("app.formDate") };
  await call("app.saveNow()");
  for (let i = 0; i < 60 && (await num("app.store.value.sessions.length")) === before.all; i++) await drive.wait(120);

  const after = { n: await num("app.weekCount"), m: await num("app.weekMinutes"),
                  s: await num("app.streak"), all: await num("app.store.value.sessions.length") };
  if (after.all !== before.all + 1) await expect.fail(`the session did not join the history (${before.all} → ${after.all})`);
  if (after.n !== before.n + 1) await expect.fail(`this week's count is stale (${before.n} → ${after.n})`);
  if (after.m !== before.m + willBe.minutes) await expect.fail(`this week's total is stale (${before.m} → ${after.m}, added ${willBe.minutes})`);
  if (!(after.s >= before.s)) await expect.fail(`the streak did not take it in (${before.s} → ${after.s})`);
  const err = await read("app.saveMessage");
  if (err !== "") await expect.fail(`the server refused: ${err}`);

  // the week's shape re-derived too — yesterday's column grew
  const shaped = await drive.page.evaluate(d =>
    window.__declare.evaluate("", `app.week.value.days.filter(x => x.key == "${d}")[0].minutes`), willBe.date);
  if (Number(shaped.text) < willBe.minutes) await expect.fail(`the week's shape is stale for ${willBe.date}`);

  // ── 8. and correcting, then removing it ──────────────────────────────────
  const newId = await read("app.selectedId");
  await call("app.openEdit()");
  await drive.settleMotion();
  await call("app.stepMinutes(15)");
  await call("app.saveNow()");
  await drive.wait(1200);
  const corrected = await num(`app.findSession("${newId}").minutes`);
  if (corrected !== willBe.minutes + 15) await expect.fail(`the correction did not land (${corrected})`);

  await call(`app.pick("${newId}")`);
  await drive.wait(200);
  await call("app.deleteNow()");
  for (let i = 0; i < 60 && (await num("app.store.value.sessions.length")) !== before.all; i++) await drive.wait(120);
  const gone = { n: await num("app.weekCount"), m: await num("app.weekMinutes"),
                 all: await num("app.store.value.sessions.length") };
  if (gone.all !== before.all) await expect.fail(`the delete did not land (${gone.all})`);
  if (gone.n !== before.n || gone.m !== before.m) await expect.fail(`the week did not fall back (${JSON.stringify(gone)})`);
  };
