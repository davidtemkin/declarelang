// Failure 2, cause: a click on a row's centre — what element is hit, and what takes the focus
// (with the stack of the focus call).
export default async function (page, h) {
  const tx = (await h.nodes()).find((x) => ["link", "button"].includes(x.role) && /^Transactions$/.test(x.name));
  await (await tx.elementHandle()).asElement()?.click().catch(() => {});
  await h.sleep(1500);
  await page.evaluate(() => {
    window.__log = [];
    document.addEventListener("focusin", (e) => window.__log.push({ ev: "focusin", el: `${e.target.tagName} ${e.target.getAttribute("role")} ${e.target.getAttribute("aria-label")} pe=${getComputedStyle(e.target).pointerEvents} op=${getComputedStyle(e.target).opacity}`, stack: new Error().stack.split("\n").slice(2, 14).join(" <- ") }), true);
    const of = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (...a) { window.__log.push({ ev: "focus()", el: `${this.tagName} ${this.getAttribute("role")} ${this.getAttribute("aria-label")}`, stack: new Error().stack.split("\n").slice(1, 16).join(" <- ") }); return of.apply(this, a); };
  });
  const row = (await h.nodes()).find((x) => x.role === "row" && /VENMO PAYMENT/.test(x.name));
  const el = (await (await row.elementHandle()).evaluateHandle((e) => (e.nodeType === 1 ? e : e.parentElement))).asElement();
  const b = await el.boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  const hit = await page.evaluate((x, y) => { const e = document.elementFromPoint(x, y); return `${e?.tagName} role=${e?.getAttribute("role")} label=${e?.getAttribute("aria-label")} class=${e?.className}`; }, x, y);
  await page.mouse.click(x, y);
  await h.sleep(1000);
  const selected = (await h.nodes()).filter((n) => n.role === "row" && n.selected).map((n) => n.name);
  // and a click a little left, on the description text
  return { at: [Math.round(x), Math.round(y)], hit, selected, log: await page.evaluate(() => window.__log) };
}
