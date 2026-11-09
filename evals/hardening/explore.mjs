// The hardening explorer (evals/hardening/README.md): drive a program with seeded
// random real input, and after every step, at rest, ask it for its invariants.
//
//   STALE_STEPS=60 STALE_SEED=1 npx declare-verify app.declare --assert evals/hardening/explore.mjs
//
// It prints one line each: STALE-REPORT (constraints whose fresh answer disagrees
// with their slot, with the steps before), PAGE-ERROR (with the steps before), and
// STALE-STEPS (how many steps it took). Links are left alone: a press that follows
// one leaves the program, and the run with it.
const STEPS = Number(process.env.STALE_STEPS ?? 40);
let seed = Number(process.env.STALE_SEED ?? 1);
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const ROLES = ["button", "tab", "checkbox", "switch", "menuitem", "option", "radio", "treeitem", "row", "gridcell", "textbox", "slider"];

export default async ({ page, drive }) => {
  const found = new Map();
  const log = [];
  page.on("pageerror", (e) => console.log(`PAGE-ERROR ${JSON.stringify({ after: log.slice(-4), message: String(e.message).slice(0, 200) })}`));
  const check = async (step) => {
    await drive.wait(400);
    const s = await page.evaluate(() => window.__declare.stale());
    for (const r of s) {
      const k = r.rule + "@" + JSON.stringify(r.at);
      if (!found.has(k)) found.set(k, { ...r, step, after: log.slice(-3) });
    }
  };
  await check("start");
  for (let i = 0; i < STEPS; i++) {
    const present = await page.evaluate((roles) => roles.filter((r) => document.querySelector(`[role="${r}"]`) !== null), ROLES);
    if (present.length === 0) break;
    const role = present[Math.floor(rand() * present.length)];
    const loc = page.getByRole(role);
    const n = await loc.count().catch(() => 0);
    if (n === 0) continue;
    const el = loc.nth(Math.floor(rand() * n));
    const name = (await el.getAttribute("aria-label").catch(() => null)) ?? (await el.innerText({ timeout: 300 }).catch(() => "")).slice(0, 30);
    try {
      if (role === "textbox") { await el.click({ timeout: 800 }); await page.keyboard.type(rand() < 0.5 ? "hello" : "12", { delay: 5 }); await page.keyboard.press(rand() < 0.5 ? "Enter" : "Tab"); }
      else if (role === "slider") { await el.focus({ timeout: 800 }); await page.keyboard.press(rand() < 0.5 ? "ArrowRight" : "ArrowLeft"); }
      else await el.click({ timeout: 800 });
      log.push(`${role} "${name}"`);
    } catch { log.push(`(missed ${role} "${name}")`); }
    if (rand() < 0.12) { await page.keyboard.press("Escape"); log.push("Escape"); }
    await check(i);
  }
  console.log(`STALE-REPORT ${JSON.stringify([...found.values()])}`);
  console.log(`STALE-STEPS ${log.length}`);
};
