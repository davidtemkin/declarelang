// cadence.assert.mjs — node tools/verify.mjs my-apps/cadence.declare --assert my-apps/cadence.assert.mjs
//
// Drives the real program in a browser against the real service on :8320.
// Note: the live session's pulse repeats forever, so this script waits rather
// than calling settleMotion(), which would never return true.

// `find(path)` hands back the live node, so a slot — or a method — is read
// directly. (`inspect().attrs` carries only cell-owning slots, and `evaluate()`
// renders to text; neither serves a numeric assertion.)
const read = (drive, expr) => drive.page.evaluate(
  (e) => new Function("app", "return (" + e + ")")(window.__declare.find("app")), expr);
const attr = (drive, path, name) => drive.page.evaluate(
  ([p, n]) => window.__declare.find(p)[n], [path, name]);
const textOf = async (drive, path) => (await drive.page.evaluate(
  (p) => window.__declare.inspect(p).text, path));
const explain = async (drive, path, name) => (await drive.page.evaluate(
  ([p, n]) => window.__declare.explain(p, n), [path, name]));
const setLoc = async (drive, v) => {
  await drive.page.evaluate((x) => { window.__declare.find("app").location = x; }, v);
  await drive.wait(450);
};

export default async ({ drive, expect }) => {
  await drive.wait(2200);   // the three sources land

  // ── §2 the copy, exactly as the brief writes it ─────────────────────────
  const week = await textOf(drive, "app.week.n");
  if (!/^\d+ sessions? · (\d+h )?\d+m$/.test(week)) await expect.fail(`week line reads "${week}"`);
  const streak = await textOf(drive, "app.streak.n");
  if (!/^(\d+ days?|no streak)$/.test(streak)) await expect.fail(`streak reads "${streak}"`);
  await expect.text("app.brand.mark", "CADENCE");

  // durations, distances and heart rates in the fixed formats
  const last = await textOf(drive, "app.last.line");
  if (!/(\d+h )?\d+m/.test(last)) await expect.fail(`last session reads "${last}"`);

  // ── §6 the numbers are the hero: largest number ≥ 6 × smallest text ─────
  const hero = await attr(drive, "app.streak.n", "fontSize");
  const tiny = await attr(drive, "app.brand.mark", "fontSize");
  if (hero < tiny * 6) await expect.fail(`hero ${hero}px is only ${(hero / tiny).toFixed(1)}× the ${tiny}px label`);

  // ── §6 numbers travel: every headline reads a sprung mirror ─────────────
  const wt = await explain(drive, "app.week.n", "text");
  if (!/weekText/.test(wt.constraint.source)) await expect.fail("the week line is not derived");
  const stx = await explain(drive, "app.streak.n", "text");
  if (!/streakText/.test(stx.constraint.source)) await expect.fail("the streak is not derived");

  // ── §3 the surface is handled: it moves with the hand, not on release ───
  const band = await drive.page.evaluate((p) => { const n = window.__declare.inspect(p); return { x: n.rootX + n.width / 2, y: n.rootY + n.height / 2 }; }, "app.band.plot.catcher");
  const c0 = await read(drive, "app.centerDay");
  const p0 = await textOf(drive, "app.band.period");

  await drive.page.mouse.move(band.x, band.y);
  await drive.page.mouse.down();
  await drive.page.mouse.move(band.x + 150, band.y, { steps: 8 });
  await drive.wait(50);

  // MID-GESTURE, with the button still down: the surface is already there
  if (await read(drive, "app.panning") !== true) await expect.fail("the surface did not take the drag");
  const mid = await read(drive, "app.centerDay");
  const midShown = await read(drive, "app.cx");
  if (!(mid < c0 - 1)) await expect.fail(`dragging right did not move the surface (${c0} → ${mid})`);
  if (Math.abs(midShown - mid) > 0.001) await expect.fail(`the surface lagged the hand: ${midShown} vs ${mid}`);
  const pMid = await textOf(drive, "app.band.period");
  if (pMid === p0) await expect.fail("the period label waited for the release");
  const sumMid = await textOf(drive, "app.band.summary");
  if (!/^\d+ sessions? · (\d+h )?\d+m$/.test(sumMid)) await expect.fail(`mid-drag summary reads "${sumMid}"`);

  await drive.page.mouse.up();
  await drive.wait(120);
  if (await read(drive, "app.panning") !== false) await expect.fail("the surface kept the drag after release");

  // ── §3 pulled open and squeezed shut ────────────────────────────────────
  const s0 = await read(drive, "app.spanDays");
  const box = await drive.page.evaluate((p) => { const n = window.__declare.inspect(p); return { x: n.rootX + n.width / 2, y: n.rootY + n.height / 2 }; }, "app.band.plot.catcher");
  await drive.page.mouse.move(box.x, box.y);
  for (let i = 0; i < 12; i++) await drive.page.mouse.wheel({ deltaY: -40 });
  await drive.wait(500);
  const s1 = await read(drive, "app.spanDays");
  if (!(s1 < s0 * 0.8)) await expect.fail(`zoom in: span ${s0} → ${s1}`);
  for (let i = 0; i < 24; i++) await drive.page.mouse.wheel({ deltaY: 60 });
  await drive.wait(500);
  const s2 = await read(drive, "app.spanDays");
  if (!(s2 > s1 * 1.3)) await expect.fail(`zoom out: span ${s1} → ${s2}`);
  // the window summary says what happened in whatever is on screen
  const sum = await textOf(drive, "app.band.summary");
  if (!/^\d+ sessions? · (\d+h )?\d+m$/.test(sum)) await expect.fail(`window summary reads "${sum}"`);

  // ── §4 picking a session, from the surface ──────────────────────────────
  await drive.click("app.band.plot.catcher");
  await drive.wait(500);
  const loc = await read(drive, "app.location");
  if (!/^s\//.test(loc)) await expect.fail(`a tap on the surface picked nothing (location "${loc}")`);
  await expect.visible("app.sheet.body.detail");
  const dur = await textOf(drive, "app.sheet.body.detail.dur");
  if (!/^(\d+h )?\d+m$/.test(dur)) await expect.fail(`detail duration reads "${dur}"`);
  const standing = await textOf(drive, "app.sheet.body.detail.standing.hdr");
  if (!/longer than \d+% of your \w+s/.test(standing)) await expect.fail(`standing reads "${standing}"`);
  // a hard session looks hard: the sheet's wash is the effort ramp
  const washSrc = (await explain(drive, "app.sheet.wash", "fill")).constraint.source;
  if (!/effortColor/.test(washSrc)) await expect.fail("the sheet's wash is not driven by effort");

  await setLoc(drive, "");

  // ── §5 adding one, and everything derived moving with it ────────────────
  const before = { n: await read(drive, "app.weekCount"), m: await read(drive, "app.weekMin"), st: await read(drive, "app.streakDays") };
  const rows0 = await read(drive, "app.rows().length");

  await drive.click(await read(drive, "app.phone") ? "app.dock" : "app.addBtn");
  await drive.wait(500);
  await expect.visible("app.sheet.body.compose");

  // the draft arrives pre-filled — the common case is confirming
  const seeded = { sport: await read(drive, "app.dSport"), day: await read(drive, "app.dDay"),
    min: await read(drive, "app.dMin"), eff: await read(drive, "app.dEff") };
  if (seeded.min <= 0) await expect.fail("the duration was not pre-filled");
  if (seeded.eff < 1 || seeded.eff > 10) await expect.fail("the effort was not pre-filled");
  if (await read(drive, "app.todayIdx") !== seeded.day) await expect.fail("the date did not default to today");
  if (await read(drive, "app.problem") !== "") await expect.fail("a freshly opened composer is not saveable");
  const saveText = await textOf(drive, "app.sheet.saveBar.l");
  if (!/^Save · /.test(saveText)) await expect.fail(`the save bar reads "${saveText}"`);

  // four taps: a sport, a day, an effort, and confirm
  await drive.click("app.sheet.body.compose.sports.t2");           // lift
  await drive.click("app.sheet.body.compose.days.c1");             // yesterday…
  await drive.wait(150);
  if (await read(drive, "app.dDay") !== seeded.day - 1) await expect.fail("the day chip did not take");
  await drive.click("app.sheet.body.compose.days.c0");             // …and back to today
  await drive.click("app.sheet.body.compose.efforts.e9");          // effort 9
  await drive.wait(250);
  if (await read(drive, "app.dSport") !== "lift") await expect.fail("the sport tile did not take");
  if (await read(drive, "app.dEff") !== 9) await expect.fail("the effort cell did not take");
  if (await read(drive, "app.dKmUsed") !== false) await expect.fail("lifting should carry no distance");
  const addedMin = await read(drive, "app.dMin");

  // record the headline frame by frame, in the page, so the measurement is not
  // at the mercy of a round trip
  await drive.page.evaluate(() => {
    window.__trace = [];
    const a = window.__declare.find("app");
    const tick = () => { window.__trace.push(a.weekMinShown); if (window.__trace.length < 60) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await drive.click("app.sheet.saveBar");

  // the truth moved at once
  if (await read(drive, "app.rows().length") !== rows0 + 1) await expect.fail("the session did not join the history");
  if (await read(drive, "app.weekCount") !== before.n + 1) await expect.fail("this week did not take it in");
  if (await read(drive, "app.weekMin") !== before.m + addedMin) await expect.fail("the week total did not take it in");
  // (>=, not >: today may already be logged, in which case the streak is right
  // to stay where it is — the check is that it re-derived, not that it grew)
  if (await read(drive, "app.streakDays") < Math.max(1, before.st)) await expect.fail("the streak did not take it in");

  // …and the headline TRAVELLED to it rather than cutting
  await drive.wait(1500);
  const trace = await drive.page.evaluate(() => window.__trace);
  const target = before.m + addedMin;
  const between = trace.filter((v) => v > before.m + 0.5 && v < target - 0.5).length;
  if (between < 3) await expect.fail(`the week total cut to its new value: only ${between} intermediate frames between ${before.m} and ${target}`);
  const settled = trace[trace.length - 1];
  if (Math.abs(settled - target) > 1) await expect.fail(`the week total never arrived (${settled} vs ${target})`);

  // ── §5 and correcting, then removing it again ───────────────────────────
  const newId = await read(drive, "app.rows()[0].id");
  await setLoc(drive, "edit/" + newId);
  await expect.visible("app.sheet.body.compose");
  if (await read(drive, "app.dEff") !== 9) await expect.fail("the correction did not seed from the record");
  await drive.click("app.sheet.body.compose.efforts.e4");
  await drive.click("app.sheet.saveBar");
  await drive.wait(900);
  if (await read(drive, `app.rows().find(s => s.id == "${newId}").effort`) !== 4) await expect.fail("the correction did not land");

  await setLoc(drive, "s/" + newId);
  await drive.click("app.sheet.body.detail.acts.del");
  await drive.wait(1200);
  if (await read(drive, "app.rows().length") !== rows0) await expect.fail("the deletion did not land");
  if (await read(drive, "app.weekCount") !== before.n) await expect.fail("this week did not take the deletion in");
  if (await read(drive, "app.notice") !== "") await expect.fail("the service refused a write: " + await read(drive, "app.notice"));

  // ── §7 the phone: the same app, arranged for the room ───────────────────
  await drive.page.setViewport({ width: 380, height: 820, deviceScaleFactor: 2, hasTouch: true });
  await drive.wait(1200);
  if (await read(drive, "app.phone") !== true) await expect.fail(`380px did not read as a phone (app.width = ${await read(drive, "app.width")}, host = ${await read(drive, "app.hostWidth")}, inner = ${await drive.page.evaluate(() => window.innerWidth)})`);
  await expect.visible("app.dock");
  await expect.hidden("app.addBtn");

  // every target a thumb must hit clears 44px, and nothing overflows the frame
  for (const p of ["app.dock", "app.last"]) {
    const n = await drive.page.evaluate((x) => window.__declare.inspect(x), p);
    if (n.height < 40) await expect.fail(`${p} is only ${n.height}px tall`);
    if (n.rootX < 0 || n.rootX + n.width > 380.5) await expect.fail(`${p} overflows the phone frame`);
  }
  await setLoc(drive, "add");
  await drive.wait(500);
  for (const p of ["app.sheet.saveBar", "app.sheet.body.compose.sports.t0", "app.sheet.body.compose.days.c0",
                   "app.sheet.body.compose.minus", "app.sheet.body.compose.efforts.e1", "app.sheet.head.back"]) {
    const n = await drive.page.evaluate((x) => window.__declare.inspect(x), p);
    if (n.width < 28 || n.height < 40) await expect.fail(`${p} is ${n.width}×${n.height} — too small for a thumb`);
  }
  // the save bar sits in the thumb's arc, at the bottom of the sheet
  const sb = await drive.page.evaluate(() => window.__declare.inspect("app.sheet.saveBar"));
  if (sb.rootY + sb.height > 821 || sb.rootY < 600) await expect.fail(`the save bar sits at y=${sb.rootY}`);
  await setLoc(drive, "");
  await drive.wait(700);

  // ── §3 with fingers: one pans, two pinch, and a tap still picks ─────────
  const cdp = await drive.page.target().createCDPSession();
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent",
    { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
  const surf = await drive.page.evaluate(() => { const n = window.__declare.inspect("app.band.plot.catcher"); return { x: n.rootX + n.width / 2, y: n.rootY + n.height / 2 }; });

  const t0 = await read(drive, "app.centerDay");
  await touch("touchStart", [{ x: surf.x, y: surf.y }]);
  await touch("touchMove", [{ x: surf.x + 70, y: surf.y }]);
  await drive.wait(50);
  if (await read(drive, "app.panning") !== true) await expect.fail("one finger did not take the surface");
  const tMid = await read(drive, "app.centerDay");
  if (Math.abs(await read(drive, "app.cx") - tMid) > 0.001) await expect.fail("the surface lagged the finger");
  await touch("touchMove", [{ x: surf.x + 150, y: surf.y }]);
  await drive.wait(50);
  const t1 = await read(drive, "app.centerDay");
  await touch("touchEnd", []);
  await drive.wait(200);
  if (!(t1 < t0 - 1)) await expect.fail(`a one-finger drag did not move the surface (${t0} → ${t1})`);

  // pinch open — the app owes its own zoom once it has claimed every finger
  const z0 = await read(drive, "app.spanDays");
  await touch("touchStart", [{ x: surf.x - 50, y: surf.y }, { x: surf.x + 50, y: surf.y }]);
  for (let i = 1; i <= 8; i++) await touch("touchMove", [{ x: surf.x - 50 - i * 12, y: surf.y }, { x: surf.x + 50 + i * 12, y: surf.y }]);
  await drive.wait(60);
  const z1 = await read(drive, "app.spanDays");
  if (Math.abs(await read(drive, "app.sp") - z1) > 0.001) await expect.fail("the pinch lagged the fingers");
  await touch("touchEnd", []);
  await drive.wait(300);
  if (!(z1 < z0 * 0.75)) await expect.fail(`pinching open: span ${z0} → ${z1}`);

  // pinch shut
  const z2 = await read(drive, "app.spanDays");
  await touch("touchStart", [{ x: surf.x - 140, y: surf.y }, { x: surf.x + 140, y: surf.y }]);
  for (let i = 1; i <= 8; i++) await touch("touchMove", [{ x: surf.x - 140 + i * 15, y: surf.y }, { x: surf.x + 140 - i * 15, y: surf.y }]);
  await drive.wait(60);
  const z3 = await read(drive, "app.spanDays");
  await touch("touchEnd", []);
  await drive.wait(300);
  if (!(z3 > z2 * 1.4)) await expect.fail(`pinching shut: span ${z2} → ${z3}`);

  // …and a tap on the surface, straight after a pinch, still picks a session.
  // (It is easy for it not to: lifting two fingers together delivers only one
  // release, so the survivor makes the next single tap look like a pinch.)
  await setLoc(drive, "");
  await drive.wait(400);
  await touch("touchStart", [{ x: surf.x, y: surf.y }]);
  await touch("touchEnd", []);
  await drive.wait(500);
  if (!/^s\//.test(await read(drive, "app.location"))) await expect.fail("a tap after a pinch picked nothing");

  // and the dock is reachable again the instant the sheet is dismissed
  await setLoc(drive, "");
  await drive.wait(180);
  const dockPt = await drive.page.evaluate(() => { const n = window.__declare.inspect("app.dock"); return { x: n.rootX + n.width / 2, y: n.rootY + n.height / 2 }; });
  await touch("touchStart", [dockPt]);
  await touch("touchEnd", []);
  await drive.wait(600);
  if (await read(drive, "app.location") !== "add") await expect.fail("the dismissing sheet swallowed the next tap");
  await setLoc(drive, "");
  await drive.wait(700);

  // ── §7 and the small phone still holds together ─────────────────────────
  await drive.page.setViewport({ width: 320, height: 568, deviceScaleFactor: 2, hasTouch: true });
  await drive.wait(700);
  const bandBox = await drive.page.evaluate(() => window.__declare.inspect("app.band"));
  const dockBox = await drive.page.evaluate(() => window.__declare.inspect("app.dock"));
  if (bandBox.rootY + bandBox.height > dockBox.rootY + 1) await expect.fail("the year surface runs under the dock at 320×568");
  if (bandBox.height < 90) await expect.fail(`the year surface collapsed to ${bandBox.height}px`);
  const heroSmall = await attr(drive, "app.streak.n", "fontSize");
  const tinySmall = await attr(drive, "app.brand.mark", "fontSize");
  if (heroSmall < tinySmall * 6) await expect.fail(`at 320px the hero is only ${(heroSmall / tinySmall).toFixed(1)}× the label`);

  // ── §6 the type scale holds at EVERY width, not just the two checked ────
  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720], [1024, 768], [900, 600],
                        [760, 900], [480, 900], [414, 896], [390, 844], [375, 667], [360, 640], [320, 568]]) {
    await drive.page.setViewport({ width: w, height: h, deviceScaleFactor: 1, hasTouch: w < 760 });
    await drive.wait(320);
    const g = await drive.page.evaluate(() => {
      const F = (p) => window.__declare.find(p);
      const I = (p) => window.__declare.inspect(p);
      const a = F("app");
      const bad = [];
      for (const p of ["app.streak.n", "app.week.n", "app.shape", "app.last", "app.band", "app.brand"]) {
        const n = I(p);
        if (n.rootX + n.width > a.width + 1) bad.push(p + " past the right edge");
        if (n.rootY + n.height > a.height + 1) bad.push(p + " past the bottom");
      }
      if (a.phone && I("app.band").rootY + I("app.band").height > I("app.dock").rootY + 1) bad.push("the surface runs under the dock");
      if (I("app.last").rootY + I("app.last").height > I("app.band").rootY + 1) bad.push("the last session runs under the surface");
      return { hero: F("app.streak.n").fontSize, tiny: F("app.brand.mark").fontSize, bad };
    });
    if (g.bad.length) await expect.fail(`${w}×${h}: ${g.bad.join(", ")}`);
    if (g.hero < g.tiny * 6) await expect.fail(`${w}×${h}: the hero is only ${(g.hero / g.tiny).toFixed(1)}× the smallest label`);
  }
};
