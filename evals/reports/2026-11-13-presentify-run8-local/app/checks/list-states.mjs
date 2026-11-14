// The list's own states: loading, the service unreachable, and no
// presentations yet. The network is made to answer each way in the page.
const shot = (drive, name) => drive.page.screenshot({ path: `/tmp/pf/${name}.png` });
const answer = (drive, how) => drive.page.evaluate((how) => {
  if (window.__realFetch == null) window.__realFetch = window.fetch;
  const real = window.__realFetch;
  window.fetch = (u, o) => {
    if (!String(u).endsWith("/api/decks")) return real(u, o);
    if (how == "down") return Promise.reject(new TypeError("Failed to fetch"));
    if (how == "empty") return Promise.resolve(new Response(JSON.stringify({ decks: [] }), { headers: { "content-type": "application/json" } }));
    if (how == "slow") return new Promise(() => { });
    return real(u, o);
  };
}, how);
const reload = (drive) => drive.page.evaluate(() => { const lib = window.__declare.find("app.library"); lib.clear(); lib.fetch() });

export default async ({ drive, expect }) => {
  await drive.waitReal(800);
  await answer(drive, "slow");
  await reload(drive);
  await drive.wait(700);
  await expect.visible("app.lists.page.loadingGrid");
  await shot(drive, "ls-loading");
  await answer(drive, "down");
  await reload(drive);
  await drive.waitReal(500);
  await drive.wait(200);
  await expect.visible("app.lists.page.down");
  await shot(drive, "ls-down");
  await answer(drive, "empty");
  await drive.click('app.lists.page.down."Try again"');
  await drive.waitReal(500);
  await drive.settleMotion();
  await expect.visible("app.lists.page.empty");
  await shot(drive, "ls-empty");
  await answer(drive, "real");
  await reload(drive);
  await drive.waitReal(600);
  await drive.settleMotion();
  await expect.hidden("app.lists.page.empty");
};
