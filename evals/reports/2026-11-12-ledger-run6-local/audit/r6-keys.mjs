export default async function (page, h) {
  const st = () => page.evaluate(() => ({ items: JSON.stringify(window.__declare.find("app").rows.value.items.map((r) => [r.title, r.note])),
    active: `${document.activeElement?.tagName} ${document.activeElement?.getAttribute("role")} ${document.activeElement?.getAttribute("aria-label")}` }));
  const out = [];
  const k = async (key, mod) => { if (mod) await page.keyboard.down(mod); await page.keyboard.press(key, mod === "Meta" && key === "a" ? { commands: ["SelectAll"] } : {}); if (mod) await page.keyboard.up(mod); await h.sleep(250); };
  await page.evaluate(() => [...document.querySelectorAll('[role="grid"]')][0].focus()); await h.sleep(200);
  await k("ArrowDown"); await k("Enter"); out.push(["Enter on title", await st()]);
  await k("a", "Meta"); await page.keyboard.type("Gamma"); await k("Escape"); out.push(["typed Gamma, Escape", await st()]);
  await k("Enter"); await k("a", "Meta"); await page.keyboard.type("Delta"); await k("Enter"); out.push(["typed Delta, Enter", await st()]);
  await page.evaluate(() => [...document.querySelectorAll('[role="grid"]')][0].focus()); await h.sleep(200);
  await k("ArrowUp"); await k("ArrowRight"); await k("Enter"); out.push(["Enter on note", await st()]);
  await k("a", "Meta"); await page.keyboard.type("three"); await k("Tab"); out.push(["typed three, Tab", await st()]);
  return out;
}
