// Run 32 #70 replayed: keyboard checkout, Postal code left empty, then the driver's
// path verb on it; geometry of the pane and the field at that moment.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.tab(2); await drive.key("Enter");
  await drive.settleData(); await drive.settleMotion();
  await drive.tab();
  let got = 0;
  for (let i = 0; i < 80 && got < 2; i++) {
    const pressed = await page.evaluate(() => document.activeElement?.getAttribute("aria-pressed"));
    const dis = await page.evaluate(() => document.activeElement?.getAttribute("aria-disabled"));
    if (pressed === "false" && dis !== "true" && i > 3) { await drive.key("Space"); got++; }
    await drive.key("ArrowRight");
  }
  await drive.tab(); await drive.key("Enter"); await drive.settleMotion();
  await drive.tab();
  await drive.type("kb@example.com"); await drive.key("Enter");
  await drive.type("Kay Bee"); await drive.key("Enter");
  await drive.type("5555555555554444"); await drive.key("Enter");
  await drive.type("0130"); await drive.key("Enter");
  await drive.type("321"); await drive.key("Enter");
  await drive.type("1 Main St"); await drive.key("Enter");
  await drive.key("Enter");
  await drive.type("Toronto"); await drive.key("Enter");
  await drive.type("Canada"); await drive.key("Enter");
  await drive.type("m5v2t6"); await drive.key("Enter");
  await drive.settleData(); await drive.settleMotion();
  const geo = () => page.evaluate(() => {
    const d = window.__declare, pane = d.find("app.checkout.pane"), f = d.find("app.checkout.pane.col.form.newCard.10.1.2");
    const el = document.querySelector('[autocomplete="postal-code"]');
    const r = el?.getBoundingClientRect();
    let sc = null; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (/(auto|scroll|hidden)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight) { sc = { tag: e.tagName, ov: cs.overflowY, sh: e.scrollHeight, ch: e.clientHeight, st: e.scrollTop, top: Math.round(e.getBoundingClientRect().top), bottom: Math.round(e.getBoundingClientRect().bottom) }; break; } }
    return { win: innerHeight, pane: { y: pane.y, h: pane.height, ch: pane.contentHeight, sy: pane.scrollY }, field: r && { top: Math.round(r.top), bottom: Math.round(r.bottom) }, firstScrollAncestor: sc, focused: document.activeElement?.getAttribute("autocomplete"), path: f && f.constructor.name };
  });
  console.log("before:", JSON.stringify(await geo()));
  console.log("open floats:", JSON.stringify(await page.evaluate(() => { const out=[]; const w=(v)=>{ if(!v) return; if (v.constructor && /Popover|Floating|Menu|List/.test(v.constructor.name) && v.present) out.push(v.constructor.name+" "+(v.present)); for (const c of (v.children??[])) w(c); }; w(window.__declare.find("app")); return out; })));
  console.log("pane style:", JSON.stringify(await page.evaluate(() => { const el=document.querySelector('[autocomplete="postal-code"]'); let e=el; while(e && getComputedStyle(e).overflowY!=='auto') e=e.parentElement; const cs=getComputedStyle(e); return {ov:cs.overflowY, ob:cs.overscrollBehavior, pe:cs.pointerEvents, html: document.documentElement.style.overflow, body: document.body.style.overflow, touch: cs.touchAction}; })));
  if (process.env.ESC) { await drive.key("Escape"); console.log("after Esc:", JSON.stringify(await geo())); }
  await page.screenshot({ path: process.env.SHOT ?? "/dev/null" });
  try { await drive.selectAll("app.checkout.pane.col.form.newCard.10.1.2"); console.log("selectAll: ok"); }
  catch (e) { console.log("selectAll refused:", String(e.message).slice(0, 300)); }
  console.log("after:", JSON.stringify(await geo()));
  await drive.wheel("app.checkout.pane", 400);
  console.log("after wheel:", JSON.stringify(await geo()));
};
