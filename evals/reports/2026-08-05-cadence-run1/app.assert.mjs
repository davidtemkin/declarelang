// Cadence — the behaviour rung. Drives the real program with real input.
const slot = (drive, name) => drive.page.evaluate(n => window.__declare.find("app")[n], name);
const call = (drive, src) => drive.page.evaluate(s => eval(s), src);

export default async ({ drive, expect }) => {
  await drive.settleData();
  await drive.wait(900);

  // ── the four answers are on screen and read as the brief quotes them ──
  await expect.text("app.todayCol.stack.weekBlock.c", "THIS WEEK");
  await expect.text("app.todayCol.stack.streakBlock.c", "THE STREAK");
  const week = await call(drive, `(() => { const a = window.__declare.find("app");
      const n = window.__declare.inspect("app.todayCol.stack.weekBlock.row");
      return n.children.map(c => c.text ?? (c.kind === "Dur" ? "<dur>" : "")).join(" "); })()`);
  if (!/^\d+ sessions? · <dur>$/.test(week.trim())) throw new Error("week line reads: " + week);

  // ── the strip is handled, and it answers DURING the gesture ──
  await call(drive, `window.__declare.find("app").setView(200, 90)`);
  await drive.wait(120);
  const s0 = await slot(drive, "start");
  await drive.drag("app.plot", -180, 0, 8);
  const s1 = await slot(drive, "start");
  if (!(Math.abs(s1 - s0) > 1)) throw new Error(`drag did not pan: ${s0} -> ${s1}`);

  // ── the header says what it is looking at, and what happened in it ──
  const label = await call(drive, `window.__declare.inspect("app.yearHead.p").text`);
  if (!/\d{4}$/.test(label)) throw new Error("period label: " + label);
  const summary = await call(drive, `window.__declare.inspect("app.yearHead.s").children.map(c => c.text).join(" ")`);
  if (!/sessions?/.test(summary)) throw new Error("period summary: " + summary);

  // ── keyboard: the desk's half ──
  await drive.key("ArrowLeft"); await drive.wait(80);
  await drive.key("0");         await drive.wait(80);
  if (await slot(drive, "zoomed")) throw new Error("0 did not return to fourteen months");

  // ── picking a session, and the URL that carries it ──
  await drive.click("app.plot");
  await drive.wait(400);
  const sel = await slot(drive, "selectedId");
  if (!/^s\d+$/.test(sel)) throw new Error("no session picked: " + sel);
  await expect.visible("app.detail");
  await drive.key("Escape"); await drive.wait(350);
  if ((await slot(drive, "selectedId")) !== "") throw new Error("Escape did not close the detail");

  // ── adding one, and every derived number taking it in ──
  const before = { n: await slot(drive, "weekCount"), m: await slot(drive, "weekMins"), s: await slot(drive, "streakN") };
  await drive.key("n"); await drive.wait(350);
  if (!(await slot(drive, "sheetOpen"))) throw new Error("n did not open the sheet");
  if (!(await slot(drive, "canSave"))) throw new Error("the sheet did not arrive ready to save");
  if (await slot(drive, "noteOpen")) throw new Error("the sheet asked for a keyboard");
  await call(drive, `(() => { const a = window.__declare.find("app");
      a.dDay = a.today; a.dSport = "ride"; a.dMin = 61; a.dKm = 12.5; a.dEffort = 8 })()`);
  await drive.wait(150);
  await drive.click("app.sheet.foot.b");
  await drive.wait(1400);
  const after = { n: await slot(drive, "weekCount"), m: await slot(drive, "weekMins"), s: await slot(drive, "streakN") };
  if (after.n !== before.n + 1 || after.m !== before.m + 61)
    throw new Error(`this week did not take it in: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  if (after.s !== before.s + 1) throw new Error(`the streak did not take it in: ${before.s} -> ${after.s}`);
  if (await slot(drive, "sheetOpen")) throw new Error("the sheet stayed up after a good save");

  const id = await call(drive, `(() => window.__declare.find("app").sessions()
      .filter(x => x.minutes === 61 && x.sport === "ride")[0].id)()`);

  // ── correcting it ──
  await call(drive, `window.__declare.find("app").select(${JSON.stringify(id)})`);
  await drive.wait(300);
  await drive.click("app.detail.acts.e");
  await drive.wait(300);
  if ((await slot(drive, "editId")) !== id) throw new Error("Correct did not open the sheet on that session");
  if ((await slot(drive, "dMin")) !== 61) throw new Error("the sheet did not arrive filled");
  await call(drive, `window.__declare.find("app").dMin = 75`);
  await drive.wait(120);
  await drive.click("app.sheet.foot.b");
  await drive.wait(1400);
  if ((await slot(drive, "weekMins")) !== before.m + 75) throw new Error("this week did not follow the correction");

  // ── and deleting it: every derived number comes back ──
  await call(drive, `window.__declare.find("app").select(${JSON.stringify(id)})`);
  await drive.wait(300);
  await drive.click("app.detail.acts.d");
  await drive.wait(1400);
  const back = { n: await slot(drive, "weekCount"), m: await slot(drive, "weekMins"), s: await slot(drive, "streakN") };
  if (JSON.stringify(back) !== JSON.stringify(before))
    throw new Error(`delete left the derivations behind: ${JSON.stringify(back)} vs ${JSON.stringify(before)}`);

  // ── the type scale, measured on the screen it is on ──
  const scale = await call(drive, `(() => {
      const out = []; const walk = n => { if (!n.shown) return;
        if (n.text != null && ("" + n.text).trim() !== "" && n.attrs.fontSize != null) out.push({ t: "" + n.text, s: n.attrs.fontSize });
        (n.children || []).forEach(walk); };
      walk(window.__declare.inspect("app"));
      const min = Math.min(...out.map(r => r.s));
      const nums = out.filter(r => /^[\\d.]+$/.test(r.t.trim()));
      return { min, max: Math.max(...nums.map(r => r.s)) }; })()`);
  if (scale.max / scale.min < 6)
    throw new Error(`largest number ${scale.max}px is only ${(scale.max / scale.min).toFixed(2)}× the smallest text ${scale.min}px`);
};
