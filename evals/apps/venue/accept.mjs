// The Venue — hidden acceptance (verify rung 5).
//
// Written BEFORE any solution exists, and deliberately never opened by the
// solving agent: an acceptance authored after the fact grades on a curve.
//
// It addresses the app the way a person does — by what is on screen and what
// happens when you click it — never by the identifiers a particular solution
// happened to choose. The only contract it leans on is the copy the brief
// makes literal (`N performances`, `N seats · $M`, the service's own
// sentences, the booking code), because copy is the one part of a brief that
// carries over verbatim.
//
// The API itself is the oracle for every number: rather than hardcoding "104
// performances match Carmen", the checks ask the service what the right answer
// is and compare. That keeps acceptance correct if the fixture's seed ever
// changes, and it means a wrong number can only come from the app.
//
// Phases are announced as they start, so a failure says how far the program
// got — with an app-scale task, "died in phase 4 of 7" is the finding, and a
// bare pass/fail throws it away.

const API = "http://127.0.0.1:8310";

export default async ({ drive, expect, page }) => {
  const phases = [];
  const pressed = [];
  const phase = (name) => { phases.push(name); };
  const trail = () => phases.map((p, i) => `${i + 1}. ${p}`).join("  →  ");
  const fail = (msg) => expect.fail(`${msg}\n      reached: ${trail()}\n      pressed: ${pressed.length ? pressed.join("  →  ") : "nothing yet"}`);

  // ── looking at the app ────────────────────────────────────────────────────
  // One walk of the inspect tree, reused by everything below. `visible` alone
  // is not enough — a node parked off-screen or behind a mode change is still
  // "visible" — so on-screen means inside the app's own bounds.
  const survey = async () => page.evaluate(() => {
    const root = window.__declare.inspect();
    const out = [];
    const walk = (n) => {
      out.push({
        path: n.path, kind: n.kind, text: n.text ?? "",
        x: n.rootX, y: n.rootY, w: n.width, h: n.height,
        own: n.visible !== false,
        kids: n.children.length,
      });
      n.children.forEach(walk);
    };
    walk(root);
    return { app: { w: root.width, h: root.height }, nodes: out };
  });

  // `inspect()` reports a node's OWN `visible`, not its effective one — a child
  // of a hidden pane still says visible:true. So a pane switched off by
  // `visible = { mode === … }` would otherwise keep offering its buttons and
  // its text fields, and the run presses controls nobody can see. Effective
  // visibility is this node and every ancestor, and paths are dotted, so the
  // ancestors are exactly the path's prefixes.
  const onScreen = (s) => {
    const own = new Map(s.nodes.map((n) => [n.path, n.own]));
    const shown = (path) => {
      const parts = path.split(".");
      for (let i = 1; i <= parts.length; i++) {
        const anc = parts.slice(0, i).join(".");
        if (own.has(anc) && !own.get(anc)) return false;
      }
      return true;
    };
    return s.nodes.filter((n) =>
      n.w > 0 && n.h > 0 && shown(n.path) &&
      n.x < s.app.w && n.y < s.app.h && n.x + n.w > 0 && n.y + n.h > 0);
  };

  const screenText = async () => {
    const s = await survey();
    return onScreen(s).map((n) => n.text).filter(Boolean).join(" ⟂ ");
  };

  const seeing = async (re) => re.test(await screenText());

  // Poll rather than sleep a fixed amount: network and motion both vary, and a
  // fixed wait is either flaky or slow. 4s ceiling, checked every 100ms.
  const until = async (label, fn, ms = 4000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() - t0 > ms) fail(`timed out waiting for ${label} (${ms}ms).\n      on screen: ${(await screenText()).slice(0, 400)}`);
      await drive.wait(100);
    }
  };

  // Fill a field the way a person re-filling a form does: clear what is there
  // first. Typing on top of an old value is how "ada@example.com" becomes
  // "ada@example.comada@example.com" and a valid form looks invalid.
  const fill = async (node, text) => {
    // Settle motion FIRST. A bar that springs into place is still travelling
    // when its fields are already in the tree, so a click computed from a
    // mid-flight position lands somewhere else and the keystrokes go nowhere —
    // the form then reads as invalid and the app is blamed for refusing it.
    // The driven clock exists precisely so this is deterministic, not a sleep.
    try { await drive.settleMotion(3000); } catch { /* nothing in flight */ }
    await drive.click(node.path);
    for (let i = 0; i < 40; i++) await drive.key("Backspace");
    for (let i = 0; i < 40; i++) await drive.key("Delete");
    await drive.type(text);
  };

  // The service, asked directly — the oracle for every count and price.
  const api = async (path, init) => page.evaluate(async (u, i) => {
    const r = await fetch(u, i ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(i) } : undefined);
    return { status: r.status, body: await r.json() };
  }, `${API}${path}`, init ?? null);

  const countOnScreen = async () => {
    const m = (await screenText()).match(/([\d,]+)\s+performances?\b/);
    return m ? Number(m[1].replace(/,/g, "")) : null;
  };

  const summaryOnScreen = async () => {
    // "3 seats · $240" — tolerant about the separator, strict about the parts.
    const m = (await screenText()).match(/(\d+)\s+seats?\b[^$\d]{0,6}\$\s?([\d,]+)/);
    return m ? { seats: Number(m[1]), total: Number(m[2].replace(/,/g, "")) } : null;
  };

  // Seats are NOT one flat cluster — a hall is sections of rows of seats, so no
  // single parent has forty children. Count the small leaf shapes on screen
  // instead, wherever they hang: the app owes us a room, not a particular tree.
  const smallShapes = async (lo, hi) => {
    const s = await survey();
    return onScreen(s)
      .filter((n) => n.w >= lo && n.w <= hi && n.h >= lo && n.h <= hi)
      .sort((a, b) => a.y - b.y || a.x - b.x);
  };

  // Text fields actually in front of the person. A panel parked off-mode can
  // still report visible:true, and counting those would have us typing a name
  // into the season's search box.
  const visibleFields = async () =>
    onScreen(await survey()).filter((n) => n.kind === "TextInput").sort((a, b) => a.y - b.y);

  // The biggest cluster of similarly-sized siblings on screen — the list of
  // performances. Structure, not names.
  const cluster = async (minKids, loBox, hiBox) => {
    const s = await survey();
    const vis = new Set(onScreen(s).map((n) => n.path));
    const byParent = new Map();
    for (const n of s.nodes) {
      if (!vis.has(n.path) || n.w < loBox || n.w > hiBox.w || n.h < 6 || n.h > hiBox.h) continue;
      const parent = n.path.slice(0, n.path.lastIndexOf("."));
      (byParent.get(parent) ?? byParent.set(parent, []).get(parent)).push(n);
    }
    let best = null;
    for (const [parent, kids] of byParent) {
      if (kids.length >= minKids && (!best || kids.length > best.kids.length)) best = { parent, kids };
    }
    return best;
  };

  // ═══ 1 — the season arrives and says how big it is ════════════════════════
  phase("season loads");
  // Wipe the fixture's accumulated holds, takeovers and bookings first: without
  // this a second run starts inside the first run's wreckage.
  await api("/api/_reset", {});
  await drive.settleData();
  const truth = await api("/api/performances");
  if (truth.status !== 200) fail(`the fixture API is not answering on ${API} — start it before verifying`);
  const total = truth.body.performances.length;

  await until(`the performance count "${total}"`, async () => (await countOnScreen()) === total);

  phase("season is listed");
  const list = await cluster(8, 80, { w: 4000, h: 140 });
  if (!list) fail(`expected a list of performances on screen; found no cluster of comparable rows`);
  const firstTitles = truth.body.performances.slice(0, 40).map((p) => p.title);
  if (!(await seeing(new RegExp(firstTitles.slice(0, 3).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"))))) {
    fail(`the listed rows show none of the season's first titles (${firstTitles.slice(0, 3).join(", ")})`);
  }

  // ═══ 2 — search narrows it, and the count follows ═════════════════════════
  phase("search narrows the season");
  const field = (await visibleFields())[0];
  if (!field) fail("no text field to search the season with");
  await drive.click(field.path);
  await drive.type("carmen");
  await drive.settleData();

  const expected = (await api("/api/performances?search=carmen")).body.performances.length;
  await until(`the count to narrow to ${expected}`, async () => (await countOnScreen()) === expected);

  const rowsNow = await cluster(3, 80, { w: 4000, h: 140 });
  if (!rowsNow) fail("after searching, no performances are listed at all");
  const strayTitle = rowsNow.kids.map((k) => k.text).filter(Boolean)
    .find((t) => /[A-Za-z]{4}/.test(t) && !/carmen/i.test(t) && firstTitles.some((ft) => t.includes(ft) && !/carmen/i.test(ft)));
  if (strayTitle) fail(`a search for "carmen" still lists "${strayTitle}"`);

  // ═══ 3 — a performance opens its hall ═════════════════════════════════════
  phase("performance opens the hall");
  const row = rowsNow.kids.sort((a, b) => a.y - b.y)[0];
  await drive.click(row.path);
  await drive.settleData();
  try { await drive.settleMotion(3000); } catch { /* motion is the app's choice, not a requirement */ }

  const anyCarmen = truth.body.performances.find((p) => /carmen/i.test(p.title));
  const hallNames = [...new Set(truth.body.performances.map((p) => p.hall))];
  await until("the hall to appear", async () => {
    const t = await screenText();
    return hallNames.some((h) => t.includes(h)) || /orchestra|balcony|mezzanine|floor/i.test(t);
  });

  phase("the hall is laid out as a room");
  const candidates = await smallShapes(6, 44);
  if (candidates.length < 40) {
    fail(`the hall shows ${candidates.length} seat-sized shapes; the smallest house has 112 seats`);
  }

  // ═══ 4 — choosing seats, and the total that follows ═══════════════════════
  phase("a seat can be chosen");
  // Which shapes are available is the app's own visual language, so try seats
  // until one registers — a sold seat refusing the click is correct behaviour,
  // not a failure. 60 tries covers the sold ratio of even a full house.
  let chosen = null, firstSummary = null;
  for (const c of candidates.slice(0, 60)) {
    await drive.click(c.path);
    await drive.wait(120);
    const sum = await summaryOnScreen();
    if (sum && sum.seats === 1 && sum.total > 0) { chosen = c; firstSummary = sum; break; }
  }
  if (!chosen) fail(`clicked 60 seats and never saw a "1 seat · $N" summary appear`);

  const allPrices = new Set((await api("/api/halls")).body.halls.flatMap((h) => h.sections.map((s) => s.price)));
  if (!allPrices.has(firstSummary.total)) {
    fail(`one seat totals $${firstSummary.total}, which is not any section's price (${[...allPrices].join(", ")})`);
  }

  phase("a second seat adds its own price");
  let second = null, twoSummary = null;
  for (const c of candidates.slice(0, 60)) {
    if (c.path === chosen.path) continue;
    await drive.click(c.path);
    await drive.wait(120);
    const sum = await summaryOnScreen();
    if (sum && sum.seats === 2) { second = c; twoSummary = sum; break; }
  }
  if (!second) fail(`could not choose a second seat — the summary never reached "2 seats"`);
  const delta = twoSummary.total - firstSummary.total;
  if (!allPrices.has(delta)) {
    fail(`choosing a second seat moved the total by $${delta}, which is not any section's price (${[...allPrices].join(", ")})`);
  }

  phase("a chosen seat can be unchosen");
  await drive.click(second.path);
  await drive.wait(150);
  const back = await summaryOnScreen();
  if (!back || back.seats !== 1) fail(`clicking a chosen seat again should drop back to 1 seat, saw ${back ? `${back.seats} seats` : "no summary"}`);
  if (back.total !== firstSummary.total) fail(`unchoosing should restore the total to $${firstSummary.total}, saw $${back.total}`);

  // ═══ 5 — booking demands a name and a real email ══════════════════════════
  phase("booking asks for a name and an email");
  // Pressing "the control that moves this along" is a guess, so it records the
  // guess: which control, bearing which words. When a run ends up somewhere
  // unexpected, this trail is the difference between a diagnosis and a shrug.
  const advance = async () => {
    const s = await survey();
    const vis = onScreen(s);
    // Prefer a real CONTROL over any text that happens to carry a verb. Matching
    // on words alone once pressed a heading reading "CONFIRMED" instead of the
    // button beside it — measuring this script's vocabulary rather than the
    // program. A Button is a Button whatever its label says, which also frees an
    // app to word its own copy ("Find another performance") without the run
    // losing the thread.
    // Never press a RETREATING control. "Clear" sat beside "Confirm booking" on
    // the same row, and picking by position alone pressed Clear — which emptied
    // the selection and took the form away with it, then reported the form as
    // missing. Advancing means the action that goes forward.
    const RETREAT = /clear|cancel|back|reset|discard|delete|remove|undo/i;
    const buttons = vis.filter((n) => n.kind === "Button" && n.h < 90 && !RETREAT.test(n.text));
    const pool = buttons.length ? buttons
      : vis.filter((n) => /book|confirm|continue|checkout|reserve|next|pay|done|again|another|start|find/i.test(n.text) && n.h < 90);
    const btn = pool.sort((a, b) => b.y - a.y)[0];
    if (!btn) { pressed.push("(nothing to press)"); return false; }
    pressed.push(`"${(btn.text || btn.kind).trim().slice(0, 22)}" @ ${btn.path}`);
    await drive.click(btn.path);
    await drive.wait(200);
    return true;
  };
  await advance();
  // A booking panel that rises is not on screen the instant it is asked for.
  // Settle motion, then WAIT for the fields rather than counting once — a
  // single look catches a panel mid-flight and reports it as absent.
  try { await drive.settleMotion(3000); } catch { /* nothing in flight */ }
  const byY = await until("a name and an email field", async () => {
    const f = await visibleFields();
    return f.length >= 2 ? f : null;
  });

  // Try to send it empty. Either the control refuses (nothing happens) or the
  // service's sentence appears — a confirmation code must NOT.
  await advance();
  await drive.settleData();
  if (await seeing(/BK-\d{4}/)) fail("an empty booking was accepted — a name and a well-formed email are required");

  phase("a malformed email is refused");
  await fill(byY[0], "Ada Lovelace");
  await fill(byY[1], "not-an-email");
  await advance();
  await drive.settleData();
  if (await seeing(/BK-\d{4}/)) fail(`"not-an-email" was accepted as an email address`);

  // ═══ 6 — a booking that works ═════════════════════════════════════════════
  phase("a complete booking returns its code");
  const emailField = (await visibleFields())[1];
  if (emailField) await fill(emailField, "ada@example.com");
  await advance();
  await drive.settleData();
  await until("a confirmation code", async () => await seeing(/BK-\d{4}/));

  // ═══ 7 — losing a seat to somebody else ═══════════════════════════════════
  // The one path a real race can't test reproducibly, so the harness makes the
  // race happen: every remaining seat in this performance goes to someone else
  // between the app reading the map and the app trying to book.
  phase("a lost seat is reported and released");
  await advance();                     // "start again" — the brief promises it
  await drive.wait(300);
  await drive.settleData();

  const listAgain = await cluster(3, 80, { w: 4000, h: 140 });
  if (!listAgain) {
    fail("after booking there is no way back to the season — the brief asks that they can start again");
  }
  await drive.click(listAgain.kids.sort((a, b) => a.y - b.y)[0].path);
  await drive.settleData();
  try { await drive.settleMotion(3000); } catch {}

  const seats2 = await smallShapes(6, 44);
  if (seats2.length < 40) fail("choosing a second performance did not open its hall");

  let picked = null;
  for (const c of seats2.slice(0, 60)) {
    await drive.click(c.path);
    await drive.wait(120);
    const sum = await summaryOnScreen();
    if (sum && sum.seats >= 1) { picked = sum; break; }
  }
  if (!picked) fail("could not choose a seat in the second performance");

  // Hand every free seat to somebody else, then confirm. Which performance the
  // app is showing is not ours to know from the outside — but the page fetched
  // its seat map, and the resource timeline remembers that.
  const openPerf = await page.evaluate(() => {
    const seen = performance.getEntriesByType("resource")
      .map((e) => (e.name.match(/\/api\/performances\/([^/]+)\/seats/) ?? [])[1])
      .filter(Boolean);
    return seen[seen.length - 1] ?? null;
  });
  if (!openPerf) fail("could not tell which performance's seat map the app fetched");
  const took = await api("/api/_takeover", { performanceId: openPerf });
  if (took.status !== 200) fail(`the harness could not manufacture a race (${took.status})`);

  // Some apps put booking behind a step; others put the fields in the bar beside
  // the summary. Don't assume either — fill what is already on screen, and press
  // onward only if nothing is there to fill. Pressing first cost a run: it fired
  // Confirm on an empty form that was already in front of us.
  let f2 = await visibleFields();
  if (f2.length < 2) {
    await advance();
    await drive.wait(200);
    f2 = await visibleFields();
  }
  if (f2.length >= 2) {
    await fill(f2[0], "Ada Lovelace");
    await fill(f2[1], "ada@example.com");
  }
  await advance();
  await drive.settleData();

  await until("the service's own sentence about the lost seats", async () => await seeing(/Someone else took .+ first\./));
  if (await seeing(/BK-\d{4}/)) fail("a booking succeeded even though every seat had been taken");

  const stale = await summaryOnScreen();
  if (stale && stale.seats > 0) {
    fail(`after losing the seats, the summary still claims ${stale.seats} seat(s) — lost seats must leave the selection`);
  }
};
