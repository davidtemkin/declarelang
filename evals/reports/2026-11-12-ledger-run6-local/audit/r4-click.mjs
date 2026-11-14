// Drives r4-pointerevents-none-field.declare: clicks each row's middle, reports the hit element
// and the status line.
export default async function (page, h) {
  const out = {};
  for (const [name, y] of [["text row", 50], ["combo row", 130]]) {
    out[name + " hit"] = await page.evaluate((y) => { const e = document.elementFromPoint(220, y); return `${e?.tagName} ${e?.getAttribute("aria-label") ?? ""} pe=${e && getComputedStyle(e).pointerEvents}`; }, y);
    await page.mouse.click(220, y); await h.sleep(400);
    out[name + " after"] = await page.evaluate(() => document.body.innerText.match(/row presses.*/)?.[0]);
    await page.mouse.click(560, 240); await h.sleep(200);
  }
  return out;
}
