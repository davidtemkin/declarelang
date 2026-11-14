export default async ({ drive, expect, page }) => {
  const r = await page.evaluate(() => {
    const d = window.__declare, app = d.find("app");
    const raw = (v) => v;
    const src = app.s.value.threads[0], der = app.inbox.value.rows[0], row = d.find("app.list.0");
    app.add();
    return { sameRecord: src === der, rowT: row.t === src, rowTmsgs: row.t.msgs.length, srcLen: app.s.value.threads[0].msgs.length,
             n: row.n, explainN: d.explain("app.list.0", "n"), explainT: d.explain("app.list.0", "t") };
  });
  console.log(JSON.stringify(r, null, 1));
};
