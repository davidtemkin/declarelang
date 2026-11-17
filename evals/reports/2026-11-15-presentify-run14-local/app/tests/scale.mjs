// A hundred slides and a very long title: opening, scrolling the list to the
// end, editing there, and how it looks.
// npx declare-verify presentify.declare --url <dev address> --assert tests/scale.mjs

const API = "http://127.0.0.1:8360";
const DIR = process.env.LOOK_DIR || "/tmp/presentify-look";
const LONG = "Annual planning offsite for the regional operations, finance and customer-success teams, with every appendix we could find";

export default async ({ drive, expect, page }) => {
  const fs = await import("node:fs");
  fs.mkdirSync(DIR, { recursive: true });
  const shot = async (name) => { await drive.settleMotion(); await page.screenshot({ path: `${DIR}/${name}.png` }); };
  const app = (expr) => page.evaluate(`(() => { const app = window.__declare.find("app"); return JSON.parse(JSON.stringify(${expr})) })()`);

  const id = await page.evaluate(async ([u, title]) => {
    const src = (await (await fetch(`${u}/api/decks/d1/slides`)).json()).slides;
    const r = await (await fetch(`${u}/api/decks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) })).json();
    let after = r.slides[0].id;
    for (let i = 1; i < 100; i++) {
      const s = src[i % src.length];
      const x = await (await fetch(`${u}/api/decks/${r.deck.id}/slides`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ after, background: s.background, elements: s.elements }) })).json();
      after = x.slide.id;
    }
    return r.deck.id;
  }, [API, LONG]);
  try {
    await page.evaluate(() => window.__declare.find("app").decks.fetch());
    await drive.settleData();
    await shot("30-home-long-title");

    const t0 = Date.now();
    await page.getByRole("button", { name: "Open " + LONG }).click();
    await drive.settleData();
    await drive.settleMotion();
    console.log("opened 100 slides in", Date.now() - t0, "ms (real time, including the requests)");
    await expect.equal(await app("app.doc.all().length"), 100);
    await shot("31-hundred-slides");

    // the list's End key goes to the last slide, which comes into view
    await drive.click("app.editor.body.film.list.rows.0");
    await drive.key("End");
    await drive.settleMotion();
    await expect.equal(await app("app.doc.at(app.current)"), 99);
    await expect.equal(await page.getByRole("button", { name: "Slide 100", exact: true }).count(), 1);
    await shot("32-hundredth-slide");

    // an edit there: the thumbnail follows, and it saves
    const prof = await drive.profile(async () => {
      await page.evaluate(() => window.__declare.find("app").focusStage());
      await drive.key("Mod+A");
      await drive.key("Shift+ArrowDown");
    });
    console.log(prof.text.split("\n").slice(0, 6).join("\n"));
    await drive.wait(1500);
    await drive.settleData();
    await expect.equal(await app("app.sync.statusText"), "All changes saved");
  } finally {
    await page.evaluate(async ([u, id]) => fetch(`${u}/api/decks/${id}`, { method: "DELETE" }), [API, id]);
  }
};
