// browser/register-sw.js — register the distro Service Worker (../service-worker.js) and pick up new deploys.
//
// Imported by boot-static.js, so EVERY statically-hosted page (the homepage + each example)
// registers the worker. The dev server's host pages use host-client.js directly and do NOT
// import this — so the SW is naturally scoped to STATIC hosting only (the server already
// serves fresh files and compiles on request), mirroring OL5's "don't register under the
// server" without needing a mode marker.
//
// The worker lives at the distro ROOT (../service-worker.js from here), giving it root scope so
// it can intercept a `.declare` browsed anywhere under the deploy. Paths derive from THIS
// module's URL, so it all adapts to the origin root or a project subpath with no build step.

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;   // an enhancement — the page still works without it
  const swUrl = new URL("../service-worker.js", import.meta.url);
  const scope = new URL("./", swUrl).pathname;    // the distro root == the worker's own directory

  // A new deploy activates a worker with a new BUILD_ID that posts `declare-updated`. If it
  // differs from the build this page booted with, reload ONCE onto the fresh version. Setting
  // sessionStorage BEFORE the reload guards against a loop (a second identical message no-ops).
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (!e.data || e.data.type !== "declare-updated") return;
    const seen = sessionStorage.getItem("declare-build");
    sessionStorage.setItem("declare-build", e.data.build);
    if (seen && seen !== e.data.build) location.reload();
  });

  try {
    const reg = await navigator.serviceWorker.register(swUrl, { scope, updateViaCache: "none" });
    reg.update().catch(() => {});   // force an update check each load → prompt pickup of new deploys
  } catch {
    // Registration needs https:// or http://localhost. Over a plain-http LAN IP it throws;
    // the page still renders (SW is purely additive), so swallow it.
  }
}
